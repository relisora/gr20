export interface Waypoint {
  id: string
  name: string
  type: 'refuge' | 'bergerie' | 'village' | 'col' | 'station'
  lat: number
  lon: number
  altitude_m: number
  off_route?: boolean
}

export interface Segment {
  id: string
  from: string
  to: string
  distance_km: number
  d_plus_m: number
  d_minus_m: number
  ele_min_m: number
  ele_max_m: number
  time_base_h: number
  terrain_factor: number
  time_h: number
  official_stage?: string
  trace: { file: string, start: number, end: number }
}

export interface Formule {
  type: 'dortoir' | 'bivouac' | 'tente_louee' | 'chambre' | 'camping' | 'demi-pension'
  prix_eur: number | null
  /** 'tente' : prix à la tente selon occupation (CGV PNRC : tentes 2 places, 27 € seul / 39 € à deux) */
  par: 'personne' | 'chambre' | 'tente'
  /** prix de la tente occupée par 2 personnes (par: 'tente' uniquement) */
  prix_2p_eur?: number
  places?: number
  note?: string
}

export interface Accommodation {
  id: string
  name: string
  type: 'refuge-pnrc' | 'bergerie' | 'gite' | 'gite-communal' | 'hotel' | 'camping'
  waypoint: string
  lat: number
  lon: number
  altitude_m: number
  formules: Formule[]
  services: {
    repas: boolean
    epicerie: boolean
    douche: boolean | 'froide' | null
    eau?: boolean
    acces_route: boolean
  }
  reservation: {
    canal: 'pnr-resa' | 'telephone' | 'email' | 'site-web' | 'sur-place'
    telephone?: string | null
    email?: string | null
    site?: string | null
  }
  ouverture?: string
  notes: string
  sources: string[]
  unverified: string[]
}

export interface OfficialStage {
  num: number
  from: string
  to: string
  temps_h_min: number
  temps_h_max: number
}

export type DispoLevel = 'dispo' | 'peu' | 'complet'

export interface DispoSnapshot {
  version: 1
  scannedAt: string
  dateDebut: string
  dateFin: string
  source: string
  legende: Record<DispoLevel, string>
  refugesIgnores: string[]
  /** accommodationId → date ISO → formule → niveau */
  dispo: Record<string, Record<string, Partial<Record<string, DispoLevel>>>>
}

export interface GoogleRating {
  note: number | null
  nbAvis: number | null
  urlMaps: string | null
  confiance: 'haute' | 'moyenne' | 'basse'
}

export interface GoogleRatingsFile {
  version: 1
  releveLe: string
  source: string
  notes: Record<string, GoogleRating>
}

export type BookingStatus = 'a_reserver' | 'reserve' | 'complet' | 'liste_attente'

export interface PlanNight {
  waypointId: string
  accommodationId: string | null
  formuleType: string | null
  booking: {
    status: BookingStatus
    reference: string
    prixPayeEur: number | null
    notes: string
  }
}

export interface TrekPlan {
  version: number
  startDate: string | null
  /** heure de départ quotidienne « HH:MM » — sert à estimer la position pour la météo horaire */
  heureDepart: string
  partySize: number
  paceFactor: number
  nights: PlanNight[]
}

export interface PlanDay {
  index: number
  date: string | null
  from: Waypoint
  to: Waypoint
  distance_km: number
  d_plus_m: number
  d_minus_m: number
  time_h: number
  night: PlanNight | null
  accommodation: Accommodation | null
  isArrival: boolean
}

export interface StageRow {
  num: number
  from: Waypoint
  to: Waypoint
  distance_km: number
  d_plus_m: number
  d_minus_m: number
  ele_max_m: number
  time_h: number
  segments: Segment[]
}
