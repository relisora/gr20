<script setup lang="ts">
import type { Accommodation } from '~/types'

const { waypointOrder, waypointById, accommodationsByWaypoint, accommodations } = useGr20()

const typeFilter = ref<string[]>([])
const formuleFilter = ref<string[]>([])
const servicesFilter = ref<string[]>([])

const typeItems = Object.entries(ACCOMMODATION_TYPE_META).map(([value, m]) => ({ label: m.label, value }))
const formuleItems = Object.entries(FORMULE_LABELS)
  .filter(([v]) => v !== 'demi-pension')
  .map(([value, label]) => ({ label, value }))
const serviceItems = [
  { label: 'Repas', value: 'repas' },
  { label: 'Épicerie', value: 'epicerie' },
  { label: 'Douche', value: 'douche' },
  { label: 'Accès route', value: 'acces_route' },
]

function matches(acc: Accommodation): boolean {
  if (typeFilter.value.length && !typeFilter.value.includes(acc.type)) return false
  if (formuleFilter.value.length && !acc.formules.some((f) => formuleFilter.value.includes(f.type))) return false
  for (const s of servicesFilter.value) {
    const v = acc.services[s as keyof Accommodation['services']]
    if (!v) return false
  }
  return true
}

const sections = computed(() =>
  waypointOrder
    .map((wpId) => ({
      waypoint: waypointById.get(wpId)!,
      accommodations: (accommodationsByWaypoint.get(wpId) ?? []).filter(matches),
    }))
    .filter((s) => s.accommodations.length > 0)
)

const totalShown = computed(() => sections.value.reduce((n, s) => n + s.accommodations.length, 0))

function telHref(tel: string): string {
  return `tel:${tel.replace(/\s/g, '')}`
}

function doucheLabel(v: boolean | 'froide' | null): string {
  if (v === 'froide') return 'Douche froide'
  return v ? 'Douche' : 'Pas de douche'
}

const { snapshot, load } = useDispo()
await load()
// date de début choisie pour le scan de dispo ; à défaut, plage du snapshot puis aujourd'hui
const scanDebut = ref('')

// filtres + date de scan conservés au refresh (comme le plan) ; page SSR → restauration
// après hydratation pour ne pas créer de mismatch serveur/client
const UI_STORAGE_KEY = 'gr20-hebergements-ui-v1'
onMounted(() => {
  // page prérendue : au chargement direct, la dispo vient du payload figé au build. En ligne,
  // on force un re-fetch client pour le dernier relevé ; hors ligne on garde le payload/précache.
  if (navigator.onLine) load(true)
  const raw = localStorage.getItem(UI_STORAGE_KEY)
  if (raw) {
    try {
      const s = JSON.parse(raw)
      if (Array.isArray(s.typeFilter)) typeFilter.value = s.typeFilter
      if (Array.isArray(s.formuleFilter)) formuleFilter.value = s.formuleFilter
      if (Array.isArray(s.servicesFilter)) servicesFilter.value = s.servicesFilter
      const today = new Date().toLocaleDateString('en-CA')
      if (typeof s.scanDebut === 'string' && s.scanDebut >= today) scanDebut.value = s.scanDebut
    } catch {
      /* état corrompu → défauts */
    }
  }
  watch([typeFilter, formuleFilter, servicesFilter, scanDebut], () => {
    localStorage.setItem(
      UI_STORAGE_KEY,
      JSON.stringify({
        typeFilter: typeFilter.value,
        formuleFilter: formuleFilter.value,
        servicesFilter: servicesFilter.value,
        scanDebut: scanDebut.value,
      })
    )
  })
})
const rescanRange = computed(() => {
  if (scanDebut.value) {
    const fin = addDaysIso(scanDebut.value, 13)
    if (fin) return { debut: scanDebut.value, fin }
  }
  if (snapshot.value) return { debut: snapshot.value.dateDebut, fin: snapshot.value.dateFin }
  const today = new Date().toLocaleDateString('en-CA')
  return { debut: today, fin: addDaysIso(today, 13) }
})
</script>

