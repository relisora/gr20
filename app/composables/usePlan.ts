import type { EffectScope } from 'vue'
import type { Accommodation, PlanDay, PlanNight, TrekPlan } from '~/types'

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Scope détaché portant l'enregistrement automatique. Il ne doit PAS appartenir au composant qui
// appelle usePlan() en premier : un watcher créé dans le setup de /plan est arrêté quand la page
// est démontée (navigation vers /carte), et les modifications suivantes ne seraient plus écrites.
// Sert aussi de garde d'hydratation : on ne relit le stockage qu'une fois par chargement d'app,
// sinon un second appel de usePlan() écraserait l'état en mémoire (édition en cours) par le
// contenu du disque.
let persistScope: EffectScope | null = null

/**
 * Cet onglet a-t-il modifié le plan depuis son chargement ? Sert à décider quoi faire quand un autre
 * onglet enregistre : si on n'a rien touché ici, on adopte sa version (rien à perdre) ; sinon on garde
 * ce que l'utilisateur a sous les yeux et on l'avertit. Ne PAS déduire ça d'une comparaison avec le
 * stockage : l'enregistrement étant immédiat à chaque frappe, l'état en mémoire est presque toujours
 * égal au dernier payload écrit, même quand l'utilisateur vient de saisir quelque chose.
 */
let modifieLocalement = false
/** Vrai pendant l'adoption d'une version externe (mutation à ne pas compter comme locale). */
let adoptionEnCours = false
/** Écouteur `storage` en place, conservé pour pouvoir le retirer au rechargement HMR du module. */
let onStorageEvent: ((e: StorageEvent) => void) | null = null

