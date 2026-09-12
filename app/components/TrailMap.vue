<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Waypoint } from '~/types'

const props = defineProps<{ highlight?: { lat: number, lon: number } | null }>()

const { waypoints, accommodationsByWaypoint, googleRatingFor } = useGr20()
const { load: loadTrace } = useTrace()

const mapEl = ref<HTMLElement | null>(null)
let map: L.Map | null = null
let highlightMarker: L.CircleMarker | null = null

function popupHtml(wp: Waypoint): string {
  const items = (accommodationsByWaypoint.get(wp.id) ?? [])
    .map((a) => {
      const resa = a.reservation.canal === 'pnr-resa'
        ? '<a href="https://pnr-resa.corsica" target="_blank" rel="noopener">pnr-resa</a>'
        : a.reservation.telephone ?? a.reservation.canal
      const note = googleRatingFor(a.id)?.note
      const noteHtml = note != null ? ` <span style="opacity:.8">★ ${note.toLocaleString('fr-FR', { minimumFractionDigits: 1 })}</span>` : ''
      const nom = a.name === wp.name ? '' : `<strong>${a.name}</strong>`
      return `<li>${nom}${noteHtml}${nom || noteHtml ? '<br>' : ''}<span style="opacity:.7">${resa}</span></li>`
    })
    .join('')
  return `
    <div style="min-width:180px">
      <strong>${wp.name}</strong><br>
      <span style="opacity:.7">${wp.altitude_m} m</span>
      ${items ? `<ul style="margin:6px 0 0;padding-left:16px">${items}</ul>` : ''}
    </div>`
}

onMounted(async () => {
  if (!mapEl.value) return

  map = L.map(mapEl.value, { zoomControl: true }).setView([42.15, 9.1], 9)

  // crossOrigin sur IGN et OSM (en-tête CORS *) : réponses non opaques, cachables par le service
  // worker à leur taille réelle. OpenTopoMap n'envoie pas de CORS : couche en ligne uniquement.
  const planIgn = L.tileLayer(
    'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    { maxZoom: 19, crossOrigin: true, attribution: '© IGN — Géoplateforme' },
  )
  const openTopo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: '© OpenStreetMap, SRTM — © OpenTopoMap (CC-BY-SA)',
  })
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    crossOrigin: true,
    attribution: '© les contributeurs OpenStreetMap',
  })
  planIgn.addTo(map)

  const [tracePoints, variant] = await Promise.all([
    loadTrace(),
    $fetch<GeoJSON.Feature>('/data/trace-var-incudine-elev.geojson'),
  ])

  const mainLayer = L.polyline(
    tracePoints.map((p) => [p.lat, p.lon] as [number, number]),
    { color: '#dc2626', weight: 3, opacity: 0.9 },
  ).addTo(map)
  const variantLayer = L.geoJSON(variant, {
    style: { color: '#ea580c', weight: 3, opacity: 0.9, dashArray: '6 6' },
  }).addTo(map)
  variantLayer.bindTooltip('Variante Monte Incudine (crêtes)', { sticky: true })

  for (const wp of waypoints) {
    L.circleMarker([wp.lat, wp.lon], {
      radius: 7,
      color: '#ffffff',
      weight: 2,
      fillColor: WAYPOINT_TYPE_META[wp.type].hex,
      fillOpacity: 1,
    })
      .bindPopup(popupHtml(wp))
      .bindTooltip(wp.name)
      .addTo(map)
  }

  L.control
    .layers(
      { 'Plan IGN': planIgn, 'OpenTopoMap': openTopo, 'OSM': osm },
      { 'Tracé GR20': mainLayer, 'Variante Incudine': variantLayer },
    )
    .addTo(map)

  map.fitBounds(mainLayer.getBounds(), { padding: [30, 30] })
})

// marqueur de survol piloté par le profil altimétrique
watch(() => props.highlight, (h) => {
  if (!map) return
  if (!h) {
    highlightMarker?.remove()
    highlightMarker = null
    return
  }
  if (highlightMarker) {
    highlightMarker.setLatLng([h.lat, h.lon])
  } else {
    highlightMarker = L.circleMarker([h.lat, h.lon], {
      radius: 7,
      color: '#1f2937',
      weight: 3,
      fillColor: '#ffffff',
      fillOpacity: 1,
      interactive: false,
    }).addTo(map)
  }
  highlightMarker.bringToFront()
})

function panTo(lat: number, lon: number) {
  map?.panTo([lat, lon], { animate: true, duration: 0.6 })
}

defineExpose({ panTo })

onBeforeUnmount(() => {
  map?.remove()
  map = null
})
</script>

<template>
  <div
    ref="mapEl"
    class="h-full w-full"
  />
</template>
