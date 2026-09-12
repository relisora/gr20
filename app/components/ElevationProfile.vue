<script setup lang="ts">
import type { TracePoint } from '~/composables/useTrace'

const props = withDefaults(defineProps<{ height?: number }>(), { height: 200 })

const emit = defineEmits<{
  hover: [point: TracePoint | null]
  select: [point: TracePoint]
}>()

const { totals, waypoints } = useGr20()
const { points, load } = useTrace()

const gradId = useId()
const MARGIN = { top: 12, right: 14, bottom: 22, left: 44 }
const width = ref(800)
const wrapEl = ref<HTMLElement | null>(null)
const svgEl = ref<SVGSVGElement | null>(null)
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  load()
  if (wrapEl.value) {
    width.value = wrapEl.value.clientWidth || width.value
    resizeObserver = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) width.value = w
    })
    resizeObserver.observe(wrapEl.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  if (rafId) cancelAnimationFrame(rafId)
})

/** Sous-échantillonnage qui conserve le min et le max de chaque intervalle : sommets et cols intacts. */
function downsample(pts: TracePoint[], target = 1000): TracePoint[] {
  if (pts.length <= target) return pts
  const buckets = Math.max(1, Math.floor(target / 2))
  const size = pts.length / buckets
  const out: TracePoint[] = [pts[0]!]
  for (let b = 0; b < buckets; b++) {
    const start = Math.max(1, Math.floor(b * size))
    const end = Math.min(pts.length, Math.floor((b + 1) * size))
    if (end <= start) continue
    let minI = start
    let maxI = start
    for (let i = start + 1; i < end; i++) {
      if (pts[i]!.ele < pts[minI]!.ele) minI = i
      if (pts[i]!.ele > pts[maxI]!.ele) maxI = i
    }
    const lo = Math.min(minI, maxI)
    const hi = Math.max(minI, maxI)
    out.push(pts[lo]!)
    if (hi !== lo) out.push(pts[hi]!)
  }
  const last = pts[pts.length - 1]!
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

const sampled = computed<TracePoint[]>(() => (points.value ? downsample(points.value) : []))

const eleMin = computed(() => (points.value ? Math.min(...points.value.map((p) => p.ele)) : 0))
const eleMax = computed(() => (points.value ? Math.max(...points.value.map((p) => p.ele)) : 1))
const maxKm = computed(() => (points.value ? points.value[points.value.length - 1]!.km : 1))

// domaine Y arrondi à la centaine, graduations tous les 500 m
const yMin = computed(() => Math.floor(eleMin.value / 100) * 100)
const yMax = computed(() => Math.ceil(eleMax.value / 100) * 100)

const yTicks = computed(() => {
  const out: number[] = []
  for (let v = Math.ceil(yMin.value / 500) * 500; v <= yMax.value; v += 500) out.push(v)
  return out
})

const xTicks = computed(() => {
  const out: number[] = []
  for (let v = 0; v <= maxKm.value; v += 10) out.push(v)
  return out
})

const innerW = computed(() => Math.max(1, width.value - MARGIN.left - MARGIN.right))
const innerH = computed(() => Math.max(1, props.height - MARGIN.top - MARGIN.bottom))
const baseY = computed(() => MARGIN.top + innerH.value)

function sx(km: number): number {
  return MARGIN.left + (km / maxKm.value) * innerW.value
}
function sy(ele: number): number {
  const t = (ele - yMin.value) / (yMax.value - yMin.value || 1)
  return MARGIN.top + (1 - t) * innerH.value
}

const linePath = computed(() =>
  sampled.value.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.km).toFixed(1)} ${sy(p.ele).toFixed(1)}`).join(' '),
)

const areaPath = computed(() => {
  const pts = sampled.value
  if (!pts.length) return ''
  const b = baseY.value.toFixed(1)
  const line = pts.map((p) => `L${sx(p.km).toFixed(1)} ${sy(p.ele).toFixed(1)}`).join(' ')
  return `M${sx(pts[0]!.km).toFixed(1)} ${b} ${line} L${sx(pts[pts.length - 1]!.km).toFixed(1)} ${b} Z`
})

/** km et altitude de chaque lieu, par plus proche point du tracé (distance équirectangulaire, suffisante ici). */
const wpMarks = computed(() => {
  const pts = points.value
  if (!pts) return []
  return waypoints.map((wp) => {
    let best = 0
    let bestD = Infinity
    const cosLat = Math.cos((wp.lat * Math.PI) / 180)
    for (let i = 0; i < pts.length; i++) {
      const dLat = pts[i]!.lat - wp.lat
      const dLon = (pts[i]!.lon - wp.lon) * cosLat
      const d = dLat * dLat + dLon * dLon
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return { wp, km: pts[best]!.km, ele: pts[best]!.ele }
  })
})

// interaction : refs légères, le SVG complet n'est jamais recalculé
const cursorVisible = ref(false)
const cursorX = ref(0)
const cursorY = ref(0)
const hoverKm = ref(0)
const hoverEle = ref(0)
const hoverWp = ref<{ name: string, altitude_m: number } | null>(null)

let rafId = 0
let pendingClientX = 0

function nearestSampled(km: number): TracePoint {
  const pts = sampled.value
  let lo = 0
  let hi = pts.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (pts[mid]!.km < km) lo = mid + 1
    else hi = mid
  }
  const a = pts[lo]!
  const b = pts[Math.max(0, lo - 1)]!
  return Math.abs(a.km - km) <= Math.abs(b.km - km) ? a : b
}

function resolve(clientX: number): TracePoint | null {
  if (!sampled.value.length || !svgEl.value) return null
  const rect = svgEl.value.getBoundingClientRect()
  const scale = rect.width ? width.value / rect.width : 1
  const x = Math.max(MARGIN.left, Math.min(MARGIN.left + innerW.value, (clientX - rect.left) * scale))
  return nearestSampled(((x - MARGIN.left) / innerW.value) * maxKm.value)
}

function apply() {
  const p = resolve(pendingClientX)
  if (!p) return
  cursorX.value = sx(p.km)
  cursorY.value = sy(p.ele)
  hoverKm.value = p.km
  hoverEle.value = p.ele
  cursorVisible.value = true

  // lieu à moins de 500 m le long du tracé
  let near: (typeof wpMarks.value)[number] | null = null
  let nearD = 0.5
  for (const m of wpMarks.value) {
    const d = Math.abs(m.km - p.km)
    if (d < nearD) {
      nearD = d
      near = m
    }
  }
  hoverWp.value = near ? { name: near.wp.name, altitude_m: near.wp.altitude_m } : null

  emit('hover', p)
}

function onMove(e: PointerEvent) {
  pendingClientX = e.clientX
  if (rafId) return
  rafId = requestAnimationFrame(() => {
    rafId = 0
    apply()
  })
}

function onLeave() {
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
  cursorVisible.value = false
  hoverWp.value = null
  emit('hover', null)
}

function onClick(e: MouseEvent) {
  const p = resolve(e.clientX)
  if (p) emit('select', p)
}

// l'infobulle bascule à gauche du curseur passé 60 % de la largeur
const tipStyle = computed(() => ({
  left: `${cursorX.value}px`,
  transform: cursorX.value > width.value * 0.6 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
}))

const fmt = (n: number) => n.toLocaleString('fr-FR')
</script>

<template>
  <div class="flex flex-col">
    <div class="flex items-baseline gap-2 px-3 pt-1.5 text-xs text-muted">
      <span class="font-medium text-default">Profil altimétrique</span>
      <span>— {{ totals.distance_km.toLocaleString('fr-FR', { minimumFractionDigits: 1 }) }} km</span>
      <span>· D+ {{ fmt(totals.d_plus_m) }} m</span>
      <span>· D− {{ fmt(totals.d_minus_m) }} m</span>
    </div>

    <div
      ref="wrapEl"
      class="relative w-full select-none"
    >
      <svg
        ref="svgEl"
        :viewBox="`0 0 ${width} ${props.height}`"
        :height="props.height"
        width="100%"
        class="block w-full touch-none"
        role="img"
        aria-label="Profil altimétrique du GR20"
      >
        <defs>
          <linearGradient
            :id="gradId"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0%"
              stop-color="currentColor"
              stop-opacity="0.28"
              class="text-primary"
            />
            <stop
              offset="100%"
              stop-color="currentColor"
              stop-opacity="0"
              class="text-primary"
            />
          </linearGradient>
        </defs>

        <g class="text-muted">
          <template
            v-for="t in yTicks"
            :key="`y${t}`"
          >
            <line
              :x1="MARGIN.left"
              :x2="width - MARGIN.right"
              :y1="sy(t)"
              :y2="sy(t)"
              stroke="currentColor"
              stroke-opacity="0.18"
            />
            <text
              :x="MARGIN.left - 6"
              :y="sy(t) + 3"
              text-anchor="end"
              font-size="9"
              fill="currentColor"
            >
              {{ t }}
            </text>
          </template>
          <text
            v-for="t in xTicks"
            :key="`x${t}`"
            :x="sx(t)"
            :y="props.height - 6"
            text-anchor="middle"
            font-size="9"
            fill="currentColor"
          >
            {{ t }}
          </text>
          <text
            :x="width - MARGIN.right"
            :y="props.height - 6"
            text-anchor="end"
            font-size="9"
            fill="currentColor"
            opacity="0.7"
          >
            km
          </text>
        </g>

        <path
          :d="areaPath"
          :fill="`url(#${gradId})`"
          class="text-primary"
        />
        <path
          :d="linePath"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linejoin="round"
          stroke-linecap="round"
          class="text-primary"
        />

        <circle
          v-for="m in wpMarks"
          :key="m.wp.id"
          :cx="sx(m.km)"
          :cy="sy(m.ele)"
          r="3"
          :fill="WAYPOINT_TYPE_META[m.wp.type].hex"
          stroke="#fff"
          stroke-width="1"
        />

        <g
          v-show="cursorVisible"
          class="text-highlighted"
        >
          <line
            :x1="cursorX"
            :x2="cursorX"
            :y1="MARGIN.top"
            :y2="baseY"
            stroke="currentColor"
            stroke-width="1"
            stroke-dasharray="3 3"
            stroke-opacity="0.6"
          />
          <circle
            :cx="cursorX"
            :cy="cursorY"
            r="3.5"
            fill="currentColor"
            stroke="#fff"
            stroke-width="1.5"
          />
        </g>

        <rect
          :x="MARGIN.left"
          :y="MARGIN.top"
          :width="innerW"
          :height="innerH"
          fill="transparent"
          style="cursor: crosshair"
          @pointermove="onMove"
          @pointerdown="onMove"
          @pointerleave="onLeave"
          @click="onClick"
        />
      </svg>

      <div
        v-show="cursorVisible"
        class="pointer-events-none absolute top-1 z-10 rounded-md border border-default bg-default px-2 py-1 text-xs shadow-sm"
        :style="tipStyle"
      >
        <div class="tabular-nums">
          <span class="font-medium">{{ hoverKm.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }} km</span>
          <span class="text-muted"> · {{ Math.round(hoverEle) }} m</span>
        </div>
        <div
          v-if="hoverWp"
          class="mt-0.5 text-muted"
        >
          {{ hoverWp.name }} <span class="tabular-nums">({{ hoverWp.altitude_m }} m)</span>
        </div>
      </div>
    </div>
  </div>
</template>
