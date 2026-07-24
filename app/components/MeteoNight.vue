<script setup lang="ts">
const props = defineProps<{ waypointId: string; dateIso: string; altitude?: number }>()

const { meteoFor } = useMeteo()
const jour = computed(() => meteoFor(props.waypointId, props.dateIso))
const meta = computed(() => (jour.value ? meteoCodeMeta(jour.value.code) : null))

// en montagne, l'orage et le vent fort sont les vrais signaux d'alerte
const alerte = computed(() => {
  const j = jour.value
  if (!j) return false
  return j.code >= 95 || j.ventMaxKmh >= 60 || j.precipMm >= 20
})

const tooltip = computed(() => {
  const j = jour.value
  if (!j || !meta.value) return ''
  const parts = [
    `${meta.value.label}${props.altitude ? ` à ${props.altitude} m` : ''}`,
    `${j.tMinC}° → ${j.tMaxC}°`,
    j.precipMm > 0 ? `${j.precipMm} mm${j.precipProbPct != null ? ` (${j.precipProbPct} %)` : ''}` : 'pas de pluie prévue',
    `vent max ${j.ventMaxKmh} km/h`,
    'Prévision Open-Meteo',
  ]
  return parts.join(' · ')
})
</script>

<template>
  <UTooltip v-if="jour && meta" :text="tooltip">
    <span class="inline-flex items-center gap-1 text-xs tabular-nums" :class="alerte ? 'text-error font-medium' : 'text-muted'">
      <UIcon :name="meta.icon" class="size-4" />
      <span>{{ jour.tMinC }}°/{{ jour.tMaxC }}°</span>
      <span v-if="jour.precipMm >= 1">· {{ jour.precipMm }} mm</span>
      <span v-if="jour.ventMaxKmh >= 40">· {{ jour.ventMaxKmh }} km/h</span>
    </span>
  </UTooltip>
</template>
