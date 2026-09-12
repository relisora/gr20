import { haversineM } from '#shared/geo.mjs'

export interface TracePoint {
  lat: number
  lon: number
  ele: number
  /** distance cumulée depuis Calenzana, en km */
  km: number
}

// promesse partagée : TrailMap et ElevationProfile demandent le tracé en même temps
let inFlight: Promise<TracePoint[]> | null = null

async function fetchTrace(): Promise<TracePoint[]> {
  const feature = await $fetch<GeoJSON.Feature<GeoJSON.LineString>>('/data/trace-main-elev.geojson')
  const coords = feature.geometry.coordinates
  const out: TracePoint[] = new Array(coords.length)
  let cum = 0
  for (let i = 0; i < coords.length; i++) {
    const [lon = 0, lat = 0, ele = 0] = coords[i]!
    if (i > 0) {
      const [pLon = 0, pLat = 0] = coords[i - 1]!
      cum += haversineM(pLat, pLon, lat, lon)
    }
    out[i] = { lat, lon, ele, km: cum / 1000 }
  }
  return out
}

export function useTrace() {
  const points = useState<TracePoint[] | null>('trace-main-points', () => null)

  function load(): Promise<TracePoint[]> {
    if (points.value) return Promise.resolve(points.value)
    if (import.meta.server) return Promise.resolve([])
    inFlight ??= fetchTrace()
      .then((pts) => {
        // 8 866 points jamais mutés : pas de réactivité profonde
        points.value = markRaw(pts)
        return pts
      })
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  return { points, load }
}
