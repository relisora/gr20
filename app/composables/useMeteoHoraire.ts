import type { PlanDay } from '~/types'

/** météo d'une heure pleine, à la position estimée du randonneur à cette heure */
export interface MeteoHeure {
  heure: number // 0..23, heure locale Europe/Paris
  tC: number
  code: number
  precipMm: number
  precipProbPct: number | null
  ventKmh: number
  rafalesKmh: number
  uvIndex: number | null
  altitudeM: number
  enMarche: boolean
}

interface OpenMeteoHourly {
  time: string[]
  temperature_2m: number[]
  precipitation: number[]
  precipitation_probability: (number | null)[]
  weather_code: number[]
  wind_speed_10m: number[]
  wind_gusts_10m: number[]
  uv_index: (number | null)[]
}

interface PositionHeure {
  lat: number
  lon: number
  ele: number
  enMarche: boolean
}

const TTL_MS = 60 * 60 * 1000

// requêtes en vol, par date : deux appels concurrents pour la même journée n'en lancent qu'une
const enVolParDate = new Map<string, Promise<void>>()

function heureEnDecimal(hhmm: string): number {
  const [h, m] = hhmm.split(':')
  return Number(h) + Number(m) / 60
}

export function useMeteoHoraire() {
  const { segmentsBetween, waypointById } = useGr20()
  const { load: loadTrace } = useTrace()

  const parDate = useState<Record<string, MeteoHeure[]>>('meteo-heures-par-date', () => ({}))
  const fetchedAtParDate = useState<Record<string, number>>('meteo-heures-fetched-at', () => ({}))
  // signature (positions + heure de départ) ayant servi au fetch : si le plan change, on refait
  const cleParDate = useState<Record<string, string>>('meteo-heures-cle', () => ({}))
  const loading = useState('meteo-heures-loading', () => false)
  const error = useState<string | null>('meteo-heures-error', () => null)

  /**
   * Position estimée à chaque heure pleine : avant le départ au lieu de la nuit précédente,
   * après l'arrivée au lieu de la nuit suivante, entre les deux le long du tracé — le temps est
   * réparti par segment selon les `time_h` calibrés (× paceFactor), puis linéairement dans les
   * indices de tracé du segment.
   */
  async function positionsPourJournee(day: PlanDay, heureDepart: string, paceFactor: number): Promise<PositionHeure[] | null> {
    const segs = segmentsBetween(day.from.id, day.to.id)
    const trace = await loadTrace()
    if (segs.length === 0 || trace.length === 0) return null

    const depart = heureEnDecimal(heureDepart)
    const durees = segs.map((s) => s.time_h * paceFactor)
    const total = durees.reduce((a, b) => a + b, 0)

    const auRepos = (id: string): PositionHeure | null => {
      const wp = waypointById.get(id)
      return wp ? { lat: wp.lat, lon: wp.lon, ele: wp.altitude_m, enMarche: false } : null
    }
    const posDepart = auRepos(day.from.id)
    const posArrivee = auRepos(day.to.id)
    if (!posDepart || !posArrivee) return null

    const out: PositionHeure[] = []
    for (let h = 0; h < 24; h++) {
      const ecoule = h - depart
      if (ecoule <= 0) {
        out.push(posDepart)
      } else if (ecoule >= total) {
        out.push(posArrivee)
      } else {
        let acc = 0
        let pos = posArrivee
        for (const [i, seg] of segs.entries()) {
          const duree = durees[i]!
          if (ecoule <= acc + duree) {
            const frac = (ecoule - acc) / duree
            const idx = Math.round(seg.trace.start + frac * (seg.trace.end - seg.trace.start))
            const p = trace[Math.min(idx, trace.length - 1)]!
            pos = { lat: p.lat, lon: p.lon, ele: p.ele, enMarche: true }
            break
          }
          acc += duree
        }
        out.push(pos)
      }
    }
    return out
  }

  async function fetchJournee(date: string, positions: PositionHeure[], cle: string) {
    // positions dédupliquées → moins de points dans l'URL, et une table heure → index de point
    const coords: { lat: number, lon: number, ele: number }[] = []
    const indexParCle = new Map<string, number>()
    const indexParHeure: number[] = []
    for (const p of positions) {
      // 4 décimales (≈ 11 m) : URL courte et STABLE pour un plan donné → retrouvée dans le cache
      // du service worker hors ligne
      const lat = Math.round(p.lat * 10_000) / 10_000
      const lon = Math.round(p.lon * 10_000) / 10_000
      const ele = Math.round(p.ele)
      const k = `${lat},${lon}`
      let i = indexParCle.get(k)
      if (i === undefined) {
        i = coords.length
        indexParCle.set(k, i)
        coords.push({ lat, lon, ele })
      }
      indexParHeure.push(i)
    }

    const res = await $fetch<unknown>('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude: coords.map((c) => c.lat).join(','),
        longitude: coords.map((c) => c.lon).join(','),
        elevation: coords.map((c) => c.ele).join(','),
        hourly: 'temperature_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,uv_index',
        timezone: 'Europe/Paris',
        start_date: date,
        end_date: date,
      },
      timeout: 15_000,
    })
    const arr = (Array.isArray(res) ? res : [res]) as { hourly: OpenMeteoHourly }[]

    const heures: MeteoHeure[] = []
    for (let h = 0; h < 24; h++) {
      const loc = arr[indexParHeure[h]!]?.hourly
      if (!loc?.time) continue
      const pos = positions[h]!
      heures.push({
        heure: h,
        tC: Math.round(loc.temperature_2m[h] ?? 0),
        code: loc.weather_code[h] ?? 3,
        precipMm: Math.round((loc.precipitation[h] ?? 0) * 10) / 10,
        precipProbPct: loc.precipitation_probability[h] ?? null,
        ventKmh: Math.round(loc.wind_speed_10m[h] ?? 0),
        rafalesKmh: Math.round(loc.wind_gusts_10m[h] ?? 0),
        uvIndex: loc.uv_index[h] != null ? Math.round(loc.uv_index[h]!) : null,
        altitudeM: Math.round(pos.ele),
        enMarche: pos.enMarche,
      })
    }
    if (heures.length !== 24) throw new Error('réponse horaire incomplète')
    parDate.value[date] = heures
    fetchedAtParDate.value[date] = Date.now()
    cleParDate.value[date] = cle
  }

  /**
   * Charge la météo horaire des journées datées passées en argument (à filtrer en amont sur
   * l'horizon de prévision) : une petite requête par journée, URLs déterministes pour un plan donné.
   */
  async function load(days: PlanDay[], heureDepart: string, paceFactor: number) {
    if (import.meta.server) return
    const cibles = days.filter((d): d is PlanDay & { date: string } => d.date != null)
    if (cibles.length === 0) return

    loading.value = true
    error.value = null
    let echec = false
    await Promise.all(
      cibles.map(async (day) => {
        const positions = await positionsPourJournee(day, heureDepart, paceFactor)
        if (!positions) return
        const cle = `${heureDepart}|${paceFactor}|${day.from.id}|${day.to.id}`
        const frais = Date.now() - (fetchedAtParDate.value[day.date] ?? 0) <= TTL_MS
        if (frais && cleParDate.value[day.date] === cle) return

        const dejaEnVol = enVolParDate.get(day.date)
        if (dejaEnVol) return dejaEnVol
        const run = fetchJournee(day.date, positions, cle).catch(() => {
          echec = true
        })
        enVolParDate.set(day.date, run)
        try {
          await run
        } finally {
          enVolParDate.delete(day.date)
        }
      }),
    )
    if (echec) error.value = 'Météo horaire incomplète (Open-Meteo injoignable)'
    loading.value = false
  }

  function heuresPour(dateIso: string): MeteoHeure[] | null {
    return parDate.value[dateIso] ?? null
  }

  return { load, heuresPour, loading, error }
}
