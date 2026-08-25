<script setup lang="ts">
import type { PlanDay, Waypoint } from '~/types'
import type { MeteoJour } from '~/composables/useMeteo'
import type { MeteoHeure } from '~/composables/useMeteoHoraire'

const { plan, days, placedNights } = usePlan()
const { load: loadMeteo, meteoFor, loading, error, derniereMajMs } = useMeteo()
const { load: loadHeures, heuresPour, error: erreurHeures } = useMeteoHoraire()

// même liste de points que /plan (arrivées des journées datées, dédupliquées, SANS fenêtre
// glissante) : l'URL Open-Meteo reste identique entre les deux pages → une seule requête
// partagée et une seule entrée dans le cache du service worker, retrouvable hors ligne.
const meteoWaypoints = computed<Waypoint[]>(() => {
  const seen = new Map<string, Waypoint>()
  for (const day of days.value) {
    if (day.date) seen.set(day.to.id, day.to)
  }
  return [...seen.values()]
})
watch(meteoWaypoints, (wps) => loadMeteo(wps), { immediate: true })

// page client-only (ssr: false) : navigator/Date locales sans risque d'hydratation
const aujourdhui = new Date().toLocaleDateString('en-CA')
const finHorizon = addDaysIso(aujourdhui, METEO_HORIZON_JOURS - 1)

type EtatJour = 'ok' | 'passee' | 'hors-horizon' | 'indisponible'
interface LigneJour {
  day: PlanDay
  meteo: MeteoJour | null
  etat: EtatJour
  disponibleLe: string | null // pour « hors-horizon » : date à partir de laquelle la prévision existera
}

const lignes = computed<LigneJour[]>(() =>
  days.value
    .filter((d): d is PlanDay & { date: string } => d.date != null)
    .map((day) => {
      const meteo = meteoFor(day.to.id, day.date)
      const etat: EtatJour = meteo
        ? 'ok'
        : day.date < aujourdhui
          ? 'passee'
          : day.date > finHorizon
            ? 'hors-horizon'
            : 'indisponible'
      return {
        day,
        meteo,
        etat,
        disponibleLe: etat === 'hors-horizon' ? addDaysIso(day.date, -(METEO_HORIZON_JOURS - 1)) : null,
      }
    }),
)

const joursEnAlerte = computed(() => lignes.value.filter((l) => l.meteo && meteoAlerte(l.meteo)))

function motifsAlerte(j: MeteoJour): string {
  const motifs = []
  if (j.code >= 95) motifs.push('orage')
  if (j.ventMaxKmh >= 60 || j.rafalesMaxKmh >= 80) motifs.push(`rafales ${j.rafalesMaxKmh} km/h`)
  if (j.precipMm >= 20) motifs.push(`${j.precipMm} mm de pluie`)
  return motifs.join(', ')
}

