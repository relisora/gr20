<script setup lang="ts">
const props = defineProps<{ accommodationId: string, formuleType: string }>()

const { snapshotDates, levelFor } = useDispo()

const cells = computed(() =>
  snapshotDates.value
    .map((date) => ({ date, level: levelFor(props.accommodationId, date, props.formuleType) }))
    .filter((c): c is { date: string, level: NonNullable<typeof c.level> } => c.level !== null),
)
</script>

<template>
  <div
    v-if="cells.length"
    class="mt-1 flex flex-wrap items-center gap-0.5"
  >
    <span
      v-for="c in cells"
      :key="c.date"
      class="inline-block size-2 rounded-[2px]"
      :style="{ backgroundColor: DISPO_LEVEL_META[c.level].hex }"
      :title="`${formatDateFr(c.date)} — ${DISPO_LEVEL_META[c.level].label}`"
    />
  </div>
</template>
