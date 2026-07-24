<script setup lang="ts">
import { fr } from '@nuxt/ui/locale'

const links = [
  { label: 'Tabloguide', icon: 'i-lucide-table-properties', to: '/' },
  { label: 'Carte', icon: 'i-lucide-map', to: '/carte' },
  { label: 'Hébergements', icon: 'i-lucide-bed', to: '/hebergements' },
  { label: 'Mon plan', icon: 'i-lucide-calendar-check', to: '/plan' },
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

    <UFooter :ui="{ container: 'py-6 lg:py-6 lg:justify-center' }">
      <p class="text-muted text-center text-xs">
        Tracé © les contributeurs OpenStreetMap (ODbL) · Altitudes IGN RGE ALTI (Etalab 2.0) ·
        Météo <ULink to="https://open-meteo.com" target="_blank" class="underline">Open-Meteo</ULink> (CC-BY 4.0) ·
        Réservation officielle des refuges :
        <ULink to="https://pnr-resa.corsica" target="_blank" class="underline">pnr-resa.corsica</ULink>
      </p>
    </UFooter>
  </UApp>
</template>
