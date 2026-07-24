export interface TracePoint {
  lat: number
  lon: number
  ele: number
  /** distance cumulée depuis le départ, en km (haversine) */
  km: number
}

const R = 6_371_000 // rayon terrestre moyen, m

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

// une seule requête en vol : les appels concurrents (TrailMap + profil) la partagent
let enVol: Promise<TracePoint[]> | null = null

export function useTrace() {
  // markRaw : 8 866 points, aucune réactivité profonde (le tableau n'est jamais muté)
  const points = useState<TracePoint[] | null>('trace-main-points', () => null)

  async function load(): Promise<TracePoint[]> {
    if (points.value) return points.value
    if (import.meta.server) return []
    if (enVol) return enVol

    enVol = (async () => {
      const feature = await $fetch<GeoJSON.Feature<GeoJSON.LineString>>('/data/trace-main-elev.geojson')
      const coords = feature.geometry.coordinates
      const out: TracePoint[] = new Array(coords.length)
      let cum = 0
      for (let i = 0; i < coords.length; i++) {
        const c = coords[i]!
        const lon = c[0]!
        const lat = c[1]!
        const ele = c[2] ?? 0
        if (i > 0) {
          const p = coords[i - 1]!
          cum += haversine(p[1]!, p[0]!, lat, lon)
        }
        out[i] = { lat, lon, ele, km: cum / 1000 }
      }
      points.value = markRaw(out)
      return out
    })()

    try {
      return await enVol
    } finally {
      enVol = null
    }
  }

  return { points, load }
}
