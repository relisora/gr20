import type { BadgeProps } from '@nuxt/ui'
import type { Accommodation, BookingStatus, Formule, Waypoint } from '~/types'

type UiColor = NonNullable<BadgeProps['color']>

export function formatHours(h: number): string {
  const hours = Math.floor(h)
  const minutes = Math.round((h - hours) * 60)
  if (minutes === 0) return `${hours} h`
  return `${hours} h ${String(minutes).padStart(2, '0')}`
}

export function formatPrice(eur: number | null): string {
  return eur == null ? '—' : `${eur} €`
}

export function telHref(tel: string): string {
  return `tel:${tel.replace(/\s/g, '')}`
}

export const WAYPOINT_TYPE_META: Record<Waypoint['type'], { label: string, hex: string }> = {
  refuge: { label: 'Refuge PNRC', hex: '#059669' },
  bergerie: { label: 'Bergerie', hex: '#d97706' },
  village: { label: 'Village', hex: '#4f46e5' },
  col: { label: 'Col', hex: '#78716c' },
  station: { label: 'Station', hex: '#0284c7' },
}

export const ACCOMMODATION_TYPE_META: Record<Accommodation['type'], { label: string, icon: string, color: UiColor }> = {
  'refuge-pnrc': { label: 'Refuge PNRC', icon: 'i-lucide-house', color: 'primary' },
  'bergerie': { label: 'Bergerie', icon: 'i-lucide-tent-tree', color: 'warning' },
  'gite': { label: 'Gîte', icon: 'i-lucide-bed', color: 'info' },
  'gite-communal': { label: 'Gîte communal', icon: 'i-lucide-bed', color: 'info' },
  'hotel': { label: 'Hôtel', icon: 'i-lucide-building', color: 'secondary' },
  'camping': { label: 'Camping', icon: 'i-lucide-tent', color: 'success' },
}

export const BOOKING_STATUS_META: Record<BookingStatus, { label: string, color: UiColor, icon: string }> = {
  a_reserver: { label: 'À réserver', color: 'warning', icon: 'i-lucide-circle-dashed' },
  reserve: { label: 'Réservé', color: 'success', icon: 'i-lucide-circle-check' },
  complet: { label: 'Complet', color: 'error', icon: 'i-lucide-circle-x' },
  liste_attente: { label: 'Liste d\'attente', color: 'info', icon: 'i-lucide-circle-ellipsis' },
}

export const FORMULE_LABELS: Record<Formule['type'], string> = {
  'dortoir': 'Dortoir',
  'bivouac': 'Bivouac',
  'tente_louee': 'Tente louée',
  'chambre': 'Chambre',
  'camping': 'Camping',
  'demi-pension': 'Demi-pension',
}

/** Unité de facturation. Les tentes PNRC sont facturées à la tente (2 places), pas à la personne. */
export const FORMULE_PAR_LABELS: Record<Formule['par'], string> = {
  personne: 'pers.',
  chambre: 'ch.',
  tente: 'tente (2 pl.)',
}
