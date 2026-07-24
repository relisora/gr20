<script setup lang="ts">
const props = defineProps<{ accommodationId: string }>()

const { googleRatingFor, googleRatingsReleveLe } = useGr20()
const rating = computed(() => googleRatingFor(props.accommodationId))

const tooltip = computed(() => {
  const parts = [`Note Google au ${formatDateFr(googleRatingsReleveLe)}`]
  if (rating.value?.confiance !== 'haute') parts.push('à confirmer')
  if (rating.value?.urlMaps) parts.push('voir les avis sur Google Maps')
  return parts.join(' · ')
})
</script>

<template>
  <UTooltip v-if="rating && rating.note != null" :text="tooltip">
    <ULink
      :to="rating.urlMaps ?? undefined"
      target="_blank"
      class="inline-flex items-center gap-1 text-xs font-medium"
      :class="rating.urlMaps ? 'hover:underline' : 'cursor-default'"
    >
      <UIcon name="i-lucide-star" class="size-3.5 text-warning" />
      <span class="tabular-nums">{{ rating.note.toLocaleString('fr-FR', { minimumFractionDigits: 1 }) }}</span>
      <span v-if="rating.nbAvis != null" class="text-muted font-normal">({{ rating.nbAvis.toLocaleString('fr-FR') }} avis)</span>
      <span v-if="rating.confiance !== 'haute'" class="text-muted font-normal">?</span>
    </ULink>
  </UTooltip>
</template>