const majLabel = computed(() =>
  derniereMajMs.value
    ? new Date(derniereMajMs.value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : null,
)

// météo horaire : une requête par journée encore à venir et dans l'horizon, à la position estimée
// heure par heure. Débounce léger : la saisie de l'heure de départ change la clé (donc l'URL) à
// chaque modification.
const joursHoraires = computed(() =>
  days.value.filter((d) => d.date && d.date >= aujourdhui && d.date <= finHorizon),
)
let debounceHeures: ReturnType<typeof setTimeout> | null = null
watch(
  [joursHoraires, () => plan.value.heureDepart, () => plan.value.paceFactor],
  () => {
    if (debounceHeures) clearTimeout(debounceHeures)
    debounceHeures = setTimeout(() => loadHeures(joursHoraires.value, plan.value.heureDepart, plan.value.paceFactor), 400)
  },
  { immediate: true },
)

function tooltipHeure(h: MeteoHeure): string {
  const parts = [
    `${meteoCodeMeta(h.code).label} à ${h.altitudeM} m`,
    h.precipMm > 0 ? `${h.precipMm} mm${h.precipProbPct != null ? ` (${h.precipProbPct} %)` : ''}` : 'pas de pluie',
    `vent ${h.ventKmh} km/h, rafales ${h.rafalesKmh}`,
    h.enMarche ? 'en marche (position estimée)' : 'au refuge/à l’étape',
  ]
  return parts.join(' · ')
}
</script>

<template>
  <UContainer class="py-8">
    <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold">Météo du trek</h1>
        <p class="text-muted mt-1 text-sm">
          Prévisions <a href="https://open-meteo.com" target="_blank" rel="noopener" class="text-primary underline">Open-Meteo</a> :
          résumé au point d'arrivée, et heure par heure à ta position estimée le long de l'étape
          (selon ton heure de départ et ton rythme). Horizon : {{ METEO_HORIZON_JOURS }} jours.
          <span v-if="majLabel">Mise à jour à {{ majLabel }}.</span>
        </p>
      </div>
      <UFormField v-if="placedNights.length && plan.startDate" label="Heure de départ le matin">
        <UInput v-model="plan.heureDepart" type="time" />
      </UFormField>
    </div>

    <UEmpty
      v-if="placedNights.length === 0"
      class="py-16"
      variant="naked"
      size="lg"
      icon="i-lucide-route"
      title="Aucun plan pour l'instant"
      description="Construis d'abord ton plan de trek : la météo s'affichera pour chaque journée."
      :actions="[{ size: 'lg', icon: 'i-lucide-calendar-check', label: 'Aller à mon plan', to: '/plan' }]"
    />

    <UEmpty
      v-else-if="!plan.startDate"
      class="py-16"
      variant="naked"
      size="lg"
      icon="i-lucide-calendar-plus"
      title="Pas de date de départ"
      description="Renseigne ta date de départ dans le plan pour croiser l'itinéraire avec les prévisions."
      :actions="[{ size: 'lg', icon: 'i-lucide-calendar-check', label: 'Choisir une date dans mon plan', to: '/plan' }]"
    />

    <template v-else>
      <UAlert
        v-if="error || erreurHeures"
        class="mb-4"
        icon="i-lucide-cloud-off"
        color="warning"
        variant="subtle"
        title="Prévisions non actualisées"
        :description="`${error ?? erreurHeures} — les dernières prévisions en cache restent affichées.`"
        :ui="{ description: 'text-xs' }"
      />

      <UAlert
        v-if="joursEnAlerte.length"
        class="mb-4"
        icon="i-lucide-triangle-alert"
        color="error"
        variant="subtle"
        :title="`Vigilance sur ${joursEnAlerte.length} journée(s)`"
        :ui="{ description: 'text-xs' }"
      >
        <template #description>
          <ul class="mt-1 space-y-0.5">
            <li v-for="l in joursEnAlerte" :key="l.day.index">
              Jour {{ l.day.index }} ({{ formatDateFr(l.day.date) }}) — {{ l.day.to.name }} : {{ motifsAlerte(l.meteo!) }}
            </li>
          </ul>
        </template>
      </UAlert>

      <div class="space-y-4">
        <UCard v-for="l in lignes" :key="l.day.index" :ui="{ body: 'p-4 sm:p-5' }">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <span class="text-muted mr-2 text-sm font-semibold uppercase">Jour {{ l.day.index }}</span>
              <span class="font-medium">{{ l.day.from.name }} → {{ l.day.to.name }}</span>
              <span class="text-muted ml-2 text-sm">{{ formatDateFr(l.day.date) }}</span>
            </div>
            <div class="text-muted flex flex-wrap items-center gap-3 text-sm tabular-nums">
              <span>{{ l.day.distance_km }} km</span>
              <span class="text-success">+{{ l.day.d_plus_m }} m</span>
              <span class="text-error">−{{ l.day.d_minus_m }} m</span>
              <span class="font-medium">{{ formatHours(l.day.time_h) }}</span>
            </div>
          </div>

          <USeparator class="my-4" />

          <template v-if="l.meteo">
            <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div class="flex min-w-40 items-center gap-3">
                <UIcon :name="meteoCodeMeta(l.meteo.code).icon" class="text-primary size-9 shrink-0" />
                <div>
                  <p class="font-medium">{{ meteoCodeMeta(l.meteo.code).label }}</p>
                  <p class="text-muted text-xs">{{ l.day.to.name }} · {{ l.day.to.altitude_m }} m</p>
                </div>
              </div>

              <div class="text-muted flex flex-wrap items-center gap-x-5 gap-y-2 text-sm tabular-nums">
                <span class="inline-flex items-center gap-1.5">
                  <UIcon name="i-lucide-thermometer" class="size-4" />
                  {{ l.meteo.tMinC }}° → {{ l.meteo.tMaxC }}°
                </span>
                <span class="inline-flex items-center gap-1.5">
                  <UIcon name="i-lucide-cloud-rain" class="size-4" />
                  <template v-if="l.meteo.precipMm > 0">
                    {{ l.meteo.precipMm }} mm<template v-if="l.meteo.precipProbPct != null"> ({{ l.meteo.precipProbPct }} %)</template>
                  </template>
                  <template v-else>pas de pluie prévue</template>
                </span>
                <span class="inline-flex items-center gap-1.5">
                  <UIcon name="i-lucide-wind" class="size-4" />
                  {{ l.meteo.ventMaxKmh }} km/h, rafales {{ l.meteo.rafalesMaxKmh }}
                </span>
                <span v-if="l.meteo.uvMax != null" class="inline-flex items-center gap-1.5">
                  <UIcon name="i-lucide-sun" class="size-4" />
                  UV {{ l.meteo.uvMax }}
                </span>
              </div>
            </div>

            <div v-if="meteoAlerte(l.meteo)" class="mt-3">
              <UBadge color="error" variant="subtle" icon="i-lucide-triangle-alert" size="sm" :label="`Vigilance : ${motifsAlerte(l.meteo)}`" />
            </div>

            <div v-if="heuresPour(l.day.date)" class="mt-4">
              <p class="text-muted mb-2 text-xs">
                <UIcon name="i-lucide-footprints" class="text-primary mr-1 inline size-3.5" />
                Heure par heure, à ta position estimée (départ {{ plan.heureDepart }}) — les heures de marche sont surlignées.
              </p>
              <div class="overflow-x-auto pb-1">
                <div class="flex min-w-max gap-1">
                  <UTooltip v-for="h in heuresPour(l.day.date)!" :key="h.heure" :text="tooltipHeure(h)">
                    <div
                      class="flex w-14 shrink-0 flex-col items-center gap-0.5 rounded-md py-1.5 text-xs"
                      :class="h.enMarche ? 'bg-primary/10' : ''"
                    >
                      <span class="text-muted">{{ h.heure }} h</span>
                      <UIcon :name="meteoCodeMeta(h.code).icon" class="size-4" :class="h.enMarche ? 'text-primary' : 'text-muted'" />
                      <span class="font-medium tabular-nums">{{ h.tC }}°</span>
                      <span class="text-info tabular-nums text-xs">{{ h.precipMm > 0 ? `${h.precipMm} mm` : ' ' }}</span>
                      <span class="text-muted tabular-nums text-xs">{{ h.altitudeM }} m</span>
                    </div>
                  </UTooltip>
                </div>
              </div>
            </div>
          </template>

          <p v-else-if="l.etat === 'passee'" class="text-muted flex items-center gap-2 text-sm">
            <UIcon name="i-lucide-history" class="size-4" />
            Journée passée — pas de prévision.
          </p>
          <p v-else-if="l.etat === 'hors-horizon'" class="text-muted flex items-center gap-2 text-sm">
            <UIcon name="i-lucide-calendar-clock" class="size-4" />
            Hors horizon de prévision ({{ METEO_HORIZON_JOURS }} jours) — disponible à partir du {{ formatDateFr(l.disponibleLe) }}.
          </p>
          <p v-else class="text-muted flex items-center gap-2 text-sm">
            <UIcon name="i-lucide-cloud-off" class="size-4" />
            {{ loading ? 'Chargement des prévisions…' : 'Prévision indisponible pour cette journée.' }}
          </p>
        </UCard>
      </div>
    </template>
  </UContainer>
</template>
