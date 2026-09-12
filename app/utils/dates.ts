/** Date du jour en heure locale : `toISOString()` est UTC et rend la veille après minuit en France. */
export function todayIso(): string {
  return new Date().toLocaleDateString('en-CA')
}

/** Décale une date ISO `YYYY-MM-DD` de `days` jours ; chaîne vide si la date est invalide. */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-CA')
}

export function formatDateFr(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}
