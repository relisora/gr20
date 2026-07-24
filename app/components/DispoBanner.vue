<script setup lang="ts">
import type { DispoLevel } from '~/types'

const props = defineProps<{ rescanDebut: string; rescanFin: string; editableDebut?: boolean }>()

/** date de début choisie par l'utilisateur pour la fenêtre de scan (pages qui passent editable-debut) */
const debut = defineModel<string>('debut')

const todayIso = new Date().toLocaleDateString('en-CA')

const { snapshot, scannedAtLabel, rescan, scanning, scanError } = useDispo()

const levels = Object.entries(DISPO_LEVEL_META) as [DispoLevel, (typeof DISPO_LEVEL_META)[DispoLevel]][]

// l'état du scan est global (useState) : ne pas laisser traîner une vieille erreur sur l'autre page
onUnmounted(() => {
  if (!scanning.value) scanError.value = null
})
</script>

<template>
  <UAlert
    icon="i-lucide-radar"
    color="neutral"
    variant="outline"
    :ui="{ description: 'flex flex-wrap items-center gap-x-3 gap-y-1.5', icon: 'text-primary' }"
  >
    <template #description>
      <template v-if="snapshot">
        <span>
          Dispos pnr-resa au <strong>{{ scannedAtLabel }}</strong>
          <span class="text-muted"> ({{ formatDateFr(snapshot.dateDebut) }} → {{ formatDateFr(snapshot.dateFin) }})</span>
        </span>
        <span class="flex items-center gap-2">
          <span v-for="[level, meta] in levels" :key="level" class="flex items-center gap-1">
            <span class="inline-block size-2 rounded-[2px]" :style="{ backgroundColor: meta.hex }" />
            <span class="text-muted">{{ meta.label }}</span>
          </span>
        </span>
      </template>
      <span v-else class="text-muted">Aucun scan de disponibilités pnr-resa pour l'instant.</span>
      <span v-if="editableDebut" class="flex items-center gap-1.5">
        <span class="text-muted">Scanner du</span>
        <UTooltip text="Début de la fenêtre de scan (14 jours)">
          <UInput v-model="debut" type="date" size="xs" :min="todayIso" class="w-34" />
        </UTooltip>
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
    </template>
  </UAlert>
</template>
