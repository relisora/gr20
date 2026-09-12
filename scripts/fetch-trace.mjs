// Assemble le tracé du GR20 en pleine résolution :
// - l'ordre des ways vient du JSON Waymarked Trails (data/raw/waymarked-*.json)
// - la géométrie complète des ways vient d'Overpass (les géométries Waymarked sont simplifiées)
// Sortie : GeoJSON LineString WGS84 [lon, lat].
//
// Usage : node scripts/fetch-trace.mjs <waymarked.json> <out.geojson> [--name "..."]

import { readFile, writeFile } from 'node:fs/promises'
import { haversineM } from '../shared/geo.mjs'

const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
const GAP_WARN_M = 50

/** distance entre deux positions GeoJSON [lon, lat], en mètres */
const haversine = ([lon1, lat1], [lon2, lat2]) => haversineM(lat1, lon1, lat2, lon2)

// Collecte récursive des ways "base" sous route.main, dans l'ordre du parcours
// (les offsets `start` sont cumulés le long de l'itinéraire).
function collectWays(node, acc) {
  if (Array.isArray(node)) {
    for (const child of node) collectWays(child, acc)
  } else if (node && typeof node === 'object') {
    if (node.route_type === 'base' && typeof node.id === 'number') {
      acc.push({ id: node.id, start: node.start ?? 0 })
      return
    }
    // ne pas descendre dans les appendices (variantes traitées séparément)
    for (const [key, child] of Object.entries(node)) {
      if (key === 'appendices') continue
      collectWays(child, acc)
    }
  }
  return acc
}

async function fetchWayGeometries(ids) {
  const query = `[out:json][timeout:120];way(id:${ids.join(',')});out geom;`
  let json
  let lastErr
  outer: for (let attempt = 0; attempt < 3; attempt++) {
    for (const server of OVERPASS_SERVERS) {
      try {
        const res = await fetch(server, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'gr20-data-pipeline/0.1 (outil perso de planification, usage ponctuel)',
            'Accept': 'application/json',
          },
          body: 'data=' + encodeURIComponent(query),
        })
        if (!res.ok) throw new Error(`Overpass ${res.status} (${server})`)
        json = await res.json()
        break outer
      } catch (err) {
        lastErr = err
        console.warn(`  ${err.message} — nouvel essai…`)
      }
    }
    await new Promise((r) => setTimeout(r, (attempt + 1) * 5000))
  }
  if (!json) throw lastErr
  const byId = new Map()
  for (const el of json.elements) {
    if (el.type === 'way' && el.geometry) {
      byId.set(el.id, el.geometry.map((p) => [p.lon, p.lat]))
    }
  }
  return byId
}

// Oriente chaque way pour que son début colle à la fin du précédent.
function assemble(orderedIds, geomById) {
  const coords = []
  const gaps = []
  let prevEnd = null

  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i]
    let pts = geomById.get(id)
    if (!pts || pts.length < 2) {
      console.warn(`⚠ way ${id} sans géométrie, ignoré`)
      continue
    }
    pts = [...pts]

    if (prevEnd === null) {
      // Oriente le premier way d'après le suivant : son extrémité "libre"
      // doit être la plus éloignée du way n°2.
      const next = geomById.get(orderedIds[i + 1])
      if (next) {
        const dEnd = Math.min(haversine(pts.at(-1), next[0]), haversine(pts.at(-1), next.at(-1)))
        const dStart = Math.min(haversine(pts[0], next[0]), haversine(pts[0], next.at(-1)))
        if (dStart < dEnd) pts.reverse()
      }
    } else {
      const dForward = haversine(prevEnd, pts[0])
      const dReverse = haversine(prevEnd, pts.at(-1))
      if (dReverse < dForward) pts.reverse()
      const gap = Math.min(dForward, dReverse)
      if (gap > GAP_WARN_M) gaps.push({ afterWay: orderedIds[i - 1], way: id, gap_m: Math.round(gap) })
      // point de jonction dupliqué → on le saute s'il est identique
      if (gap < 0.5) pts.shift()
    }

    coords.push(...pts)
    prevEnd = coords.at(-1)
  }
  return { coords, gaps }
}

const [waymarkedPath, outPath] = process.argv.slice(2)
const nameArg = process.argv.includes('--name')
  ? process.argv[process.argv.indexOf('--name') + 1]
  : null
if (!waymarkedPath || !outPath) {
  console.error('Usage: node scripts/fetch-trace.mjs <waymarked.json> <out.geojson> [--name "..."]')
  process.exit(1)
}

const wm = JSON.parse(await readFile(waymarkedPath, 'utf8'))
const ways = collectWays(wm.route.main, []).sort((a, b) => a.start - b.start)
const orderedIds = ways.map((w) => w.id)
console.log(`${orderedIds.length} ways ordonnés (relation ${wm.id} « ${wm.name} »)`)

const geomById = await fetchWayGeometries([...new Set(orderedIds)])
console.log(`${geomById.size} géométries récupérées d'Overpass`)

const { coords, gaps } = assemble(orderedIds, geomById)
let length = 0
for (let i = 1; i < coords.length; i++) length += haversine(coords[i - 1], coords[i])

for (const g of gaps) console.warn(`⚠ trou de ${g.gap_m} m entre way ${g.afterWay} et way ${g.way}`)

const feature = {
  type: 'Feature',
  properties: {
    name: nameArg ?? wm.name,
    osm_relation: wm.id,
    source: '© les contributeurs OpenStreetMap (ODbL), assemblage via Waymarked Trails + Overpass',
    length_m: Math.round(length),
    n_points: coords.length,
    fetched_at: new Date().toISOString().slice(0, 10),
    gaps,
  },
  geometry: { type: 'LineString', coordinates: coords.map(([lon, lat]) => [+lon.toFixed(6), +lat.toFixed(6)]) },
}

await writeFile(outPath, JSON.stringify(feature))
console.log(`✔ ${outPath} : ${coords.length} points, ${(length / 1000).toFixed(1)} km, ${gaps.length} trou(x)`)
