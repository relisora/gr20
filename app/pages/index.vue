<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Segment, StageRow } from '~/types'

const { stageRows, segments, totals, waypointById, accommodationsByWaypoint } = useGr20()

const view = ref<'etapes' | 'segments'>('etapes')
const viewItems = [
  { label: '16 étapes officielles', value: 'etapes' },
  { label: `Segments détaillés (${segments.length})`, value: 'segments' },
]

const stageColumns: TableColumn<StageRow>[] = [
  { accessorKey: 'num', header: '№' },
  { id: 'etape', header: 'Étape' },
  { accessorKey: 'distance_km', header: 'Distance' },
  { accessorKey: 'd_plus_m', header: 'D+' },
  { accessorKey: 'd_minus_m', header: 'D−' },
  { accessorKey: 'time_h', header: 'Temps' },
  { accessorKey: 'ele_max_m', header: 'Alt. max' },
  { id: 'hebergements', header: 'Dormir à l’arrivée' },
]

const segmentColumns: TableColumn<Segment>[] = [
  { id: 'segment', header: 'Segment' },
  { accessorKey: 'distance_km', header: 'Distance' },
  { accessorKey: 'd_plus_m', header: 'D+' },
  { accessorKey: 'd_minus_m', header: 'D−' },
  { accessorKey: 'time_h', header: 'Temps' },
  { accessorKey: 'ele_max_m', header: 'Alt. max' },
]

function arrivalAccommodations(waypointId: string) {
  return accommodationsByWaypoint.get(waypointId) ?? []
}

const stats = [
  { label: 'Distance', value: `${totals.distance_km} km`, icon: 'i-lucide-ruler' },
  { label: 'Dénivelé +', value: `${totals.d_plus_m.toLocaleString('fr-FR')} m`, icon: 'i-lucide-trending-up' },
  { label: 'Dénivelé −', value: `${totals.d_minus_m.toLocaleString('fr-FR')} m`, icon: 'i-lucide-trending-down' },
  { label: 'Marche totale', value: formatHours(totals.time_h), icon: 'i-lucide-clock' },
]
</script>

<template>
  <UContainer class="py-8">
    <div class="mb-6">
      <h1 class="text-2xl font-bold">Tabloguide GR20</h1>
      <p class="text-muted mt-1 text-sm">
        Calenzana → Conca · découpage officiel PNRC 2026 · temps calibrés sur les temps officiels,
        calculés depuis le tracé OSM et les altitudes IGN.
      </p>
    </div>

    <UPageGrid class="mb-6 grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
      <UPageCard
        v-for="s in stats"
        :key="s.label"
        :icon="s.icon"
        :title="s.value"
        :description="s.label"
        variant="outline"
        :ui="{ container: 'p-4 sm:p-4 gap-y-0', leading: 'mb-1.5', title: 'tabular-nums text-lg', description: 'text-xs' }"
      />
    </UPageGrid>

    <div class="mb-4 flex items-center justify-between gap-4">
      <UTabs v-model="view" :items="viewItems" :content="false" size="sm" />
    </div>

    <UTable v-if="view === 'etapes'" :data="stageRows" :columns="stageColumns">
      <template #etape-cell="{ row }">
        <div class="flex flex-col">
          <span class="font-medium">{{ row.original.from.name }} → {{ row.original.to.name }}</span>
          <span v-if="row.original.segments.length > 1" class="text-muted text-xs">
            via {{ row.original.segments.slice(0, -1).map(s => waypointById.get(s.to)?.name).join(', ') }}
          </span>
        </div>
      </template>
      <template #distance_km-cell="{ row }">
        <span class="tabular-nums">{{ row.original.distance_km }} km</span>
      </template>
      <template #d_plus_m-cell="{ row }">
        <span class="tabular-nums text-success">+{{ row.original.d_plus_m }} m</span>
      </template>
      <template #d_minus_m-cell="{ row }">
        <span class="tabular-nums text-error">−{{ row.original.d_minus_m }} m</span>
      </template>
      <template #time_h-cell="{ row }">
        <span class="tabular-nums font-medium">{{ formatHours(row.original.time_h) }}</span>
      </template>
      <template #ele_max_m-cell="{ row }">
        <span class="tabular-nums">{{ row.original.ele_max_m }} m</span>
      </template>
      <template #hebergements-cell="{ row }">
        <div class="flex flex-wrap gap-1">
          <UTooltip
            v-for="acc in arrivalAccommodations(row.original.to.id)"
            :key="acc.id"
            :text="acc.name"
          >
            <UBadge
              :icon="ACCOMMODATION_TYPE_META[acc.type]?.icon"
              :color="(ACCOMMODATION_TYPE_META[acc.type]?.color as any) ?? 'neutral'"
              variant="subtle"
              size="sm"
              :label="ACCOMMODATION_TYPE_META[acc.type]?.label"
            />
          </UTooltip>
        </div>
      </template>
    </UTable>

    <UTable v-else :data="segments" :columns="segmentColumns">
      <template #segment-cell="{ row }">
        <span class="font-medium">
          {{ waypointById.get(row.original.from)?.name }} → {{ waypointById.get(row.original.to)?.name }}
        </span>
      </template>
      <template #distance_km-cell="{ row }">
        <span class="tabular-nums">{{ row.original.distance_km }} km</span>
      </template>
      <template #d_plus_m-cell="{ row }">
        <span class="tabular-nums text-success">+{{ row.original.d_plus_m }} m</span>
      </template>
      <template #d_minus_m-cell="{ row }">
        <span class="tabular-nums text-error">−{{ row.original.d_minus_m }} m</span>
      </template>
      <template #time_h-cell="{ row }">
        <span class="tabular-nums font-medium">{{ formatHours(row.original.time_h) }}</span>
      </template>
      <template #ele_max_m-cell="{ row }">
        <span class="tabular-nums">{{ row.original.ele_max_m }} m</span>
      </template>
    </UTable>

    <UAlert
      class="mt-6"
      icon="i-lucide-info"
      color="neutral"
      variant="subtle"
      title="Nuit à Castel di Verghio et crête du Monte Incudine"
      description="Le découpage officiel enchaîne Ciottulu di i Mori → Manganu (le col de Vergio est traversé en route) et passe par le plateau du Cuscionu (Basseta, Matalza, I Croci). La crête du Monte Incudine est une variante — visible sur la carte."
    />
  </UContainer>
</template>
