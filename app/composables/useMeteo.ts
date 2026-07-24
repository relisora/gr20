import type { Waypoint } from '~/types'

export interface MeteoJour {
  date: string
  code: number
  tMinC: number
  tMaxC: number
  precipMm: number
  precipProbPct: number | null
  ventMaxKmh: number
}

/** horizon de prévision Open-Meteo (aujourd'hui inclus) */
export const METEO_HORIZON_JOURS = 16

/** codes météo WMO → icône + libellé (groupes utiles en montagne) */
export const METEO_CODE_META: { codes: number[]; icon: string; label: string }[] = [
  { codes: [0], icon: 'i-lucide-sun', label: 'Ciel clair' },
  { codes: [1, 2], icon: 'i-lucide-cloud-sun', label: 'Peu nuageux' },
  { codes: [3], icon: 'i-lucide-cloud', label: 'Couvert' },
  { codes: [45, 48], icon: 'i-lucide-cloud-fog', label: 'Brouillard' },
  { codes: [51, 53, 55, 56, 57], icon: 'i-lucide-cloud-drizzle', label: 'Bruine' },
  { codes: [61, 63, 65, 66, 67], icon: 'i-lucide-cloud-rain', label: 'Pluie' },
  { codes: [71, 73, 75, 77, 85, 86], icon: 'i-lucide-cloud-snow', label: 'Neige' },
  { codes: [80, 81, 82], icon: 'i-lucide-cloud-rain-wind', label: 'Averses' },
  { codes: [95, 96, 99], icon: 'i-lucide-cloud-lightning', label: 'Orage' },
]

export function meteoCodeMeta(code: number) {
  return METEO_CODE_META.find((m) => m.codes.includes(code)) ?? { icon: 'i-lucide-cloud', label: `Code ${code}` }
}

interface OpenMeteoDaily {
  time: string[]
  weather_code: number[]
  temperature_2m_max: number[]
  temperature_2m_min: number[]
  precipitation_sum: number[]
  precipitation_probability_max: (number | null)[]
  wind_speed_10m_max: number[]
}

const TTL_MS = 60 * 60 * 1000 // les prévisions bougent lentement, 1 h suffit

// une seule requête en vol ; les appels concurrents attendent puis complètent ce qui manque
let enVol: Promise<void> | null = null

export function useMeteo() {
  const parWaypoint = useState<Record<string, MeteoJour[]>>('meteo-par-waypoint', () => ({}))
  // fraîcheur PAR waypoint : un fetch partiel ne doit pas « rajeunir » les autres
  const fetchedAtParWp = useState<Record<string, number>>('meteo-fetched-at-wp', () => ({}))
  const loading = useState('meteo-loading', () => false)
  const error = useState<string | null>('meteo-error', () => null)

  async function fetchInto(targets: Waypoint[]) {
    error.value = null
    try {
      const res = await $fetch<unknown>('https://api.open-meteo.com/v1/forecast', {
        params: {
          latitude: targets.map((w) => w.lat).join(','),
          longitude: targets.map((w) => w.lon).join(','),
          elevation: targets.map((w) => w.altitude_m).join(','),
          daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
          timezone: 'Europe/Paris',
          forecast_days: METEO_HORIZON_JOURS,
        },
        timeout: 15_000,
      })
      // 1 point → objet ; N points → tableau
      const arr = (Array.isArray(res) ? res : [res]) as { daily: OpenMeteoDaily }[]
      for (const [i, r] of arr.entries()) {
        const wp = targets[i]
        if (!wp || !r?.daily?.time) continue
        parWaypoint.value[wp.id] = r.daily.time.map((date, j) => ({
          date,
          code: r.daily.weather_code[j] ?? 3,
          tMinC: Math.round(r.daily.temperature_2m_min[j] ?? 0),
          tMaxC: Math.round(r.daily.temperature_2m_max[j] ?? 0),
          precipMm: Math.round((r.daily.precipitation_sum[j] ?? 0) * 10) / 10,
          precipProbPct: r.daily.precipitation_probability_max[j] ?? null,
          ventMaxKmh: Math.round(r.daily.wind_speed_10m_max[j] ?? 0),
        }))
        fetchedAtParWp.value[wp.id] = Date.now()
      }
    } catch {
      error.value = 'Météo indisponible (Open-Meteo injoignable)'
    }
  }

  /** charge (ou recharge si périmé) les prévisions 16 jours pour ces waypoints, en une requête */
  async function load(wps: Waypoint[]) {
    if (import.meta.server || wps.length === 0) return
    // attendre la requête en cours plutôt que jeter l'appel : rien ne se perd
    while (enVol) {
      try {
        await enVol
      } catch {
        /* les erreurs sont gérées dans fetchInto */
      }
    }
    const now = Date.now()
    const targets = wps.filter((w) => now - (fetchedAtParWp.value[w.id] ?? 0) > TTL_MS)
    if (targets.length === 0) return

    const run = fetchInto(targets)
    enVol = run
    loading.value = true
    try {
      await run
    } finally {
      loading.value = false
      enVol = null
    }
  }

  function meteoFor(waypointId: string, dateIso: string): MeteoJour | null {
    return parWaypoint.value[waypointId]?.find((j) => j.date === dateIso) ?? null
  }

  return { load, meteoFor, loading, error }
}
