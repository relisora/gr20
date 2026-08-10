import type { BookingStatus } from '~/types'

export function formatHours(h: number): string {
  const hours = Math.floor(h)
  const minutes = Math.round((h - hours) * 60)
  if (minutes === 0) return `${hours} h`
  return `${hours} h ${String(minutes).padStart(2, '0')}`
}

export function formatPrice(eur: number | null): string {
  return eur == null ? '—' : `${eur} €`
}

export function formatDateFr(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export const ACCOMMODATION_TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
  'refuge-pnrc': { label: 'Refuge PNRC', icon: 'i-lucide-house', color: 'primary' },
  'bergerie': { label: 'Bergerie', icon: 'i-lucide-tent-tree', color: 'warning' },
  'gite': { label: 'Gîte', icon: 'i-lucide-bed', color: 'info' },
  'gite-communal': { label: 'Gîte communal', icon: 'i-lucide-bed', color: 'info' },
  'hotel': { label: 'Hôtel', icon: 'i-lucide-building', color: 'secondary' },
  'camping': { label: 'Camping', icon: 'i-lucide-tent', color: 'success' },
}

export const BOOKING_STATUS_META: Record<BookingStatus, { label: string; color: string; icon: string }> = {
  a_reserver: { label: 'À réserver', color: 'warning', icon: 'i-lucide-circle-dashed' },
  reserve: { label: 'Réservé', color: 'success', icon: 'i-lucide-circle-check' },
  complet: { label: 'Complet', color: 'error', icon: 'i-lucide-circle-x' },
  liste_attente: { label: "Liste d'attente", color: 'info', icon: 'i-lucide-circle-ellipsis' },
}

export const FORMULE_LABELS: Record<string, string> = {
  'dortoir': 'Dortoir',
  'bivouac': 'Bivouac',
  'tente_louee': 'Tente louée',
  'chambre': 'Chambre',
  'camping': 'Camping',
  'demi-pension': 'Demi-pension',
}
