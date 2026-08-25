<script setup lang="ts">
import type { Accommodation, PlanDay, PlanNight, Waypoint } from '~/types'

const {
  plan, days, stopCandidates, nightWaypointIds, toggleStop, initFromOfficial, resetPlan,
  accommodationFor, bookingProgress, deadlines, seasonWarning, storageNotices, replacePlan,
  orphanNights, placedNights, removeNight,
} = usePlan()
const { accommodationsByWaypoint, waypointById, googleRatingFor } = useGr20()

// décocher une nuitée détruit ses infos de résa : on confirme si elle en porte
function onToggleStop(waypointId: string) {
  const night = plan.value.nights.find((n) => n.waypointId === waypointId)
  if (night) {
    const b = night.booking
    const hasBookingData = b.status !== 'a_reserver' || b.reference !== '' || b.notes !== '' || b.prixPayeEur != null
    if (hasBookingData) {
      const detail = [BOOKING_STATUS_META[b.status]?.label, b.reference && `réf. ${b.reference}`].filter(Boolean).join(', ')
      if (!window.confirm(`Supprimer la nuitée « ${waypointById.get(waypointId)?.name} » et ses infos de réservation (${detail}) ?`)) return
    }
  }
  toggleStop(waypointId)
}

const showStopsEditor = ref(false)

function accommodationItems(night: PlanNight) {
  // note Google en tête de libellé : les noms sont longs et le menu tronque la fin
  return (accommodationsByWaypoint.get(night.waypointId) ?? []).map((a) => {
    const note = googleRatingFor(a.id)?.note
    return {
      label: note != null ? `★ ${note.toLocaleString('fr-FR', { minimumFractionDigits: 1 })} · ${a.name}` : a.name,
      value: a.id,
    }
  })
}

function formuleItems(night: PlanNight) {
  const acc = accommodationFor(night)
  if (!acc) return []
  return acc.formules.map((f) => ({
    label: `${FORMULE_LABELS[f.type]} — ${formatPrice(f.prix_eur)}${f.prix_eur != null ? (f.par === 'chambre' ? '/ch.' : f.par === 'tente' ? '/tente (2 pl.)' : '/pers.') : ''}`,
    value: f.type,
  }))
}

const statusItems = Object.entries(BOOKING_STATUS_META).map(([value, m]) => ({
  label: m.label,
  value,
  icon: m.icon,
}))

function onAccommodationChange(night: PlanNight) {
  night.formuleType = null
}

const paceLabel = computed(() => {
  const pct = Math.round(plan.value.paceFactor * 100)
  if (pct === 100) return 'rythme officiel'
  return pct < 100 ? `${100 - pct} % plus rapide` : `${pct - 100} % plus lent`
})

const { dispoFor } = useDispo()
const rescanRange = computed(() => {
  if (plan.value.startDate && days.value.length > 1) {
    return { debut: plan.value.startDate, fin: addDaysIso(plan.value.startDate, days.value.length - 2) }
  }
  const today = new Date().toISOString().slice(0, 10)
  return { debut: today, fin: addDaysIso(today, 13) }
})

const nightDispoByDay = computed(() => {
  const map = new Map<number, { accommodation: Accommodation; dateIso: string; selectedFormule: string | null }>()
  for (const day of days.value) {
    const acc = day.night ? accommodationFor(day.night) : null
    if (!acc || !day.date || acc.reservation.canal !== 'pnr-resa') continue
    if (!dispoFor(acc.id, day.date)) continue
    map.set(day.index, { accommodation: acc, dateIso: day.date, selectedFormule: day.night!.formuleType })
  }
  return map
})

// météo Open-Meteo aux points d'arrivée de toutes les journées datées (dédupliquées) : pas de
// filtre par fenêtre glissante, sinon l'URL (listes lat/lon) dériverait chaque jour et l'entrée
// en cache ne serait jamais retrouvée hors ligne. meteoFor(id, date) fait déjà le tri par date.
const { load: loadMeteo } = useMeteo()
const meteoWaypoints = computed<Waypoint[]>(() => {
  const seen = new Map<string, Waypoint>()
  for (const day of days.value) {
    if (day.date) seen.set(day.to.id, day.to)
  }
  return [...seen.values()]
})
watch(meteoWaypoints, (wps) => loadMeteo(wps), { immediate: true })

