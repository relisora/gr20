import type { FetchError } from 'ofetch'
import type { DispoLevel, DispoSnapshot } from '~/types'

export const DISPO_LEVEL_META: Record<DispoLevel, { label: string, hex: string }> = {
  dispo: { label: '> 5 places', hex: '#059669' },
  peu: { label: '≤ 5 places', hex: '#d97706' },
  complet: { label: 'Complet', hex: '#dc2626' },
}

// Snapshot du dernier rescan fait depuis la page. Reconstituable à volonté : pas de copie de
// sécurité, les échecs d'écriture sont ignorés.
const SNAPSHOT_STORAGE_KEY = 'gr20-dispo-snapshot-v1'

function readLocalSnapshot(): DispoSnapshot | null {
  if (!import.meta.client) return null
  try {
    const raw = localStorage.getItem(SNAPSHOT_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as DispoSnapshot) : null
    return parsed && typeof parsed.scannedAt === 'string' && parsed.dispo ? parsed : null
  } catch {
    return null
  }
}

function writeLocalSnapshot(s: DispoSnapshot) {
  if (!import.meta.client) return
  try {
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(s))
  } catch {
    // quota ou navigation privée : le snapshot reste en mémoire pour la session
  }
}

/** `/api/dispo` (URL stable, resservie hors ligne par NetworkFirst), sinon le fichier statique précaché. */
async function fetchRemoteSnapshot(): Promise<DispoSnapshot | null> {
  try {
    return await $fetch<DispoSnapshot>('/api/dispo')
  } catch {
    // route absente sur un hébergement sans disque (Cloudflare Pages)
  }
  try {
    return await $fetch<DispoSnapshot>('/data/dispo-snapshot.json')
  } catch {
    return null
  }
}

export function useDispo() {
  const snapshot = useState<DispoSnapshot | null>('dispo-snapshot', () => null)
  const loaded = useState('dispo-loaded', () => false)
  const scanning = useState('dispo-scanning', () => false)
  const scanError = useState<string | null>('dispo-scan-error', () => null)

  async function load(force = false) {
    if (loaded.value && !force) return
    loaded.value = true
    const remote = await fetchRemoteSnapshot()
    const local = readLocalSnapshot()
    // le plus frais gagne : un rescan local est plus récent que le snapshot embarqué au build
    snapshot.value = local && (!remote || local.scannedAt > remote.scannedAt) ? local : (remote ?? local)
  }
  // les pages SSR font `await load()` dans leur setup ; /plan (ssr: false) passe par ici
  if (import.meta.client) void load()

  /** Dispo par formule pour un hébergement à une date, ou null si hors snapshot. */
  function dispoFor(accommodationId: string, dateIso: string | null) {
    if (!snapshot.value || !dateIso) return null
    return snapshot.value.dispo[accommodationId]?.[dateIso] ?? null
  }

  function levelFor(accommodationId: string, dateIso: string | null, formuleType: string | null): DispoLevel | null {
    if (!formuleType) return null
    return dispoFor(accommodationId, dateIso)?.[formuleType] ?? null
  }

  const snapshotDates = computed(() => {
    if (!snapshot.value) return []
    const all = new Set<string>()
    for (const byDate of Object.values(snapshot.value.dispo)) {
      for (const d of Object.keys(byDate)) all.add(d)
    }
    return [...all].sort()
  })

  const scannedAtLabel = computed(() => {
    if (!snapshot.value) return null
    return new Date(snapshot.value.scannedAt).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  })

  /** La route scanne en mémoire et retourne le snapshot : adopté, puis conservé pour cet appareil. */
  async function rescan(dateDebut: string, dateFin: string) {
    scanning.value = true
    scanError.value = null
    try {
      const res = await $fetch<{ ok: boolean, snapshot: DispoSnapshot }>('/api/rescan', {
        method: 'POST',
        body: { dateDebut, dateFin },
        timeout: 120_000,
      })
      if (!res?.snapshot?.dispo) throw new Error('Scan terminé mais snapshot illisible.')
      snapshot.value = res.snapshot
      writeLocalSnapshot(res.snapshot)
    } catch (e) {
      const err = e as FetchError<{ message?: string }>
      scanError.value = err.data?.message ?? err.message ?? 'Échec du scan.'
    } finally {
      scanning.value = false
    }
  }

  return { snapshot, snapshotDates, dispoFor, levelFor, scannedAtLabel, load, rescan, scanning, scanError }
}
