// Construit le graphe de segments du GR20 :
// - snappe chaque waypoint de data/waypoints.json sur le tracé enrichi en altitude
// - découpe le tracé en segments entre waypoints consécutifs
// - calcule distance, D+/D- (accumulateur à hystérésis), alt min/max, temps de base
//
// Le temps de base suit la formule additive dist/v_flat + D+/v_up + D-/v_down,
// multipliée ensuite par terrain_factor (calibré sur les temps officiels des étapes,
// cf. scripts/calibrate-times.mjs) — le GR20 est bien plus lent que la formule nue.
//
// Usage : node scripts/build-segments.mjs

import { readFile, writeFile } from 'node:fs/promises';

const HYSTERESIS_M = 5; // seuil de lissage du dénivelé
const SPEEDS = { flat_kmh: 4.0, up_mh: 350, down_mh: 600 };
const SNAP_WARN_M = 300; // au-delà : hébergement hors tracé (accès à signaler)

const R = 6371008.8;
function haversine([lon1, lat1], [lon2, lat2]) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function nearestIndex(coords, [lon, lat]) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = haversine(coords[i], [lon, lat]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { index: best, dist_m: Math.round(bestD) };
}

function segmentStats(coords) {
  let dist = 0;
  for (let i = 1; i < coords.length; i++) dist += haversine(coords[i - 1], coords[i]);

  let dPlus = 0;
  let dMinus = 0;
  let ref = coords[0][2];
  let eleMin = Infinity;
  let eleMax = -Infinity;
  for (const [, , z] of coords) {
    if (z == null || z <= -99) continue;
    eleMin = Math.min(eleMin, z);
    eleMax = Math.max(eleMax, z);
    const diff = z - ref;
    if (diff >= HYSTERESIS_M) {
      dPlus += diff;
      ref = z;
    } else if (diff <= -HYSTERESIS_M) {
      dMinus += -diff;
      ref = z;
    }
  }

  const distKm = dist / 1000;
  const timeBase = distKm / SPEEDS.flat_kmh + dPlus / SPEEDS.up_mh + dMinus / SPEEDS.down_mh;
  return {
    distance_km: +distKm.toFixed(2),
    d_plus_m: Math.round(dPlus),
    d_minus_m: Math.round(dMinus),
    ele_min_m: Math.round(eleMin),
    ele_max_m: Math.round(eleMax),
    time_base_h: +timeBase.toFixed(2),
  };
}

const trace = JSON.parse(await readFile('data/raw/trace-main-elev.geojson', 'utf8'));
const coords = trace.geometry.coordinates;
const { waypoints } = JSON.parse(await readFile('data/waypoints.json', 'utf8'));

// Snapping — seuls les waypoints du tracé principal découpent celui-ci.
const snapped = [];
for (const wp of waypoints) {
  if (wp.off_route) continue;
  const { index, dist_m } = nearestIndex(coords, [wp.lon, wp.lat]);
  if (dist_m > SNAP_WARN_M) {
    console.warn(`⚠ ${wp.id} est à ${dist_m} m du tracé — marquer off_route ou vérifier les coords ?`);
  }
  snapped.push({ ...wp, trace_index: index, dist_to_trail_m: dist_m });
}
snapped.sort((a, b) => a.trace_index - b.trace_index);

console.log('Ordre le long du tracé (Calenzana → Conca) :');
for (const wp of snapped) console.log(`  ${String(wp.trace_index).padStart(5)}  ${wp.id} (à ${wp.dist_to_trail_m} m du tracé)`);

const segments = [];
for (let i = 1; i < snapped.length; i++) {
  const from = snapped[i - 1];
  const to = snapped[i];
  if (to.trace_index === from.trace_index) {
    console.warn(`⚠ ${from.id} et ${to.id} snappent au même point — segment vide ignoré`);
    continue;
  }
  const slice = coords.slice(from.trace_index, to.trace_index + 1);
  const stats = segmentStats(slice);
  segments.push({
    id: `${from.id}--${to.id}`,
    from: from.id,
    to: to.id,
    ...stats,
    terrain_factor: 1.0, // calibré ensuite sur les temps officiels
    time_h: stats.time_base_h,
    trace: { file: 'raw/trace-main-elev.geojson', start: from.trace_index, end: to.trace_index },
  });
}

const total = segments.reduce(
  (acc, s) => ({
    km: acc.km + s.distance_km,
    dp: acc.dp + s.d_plus_m,
    dm: acc.dm + s.d_minus_m,
  }),
  { km: 0, dp: 0, dm: 0 }
);

await writeFile(
  'data/segments.json',
  JSON.stringify(
    {
      generated_at: new Date().toISOString().slice(0, 10),
      params: { hysteresis_m: HYSTERESIS_M, speeds: SPEEDS },
      waypoint_order: snapped.map((w) => ({ id: w.id, trace_index: w.trace_index, dist_to_trail_m: w.dist_to_trail_m })),
      segments,
    },
    null,
    2
  )
);

console.log(
  `✔ data/segments.json : ${segments.length} segments, ${total.km.toFixed(1)} km, D+ ${total.dp} m, D- ${total.dm} m`
);
