import type { DispoLevel, DispoSnapshot } from '~/types'

export const DISPO_LEVEL_META: Record<DispoLevel, { label: string; color: string; hex: string }> = {
  dispo: { label: '> 5 places', color: 'success', hex: '#059669' },
  peu: { label: '≤ 5 places', color: 'warning', hex: '#d97706' },
  complet: { label: 'Complet', color: 'error', hex: '#dc2626' },
}

export function useDispo() {
  const snapshot = useState<DispoSnapshot | null>('dispo-snapshot', () => null)
  const loaded = useState('dispo-loaded', () => false)
  const scanning = useState('dispo-scanning', () => false)
  const scanError = useState<string | null>('dispo-scan-error', () => null)

  async function load(force = false) {
    if (loaded.value && !force) return
    loaded.value = true
    try {
      // URL stable (sans cache-buster) : /api/dispo renvoie déjà Cache-Control: no-store, et une URL
      // constante permet à NetworkFirst de resservir la dernière réponse hors ligne.
      snapshot.value = await $fetch<DispoSnapshot>('/api/dispo')
    } catch {
      try {
        // repli hors ligne : le fichier statique précaché (même forme que /api/dispo, qui ne fait
        // que le relire depuis le disque) ; sans query string, sinon le précache ne matche pas.
        snapshot.value = await $fetch<DispoSnapshot>('/data/dispo-snapshot.json')
      } catch {
        snapshot.value = null
      }
    }
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
      await $fetch('/api/rescan', { method: 'POST', body: { dateDebut, dateFin } })
      await load(true)
      if (!snapshot.value) scanError.value = 'Scan terminé mais snapshot illisible.'
    } catch (e: unknown) {
      const err = e as { data?: { message?: string }; message?: string }
      scanError.value = err.data?.message ?? err.message ?? 'Échec du scan.'
    } finally {
      scanning.value = false
    }
  }

  return { snapshot, snapshotDates, dispoFor, levelFor, scannedAtLabel, load, rescan, scanning, scanError }
}
