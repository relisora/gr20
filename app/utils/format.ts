export function formatHours(h: number): string {
  const hours = Math.floor(h)
  const minutes = Math.round((h - hours) * 60)
  if (minutes === 0) return `${hours} h`
  return `${hours} h ${String(minutes).padStart(2, '0')}`
}

export function formatPrice(eur: number | null): string {
  return eur == null ? '—' : `${eur} €`
}

export const ACCOMMODATION_TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
  'refuge-pnrc': { label: 'Refuge PNRC', icon: 'i-lucide-house', color: 'primary' },
  'bergerie': { label: 'Bergerie', icon: 'i-lucide-tent-tree', color: 'warning' },
  'gite': { label: 'Gîte', icon: 'i-lucide-bed', color: 'info' },
  'gite-communal': { label: 'Gîte communal', icon: 'i-lucide-bed', color: 'info' },
  'hotel': { label: 'Hôtel', icon: 'i-lucide-building', color: 'secondary' },
  'camping': { label: 'Camping', icon: 'i-lucide-tent', color: 'success' },
}

export const FORMULE_LABELS: Record<string, string> = {
  'dortoir': 'Dortoir',
  'bivouac': 'Bivouac',
  'tente_louee': 'Tente louée',
  'chambre': 'Chambre',
  'camping': 'Camping',
  'demi-pension': 'Demi-pension',
}
