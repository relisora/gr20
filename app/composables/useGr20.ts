import waypointsJson from '~~/data/waypoints.json'
import segmentsJson from '~~/data/segments.json'
import accommodationsJson from '~~/data/accommodations.json'
import stagesJson from '~~/data/stages-official.json'
import pnrcJson from '~~/data/pnrc-2026.json'
import googleRatingsJson from '~~/data/google-ratings.json'
import type { Accommodation, GoogleRating, OfficialStage, Segment, StageRow, Waypoint } from '~/types'

// Référentiel statique : les JSON sont transformés une seule fois à l'import, partagés par tous les appelants.

const waypoints = waypointsJson.waypoints as Waypoint[]
const segments = segmentsJson.segments as Segment[]
/** Ids des waypoints du graphe, dans le sens Calenzana → Conca. */
const waypointOrder = segmentsJson.waypoint_order.map((w) => w.id)
const accommodations = accommodationsJson.accommodations as Accommodation[]
const officialStages = stagesJson.stages as OfficialStage[]
/** Lieux de nuitée du découpage officiel (l'arrivée n'est pas une nuitée). */
const officialNightIds = officialStages.slice(0, -1).map((s) => s.to)

const waypointById = new Map(waypoints.map((w) => [w.id, w]))
const segmentByPair = new Map(segments.map((s) => [`${s.from}--${s.to}`, s]))

/** Segments consécutifs de `from` à `to` ; `[]` si `to` précède `from` ou si l'un est hors graphe. */
function segmentsBetween(from: string, to: string): Segment[] {
  const i = waypointOrder.indexOf(from)
  const j = waypointOrder.indexOf(to)
  if (i === -1 || j === -1 || j <= i) return []
  const out: Segment[] = []
  for (let k = i; k < j; k++) {
    const s = segmentByPair.get(`${waypointOrder[k]}--${waypointOrder[k + 1]}`)
    if (s) out.push(s)
  }
  return out
}

/** Distance, dénivelés et temps calibré (× `paceFactor`) cumulés d'une suite de segments. */
function sumSegments(segs: Segment[], paceFactor = 1) {
  return {
    distance_km: +segs.reduce((s, x) => s + x.distance_km, 0).toFixed(1),
    d_plus_m: segs.reduce((s, x) => s + x.d_plus_m, 0),
    d_minus_m: segs.reduce((s, x) => s + x.d_minus_m, 0),
    time_h: +(segs.reduce((s, x) => s + x.time_h, 0) * paceFactor).toFixed(1),
  }
}

const stageRows: StageRow[] = officialStages.map((st) => {
  const segs = segmentsBetween(st.from, st.to)
  return {
    num: st.num,
    from: waypointById.get(st.from)!,
    to: waypointById.get(st.to)!,
    ...sumSegments(segs),
    ele_max_m: Math.max(...segs.map((x) => x.ele_max_m)),
    segments: segs,
  }
})

const accommodationsByWaypoint = new Map<string, Accommodation[]>()
for (const acc of accommodations) {
  const list = accommodationsByWaypoint.get(acc.waypoint) ?? []
  list.push(acc)
  accommodationsByWaypoint.set(acc.waypoint, list)
}

const googleRatings = googleRatingsJson.notes as Record<string, GoogleRating>

function googleRatingFor(accommodationId: string): GoogleRating | null {
  return googleRatings[accommodationId] ?? null
}

const totals = sumSegments(segments)

export function useGr20() {
  return {
    waypoints,
    waypointOrder,
    waypointById,
    segments,
    segmentsBetween,
    sumSegments,
    stageRows,
    officialNightIds,
    accommodations,
    accommodationsByWaypoint,
    googleRatingFor,
    googleRatingsReleveLe: googleRatingsJson.releveLe,
    totals,
    pnrc: pnrcJson,
  }
}
