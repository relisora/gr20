// Calibre les temps de marche des segments sur les temps officiels des étapes.
//
// La formule additive (dist/v + D+/v_up + D-/v_down) sous-estime largement le GR20
// (terrain technique : dalles, blocs, passages câblés). Pour chaque étape officielle
// (data/stages-official.json : {from, to, temps_h_min, temps_h_max}), on calcule
// terrain_factor = temps_officiel_médian / somme des time_base_h des segments couverts,
// et on applique ce facteur à chacun de ces segments.
//
// Usage : node scripts/calibrate-times.mjs

import { readFile, writeFile } from 'node:fs/promises'

const data = JSON.parse(await readFile('data/segments.json', 'utf8'))
const { stages } = JSON.parse(await readFile('data/stages-official.json', 'utf8'))

const order = data.waypoint_order.map((w) => w.id)
const segByPair = new Map(data.segments.map((s) => [`${s.from}--${s.to}`, s]))

function segmentsBetween(from, to) {
  const i = order.indexOf(from)
  const j = order.indexOf(to)
  if (i === -1 || j === -1 || j <= i) throw new Error(`Étape introuvable sur le tracé : ${from} → ${to}`)
  const segs = []
  for (let k = i; k < j; k++) {
    const s = segByPair.get(`${order[k]}--${order[k + 1]}`)
    if (!s) throw new Error(`Segment manquant : ${order[k]} → ${order[k + 1]}`)
    segs.push(s)
  }
  return segs
}

console.log('Étape'.padEnd(45), 'formule', 'officiel', 'facteur')
for (const st of stages) {
  const segs = segmentsBetween(st.from, st.to)
  const base = segs.reduce((sum, s) => sum + s.time_base_h, 0)
  const official = (st.temps_h_min + st.temps_h_max) / 2
  const factor = +(official / base).toFixed(2)
  for (const s of segs) {
    s.terrain_factor = factor
    s.time_h = +(s.time_base_h * factor).toFixed(2)
    s.official_stage = `${st.from}--${st.to}`
  }
  console.log(
    `${st.from} → ${st.to}`.padEnd(45),
    `${base.toFixed(1)}h`.padStart(6),
    `${official.toFixed(1)}h`.padStart(8),
    `×${factor}`.padStart(7),
  )
}

const uncal = data.segments.filter((s) => !s.official_stage)
if (uncal.length) {
  const avg
    = data.segments.filter((s) => s.official_stage).reduce((sum, s) => sum + s.terrain_factor, 0)
      / data.segments.filter((s) => s.official_stage).length
  for (const s of uncal) {
    s.terrain_factor = +avg.toFixed(2)
    s.time_h = +(s.time_base_h * s.terrain_factor).toFixed(2)
  }
  console.log(`${uncal.length} segment(s) hors étapes officielles calibré(s) au facteur moyen ×${avg.toFixed(2)}`)
}

data.calibrated_at = new Date().toISOString().slice(0, 10)
await writeFile('data/segments.json', JSON.stringify(data, null, 2))
console.log(`✔ data/segments.json recalibré (${stages.length} étapes officielles)`)
