<script setup lang="ts">
import type { TracePoint } from '~/composables/useTrace'

const props = withDefaults(defineProps<{ height?: number }>(), { height: 200 })

const emit = defineEmits<{
  hover: [point: { lat: number; lon: number; km: number; ele: number } | null]
  select: [point: { lat: number; lon: number; km: number; ele: number }]
}>()

const { totals, waypoints } = useGr20()
const { points, load } = useTrace()

// couleurs de catégorie identiques à la légende de la carte
const WAYPOINT_COLORS: Record<string, string> = {
  refuge: '#059669',
  bergerie: '#d97706',
  village: '#4f46e5',
  col: '#78716c',
  station: '#0284c7',
}

const gradId = useId()

const MARGIN = { top: 12, right: 14, bottom: 22, left: 44 }
const width = ref(800)
const wrapEl = ref<HTMLElement | null>(null)
const svgEl = ref<SVGSVGElement | null>(null)
let ro: ResizeObserver | null = null

onMounted(() => {
  load()
  if (wrapEl.value) {
    width.value = wrapEl.value.clientWidth || width.value
    ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) width.value = w
    })
    ro.observe(wrapEl.value)
  }
})

onBeforeUnmount(() => {
  ro?.disconnect()
  if (rafId) cancelAnimationFrame(rafId)
})

// sous-échantillonnage préservant min ET max de chaque bucket (les sommets/cols ne sont pas rabotés)
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

// calculé une seule fois (ne dépend pas de la largeur → pas de recalcul au resize)
const sampled = computed<TracePoint[]>(() => (points.value ? downsample(points.value) : []))

const eleMin = computed(() => (points.value ? Math.min(...points.value.map((p) => p.ele)) : 0))
const eleMax = computed(() => (points.value ? Math.max(...points.value.map((p) => p.ele)) : 1))
const maxKm = computed(() => (points.value ? points.value[points.value.length - 1]!.km : 1))

// domaine Y arrondi à la centaine, graduations rondes tous les 500 m
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

const linePath = computed(() => {
  const pts = sampled.value
  if (!pts.length) return ''
  let d = ''
  for (let i = 0; i < pts.length; i++) {
    d += (i === 0 ? 'M' : 'L') + sx(pts[i]!.km).toFixed(1) + ' ' + sy(pts[i]!.ele).toFixed(1) + ' '
  }
  return d.trim()
})

const areaPath = computed(() => {
  const pts = sampled.value
  if (!pts.length) return ''
  const b = baseY.value.toFixed(1)
  let d = 'M' + sx(pts[0]!.km).toFixed(1) + ' ' + b + ' '
  for (const p of pts) d += 'L' + sx(p.km).toFixed(1) + ' ' + sy(p.ele).toFixed(1) + ' '
  d += 'L' + sx(pts[pts.length - 1]!.km).toFixed(1) + ' ' + b + ' Z'
  return d
})

// km + altitude de chaque waypoint, par plus-proche-point du tracé (précalcul unique)
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

// --- interaction : refs légères, aucun recalcul du SVG complet ---
const cursorVisible = ref(false)
const cursorX = ref(0)
const cursorY = ref(0)
const hoverKm = ref(0)
const hoverEle = ref(0)
const hoverWp = ref<{ name: string; altitude_m: number } | null>(null)

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

function resolve(clientX: number) {
  const pts = sampled.value
  if (!pts.length || !svgEl.value) return null
  const rect = svgEl.value.getBoundingClientRect()
  const scale = rect.width ? width.value / rect.width : 1
  let x = (clientX - rect.left) * scale
  x = Math.max(MARGIN.left, Math.min(MARGIN.left + innerW.value, x))
  const km = ((x - MARGIN.left) / innerW.value) * maxKm.value
  return nearestSampled(km)
}

function apply() {
  const p = resolve(pendingClientX)
  if (!p) return
  cursorX.value = sx(p.km)
  cursorY.value = sy(p.ele)
  hoverKm.value = p.km
  hoverEle.value = p.ele
  cursorVisible.value = true

  let near: (typeof wpMarks.value)[number] | null = null
  let nearD = 0.5 // 500 m le long du tracé
  for (const m of wpMarks.value) {
    const d = Math.abs(m.km - p.km)
    if (d < nearD) {
      nearD = d
      near = m
    }
  }
  hoverWp.value = near ? { name: near.wp.name, altitude_m: near.wp.altitude_m } : null

  emit('hover', { lat: p.lat, lon: p.lon, km: p.km, ele: p.ele })
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
  if (p) emit('select', { lat: p.lat, lon: p.lon, km: p.km, ele: p.ele })
}

// tooltip : reste dans le cadre (bascule à gauche du curseur passé 60 % de la largeur)
const tipStyle = computed(() => {
  const flip = cursorX.value > width.value * 0.6
  return {
    left: `${cursorX.value}px`,
    transform: flip ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
  }
})

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

    <div ref="wrapEl" class="relative w-full select-none">
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
          <linearGradient :id="gradId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="currentColor" stop-opacity="0.28" class="text-primary" />
            <stop offset="100%" stop-color="currentColor" stop-opacity="0" class="text-primary" />
          </linearGradient>
        </defs>

        <!-- axes / graduations -->
        <g class="text-muted">
          <template v-for="t in yTicks" :key="`y${t}`">
            <line
              :x1="MARGIN.left"
              :x2="width - MARGIN.right"
              :y1="sy(t)"
              :y2="sy(t)"
              stroke="currentColor"
              stroke-opacity="0.18"
            />
            <text :x="MARGIN.left - 6" :y="sy(t) + 3" text-anchor="end" font-size="9" fill="currentColor">
              {{ t }}
            </text>
          </template>
          <template v-for="t in xTicks" :key="`x${t}`">
            <text :x="sx(t)" :y="props.height - 6" text-anchor="middle" font-size="9" fill="currentColor">
              {{ t }}
            </text>
          </template>
          <text :x="width - MARGIN.right" :y="props.height - 6" text-anchor="end" font-size="9" fill="currentColor" opacity="0.7">
            km
          </text>
        </g>

        <!-- courbe + aplat -->
        <path :d="areaPath" :fill="`url(#${gradId})`" class="text-primary" />
        <path
          :d="linePath"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linejoin="round"
          stroke-linecap="round"
          class="text-primary"
        />

        <!-- waypoints -->
        <circle
          v-for="m in wpMarks"
          :key="m.wp.id"
          :cx="sx(m.km)"
          :cy="sy(m.ele)"
          r="3"
          :fill="WAYPOINT_COLORS[m.wp.type] ?? '#333'"
          stroke="#fff"
          stroke-width="1"
        />

        <!-- crosshair (piloté par refs légères) -->
        <g v-show="cursorVisible" class="text-highlighted">
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
          <circle :cx="cursorX" :cy="cursorY" r="3.5" fill="currentColor" stroke="#fff" stroke-width="1.5" />
        </g>

        <!-- zone de capture -->
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
        <div v-if="hoverWp" class="mt-0.5 text-muted">
          {{ hoverWp.name }} <span class="tabular-nums">({{ hoverWp.altitude_m }} m)</span>
        </div>
      </div>
    </div>
  </div>
</template>
