import type { DispoLevel, DispoSnapshot } from '~/types'

export const DISPO_LEVEL_META: Record<DispoLevel, { label: string; color: string; hex: string }> = {
  dispo: { label: '> 5 places', color: 'success', hex: '#059669' },
  peu: { label: '≤ 5 places', color: 'warning', hex: '#d97706' },
  complet: { label: 'Complet', color: 'error', hex: '#dc2626' },
}

// Snapshot du dernier rescan fait DEPUIS la page (route /api/rescan). Reconstituable à volonté :
// pas de mécanique de copie type plan, les échecs d'écriture sont ignorés en silence.
const SNAPSHOT_STORAGE_KEY = 'gr20-dispo-snapshot-v1'

function lireSnapshotLocal(): DispoSnapshot | null {
  if (!import.meta.client) return null
  try {
    const raw = localStorage.getItem(SNAPSHOT_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as DispoSnapshot) : null
    return parsed && typeof parsed.scannedAt === 'string' && parsed.dispo ? parsed : null
  } catch {
    return null
  }
}

function ecrireSnapshotLocal(s: DispoSnapshot) {
  if (!import.meta.client) return
  try {
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(s))
  } catch {
    // quota / navigation privée : tant pis, le snapshot reste en mémoire pour la session
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
    let distant: DispoSnapshot | null = null
    try {
      // URL stable (sans cache-buster) : /api/dispo renvoie déjà Cache-Control: no-store, et une URL
      // constante permet à NetworkFirst de resservir la dernière réponse hors ligne.
      distant = await $fetch<DispoSnapshot>('/api/dispo')
    } catch {
      try {
        // repli : le fichier statique précaché (même forme ; /api/dispo n'existe pas sur un
        // hébergement sans disque type Cloudflare Pages) ; sans query string, sinon le précache
        // ne matche pas.
        distant = await $fetch<DispoSnapshot>('/data/dispo-snapshot.json')
      } catch {
        distant = null
      }
    }
    // le plus frais gagne : un rescan fait depuis la page (localStorage) est plus récent que le
    // snapshot embarqué au build
    const local = lireSnapshotLocal()
    snapshot.value =
      local && (!distant || local.scannedAt > distant.scannedAt) ? local : (distant ?? local)
  }
  // Fallback client (la page /plan est ssr:false) ; les pages SSR font `await load()`
  // dans leur setup pour avoir les pastilles dès le HTML serveur (useState transfère l'état).
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

  /** Dates couvertes par le snapshot, triées. */
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

  async function rescan(dateDebut: string, dateFin: string) {
    scanning.value = true
    scanError.value = null
    try {
      // la route scanne en mémoire et RETOURNE le snapshot (pas d'écriture disque en prod) :
      // on l'adopte directement et on le persiste pour les prochaines sessions de cet appareil
      const res = await $fetch<{ ok: boolean; snapshot: DispoSnapshot }>('/api/rescan', {
        method: 'POST',
        body: { dateDebut, dateFin },
        timeout: 120_000,
      })
      if (!res?.snapshot?.dispo) throw new Error('Scan terminé mais snapshot illisible.')
      snapshot.value = res.snapshot
      ecrireSnapshotLocal(res.snapshot)
    } catch (e: unknown) {
      const err = e as { data?: { message?: string }; message?: string }
      scanError.value = err.data?.message ?? err.message ?? 'Échec du scan.'
    } finally {
      scanning.value = false
    }
  }

  return { snapshot, snapshotDates, dispoFor, levelFor, scannedAtLabel, load, rescan, scanning, scanError }
}
