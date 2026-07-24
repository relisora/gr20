<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const props = defineProps<{ highlight?: { lat: number; lon: number } | null }>()

const { waypoints, accommodationsByWaypoint, googleRatingFor } = useGr20()
const { load: loadTrace } = useTrace()

const mapEl = ref<HTMLElement | null>(null)
let map: L.Map | null = null
let highlightMarker: L.CircleMarker | null = null

const WAYPOINT_COLORS: Record<string, string> = {
  refuge: '#059669',
  bergerie: '#d97706',
  village: '#4f46e5',
  col: '#78716c',
  station: '#0284c7',
}

function popupHtml(wp: (typeof waypoints)[number]): string {
  const accs = accommodationsByWaypoint.get(wp.id) ?? []
  const list = accs
    .map((a) => {
      const resa =
        a.reservation.canal === 'pnr-resa'
          ? '<a href="https://pnr-resa.corsica" target="_blank" rel="noopener">pnr-resa</a>'
          : a.reservation.telephone ?? a.reservation.canal
      const g = googleRatingFor(a.id)
      const note = g?.note != null ? ` <span style="opacity:.8">★ ${g.note.toLocaleString('fr-FR', { minimumFractionDigits: 1 })}</span>` : ''
      // pas de doublon quand l'hébergement porte le même nom que le waypoint
      const nom = a.name === wp.name ? '' : `<strong>${a.name}</strong>`
      return `<li>${nom}${note}${nom || note ? '<br>' : ''}<span style="opacity:.7">${resa}</span></li>`
    })
    .join('')
  return `
    <div style="min-width:180px">
      <strong>${wp.name}</strong><br>
      <span style="opacity:.7">${wp.altitude_m} m</span>
      ${list ? `<ul style="margin:6px 0 0;padding-left:16px">${list}</ul>` : ''}
    </div>`
}

onMounted(async () => {
  if (!mapEl.value) return

  map = L.map(mapEl.value, { zoomControl: true }).setView([42.15, 9.1], 9)

  const planIgn = L.tileLayer(
    'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    { maxZoom: 19, crossOrigin: true, attribution: '© IGN — Géoplateforme' }
  )
  // pas de crossOrigin sur OpenTopoMap : le serveur n'envoie aucun en-tête CORS (une requête
  // crossorigin échouerait). Couche en ligne uniquement, exclue du cache de tuiles.
  const openTopo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: '© OpenStreetMap, SRTM — © OpenTopoMap (CC-BY-SA)',
  })
  // crossOrigin : geopf.fr et OSM renvoient Access-Control-Allow-Origin: * → réponses non opaques,
  // taille réelle comptée dans le quota (une réponse opaque est paddée à ~7 Mo par Chrome).
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
    { color: '#dc2626', weight: 3, opacity: 0.9 }
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
      fillColor: WAYPOINT_COLORS[wp.type] ?? '#333333',
      fillOpacity: 1,
    })
      .bindPopup(popupHtml(wp))
      .bindTooltip(wp.name)
      .addTo(map!)
  }

  L.control
    .layers(
      { 'Plan IGN': planIgn, 'OpenTopoMap': openTopo, 'OSM': osm },
      { 'Tracé GR20': mainLayer, 'Variante Incudine': variantLayer }
    )
    .addTo(map)

  map.fitBounds(mainLayer.getBounds(), { padding: [30, 30] })
})

// marqueur de survol piloté par le profil altimétrique
watch(
  () => props.highlight,
  (h) => {
    if (!map) return
    if (!h) {
      highlightMarker?.remove()
      highlightMarker = null
      return
    }
    if (!highlightMarker) {
      highlightMarker = L.circleMarker([h.lat, h.lon], {
        radius: 7,
        color: '#1f2937',
        weight: 3,
        fillColor: '#ffffff',
        fillOpacity: 1,
        interactive: false,
      }).addTo(map)
    } else {
      highlightMarker.setLatLng([h.lat, h.lon])
    }
    highlightMarker.bringToFront()
  }
)

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
  <div ref="mapEl" class="h-full w-full" />
</template>