const exporting = ref(false)
async function exportGpx() {
  exporting.value = true
  try {
    await downloadPlanGpx(days.value)
  } finally {
    exporting.value = false
  }
}

// Export du tracé d'une seule journée : utile pour ne charger que l'étape du jour dans une appli
// de rando (OsmAnd, Garmin…) plutôt que les 180 km du parcours.
const exportingDay = ref<number | null>(null)
async function exportDayGpx(day: PlanDay) {
  exportingDay.value = day.index
  try {
    await downloadDayGpx(day)
  } finally {
    exportingDay.value = null
  }
}

function confirmReset() {
  if (window.confirm('Réinitialiser tout le plan (nuitées, réservations, notes) ?')) resetPlan()
}

// Sauvegarde JSON : seul recours si le stockage du navigateur est vidé (« effacer les données de
// site », navigation privée, changement d'appareil). Le fichier reste lisible par les versions
// suivantes de l'app grâce aux migrations (cf. utils/planStorage.ts).
const importInput = ref<HTMLInputElement | null>(null)
const importError = ref<string | null>(null)

async function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // permet de réimporter le même fichier après correction
  if (!file) return
  importError.value = null
  try {
    const imported = parsePlanJson(await file.text())
    const resume = `${imported.nights.length} nuitée(s)${imported.startDate ? `, départ le ${formatDateFr(imported.startDate)}` : ''}`
    if (!window.confirm(`Remplacer le plan actuel par la sauvegarde (${resume}) ?`)) return
    replacePlan(imported)
  } catch (err) {
    importError.value = err instanceof Error ? err.message : 'Fichier illisible.'
  }
}

// Nuitées dont le lieu ne fait plus partie du tracé : jamais supprimées automatiquement, mais
// l'utilisateur doit pouvoir les traiter — sinon elles pèsent sur l'avancement des réservations
// sans qu'aucune carte ne les montre.
function confirmRemoveOrphan(waypointId: string, nom: string | null) {
  const night = plan.value.nights.find((n) => n.waypointId === waypointId)
  const b = night?.booking
  const detail = [b?.reference && `réf. ${b.reference}`, b?.prixPayeEur != null && `${b.prixPayeEur} € payés`, b?.notes]
    .filter(Boolean)
    .join(', ')
  const libelle = nom ?? waypointId
  if (window.confirm(`Supprimer définitivement la nuitée « ${libelle} »${detail ? ` et ses infos (${detail})` : ''} ?`)) {
    removeNight(waypointId)
  }
}
</script>