export function usePlan() {
  const { waypointOrder, waypointById, segmentsBetween, accommodationsByWaypoint, pnrc } = useGr20()

  const plan = useState<TrekPlan>('trek-plan', defaultPlan)
  const loadStatus = useState<PlanLoadStatus>('trek-plan-load-status', () => 'vide')
  const loadedVersion = useState<number | null>('trek-plan-loaded-version', () => null)
  const backupKey = useState<string | null>('trek-plan-backup-key', () => null)
  const saveError = useState<string | null>('trek-plan-save-error', () => null)
  const conflictBackupKey = useState<string | null>('trek-plan-conflict-key', () => null)
  const externalChange = useState('trek-plan-external-change', () => false)

  if (import.meta.client && !persistScope) {
    const res = loadStoredPlan()
    loadStatus.value = res.status
    loadedVersion.value = res.versionTrouvee
    backupKey.value = res.sauvegarde
    if (res.plan) plan.value = res.plan

    persistScope = effectScope(true)
    persistScope.run(() => {
      watch(plan, (v) => {
        // adoption d'une version externe : le stockage la contient déjà, et ce n'est pas une
        // modification de cet onglet
        if (adoptionEnCours) return
        modifieLocalement = true
        const { erreur, conflit } = savePlan(v)
        saveError.value = erreur
        if (conflit) conflictBackupKey.value = conflit
      }, { deep: true })

      // Un autre client de la même origine (onglet, fenêtre PWA) a enregistré. L'événement ne se
      // déclenche que dans les AUTRES documents, donc pas de va-et-vient possible.
      onStorageEvent = (e: StorageEvent) => {
        if (e.key !== PLAN_STORAGE_KEY) return
        if (!modifieLocalement) {
          // rien n'a été touché ici : adopter la version la plus récente. C'est le cas dangereux de
          // l'onglet oublié — sans ça, sa première modification remplacerait tout le travail fait
          // dans l'autre onglet.
          const relu = loadStoredPlan()
          if (relu.plan) {
            adoptionEnCours = true
            plan.value = relu.plan
            void nextTick(() => { adoptionEnCours = false })
          }
          return
        }
        // édition locale en cours : ne JAMAIS remplacer ce que l'utilisateur a sous les yeux (on
        // échangerait une perte rare contre une perte visible et fréquente). On signale ; la version
        // de l'autre onglet sera copiée par le prochain enregistrement (compare-and-swap).
        externalChange.value = true
      }
      window.addEventListener('storage', onStorageEvent)
    })

    if (import.meta.hot) {
      // HMR : sans ça, chaque rechargement du module empile un watcher et relit le stockage.
      // `effectScope.stop()` ne retire PAS les écouteurs DOM : sans le removeEventListener,
      // l'écouteur de l'ancien module survit avec une fermeture périmée (`modifieLocalement`
      // resté à false) et adopte une version externe alors qu'on vient d'éditer localement.
      import.meta.hot.dispose(() => {
        if (onStorageEvent) window.removeEventListener('storage', onStorageEvent)
        onStorageEvent = null
        persistScope?.stop()
        persistScope = null
        modifieLocalement = false
      })
    }
  }

  // Waypoints sélectionnables comme nuitées (tout sauf départ/arrivée)
  const stopCandidates = waypointOrder.slice(1, -1).map((id) => waypointById.get(id)!)

  const officialStopIds = [
    'ortu-di-u-piobbu', 'carrozzu', 'ascu-stagnu', 'tighjettu', 'ciottulu-di-i-mori',
    'manganu', 'petra-piana', 'onda', 'vizzavona', 'e-capannelle', 'prati', 'usciolu',
    'matalza', 'asinau', 'paliri',
  ]

  function initFromOfficial() {
    plan.value.nights = officialStopIds.filter((id) => waypointById.has(id)).map(newNight)
  }

  function resetPlan() {
    // destructif : on garde une copie récupérable (cf. planStorage) avant de tout effacer
    backupCurrentPlan('avant-reinit')
    autoriserEcriture() // décision explicite de l'utilisateur : plus rien à protéger
    plan.value = defaultPlan()
  }

  /** Remplace le plan (import d'une sauvegarde) après copie de l'existant. */
  function replacePlan(next: TrekPlan) {
    backupCurrentPlan('avant-import')
    // l'import est la porte de sortie quand l'enregistrement a été bloqué (payload non copiable)
    autoriserEcriture()
    saveError.value = null
    loadStatus.value = 'ok'
    plan.value = sanitizePlan(next)
  }

  /**
   * Retire une nuitée devenue orpheline (lieu absent du tracé actuel). Action réservée à un geste
   * explicite de l'utilisateur : ces nuitées portent des infos de réservation irrécupérables, et
   * rien dans l'app ne doit les supprimer automatiquement.
   */
  function removeNight(waypointId: string) {
    const i = plan.value.nights.findIndex((n) => n.waypointId === waypointId)
    if (i >= 0) plan.value.nights.splice(i, 1)
  }

  const nightWaypointIds = computed(() => new Set(plan.value.nights.map((n) => n.waypointId)))

  function toggleStop(waypointId: string) {
    if (!waypointById.has(waypointId)) return
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

  /**
   * Lieux réellement plaçables sur l'itinéraire = ceux du graphe (`waypoint_order`), et non tous les
   * waypoints connus : un waypoint passé `off_route: true` lors d'une mise à jour des données existe
   * toujours dans `waypoints.json` mais ne fait plus partie du tracé — le garder comme étape
   * donnerait deux journées à 0 km / 0 h sans le moindre signalement.
   */
  const placeableIds = new Set(waypointOrder)

  /**
   * Nuitées dont le lieu ne fait plus partie du tracé (id renommé, supprimé, ou passé hors tracé).
   * Elles restent dans le plan — leurs infos de réservation ne sont pas reconstituables — mais sont
   * exclues de l'itinéraire : un `waypointById.get(id)!` undefined dans `days` fait planter le
   * rendu de la page, donc l'accès à toutes les autres nuitées.
   */
  const orphanNights = computed(() =>
    plan.value.nights
      .filter((n) => !placeableIds.has(n.waypointId))
      .map((n) => ({ night: n, nom: waypointById.get(n.waypointId)?.name ?? null }))
  )

  /** Nuitées effectivement placées dans l'itinéraire (base de l'état vide et des gardes de l'UI). */
  const placedNights = computed(() => plan.value.nights.filter((n) => placeableIds.has(n.waypointId)))

  /** Nuitées dont l'hébergement ou la formule choisis ne sont plus au référentiel. */
  const staleChoices = computed(() =>
    plan.value.nights.flatMap((night) => {
      if (!night.accommodationId) return []
      const lieu = waypointById.get(night.waypointId)?.name ?? night.waypointId
      const acc = (accommodationsByWaypoint.get(night.waypointId) ?? []).find((a) => a.id === night.accommodationId)
      if (!acc) return [{ lieu, motif: `hébergement « ${night.accommodationId} » inconnu` }]
      if (night.formuleType && !acc.formules.some((f) => f.type === night.formuleType)) {
        return [{ lieu, motif: `formule « ${night.formuleType} » plus proposée par ${acc.name}` }]
      }
      return []
    })
  )

  const days = computed<PlanDay[]>(() => {
    // `placed` est conservé à part de `plan.nights` pour que `night` reste aligné avec les journées
    // après exclusion d'une nuitée orpheline
    const placed = placedNights.value
    const stops = [waypointOrder[0]!, ...placed.map((n) => n.waypointId), waypointOrder.at(-1)!]
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
        night: isArrival ? null : placed[i - 1]!,
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

  /**
   * Ce que l'utilisateur doit savoir sur l'état de sa sauvegarde : migration effectuée, plan mis de
   * côté, écriture impossible. Rien ne doit se perdre en silence — surtout pas une écriture qui
   * échoue alors que la page annonce « sauvegardé automatiquement ».
   */
  const storageNotices = computed(() => {
    const out: { id: string; color: 'error' | 'warning' | 'info'; title: string; description: string }[] = []
    const copie = backupKey.value ? ` Copie conservée dans ce navigateur sous « ${backupKey.value} ».` : ''

    if (saveError.value) {
      out.push({
        id: 'save',
        color: 'error',
        title: "Le plan n'est plus enregistré dans ce navigateur",
        description: `${saveError.value} Exporte une sauvegarde JSON maintenant : les modifications en cours ne survivront pas à la fermeture de l'onglet.`,
      })
    }
    if (externalChange.value) {
      out.push({
        id: 'autre-onglet',
        color: 'warning',
        title: 'Ce plan a été modifié ailleurs',
        description:
          "Un autre onglet (ou la fenêtre installée de l'app) a enregistré ce plan pendant que tu l'éditais ici. " +
          "Ta version locale est conservée telle quelle ; l'autre sera copiée avant d'être remplacée. " +
          'Pour repartir de la plus récente : exporte une sauvegarde JSON, puis recharge la page.',
      })
    }
    if (conflictBackupKey.value) {
      out.push({
        id: 'conflit',
        color: 'warning',
        title: "Version d'un autre onglet mise de côté",
        description: `Ce plan avait été enregistré ailleurs depuis son chargement ici. Cette version a été copiée sous « ${conflictBackupKey.value} » avant d'être remplacée par celle-ci.`,
      })
    }
    if (loadStatus.value === 'migre') {
      out.push({
        id: 'migre',
        color: 'info',
        title: `Plan repris depuis la version ${loadedVersion.value} de l'app`,
        description: `Tes nuitées et réservations ont été converties au format actuel (version ${PLAN_VERSION}).${copie}`,
      })
    }
    if (loadStatus.value === 'version-future') {
      out.push({
        id: 'future',
        color: 'warning',
        title: `Plan enregistré par une version plus récente de l'app (version ${loadedVersion.value})`,
        description: `Il est affiché au mieux ; des informations récentes peuvent ne pas apparaître ici. Recharge la page pour mettre l'app à jour avant de modifier quoi que ce soit.${copie}`,
      })
    }
    if (loadStatus.value === 'illisible' || loadStatus.value === 'migration-manquante') {
      out.push({
        id: 'illisible',
        color: 'error',
        title:
          loadStatus.value === 'illisible'
            ? 'Le plan enregistré était illisible'
            : `Le plan enregistré (version ${loadedVersion.value}) ne peut pas être converti`,
        description: `Il n'a pas été chargé et n'a pas été écrasé.${copie || " Aucune copie n'a pu être créée (stockage plein)."} Restaure une sauvegarde JSON si tu en as une.`,
      })
    }
    // Les orphelines ne sont PAS listées ici : elles ont leur propre bloc dans /plan, avec leurs
    // infos de réservation visibles et un bouton de suppression explicite (les compter dans
    // l'avancement des réservations sans jamais les montrer serait un piège).
    if (staleChoices.value.length) {
      out.push({
        id: 'obsoletes',
        color: 'warning',
        title: 'Choix à revoir après mise à jour des données',
        description: staleChoices.value.map((s) => `${s.lieu} : ${s.motif}`).join(' · '),
      })
    }
    return out
  })

  return {
    plan,
    days,
    stopCandidates,
    nightWaypointIds,
    toggleStop,
    initFromOfficial,
    resetPlan,
    replacePlan,
    removeNight,
    accommodationFor,
    formuleFor,
    bookingProgress,
    deadlines,
    seasonWarning,
    storageNotices,
    orphanNights,
    placedNights,
    staleChoices,
  }
}
