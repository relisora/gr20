<script setup lang="ts">
import { fr } from '@nuxt/ui/locale'

const links = [
  { label: 'Tabloguide', icon: 'i-lucide-table-properties', to: '/' },
  { label: 'Carte', icon: 'i-lucide-map', to: '/carte' },
  { label: 'Hébergements', icon: 'i-lucide-bed', to: '/hebergements' },
]
</script>

<template>
  <UApp :locale="fr">
    <UHeader title="Fra li Monti · GR20">
      <UNavigationMenu :items="links" />

      <template #right>
        <UColorModeButton />
      </template>

      <template #body>
        <UNavigationMenu :items="links" orientation="vertical" class="-mx-2.5" />
      </template>
    </UHeader>

    <UMain>
      <NuxtPage />
    </UMain>

    <footer class="border-t border-default py-6 text-center text-xs text-muted">
      Tracé © les contributeurs OpenStreetMap (ODbL) · Altitudes IGN RGE ALTI (Etalab 2.0) ·
      Réservation officielle des refuges :
      <a href="https://pnr-resa.corsica" target="_blank" rel="noopener" class="underline">pnr-resa.corsica</a>
    </footer>
  </UApp>
</template>
