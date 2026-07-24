<script setup lang="ts">
import type { DispoLevel } from '~/types'

const props = defineProps<{ rescanDebut: string; rescanFin: string }>()

const { snapshot, scannedAtLabel, rescan, scanning, scanError } = useDispo()

const levels = Object.entries(DISPO_LEVEL_META) as [DispoLevel, (typeof DISPO_LEVEL_META)[DispoLevel]][]

// l'état du scan est global (useState) : ne pas laisser traîner une vieille erreur sur l'autre page
onUnmounted(() => {
  if (!scanning.value) scanError.value = null
})
</script>

<template>
  <div class="border-default flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2 text-xs">
    <template v-if="snapshot">
      <span class="flex items-center gap-1.5">
        <UIcon name="i-lucide-radar" class="text-primary size-3.5" />
        Dispos pnr-resa au <strong>{{ scannedAtLabel }}</strong>
        <span class="text-muted">({{ formatDateFr(snapshot.dateDebut) }} → {{ formatDateFr(snapshot.dateFin) }})</span>
      </span>
      <span class="flex items-center gap-2">
        <span v-for="[level, meta] in levels" :key="level" class="flex items-center gap-1">
          <span class="inline-block size-2 rounded-[2px]" :style="{ backgroundColor: meta.hex }" />
          <span class="text-muted">{{ meta.label }}</span>
        </span>
      </span>
    </template>
    <span v-else class="text-muted flex items-center gap-1.5">
      <UIcon name="i-lucide-radar" class="size-3.5" />
      Aucun scan de disponibilités pnr-resa pour l'instant.
    </span>
    <UButton
      size="xs"
      variant="soft"
      color="primary"
      icon="i-lucide-refresh-cw"
      :loading="scanning"
      :label="scanning ? 'Scan en cours…' : 'Rescanner'"
      @click="rescan(props.rescanDebut, props.rescanFin)"
    />
    <span v-if="scanError" class="text-error">{{ scanError }}</span>
  </div>
</template>
