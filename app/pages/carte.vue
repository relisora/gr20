<script setup lang="ts">
const legend = [
  { label: 'Refuge PNRC', color: '#059669' },
  { label: 'Bergerie', color: '#d97706' },
  { label: 'Village', color: '#4f46e5' },
  { label: 'Col', color: '#78716c' },
  { label: 'Station', color: '#0284c7' },
]
</script>

<template>
  <div class="flex h-[calc(100vh-var(--ui-header-height))] flex-col">
    <div class="border-b border-default flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-xs">
      <span class="text-muted">Légende :</span>
      <span v-for="l in legend" :key="l.label" class="flex items-center gap-1.5">
        <span class="inline-block size-2.5 rounded-full" :style="{ backgroundColor: l.color }" />
        {{ l.label }}
      </span>
      <span class="flex items-center gap-1.5">
        <span class="inline-block h-0.5 w-5" style="background:#dc2626" /> Tracé principal
      </span>
      <span class="flex items-center gap-1.5">
        <span class="inline-block h-0.5 w-5" style="background:repeating-linear-gradient(90deg,#ea580c 0 4px,transparent 4px 8px)" /> Variante Incudine
      </span>
    </div>
    <ClientOnly>
      <TrailMap class="min-h-0 flex-1" />
      <template #fallback>
        <div class="flex flex-1 items-center justify-center text-muted">
          <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
        </div>
      </template>
    </ClientOnly>
  </div>
</template>
