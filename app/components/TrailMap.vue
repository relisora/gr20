<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const { waypoints, accommodationsByWaypoint, googleRatingFor } = useGr20()

const mapEl = ref<HTMLElement | null>(null)
let map: L.Map | null = null

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
    { maxZoom: 19, attribution: '© IGN — Géoplateforme' }
  )
  const openTopo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: '© OpenStreetMap, SRTM — © OpenTopoMap (CC-BY-SA)',
  })
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© les contributeurs OpenStreetMap',
  })
  planIgn.addTo(map)

  const [main, variant] = await Promise.all([
    $fetch<GeoJSON.Feature>('/data/trace-main-elev.geojson'),
    $fetch<GeoJSON.Feature>('/data/trace-var-incudine-elev.geojson'),
  ])

  const mainLayer = L.geoJSON(main, { style: { color: '#dc2626', weight: 3, opacity: 0.9 } }).addTo(map)
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

onBeforeUnmount(() => {
  map?.remove()
  map = null
})
</script>

<template>
  <div ref="mapEl" class="h-full w-full" />
</template>
