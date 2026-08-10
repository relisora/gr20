<script setup lang="ts">
const legend = [
  { label: 'Refuge PNRC', color: '#059669' },
  { label: 'Bergerie', color: '#d97706' },
  { label: 'Village', color: '#4f46e5' },
  { label: 'Col', color: '#78716c' },
  { label: 'Station', color: '#0284c7' },
]

type Point = { lat: number; lon: number; km: number; ele: number }

const mapRef = ref<{ panTo: (lat: number, lon: number) => void } | null>(null)
const highlight = ref<{ lat: number; lon: number } | null>(null)

function onHover(p: Point | null) {
  highlight.value = p ? { lat: p.lat, lon: p.lon } : null
}

function onSelect(p: Point) {
  highlight.value = { lat: p.lat, lon: p.lon }
  mapRef.value?.panTo(p.lat, p.lon)
}

const exportingTrace = ref(false)
async function exportTrace() {
  exportingTrace.value = true
  try {
    await downloadTraceGpx()
  } finally {
    exportingTrace.value = false
  }
}
</script>

<template>
  <div class="flex flex-col lg:h-[calc(100vh-var(--ui-header-height))]">
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
      <ClientOnly>
        <UButton
          class="ml-auto"
          icon="i-lucide-download"
          variant="soft"
          color="neutral"
          size="xs"
          label="GPX du parcours"
          title="Télécharger le tracé complet Calenzana → Conca"
          :loading="exportingTrace"
          @click="exportTrace"
        />
      </ClientOnly>
    </div>
    <ClientOnly>
      <div class="h-[55vh] min-h-0 lg:h-auto lg:flex-1">
        <TrailMap ref="mapRef" :highlight="highlight" class="h-full w-full" />
      </div>
      <ElevationProfile
        class="shrink-0 border-t border-default"
        @hover="onHover"
        @select="onSelect"
      />
      <template #fallback>
        <div class="flex flex-1 items-center justify-center text-muted">
          <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
        </div>
      </template>
    </ClientOnly>
  </div>
</template>
