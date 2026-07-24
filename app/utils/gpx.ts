import type { PlanDay } from '~/types'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function downloadPlanGpx(days: PlanDay[]) {
  const trace = await $fetch<GeoJSON.Feature<GeoJSON.LineString>>('/data/trace-main-elev.geojson')
  const coords = trace.geometry.coordinates

  const wpts = days
    .map((d) => {
      const label = d.isArrival ? `Arrivée : ${d.to.name}` : `Nuit ${d.index} : ${d.to.name}`
      return `  <wpt lat="${d.to.lat}" lon="${d.to.lon}"><ele>${d.to.altitude_m}</ele><name>${esc(label)}${d.date ? ` (${d.date})` : ''}</name></wpt>`
    })
    .join('\n')

  const trkpts = coords
    .map(([lon, lat, ele]) => `      <trkpt lat="${lat}" lon="${lon}">${ele != null ? `<ele>${ele}</ele>` : ''}</trkpt>`)
    .join('\n')

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="fra-li-monti" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>GR20 — plan personnel</name>
    <copyright author="© les contributeurs OpenStreetMap (ODbL) ; altitudes IGN RGE ALTI (Etalab 2.0)"/>
  </metadata>
${wpts}
  <trk>
    <name>GR20 Calenzana → Conca</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`

  const blob = new Blob([gpx], { type: 'application/gpx+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'gr20-plan.gpx'
  // l'ancre doit être dans le DOM (Firefox) et l'URL révoquée en différé,
  // sinon le téléchargement peut être annulé avant de démarrer
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
