import type { PlanDay, Segment } from '~/types'
import type { TracePoint } from '~/composables/useTrace'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** nom de fichier lisible : « Ortu di u Piobbu » → « ortu-di-u-piobbu » */
function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

interface GpxWpt {
  lat: number
  lon: number
  ele?: number | null
  name: string
}

interface GpxSeg {
  name: string
  points: TracePoint[]
}

// L'attribution est une obligation de licence (OSM ODbL, IGN RGE ALTI Etalab 2.0),
// elle doit rester dans tout fichier exporté.
const COPYRIGHT = '© les contributeurs OpenStreetMap (ODbL) ; altitudes IGN RGE ALTI (Etalab 2.0)'

function buildGpx(name: string, wpts: GpxWpt[], segs: GpxSeg[]): string {
  const wptXml = wpts
    .map(
      (w) =>
        `  <wpt lat="${w.lat}" lon="${w.lon}">${w.ele != null ? `<ele>${w.ele}</ele>` : ''}<name>${esc(w.name)}</name></wpt>`,
    )
    .join('\n')

  // un <trk> par tronçon nommé : les applis de rando (OsmAnd, Garmin…) les affichent séparément
  const trkXml = segs
    .map(
      (s) => `  <trk>
    <name>${esc(s.name)}</name>
    <trkseg>
${s.points.map((p) => `      <trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.ele}</ele></trkpt>`).join('\n')}
    </trkseg>
  </trk>`,
    )
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

function telecharger(gpx: string, fichier: string) {
  const blob = new Blob([gpx], { type: 'application/gpx+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fichier
  // l'ancre doit être dans le DOM (Firefox) et l'URL révoquée en différé,
  // sinon le téléchargement peut être annulé avant de démarrer
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

/**
 * Points du tracé couverts par une suite de segments consécutifs.
 * `segment.trace.start/end` sont des index dans le tableau de `useTrace` (même fichier source) ;
 * la fin d'un segment est le début du suivant, d'où le `+ 1` seulement sur le premier découpage.
 */
function pointsDeSegments(segments: Segment[], points: TracePoint[]): TracePoint[] {
  const out: TracePoint[] = []
  for (const seg of segments) {
    const tranche = points.slice(seg.trace.start, seg.trace.end + 1)
    out.push(...(out.length ? tranche.slice(1) : tranche))
  }
  return out
}

function wptDuLieu(nom: string, w: { lat: number; lon: number; altitude_m: number }): GpxWpt {
  return { lat: w.lat, lon: w.lon, ele: w.altitude_m, name: nom }
}

/** Tracé d'une seule journée du plan (de l'étape précédente à la nuitée ou à l'arrivée). */
export async function downloadDayGpx(day: PlanDay) {
  const { segmentsBetween } = useGr20()
  const points = await useTrace().load()
  const segments = segmentsBetween(day.from.id, day.to.id)
  if (!points.length || !segments.length) return

  const titre = `GR20 jour ${day.index} — ${day.from.name} → ${day.to.name}`
  telecharger(
    buildGpx(
      titre,
      [wptDuLieu(`Départ : ${day.from.name}`, day.from), wptDuLieu(`${day.isArrival ? 'Arrivée' : 'Nuit'} : ${day.to.name}${day.date ? ` (${day.date})` : ''}`, day.to)],
      [{ name: titre, points: pointsDeSegments(segments, points) }],
    ),
    `gr20-jour-${day.index}-${slug(day.to.name)}.gpx`,
  )
}

/** Tracé complet du plan, découpé en un tronçon par journée. */
export async function downloadPlanGpx(days: PlanDay[]) {
  const { segmentsBetween } = useGr20()
  const points = await useTrace().load()
  if (!points.length || !days.length) return

  const wpts: GpxWpt[] = []
  const segs: GpxSeg[] = []
  const premier = days[0]!
  wpts.push(wptDuLieu(`Départ : ${premier.from.name}`, premier.from))

  for (const day of days) {
    const label = day.isArrival ? `Arrivée : ${day.to.name}` : `Nuit ${day.index} : ${day.to.name}`
    wpts.push(wptDuLieu(`${label}${day.date ? ` (${day.date})` : ''}`, day.to))
    const p = pointsDeSegments(segmentsBetween(day.from.id, day.to.id), points)
    if (p.length) segs.push({ name: `Jour ${day.index} — ${day.from.name} → ${day.to.name}`, points: p })
  }

  telecharger(buildGpx('GR20 — plan personnel', wpts, segs), 'gr20-plan.gpx')
}

/** Tracé intégral Calenzana → Conca, avec tous les lieux du référentiel en waypoints. */
export async function downloadTraceGpx() {
  const { waypoints, waypointOrder, waypointById } = useGr20()
  const points = await useTrace().load()
  if (!points.length) return

  const ordonnes = waypointOrder.map((id) => waypointById.get(id)).filter((w) => w != null)
  const hors = waypoints.filter((w) => !waypointOrder.includes(w.id))

  telecharger(
    buildGpx(
      'GR20 — tracé complet',
      [...ordonnes, ...hors].map((w) => wptDuLieu(w.name, w)),
      [{ name: 'GR20 Calenzana → Conca', points }],
    ),
    'gr20-trace-complet.gpx',
  )
}
