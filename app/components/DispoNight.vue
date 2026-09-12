<script setup lang="ts">
import type { Accommodation } from '~/types'

const props = defineProps<{
  accommodation: Accommodation
  dateIso: string
  selectedFormule: string | null
}>()

const { dispoFor } = useDispo()

const entries = computed(() => {
  const d = dispoFor(props.accommodation.id, props.dateIso)
  if (!d) return []
  return props.accommodation.formules
    .filter((f) => d[f.type])
    .map((f) => ({ type: f.type, level: d[f.type]! }))
})
</script>

<template>
  <div
    v-if="entries.length"
    class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
  >
    <span class="text-muted">Dispo pnr-resa ({{ formatDateFr(dateIso) }}) :</span>
    <span
      v-for="e in entries"
      :key="e.type"
      class="flex items-center gap-1"
      :class="selectedFormule === e.type ? 'font-semibold' : 'text-muted'"
      :title="DISPO_LEVEL_META[e.level].label"
    >
      <span
        class="inline-block size-2 rounded-full"
        :style="{ backgroundColor: DISPO_LEVEL_META[e.level].hex }"
      />
      {{ FORMULE_LABELS[e.type] }}
    </span>
  </div>
</template>