<template>
  <UContainer class="py-8">
    <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold">Mon plan de trek</h1>
        <p class="text-muted mt-1 text-sm">
          Sauvegardé automatiquement dans ce navigateur. La réservation réelle se fait sur
          <a href="https://pnr-resa.corsica" target="_blank" rel="noopener" class="text-primary underline">pnr-resa.corsica</a>
          (refuges) ou en direct (privés) — ici tu traces où tu en es.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          icon="i-lucide-download"
          variant="soft"
          color="neutral"
          label="Export GPX"
          :loading="exporting"
          :disabled="days.length === 0"
          @click="exportGpx"
        />
        <UButton
          icon="i-lucide-save"
          variant="soft"
          color="neutral"
          label="Sauvegarde JSON"
          :disabled="plan.nights.length === 0"
          title="Enregistre un fichier de sauvegarde du plan (nuitées, réservations, notes)"
          @click="downloadPlanJson(plan)"
        />
        <UButton
          icon="i-lucide-upload"
          variant="soft"
          color="neutral"
          label="Restaurer"
          title="Restaure un plan depuis un fichier de sauvegarde JSON"
          @click="importInput?.click()"
        />
        <input ref="importInput" type="file" accept="application/json,.json" class="hidden" @change="onImportFile">
        <UButton
          v-if="plan.nights.length"
          icon="i-lucide-rotate-ccw"
          variant="ghost"
          color="error"
          label="Réinitialiser"
          @click="confirmReset"
        />
      </div>
    </div>

    <UAlert
      v-for="notice in storageNotices"
      :key="notice.id"
      class="mb-4"
      icon="i-lucide-database-backup"
      variant="subtle"
      :color="notice.color"
      :title="notice.title"
      :description="notice.description"
      :ui="{ description: 'text-xs' }"
    />

    <UAlert
      v-if="importError"
      class="mb-4"
      icon="i-lucide-file-x"
      color="error"
      variant="subtle"
      title="Restauration impossible"
      :description="importError"
      close
      :ui="{ description: 'text-xs' }"
      @update:open="importError = null"
    />

    <UCard
      v-if="orphanNights.length"
      class="mb-6"
      :ui="{ root: 'ring-warning/40', body: 'p-4 sm:p-5' }"
    >
      <template #header>
        <div class="flex items-start gap-2">
          <UIcon name="i-lucide-map-pin-off" class="text-warning mt-0.5 size-4 shrink-0" />
          <div>
            <p class="font-medium">{{ orphanNights.length }} nuitée(s) hors tracé</p>
            <p class="text-muted mt-1 text-xs">
              Ces lieux ne font plus partie du tracé de référence (renommés, supprimés, ou passés hors
              itinéraire). Les nuitées restent enregistrées avec leurs infos de réservation, mais
              n'apparaissent dans aucune journée. À toi de décider : rien n'est supprimé automatiquement.
            </p>
          </div>
        </div>
      </template>
      <ul class="space-y-2 text-sm">
        <li
          v-for="o in orphanNights"
          :key="o.night.waypointId"
          class="border-default flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-2"
        >
          <span class="font-medium">{{ o.nom ?? o.night.waypointId }}</span>
          <code v-if="o.nom" class="text-muted text-xs">{{ o.night.waypointId }}</code>
          <UBadge
            :color="(BOOKING_STATUS_META[o.night.booking.status]?.color as any)"
            :icon="BOOKING_STATUS_META[o.night.booking.status]?.icon"
            variant="subtle"
            size="sm"
            :label="BOOKING_STATUS_META[o.night.booking.status]?.label"
          />
          <span v-if="o.night.booking.reference" class="text-muted text-xs">réf. {{ o.night.booking.reference }}</span>
          <span v-if="o.night.booking.prixPayeEur != null" class="text-muted text-xs tabular-nums">
            {{ o.night.booking.prixPayeEur }} € payés
          </span>
          <span v-if="o.night.booking.notes" class="text-muted text-xs italic">« {{ o.night.booking.notes }} »</span>
          <UButton
            class="ml-auto"
            icon="i-lucide-trash-2"
            size="xs"
            variant="ghost"
            color="error"
            label="Supprimer"
            @click="confirmRemoveOrphan(o.night.waypointId, o.nom)"
          />
        </li>
      </ul>
    </UCard>

    <UEmpty
      v-if="placedNights.length === 0"
      class="py-16"
      variant="naked"
      size="lg"
      icon="i-lucide-route"
      title="Aucun plan pour l'instant"
      description="Tu pourras ensuite fusionner/scinder les étapes nuit par nuit."
      :actions="[{ size: 'lg', icon: 'i-lucide-sparkles', label: 'Partir des 16 étapes officielles', onClick: initFromOfficial }]"
    />

    <template v-else>
      <div class="mb-6 grid gap-4 lg:grid-cols-2">
        <UCard>
          <template #header><span class="font-medium">Paramètres</span></template>
          <div class="space-y-4">
            <UFormField label="Date de départ (Calenzana)">
              <UInput v-model="plan.startDate" type="date" min="2020-01-01" max="2099-12-31" class="w-full" />
            </UFormField>
            <UFormField label="Heure de départ le matin" help="Sert à estimer ta position pour la météo horaire">
              <UInput v-model="plan.heureDepart" type="time" class="w-full" />
            </UFormField>
            <UFormField label="Nombre de personnes">
              <UInputNumber v-model="plan.partySize" :min="1" :max="12" class="w-full" />
            </UFormField>
            <UFormField :label="`Rythme : ${paceLabel}`">
              <USlider v-model="plan.paceFactor" :min="0.7" :max="1.4" :step="0.05" />
            </UFormField>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <span class="font-medium">Réservations</span>
              <UBadge variant="subtle" :color="bookingProgress.reserved === bookingProgress.total ? 'success' : 'warning'">
                {{ bookingProgress.reserved }}/{{ bookingProgress.total }}
              </UBadge>
            </div>
          </template>
          <UProgress
            :model-value="bookingProgress.reserved"
            :max="bookingProgress.total"
            :color="bookingProgress.reserved === bookingProgress.total ? 'success' : 'warning'"
            class="mb-4"
          />
          <ul class="space-y-1.5 text-xs">
            <li v-for="d in deadlines" :key="d.id" class="flex items-start gap-2" :class="d.passed ? 'text-muted line-through' : ''">
              <UIcon :name="d.passed ? 'i-lucide-check' : 'i-lucide-bell'" class="mt-0.5 size-3.5 shrink-0" />
              <span><strong>{{ formatDateFr(d.date) }}</strong> — {{ d.label }}</span>
            </li>
            <li v-if="!plan.startDate" class="text-muted">Renseigne la date de départ pour voir l'échéancier.</li>
          </ul>
        </UCard>
      </div>

      <UAlert
        v-if="seasonWarning"
        class="mb-6"
        icon="i-lucide-triangle-alert"
        color="warning"
        variant="subtle"
        :description="seasonWarning"
      />

      <DispoBanner class="mb-6" :rescan-debut="rescanRange.debut" :rescan-fin="rescanRange.fin" />

      <UCollapsible v-model:open="showStopsEditor" class="mb-6">
        <UButton
          :icon="showStopsEditor ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          variant="ghost"
          color="neutral"
          :label="`Modifier les nuitées (${placedNights.length} nuits, ${days.length} jours de marche)`"
        />
        <template #content>
          <div class="border-default mt-2 rounded-lg border p-4">
            <p class="text-muted mb-3 text-xs">
              Coche les lieux où tu dors : décocher une nuitée fusionne les deux journées adjacentes.
            </p>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="wp in stopCandidates"
                :key="wp.id"
                size="xs"
                :variant="nightWaypointIds.has(wp.id) ? 'solid' : 'outline'"
                :color="nightWaypointIds.has(wp.id) ? 'primary' : 'neutral'"
                :label="wp.name"
                :disabled="nightWaypointIds.has(wp.id) && placedNights.length === 1"
                :title="nightWaypointIds.has(wp.id) && placedNights.length === 1 ? 'Garde au moins une nuitée — utilise Réinitialiser pour repartir de zéro' : undefined"
                @click="onToggleStop(wp.id)"
              />
            </div>
          </div>
        </template>
      </UCollapsible>

      <div class="space-y-4">
        <UCard v-for="day in days" :key="day.index" :ui="{ body: 'p-4 sm:p-5' }">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <span class="text-muted mr-2 text-sm font-semibold uppercase">Jour {{ day.index }}</span>
              <span class="font-medium">{{ day.from.name }} → {{ day.to.name }}</span>
              <span v-if="day.date" class="text-muted ml-2 text-sm">{{ formatDateFr(day.date) }}</span>
            </div>
            <div class="text-muted flex flex-wrap items-center gap-3 text-sm tabular-nums">
              <MeteoNight v-if="day.date" :waypoint-id="day.to.id" :date-iso="day.date" :altitude="day.to.altitude_m" />
              <span>{{ day.distance_km }} km</span>
              <span class="text-success">+{{ day.d_plus_m }} m</span>
              <span class="text-error">−{{ day.d_minus_m }} m</span>
              <span class="font-medium">{{ formatHours(day.time_h) }}</span>
              <UButton
                icon="i-lucide-download"
                variant="ghost"
                color="neutral"
                size="xs"
                :loading="exportingDay === day.index"
                title="Télécharger le tracé GPX de cette journée"
                aria-label="Télécharger le tracé GPX de cette journée"
                @click="exportDayGpx(day)"
              />
            </div>
          </div>

          <div v-if="day.time_h > 9" class="mt-2">
            <UBadge color="error" variant="subtle" icon="i-lucide-triangle-alert" size="sm" label="Journée très longue (> 9 h de marche)" />
          </div>

          <template v-if="day.night">
            <USeparator class="my-4" />
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <UFormField label="Hébergement" size="sm">
                <USelect
                  v-model="day.night.accommodationId"
                  value-key="value"
                  :items="accommodationItems(day.night)"
                  placeholder="Choisir…"
                  class="w-full"
                  @update:model-value="onAccommodationChange(day.night!)"
                />
              </UFormField>
              <UFormField label="Formule" size="sm">
                <USelect
                  v-model="day.night.formuleType"
                  value-key="value"
                  :items="formuleItems(day.night)"
                  :disabled="!day.night.accommodationId"
                  placeholder="Choisir…"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Statut résa" size="sm">
                <USelect
                  v-model="day.night.booking.status"
                  value-key="value"
                  :items="statusItems"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Référence / n° de résa" size="sm">
                <UInput v-model="day.night.booking.reference" placeholder="ex. facture PNRC" class="w-full" />
              </UFormField>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-3">
              <UBadge
                :color="(BOOKING_STATUS_META[day.night.booking.status]?.color as any)"
                :icon="BOOKING_STATUS_META[day.night.booking.status]?.icon"
                variant="subtle"
                :label="BOOKING_STATUS_META[day.night.booking.status]?.label"
              />
              <DispoNight v-if="nightDispoByDay.has(day.index)" v-bind="nightDispoByDay.get(day.index)!" />
              <GoogleNote v-if="day.night.accommodationId" :accommodation-id="day.night.accommodationId" />
              <template v-if="accommodationFor(day.night)">
                <UButton
                  v-if="accommodationFor(day.night)!.reservation.canal === 'pnr-resa'"
                  icon="i-lucide-external-link"
                  size="xs"
                  variant="link"
                  label="Réserver sur pnr-resa"
                  to="https://pnr-resa.corsica"
                  target="_blank"
                />
                <UButton
                  v-else-if="accommodationFor(day.night)!.reservation.telephone"
                  icon="i-lucide-phone"
                  size="xs"
                  variant="link"
                  :label="accommodationFor(day.night)!.reservation.telephone!"
                  :to="`tel:${accommodationFor(day.night)!.reservation.telephone!.replace(/\s/g, '')}`"
                />
                <span
                  v-if="day.date && accommodationFor(day.night)!.reservation.canal === 'pnr-resa'"
                  class="text-muted text-xs"
                >
                  Modifiable sur pnr-resa jusqu'au {{ formatDateFr(addDaysIso(day.date, -2)) }}
                </span>
              </template>
              <div class="ml-auto flex items-center gap-2">
                <span class="text-muted text-xs">Prix payé</span>
                <UInputNumber v-model="day.night.booking.prixPayeEur" :min="0" size="xs" class="w-24" placeholder="€" />
              </div>
            </div>

            <UInput
              v-model="day.night.booking.notes"
              class="mt-3 w-full"
              size="sm"
              icon="i-lucide-sticky-note"
              placeholder="Notes (confirmation orale, heure d'arrivée prévue, à rappeler…)"
            />
          </template>

          <template v-else>
            <USeparator class="my-4" />
            <div class="text-muted flex items-center gap-2 text-sm">
              <UIcon name="i-lucide-flag" class="text-primary size-4" />
              Arrivée à {{ day.to.name }} — navettes vers Porto-Vecchio depuis le gîte La Tonnelle.
            </div>
          </template>
        </UCard>
      </div>
    </template>
  </UContainer>
</template>
