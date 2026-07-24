import type { Accommodation, BookingStatus, PlanDay, PlanNight, TrekPlan } from '~/types'

const STORAGE_KEY = 'gr20-trek-plan-v1'

function defaultPlan(): TrekPlan {
  return {
    version: 1,
    startDate: null,
    partySize: 1,
    paceFactor: 1,
    includeMealsInBudget: true,
    nights: [],
  }
}

function newNight(waypointId: string): PlanNight {
  return {
    waypointId,
    accommodationId: null,
    formuleType: null,
    booking: { status: 'a_reserver', reference: '', prixPayeEur: null, notes: '' },
  }
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export const BOOKING_STATUS_META: Record<BookingStatus, { label: string; color: string; icon: string }> = {
  a_reserver: { label: 'À réserver', color: 'warning', icon: 'i-lucide-circle-dashed' },
  reserve: { label: 'Réservé', color: 'success', icon: 'i-lucide-circle-check' },
  complet: { label: 'Complet', color: 'error', icon: 'i-lucide-circle-x' },
  liste_attente: { label: "Liste d'attente", color: 'info', icon: 'i-lucide-circle-ellipsis' },
}

export function usePlan() {
  const { waypointOrder, waypointById, segmentsBetween, accommodationsByWaypoint, pnrc } = useGr20()

  const plan = useState<TrekPlan>('trek-plan', defaultPlan)

  if (import.meta.client) {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as TrekPlan
        if (parsed.version === 1) plan.value = { ...defaultPlan(), ...parsed }
      } catch {
        /* plan corrompu → on repart du défaut */
      }
    }
    watch(plan, (v) => localStorage.setItem(STORAGE_KEY, JSON.stringify(v)), { deep: true })
  }

  // Waypoints sélectionnables comme nuitées (tout sauf départ/arrivée)
  const stopCandidates = waypointOrder.slice(1, -1).map((id) => waypointById.get(id)!)

  const officialStopIds = [
    'ortu-di-u-piobbu', 'carrozzu', 'ascu-stagnu', 'tighjettu', 'ciottulu-di-i-mori',
    'manganu', 'petra-piana', 'onda', 'vizzavona', 'e-capannelle', 'prati', 'usciolu',
    'matalza', 'asinau', 'paliri',
  ]

  function initFromOfficial() {
    plan.value.nights = officialStopIds.map(newNight)
  }

  function resetPlan() {
    plan.value = defaultPlan()
  }

  const nightWaypointIds = computed(() => new Set(plan.value.nights.map((n) => n.waypointId)))

  function toggleStop(waypointId: string) {
    const nights = plan.value.nights
    const existing = nights.findIndex((n) => n.waypointId === waypointId)
    if (existing >= 0) {
      nights.splice(existing, 1)
      return
    }
    const order = waypointOrder.indexOf(waypointId)
    const insertAt = nights.findIndex((n) => waypointOrder.indexOf(n.waypointId) > order)
    const night = newNight(waypointId)
    // pré-sélectionne l'hébergement s'il est seul sur place
    const accs = accommodationsByWaypoint.get(waypointId) ?? []
    if (accs.length === 1 && accs[0]) night.accommodationId = accs[0].id
    if (insertAt === -1) nights.push(night)
    else nights.splice(insertAt, 0, night)
  }

  const days = computed<PlanDay[]>(() => {
    const stops = [waypointOrder[0]!, ...plan.value.nights.map((n) => n.waypointId), waypointOrder.at(-1)!]
    const out: PlanDay[] = []
    for (let i = 1; i < stops.length; i++) {
      const from = stops[i - 1]!
      const to = stops[i]!
      const segs = segmentsBetween(from, to)
      const isArrival = i === stops.length - 1
      out.push({
        index: i,
        date: plan.value.startDate ? addDaysIso(plan.value.startDate, i - 1) : null,
        from: waypointById.get(from)!,
        to: waypointById.get(to)!,
        distance_km: +segs.reduce((s, x) => s + x.distance_km, 0).toFixed(1),
        d_plus_m: segs.reduce((s, x) => s + x.d_plus_m, 0),
        d_minus_m: segs.reduce((s, x) => s + x.d_minus_m, 0),
        time_h: +(segs.reduce((s, x) => s + x.time_h, 0) * plan.value.paceFactor).toFixed(1),
        night: isArrival ? null : plan.value.nights[i - 1]!,
        isArrival,
      })
    }
    return out
  })

  function accommodationFor(night: PlanNight): Accommodation | null {
    if (!night.accommodationId) return null
    return (accommodationsByWaypoint.get(night.waypointId) ?? []).find((a) => a.id === night.accommodationId) ?? null
  }

  function formuleFor(night: PlanNight) {
    const acc = accommodationFor(night)
    if (!acc || !night.formuleType) return null
    return acc.formules.find((f) => f.type === night.formuleType) ?? null
  }

  const tarifs = pnrc.tarifs_eur as Record<string, number>
  const mealEstimatePerNight =
    (((tarifs.repas_soir_min ?? 18) + (tarifs.repas_soir_max ?? 28)) / 2) +
    (((tarifs.petit_dej_min ?? 9) + (tarifs.petit_dej_max ?? 13)) / 2)

  const budget = computed(() => {
    let nuitees = 0
    let nuiteesInconnues = 0
    let repas = 0
    let especes = 0
    for (const night of plan.value.nights) {
      const acc = accommodationFor(night)
      const formule = formuleFor(night)
      const party = plan.value.partySize
      if (formule && formule.prix_eur != null) {
        let cost: number
        if (formule.par === 'chambre') {
          cost = formule.prix_eur
        } else if (formule.par === 'tente') {
          // tentes 2 places facturées à la tente selon occupation (CGV PNRC : 27 € seul, 39 € à deux)
          const prixDeux = formule.prix_2p_eur ?? formule.prix_eur
          cost = Math.floor(party / 2) * prixDeux + (party % 2) * formule.prix_eur
        } else {
          cost = formule.prix_eur * party
        }
        nuitees += cost
        if (acc && acc.reservation.canal !== 'pnr-resa') especes += cost
      } else if (night.accommodationId) {
        nuiteesInconnues++
      }
      const isDp = night.formuleType === 'demi-pension'
      if (plan.value.includeMealsInBudget && !isDp && acc?.services.repas) {
        const meals = mealEstimatePerNight * party
        repas += meals
        especes += meals
      }
    }
    return {
      nuitees: Math.round(nuitees),
      nuiteesInconnues,
      repas: Math.round(repas),
      especes: Math.round(especes),
      total: Math.round(nuitees + repas),
    }
  })

  const bookingProgress = computed(() => {
    const total = plan.value.nights.length
    const reserved = plan.value.nights.filter((n) => n.booking.status === 'reserve').length
    return { reserved, total }
  })

  const saison = pnrc.saison as { ouverture_ventes: string; debut: string; fin: string }

  const deadlines = computed(() => {
    const start = plan.value.startDate
    if (!start) return []
    const year = start.slice(0, 4)
    const items = [
      {
        id: 'ouverture',
        date: `${year}${saison.ouverture_ventes.slice(4)}`,
        label: 'Ouverture des ventes PNRC (indicatif : ~20 janvier)',
      },
      { id: 'j60', date: addDaysIso(start, -60), label: 'Dernier jour de remboursement intégral PNRC (J-60)' },
      { id: 'j10', date: addDaysIso(start, -10), label: "Limite de demande d'avoir médical (J-10)" },
      { id: 'j2', date: addDaysIso(start, -2), label: 'Limite de modification de la 1ʳᵉ nuit (J-2, glisse ensuite chaque jour)' },
    ]
    const today = new Date().toISOString().slice(0, 10)
    return items
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((i) => ({ ...i, passed: i.date < today }))
  })

  const seasonWarning = computed(() => {
    const start = plan.value.startDate
    if (!start) return null
    const year = start.slice(0, 4)
    const debut = `${year}${saison.debut.slice(4)}`
    const fin = `${year}${saison.fin.slice(4)}`
    const end = days.value.at(-1)?.date ?? start
    if (start < debut || end > fin) {
      return `Attention : la saison de gardiennage PNRC va du ${formatDateFr(debut)} au ${formatDateFr(fin)} — ton plan (${formatDateFr(start)} → ${formatDateFr(end)}) en sort partiellement.`
    }
    return null
  })

  return {
    plan,
    days,
    stopCandidates,
    nightWaypointIds,
    toggleStop,
    initFromOfficial,
    resetPlan,
    accommodationFor,
    formuleFor,
    budget,
    bookingProgress,
    deadlines,
    seasonWarning,
    mealEstimatePerNight,
  }
}
