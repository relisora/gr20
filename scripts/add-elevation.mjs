// Enrichit un tracé GeoJSON avec les altitudes IGN (RGE ALTI, Géoplateforme).
// Chaque coordonnée devient [lon, lat, ele]. Fallback : Open-Meteo (DEM 90 m).
//
// Usage : node scripts/add-elevation.mjs <in.geojson> <out.geojson>

import { readFile, writeFile } from 'node:fs/promises'

const IGN_URL = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json'
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/elevation'
const BATCH = 100
const DELAY_MS = 250 // ~4 req/s, sous la limite IGN de 5 req/s

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function ignBatch(coords) {
  const lon = coords.map(([x]) => x).join('|')
  const lat = coords.map(([, y]) => y).join('|')
  const url = `${IGN_URL}?lon=${lon}&lat=${lat}&resource=ign_rge_alti_wld&zonly=true`
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (res.ok) {
      const json = await res.json()
      const zs = json.elevations.map((e) => (typeof e === 'number' ? e : e.z))
      if (zs.length !== coords.length) throw new Error(`IGN : ${zs.length} altitudes pour ${coords.length} points`)
      return zs
    }
    if (attempt < 3) await sleep(attempt * 2000)
    else throw new Error(`IGN ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
}

async function openMeteoBatch(coords) {
  const latitude = coords.map(([, y]) => y).join(',')
  const longitude = coords.map(([x]) => x).join(',')
  const res = await fetch(`${OPEN_METEO_URL}?latitude=${latitude}&longitude=${longitude}`)
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
  return (await res.json()).elevation
}

const [inPath, outPath] = process.argv.slice(2)
if (!inPath || !outPath) {
  console.error('Usage: node scripts/add-elevation.mjs <in.geojson> <out.geojson>')
  process.exit(1)
}

const feature = JSON.parse(await readFile(inPath, 'utf8'))
const coords = feature.geometry.coordinates
console.log(`${coords.length} points à enrichir (${inPath})`)

const elevations = new Array(coords.length)
let provider = 'IGN RGE ALTI (Géoplateforme, licence Etalab 2.0)'

for (let i = 0; i < coords.length; i += BATCH) {
  const batch = coords.slice(i, i + BATCH)
  try {
    const zs = await ignBatch(batch)
    zs.forEach((z, j) => (elevations[i + j] = z))
  } catch (err) {
    console.warn(`⚠ IGN en échec sur le lot ${i / BATCH} (${err.message}) → fallback Open-Meteo`)
    const zs = await openMeteoBatch(batch)
    zs.forEach((z, j) => (elevations[i + j] = z))
    provider = 'mixte IGN / Open-Meteo Copernicus GLO-90'
  }
  if (i % (BATCH * 10) === 0) process.stdout.write(`  ${Math.min(i + BATCH, coords.length)}/${coords.length}\r`)
  await sleep(DELAY_MS)
}

const invalid = elevations.filter((z) => z == null || z <= -99).length
if (invalid > 0) console.warn(`⚠ ${invalid} altitude(s) invalide(s) (-99999 = hors MNT)`)

feature.geometry.coordinates = coords.map(([lon, lat], i) => [lon, lat, Math.round(elevations[i] * 10) / 10])
feature.properties.elevation_source = provider
const zs = feature.geometry.coordinates.map((c) => c[2]).filter((z) => z > -99)
feature.properties.ele_min = Math.min(...zs)
feature.properties.ele_max = Math.max(...zs)

await writeFile(outPath, JSON.stringify(feature))
console.log(`✔ ${outPath} : alt ${feature.properties.ele_min} → ${feature.properties.ele_max} m (${provider})`)
