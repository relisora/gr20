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
  trace: { file: string; start: number; end: number }
}

export interface Formule {
  type: 'dortoir' | 'bivouac' | 'tente_louee' | 'chambre' | 'camping' | 'demi-pension'
  prix_eur: number | null
  par: 'personne' | 'chambre'
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
