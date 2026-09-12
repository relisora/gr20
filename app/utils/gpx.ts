import type { PlanDay, Segment, Waypoint } from '~/types'
import type { TracePoint } from '~/composables/useTrace'

// Obligation de licence (OSM ODbL, IGN Etalab 2.0) : doit figurer dans tout fichier exporté.
const COPYRIGHT = '© les contributeurs OpenStreetMap (ODbL) ; altitudes IGN RGE ALTI (Etalab 2.0)'

interface GpxWpt {
  lat: number
  lon: number
  ele?: number | null
  name: string
}

interface GpxTrk {
  name: string
  points: TracePoint[]
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** « Ortu di u Piobbu » → « ortu-di-u-piobbu » */
function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function buildGpx(name: string, wpts: GpxWpt[], trks: GpxTrk[]): string {
  const wptXml = wpts
    .map((w) => `  <wpt lat="${w.lat}" lon="${w.lon}">${w.ele != null ? `<ele>${w.ele}</ele>` : ''}<name>${esc(w.name)}</name></wpt>`)
    .join('\n')

  // un <trk> par tronçon : les applis de rando (OsmAnd, Garmin…) les affichent séparément
  const trkXml = trks
    .map((t) => `  <trk>
    <name>${esc(t.name)}</name>
    <trkseg>
${t.points.map((p) => `      <trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.ele}</ele></trkpt>`).join('\n')}
    </trkseg>
  </trk>`)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="fra-li-monti" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${esc(name)}</name>
    <copyright author="${esc(COPYRIGHT)}"/>
  </metadata>
${wptXml}
${trkXml}
</gpx>`
}

function downloadGpx(gpx: string, filename: string) {
  downloadBlob(new Blob([gpx], { type: 'application/gpx+xml' }), filename)
}

/** Points du tracé couverts par des segments consécutifs (la fin d'un segment est le début du suivant). */
function tracePoints(segments: Segment[], points: TracePoint[]): TracePoint[] {
  const out: TracePoint[] = []
  for (const seg of segments) {
    const slice = points.slice(seg.trace.start, seg.trace.end + 1)
    out.push(...(out.length ? slice.slice(1) : slice))
  }
  return out
}

function toWpt(name: string, w: Waypoint): GpxWpt {
  return { lat: w.lat, lon: w.lon, ele: w.altitude_m, name }
}

function dayLabel(day: PlanDay): string {
  return `${day.isArrival ? 'Arrivée' : 'Nuit'} : ${day.to.name}${day.date ? ` (${day.date})` : ''}`
}

/** Tracé d'une seule journée du plan. */
export async function downloadDayGpx(day: PlanDay) {
  const { segmentsBetween } = useGr20()
  const points = await useTrace().load()
  const segments = segmentsBetween(day.from.id, day.to.id)
  if (!points.length || !segments.length) return

  const title = `GR20 jour ${day.index} — ${day.from.name} → ${day.to.name}`
  downloadGpx(
    buildGpx(
      title,
      [toWpt(`Départ : ${day.from.name}`, day.from), toWpt(dayLabel(day), day.to)],
      [{ name: title, points: tracePoints(segments, points) }],
    ),
    `gr20-jour-${day.index}-${slug(day.to.name)}.gpx`,
  )
}

/** Tracé complet du plan, un tronçon par journée. */
export async function downloadPlanGpx(days: PlanDay[]) {
  const { segmentsBetween } = useGr20()
  const points = await useTrace().load()
  const first = days[0]
  if (!points.length || !first) return

  const wpts = [toWpt(`Départ : ${first.from.name}`, first.from)]
  const trks: GpxTrk[] = []
  for (const day of days) {
    wpts.push(toWpt(dayLabel(day), day.to))
    const p = tracePoints(segmentsBetween(day.from.id, day.to.id), points)
    if (p.length) trks.push({ name: `Jour ${day.index} — ${day.from.name} → ${day.to.name}`, points: p })
  }

  downloadGpx(buildGpx('GR20 — plan personnel', wpts, trks), 'gr20-plan.gpx')
}

/** Tracé intégral Calenzana → Conca, tous les lieux du référentiel en waypoints. */
export async function downloadTraceGpx() {
  const { waypoints, waypointOrder, waypointById } = useGr20()
  const points = await useTrace().load()
  if (!points.length) return

  const onRoute = waypointOrder.map((id) => waypointById.get(id)).filter((w) => w != null)
  const offRoute = waypoints.filter((w) => !waypointOrder.includes(w.id))

  downloadGpx(
    buildGpx(
      'GR20 — tracé complet',
      [...onRoute, ...offRoute].map((w) => toWpt(w.name, w)),
      [{ name: 'GR20 Calenzana → Conca', points }],
    ),
    'gr20-trace-complet.gpx',
  )
}