<template>
  <UContainer class="py-8">
    <div class="mb-6">
      <h1 class="text-2xl font-bold">Hébergements</h1>
      <p class="text-muted mt-1 text-sm">
        {{ totalShown }} / {{ accommodations.length }} hébergements, du nord au sud. Tarifs saison 2026 —
        les refuges PNRC se réservent sur
        <a href="https://pnr-resa.corsica" target="_blank" rel="noopener" class="text-primary underline">pnr-resa.corsica</a>,
        les privés en direct.
      </p>
    </div>

    <DispoBanner
      class="mb-6"
      v-model:debut="scanDebut"
      editable-debut
      :rescan-debut="rescanRange.debut"
      :rescan-fin="rescanRange.fin"
    />

    <div class="mb-8 flex flex-wrap gap-3">
      <USelectMenu
        v-model="typeFilter"
        value-key="value"
        :items="typeItems"
        multiple
        placeholder="Type d’hébergement"
        class="w-56"
      />
      <USelectMenu
        v-model="formuleFilter"
        value-key="value"
        :items="formuleItems"
        multiple
        placeholder="Formule (dortoir, bivouac…)"
        class="w-64"
      />
      <USelectMenu
        v-model="servicesFilter"
        value-key="value"
        :items="serviceItems"
        multiple
        placeholder="Services requis"
        class="w-52"
      />
      <UButton
        v-if="typeFilter.length || formuleFilter.length || servicesFilter.length"
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        label="Réinitialiser"
        @click="typeFilter = []; formuleFilter = []; servicesFilter = []"
      />
    </div>

    <div v-for="section in sections" :key="section.waypoint.id" class="mb-10">
      <div class="border-default mb-4 flex items-baseline gap-3 border-b pb-2">
        <h2 class="text-lg font-semibold">{{ section.waypoint.name }}</h2>
        <span class="text-muted text-sm tabular-nums">{{ section.waypoint.altitude_m }} m</span>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <UCard v-for="acc in section.accommodations" :key="acc.id">
          <template #header>
            <div class="flex items-start justify-between gap-2">
              <div>
                <div class="font-medium">{{ acc.name }}</div>
                <div class="flex flex-wrap items-center gap-x-2">
                  <GoogleNote :accommodation-id="acc.id" />
                  <span class="text-muted text-xs">{{ acc.ouverture }}</span>
                </div>
              </div>
              <UBadge
                :icon="ACCOMMODATION_TYPE_META[acc.type]?.icon"
                :color="(ACCOMMODATION_TYPE_META[acc.type]?.color as any) ?? 'neutral'"
                variant="subtle"
                :label="ACCOMMODATION_TYPE_META[acc.type]?.label"
              />
            </div>
          </template>

          <div class="space-y-3">
            <table class="w-full text-sm">
              <tbody>
                <tr v-for="f in acc.formules" :key="f.type" class="border-default border-b last:border-0">
                  <td class="py-1.5">
                    {{ FORMULE_LABELS[f.type] }}
                    <span v-if="f.places" class="text-muted text-xs">· {{ f.places }} pl.</span>
                    <div v-if="f.note" class="text-muted text-xs">{{ f.note }}</div>
                    <DispoDots
                      v-if="acc.reservation.canal === 'pnr-resa'"
                      :accommodation-id="acc.id"
                      :formule-type="f.type"
                    />
                  </td>
                  <td class="py-1.5 text-right font-medium tabular-nums">
                    {{ formatPrice(f.prix_eur) }}<span v-if="f.prix_eur != null" class="text-muted text-xs font-normal">/{{ f.par === 'chambre' ? 'ch.' : f.par === 'tente' ? 'tente' : 'pers.' }}</span>
                  </td>
                </tr>
              </tbody>
            </table>

            <div class="flex flex-wrap gap-1.5">
              <UBadge v-if="acc.services.repas" icon="i-lucide-utensils" color="neutral" variant="soft" size="sm" label="Repas" />
              <UBadge v-if="acc.services.epicerie" icon="i-lucide-shopping-basket" color="neutral" variant="soft" size="sm" label="Épicerie" />
              <UBadge v-if="acc.services.douche" icon="i-lucide-shower-head" color="neutral" variant="soft" size="sm" :label="doucheLabel(acc.services.douche)" />
              <UBadge v-if="acc.services.acces_route" icon="i-lucide-car" color="neutral" variant="soft" size="sm" label="Accès route" />
            </div>

            <p class="text-muted text-xs leading-relaxed">{{ acc.notes }}</p>

            <UAlert
              v-if="acc.unverified.length"
              icon="i-lucide-triangle-alert"
              color="warning"
              variant="subtle"
              :description="`À vérifier : ${acc.unverified.join(' ; ')}`"
              :ui="{ description: 'text-xs' }"
            />
          </div>

          <template #footer>
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                v-if="acc.reservation.canal === 'pnr-resa'"
                icon="i-lucide-calendar-check"
                size="xs"
                color="primary"
                variant="soft"
                label="Réserver sur pnr-resa"
                :to="acc.reservation.site ?? 'https://pnr-resa.corsica'"
                target="_blank"
              />
              <template v-else>
                <UButton
                  v-if="acc.reservation.telephone"
                  icon="i-lucide-phone"
                  size="xs"
                  color="neutral"
                  variant="soft"
                  :label="acc.reservation.telephone"
                  :to="telHref(acc.reservation.telephone)"
                />
                <UButton
                  v-if="acc.reservation.site"
                  icon="i-lucide-globe"
                  size="xs"
                  color="neutral"
                  variant="soft"
                  label="Site"
                  :to="acc.reservation.site"
                  target="_blank"
                />
                <UButton
                  v-if="acc.reservation.email"
                  icon="i-lucide-mail"
                  size="xs"
                  color="neutral"
                  variant="soft"
                  label="Email"
                  :to="`mailto:${acc.reservation.email}`"
                />
              </template>
            </div>
          </template>
        </UCard>
      </div>
    </div>

    <UAlert
      v-if="sections.length === 0"
      icon="i-lucide-search-x"
      color="neutral"
      variant="subtle"
      title="Aucun hébergement ne correspond à ces filtres."
    />
  </UContainer>
</template>
