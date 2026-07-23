import waypointsJson from '~~/data/waypoints.json'
import segmentsJson from '~~/data/segments.json'
import accommodationsJson from '~~/data/accommodations.json'
import stagesJson from '~~/data/stages-official.json'
import pnrcJson from '~~/data/pnrc-2026.json'
import type { Accommodation, OfficialStage, Segment, StageRow, Waypoint } from '~/types'

const waypoints = waypointsJson.waypoints as Waypoint[]
const segments = segmentsJson.segments as Segment[]
const waypointOrder = (segmentsJson.waypoint_order as { id: string }[]).map((w) => w.id)
const accommodations = accommodationsJson.accommodations as Accommodation[]
const officialStages = stagesJson.stages as OfficialStage[]

const waypointById = new Map(waypoints.map((w) => [w.id, w]))
const segmentByPair = new Map(segments.map((s) => [`${s.from}--${s.to}`, s]))

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

const stageRows: StageRow[] = officialStages.map((st) => {
  const segs = segmentsBetween(st.from, st.to)
  return {
    num: st.num,
    from: waypointById.get(st.from)!,
    to: waypointById.get(st.to)!,
    distance_km: +segs.reduce((s, x) => s + x.distance_km, 0).toFixed(1),
    d_plus_m: segs.reduce((s, x) => s + x.d_plus_m, 0),
    d_minus_m: segs.reduce((s, x) => s + x.d_minus_m, 0),
    ele_max_m: Math.max(...segs.map((x) => x.ele_max_m)),
    time_h: +segs.reduce((s, x) => s + x.time_h, 0).toFixed(1),
    segments: segs,
  }
})

const accommodationsByWaypoint = new Map<string, Accommodation[]>()
for (const acc of accommodations) {
  const list = accommodationsByWaypoint.get(acc.waypoint) ?? []
  list.push(acc)
  accommodationsByWaypoint.set(acc.waypoint, list)
}

const totals = {
  distance_km: +segments.reduce((s, x) => s + x.distance_km, 0).toFixed(1),
  d_plus_m: segments.reduce((s, x) => s + x.d_plus_m, 0),
  d_minus_m: segments.reduce((s, x) => s + x.d_minus_m, 0),
  time_h: +segments.reduce((s, x) => s + x.time_h, 0).toFixed(1),
}

export function useGr20() {
  return {
    waypoints,
    waypointOrder,
    waypointById,
    segments,
    segmentsBetween,
    stageRows,
    accommodations,
    accommodationsByWaypoint,
    totals,
    pnrc: pnrcJson,
  }
}
