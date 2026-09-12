import type { EffectScope } from 'vue'
import type { Accommodation, PlanDay, PlanNight, TrekPlan, Waypoint } from '~/types'

// Scope détaché portant l'enregistrement automatique : créé dans le setup de /plan, le watcher
// serait arrêté au démontage de la page. Sert aussi de garde : le stockage n'est relu qu'une fois.
let persistScope: EffectScope | null = null

// Cet onglet a-t-il modifié le plan ? Décide de la réaction quand un autre onglet enregistre.
// Ne pas le déduire d'une comparaison avec le stockage : l'enregistrement est immédiat à chaque frappe.
let modifieLocalement = false
let adoptionEnCours = false
let onStorageEvent: ((e: StorageEvent) => void) | null = null

export function usePlan() {
  const {
    waypointOrder, waypointById, segmentsBetween, sumSegments, accommodationsByWaypoint, officialNightIds, pnrc,
  } = useGr20()

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
        if (adoptionEnCours) return
        modifieLocalement = true
        const { erreur, conflit } = savePlan(v)
        saveError.value = erreur
        if (conflit) conflictBackupKey.value = conflit
      }, { deep: true })

      // `storage` ne se déclenche que dans les autres documents : pas de va-et-vient possible
      onStorageEvent = (e: StorageEvent) => {
        if (e.key !== PLAN_STORAGE_KEY) return
        if (modifieLocalement) {
          // édition locale en cours : on ne remplace jamais ce que l'utilisateur a sous les yeux ;
          // la version de l'autre onglet sera copiée par le prochain enregistrement
          externalChange.value = true
          return
        }
        // rien touché ici (onglet oublié) : adopter la version externe, sinon la première frappe
        // locale remplacerait tout le travail fait ailleurs
        const relu = loadStoredPlan()
        if (relu.plan) {
          adoptionEnCours = true
          plan.value = relu.plan
          void nextTick(() => {
            adoptionEnCours = false
          })
        }
      }
      window.addEventListener('storage', onStorageEvent)
    })

    // HMR : `effectScope.stop()` ne retire pas les écouteurs DOM, l'ancien survivrait avec une fermeture périmée
    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        if (onStorageEvent) window.removeEventListener('storage', onStorageEvent)
        onStorageEvent = null
        persistScope?.stop()
        persistScope = null
        modifieLocalement = false
      })
    }
  }

  /** Lieux sélectionnables comme nuitées : tout le graphe sauf départ et arrivée. */
  const stopCandidates = waypointOrder.slice(1, -1).map((id) => waypointById.get(id)!)

  function initFromOfficial() {
    plan.value.nights = officialNightIds.filter((id) => waypointById.has(id)).map(newNight)
  }

  function resetPlan() {
    backupCurrentPlan('avant-reinit')
    autoriserEcriture()
    plan.value = defaultPlan()
  }

  /** Remplace le plan (import d'une sauvegarde) après copie de l'existant. */
  function replacePlan(next: TrekPlan) {
    backupCurrentPlan('avant-import')
    autoriserEcriture()
    saveError.value = null
    loadStatus.value = 'ok'
    plan.value = sanitizePlan(next)
  }

  /** Suppression explicite d'une nuitée (orpheline ou non) : rien ne les supprime automatiquement. */
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
    const accs = accommodationsByWaypoint.get(waypointId) ?? []
    if (accs.length === 1) night.accommodationId = accs[0]!.id
    if (insertAt === -1) nights.push(night)
    else nights.splice(insertAt, 0, night)
  }

  // Le critère est l'appartenance au graphe (`waypointOrder`), pas à `waypointById` : un lieu passé
  // `off_route` existe encore dans waypoints.json mais donnerait deux journées à 0 km.
  const placeableIds = new Set(waypointOrder)

  /** Nuitées dont le lieu a quitté le tracé (id renommé, supprimé, hors tracé). Conservées, mais hors itinéraire. */
  const orphanNights = computed(() =>
    plan.value.nights
      .filter((n) => !placeableIds.has(n.waypointId))
      .map((n) => ({ night: n, nom: waypointById.get(n.waypointId)?.name ?? null })),
  )

  /** Nuitées effectivement placées dans l'itinéraire : base de l'état vide et des gardes de l'UI. */
  const placedNights = computed(() => plan.value.nights.filter((n) => placeableIds.has(n.waypointId)))

  /** Nuitées dont l'hébergement ou la formule choisis ne sont plus au référentiel. */
  const staleChoices = computed(() =>
    plan.value.nights.flatMap((night) => {
      if (!night.accommodationId) return []
      const lieu = waypointById.get(night.waypointId)?.name ?? night.waypointId
      const acc = accommodationFor(night)
      if (!acc) return [{ lieu, motif: `hébergement « ${night.accommodationId} » inconnu` }]
      if (night.formuleType && !acc.formules.some((f) => f.type === night.formuleType)) {
        return [{ lieu, motif: `formule « ${night.formuleType} » plus proposée par ${acc.name}` }]
      }
      return []
    }),
  )

  function accommodationFor(night: PlanNight): Accommodation | null {
    if (!night.accommodationId) return null
    return (accommodationsByWaypoint.get(night.waypointId) ?? []).find((a) => a.id === night.accommodationId) ?? null
  }

  /** Journées de marche recomposées à partir des nuitées placées ; départ et arrivée sont implicites. */
  const days = computed<PlanDay[]>(() => {
    const placed = placedNights.value
    const stops = [waypointOrder[0]!, ...placed.map((n) => n.waypointId), waypointOrder.at(-1)!]
    return stops.slice(1).map((to, i) => {
      const from = stops[i]!
      const night = placed[i] ?? null
      return {
        index: i + 1,
        date: plan.value.startDate ? addDaysIso(plan.value.startDate, i) : null,
        from: waypointById.get(from)!,
        to: waypointById.get(to)!,
        ...sumSegments(segmentsBetween(from, to), plan.value.paceFactor),
        night,
        accommodation: night ? accommodationFor(night) : null,
        isArrival: night === null,
      }
    })
  })

  /**
   * Arrivées des journées datées, dédupliquées : la liste de points météo. Identique entre /plan et
   * /meteo et sans fenêtre glissante, pour une URL Open-Meteo stable retrouvée dans le cache hors ligne.
   */
  const arrivalWaypoints = computed<Waypoint[]>(() => {
    const seen = new Map<string, Waypoint>()
    for (const day of days.value) {
      if (day.date) seen.set(day.to.id, day.to)
    }
    return [...seen.values()]
  })

  const bookingProgress = computed(() => ({
    reserved: plan.value.nights.filter((n) => n.booking.status === 'reserve').length,
    total: plan.value.nights.length,
  }))

  const deadlines = computed(() => {
    const start = plan.value.startDate
    if (!start) return []
    const year = start.slice(0, 4)
    const items = [
      { id: 'ouverture', date: `${year}${pnrc.saison.ouverture_ventes.slice(4)}`, label: 'Ouverture des ventes PNRC (indicatif : ~20 janvier)' },
      { id: 'j60', date: addDaysIso(start, -60), label: 'Dernier jour de remboursement intégral PNRC (J-60)' },
      { id: 'j10', date: addDaysIso(start, -10), label: 'Limite de demande d\'avoir médical (J-10)' },
      { id: 'j2', date: addDaysIso(start, -2), label: 'Limite de modification de la 1ʳᵉ nuit (J-2, glisse ensuite chaque jour)' },
    ]
    const today = todayIso()
    return items
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((i) => ({ ...i, passed: i.date < today }))
  })

  const seasonWarning = computed(() => {
    const start = plan.value.startDate
    if (!start) return null
    const year = start.slice(0, 4)
    const debut = `${year}${pnrc.saison.debut.slice(4)}`
    const fin = `${year}${pnrc.saison.fin.slice(4)}`
    const end = days.value.at(-1)?.date ?? start
    if (start >= debut && end <= fin) return null
    return `Attention : la saison de gardiennage PNRC va du ${formatDateFr(debut)} au ${formatDateFr(fin)} — ton plan (${formatDateFr(start)} → ${formatDateFr(end)}) en sort partiellement.`
  })

  interface StorageNotice {
    id: string
    color: 'error' | 'warning' | 'info'
    title: string
    description: string
  }

  /** État de la sauvegarde à afficher : rien ne doit se perdre en silence. */
  const storageNotices = computed<StorageNotice[]>(() => {
    const out: StorageNotice[] = []
    const copie = backupKey.value ? ` Copie conservée dans ce navigateur sous « ${backupKey.value} ».` : ''

    if (saveError.value) {
      out.push({
        id: 'save',
        color: 'error',
        title: 'Le plan n\'est plus enregistré dans ce navigateur',
        description: `${saveError.value} Exporte une sauvegarde JSON maintenant : les modifications en cours ne survivront pas à la fermeture de l'onglet.`,
      })
    }
    if (externalChange.value) {
      out.push({
        id: 'autre-onglet',
        color: 'warning',
        title: 'Ce plan a été modifié ailleurs',
        description:
          'Un autre onglet (ou la fenêtre installée de l\'app) a enregistré ce plan pendant que tu l\'éditais ici. '
          + 'Ta version locale est conservée telle quelle ; l\'autre sera copiée avant d\'être remplacée. '
          + 'Pour repartir de la plus récente : exporte une sauvegarde JSON, puis recharge la page.',
      })
    }
    if (conflictBackupKey.value) {
      out.push({
        id: 'conflit',
        color: 'warning',
        title: 'Version d\'un autre onglet mise de côté',
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
        title: loadStatus.value === 'illisible'
          ? 'Le plan enregistré était illisible'
          : `Le plan enregistré (version ${loadedVersion.value}) ne peut pas être converti`,
        description: `Il n'a pas été chargé et n'a pas été écrasé.${copie || ' Aucune copie n\'a pu être créée (stockage plein).'} Restaure une sauvegarde JSON si tu en as une.`,
      })
    }
    // les nuitées orphelines ont leur propre bloc dans /plan, avec leurs infos de réservation
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
    arrivalWaypoints,
    stopCandidates,
    nightWaypointIds,
    toggleStop,
    initFromOfficial,
    resetPlan,
    replacePlan,
    removeNight,
    accommodationFor,
    bookingProgress,
    deadlines,
    seasonWarning,
    storageNotices,
    orphanNights,
    placedNights,
    staleChoices,
  }
}
