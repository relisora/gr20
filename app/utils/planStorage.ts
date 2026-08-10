import type { BookingStatus, PlanNight, TrekPlan } from '~/types'
import { BOOKING_STATUS_META } from './format'

/**
 * Persistance du plan de trek (localStorage).
 *
 * Le plan contient des références de réservation et des montants payés : il n'est PAS
 * reconstituable. Règles à ne jamais casser en faisant évoluer l'app :
 *
 *  1. `PLAN_STORAGE_KEY` ne change JAMAIS. Le versionnement se fait DANS le payload
 *     (champ `version`), jamais dans le nom de la clé : renommer la clé = perdre les plans
 *     déjà enregistrés dans les navigateurs.
 *  2. Tout changement de forme = `PLAN_VERSION` + 1 ET l'entrée correspondante dans `MIGRATIONS`.
 *     Sans migration, l'ancien plan n'est pas chargé (il est seulement mis de côté).
 *  3. Rien n'est écrasé sans copie préalable : tout chargement non nominal appelle `backupRaw`.
 *  4. `sanitizePlan` conserve les champs inconnus (un plan écrit par une version plus récente,
 *     lu par un shell plus ancien, ne doit pas perdre ses champs au prochain enregistrement).
 */
export const PLAN_STORAGE_KEY = 'gr20-trek-plan-v1'
export const PLAN_VERSION = 1

const BACKUP_PREFIX = 'gr20-trek-plan-sauvegarde-'
const MAX_BACKUPS = 3
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

type Raw = Record<string, unknown>

/**
 * Dernier payload que CET onglet a lu ou écrit. Sert de témoin de concurrence : si le contenu du
 * stockage en diffère au moment d'écrire, c'est qu'un autre onglet (ou la fenêtre PWA installée) a
 * enregistré entre-temps — on en garde une copie avant de l'écraser (« dernier écrivain gagne » sur
 * la seule donnée non reconstituable du projet, sinon).
 */
let dernierPayloadConnu: string | null = null

/**
 * Message bloquant l'enregistrement automatique. Positionné quand un payload n'a pas pu être chargé
 * ET n'a pas pu être copié (stockage plein) : le laisser s'écraser par le plan par défaut à la
 * première frappe détruirait la seule trace des données.
 */
let ecritureBloquee: string | null = null

export function defaultPlan(): TrekPlan {
  return {
    version: PLAN_VERSION,
    startDate: null,
    partySize: 1,
    paceFactor: 1,
    includeMealsInBudget: true,
    nights: [],
  }
}

export function newNight(waypointId: string): PlanNight {
  return {
    waypointId,
    accommodationId: null,
    formuleType: null,
    booking: { status: 'a_reserver', reference: '', prixPayeEur: null, notes: '' },
  }
}

function isRaw(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
}

// `...raw` en tête : les champs qu'on ne connaît pas sont recopiés tels quels, seuls les champs
// connus sont validés/corrigés par-dessus.
function sanitizeNight(raw: unknown): PlanNight | null {
  if (!isRaw(raw) || typeof raw.waypointId !== 'string' || raw.waypointId === '') return null
  const booking = isRaw(raw.booking) ? raw.booking : {}
  const status = str(booking.status) as BookingStatus
  return {
    ...raw,
    waypointId: raw.waypointId,
    accommodationId: typeof raw.accommodationId === 'string' ? raw.accommodationId : null,
    formuleType: typeof raw.formuleType === 'string' ? raw.formuleType : null,
    booking: {
      ...booking,
      status: status in BOOKING_STATUS_META ? status : 'a_reserver',
      reference: str(booking.reference),
      prixPayeEur: numOrNull(booking.prixPayeEur),
      notes: str(booking.notes),
    },
  } as PlanNight
}

/** Normalise un payload quelconque en plan exploitable, sans jamais jeter ce qu'on ne comprend pas. */
export function sanitizePlan(raw: unknown): TrekPlan {
  if (!isRaw(raw)) return defaultPlan()
  const nights = Array.isArray(raw.nights)
    ? raw.nights.map(sanitizeNight).filter((n): n is PlanNight => n !== null)
    : []
  return {
    ...raw,
    version: PLAN_VERSION,
    startDate: typeof raw.startDate === 'string' && ISO_DATE.test(raw.startDate) ? raw.startDate : null,
    partySize: Math.round(clamp(raw.partySize, 1, 12, 1)),
    paceFactor: clamp(raw.paceFactor, 0.5, 2, 1),
    includeMealsInBudget: typeof raw.includeMealsInBudget === 'boolean' ? raw.includeMealsInBudget : true,
    nights,
  } as TrekPlan
}

/**
 * Migrations de forme appliquées en chaîne : `MIGRATIONS[n]` transforme un payload version n en
 * version n+1 (et met à jour son champ `version`). Table vide aujourd'hui : seule la v1 existe.
 */
const MIGRATIONS: Record<number, (p: Raw) => Raw> = {
  // Exemple pour le jour où la forme change :
  // 1: (p) => ({
  //   ...p,
  //   version: 2,
  //   nights: (p.nights as Raw[] ?? []).map((n) => ({ ...n, repasCommandes: null })),
  // }),
}

/**
 * Applique la chaîne de migrations de `versionDepart` jusqu'à `PLAN_VERSION`.
 * Routine unique, partagée par `loadStoredPlan` et `parsePlanJson` : deux implémentations
 * divergeraient (l'une refusant ce que l'autre accepte, ou plantant sur une étape intermédiaire
 * absente au milieu de la chaîne).
 */
function appliquerMigrations(
  payload: Raw,
  versionDepart: number
): { ok: true; payload: Raw } | { ok: false; motif: 'manquante' | 'sans-progres'; version: number } {
  let courant = payload
  let version = versionDepart
  while (version < PLAN_VERSION) {
    const etape = MIGRATIONS[version]
    if (!etape) return { ok: false, motif: 'manquante', version }
    courant = etape(courant)
    const suivante = typeof courant.version === 'number' ? courant.version : version + 1
    // Garde-fou : une migration qui oublie d'incrémenter `version` ferait tourner cette boucle à
    // l'infini — onglet figé, et plus aucun accès au plan.
    if (suivante <= version) return { ok: false, motif: 'sans-progres', version }
    version = suivante
  }
  return { ok: true, payload: courant }
}

function backupKeys(): string[] {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(BACKUP_PREFIX)) keys.push(k)
  }
  // horodatage ISO en tête de clé → tri alphabétique = tri chronologique
  return keys.sort()
}

/** Met de côté un payload brut avant toute opération destructive. Retourne la clé créée. */
function backupRaw(raw: string, motif: string): string | null {
  try {
    // Copie identique déjà présente ? Ne pas en empiler une nouvelle : à chaque rechargement d'un
    // payload illisible on créerait une copie de plus, qui purgerait les copies DISTINCTES encore
    // utiles (la plus ancienne, ex. « avant-reinit », disparaîtrait au 3e rechargement).
    for (const k of backupKeys()) {
      if (localStorage.getItem(k) === raw) return k
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const key = `${BACKUP_PREFIX}${stamp}-${motif}`
    localStorage.setItem(key, raw)
    const keys = backupKeys()
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_BACKUPS))) localStorage.removeItem(old)
    return key
  } catch {
    // quota plein : pas de copie possible, mais on ne bloque pas le chargement pour autant
    return null
  }
}

/** Copie le plan actuellement stocké (avant réinitialisation ou import). */
export function backupCurrentPlan(motif: string): string | null {
  try {
    const raw = localStorage.getItem(PLAN_STORAGE_KEY)
    return raw ? backupRaw(raw, motif) : null
  } catch {
    return null
  }
}

export type PlanLoadStatus =
  | 'vide' /** rien en stockage : premier lancement */
  | 'ok' /** plan à la version courante */
  | 'migre' /** plan d'une version antérieure, migré */
  | 'version-future' /** plan écrit par une version plus récente de l'app */
  | 'migration-manquante' /** version antérieure sans migration : plan NON chargé, copie gardée */
  | 'illisible' /** JSON corrompu : plan NON chargé, copie gardée */

export interface PlanLoadResult {
  plan: TrekPlan | null
  status: PlanLoadStatus
  /** version trouvée en stockage, si le payload était lisible */
  versionTrouvee: number | null
  /** clé de la copie brute créée avant écrasement, le cas échéant */
  sauvegarde: string | null
}

/**
 * Payload non chargé et non copié : interdire l'enregistrement automatique, sinon la première
 * frappe de l'utilisateur écrase la seule trace de ses données par un plan par défaut.
 */
function bloquerEcriture(quoi: string) {
  ecritureBloquee =
    `${quoi} n'a pas pu être copié (stockage plein ou inaccessible), il n'a donc pas été écrasé — ` +
    `mais tes modifications ne sont pas enregistrées. Libère de l'espace, ou repars d'une ` +
    `« Sauvegarde JSON » : l'import débloque l'enregistrement.`
}

/** Réautorise l'enregistrement après une décision explicite de l'utilisateur (import, réinit). */
export function autoriserEcriture() {
  ecritureBloquee = null
}

export function loadStoredPlan(): PlanLoadResult {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(PLAN_STORAGE_KEY)
  } catch {
    // stockage inaccessible (Safari navigation privée, permissions) — rien à charger
    return { plan: null, status: 'vide', versionTrouvee: null, sauvegarde: null }
  }
  if (!raw) {
    dernierPayloadConnu = null // stockage vidé entre-temps : plus rien à comparer
    return { plan: null, status: 'vide', versionTrouvee: null, sauvegarde: null }
  }

  // témoin de concurrence : ce qu'on vient de lire est, à cet instant, l'état de référence
  dernierPayloadConnu = raw

  const illisible = (): PlanLoadResult => {
    // on met le payload de côté AVANT que l'enregistrement automatique n'écrive le plan par défaut
    // par-dessus : c'est la seule chance de récupérer les données à la main
    const sauvegarde = backupRaw(raw!, 'illisible')
    if (!sauvegarde) bloquerEcriture('Le plan enregistré était illisible et')
    return { plan: null, status: 'illisible', versionTrouvee: null, sauvegarde }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return illisible()
  }
  if (!isRaw(parsed)) return illisible()

  // absence de `version` : seule la v1 a existé, et elle portait déjà le champ
  const versionTrouvee = typeof parsed.version === 'number' ? parsed.version : PLAN_VERSION

  if (versionTrouvee > PLAN_VERSION) {
    // Plan écrit par une version plus récente (autre appareil, ou service worker en retard sur
    // celui-ci) : copie intacte, puis chargement au mieux — sanitizePlan garde les champs inconnus.
    const plan = sanitizePlan(parsed)
    // Ne PAS rabaisser l'étiquette de version : le payload porte la forme d'une version plus
    // récente. Le réenregistrer en version courante ferait rejouer les migrations sur des données
    // déjà migrées au prochain chargement par l'app à jour (corruption silencieuse).
    plan.version = versionTrouvee as TrekPlan['version']
    return { plan, status: 'version-future', versionTrouvee, sauvegarde: backupRaw(raw, `v${versionTrouvee}`) }
  }

  if (versionTrouvee === PLAN_VERSION) {
    return { plan: sanitizePlan(parsed), status: 'ok', versionTrouvee, sauvegarde: null }
  }

  const sauvegarde = backupRaw(raw, `v${versionTrouvee}`) // filet avant migration
  const migre = appliquerMigrations(parsed, versionTrouvee)
  if (!migre.ok) {
    // migration absente ou défectueuse : ne rien deviner et ne rien charger, la copie reste exploitable
    if (!sauvegarde) bloquerEcriture(`Le plan enregistré (version ${versionTrouvee})`)
    return { plan: null, status: 'migration-manquante', versionTrouvee, sauvegarde }
  }
  return { plan: sanitizePlan(migre.payload), status: 'migre', versionTrouvee, sauvegarde }
}

export interface SaveResult {
  /** message à afficher si le plan n'a pas pu être enregistré */
  erreur: string | null
  /** clé de la copie créée parce qu'un autre onglet avait écrit entre-temps */
  conflit: string | null
}

/**
 * Enregistre le plan, en refusant d'écraser aveuglément le travail d'un autre onglet.
 *
 * Le chemin d'écriture nominal était le seul à ne laisser aucune copie : deux clients de la même
 * origine (onglet + fenêtre PWA installée, ou onglet oublié depuis la veille) gardent chacun leur
 * état en mémoire, et la moindre modification dans le plus ancien remplaçait intégralement le
 * travail fait dans l'autre — sans copie et sans le dire.
 */
export function savePlan(plan: TrekPlan): SaveResult {
  if (ecritureBloquee) return { erreur: ecritureBloquee, conflit: null }
  try {
    const payload = JSON.stringify(plan)
    const existant = localStorage.getItem(PLAN_STORAGE_KEY)

    // rien à écrire : évite aussi le va-et-vient d'événements `storage` entre onglets
    if (existant === payload) {
      dernierPayloadConnu = payload
      return { erreur: null, conflit: null }
    }

    let conflit: string | null = null
    if (existant !== null && existant !== dernierPayloadConnu) {
      // écrit par un autre client depuis notre dernière lecture/écriture : copie avant écrasement
      conflit = backupRaw(existant, 'autre-onglet')
    }

    localStorage.setItem(PLAN_STORAGE_KEY, payload)
    dernierPayloadConnu = payload
    return { erreur: null, conflit }
  } catch (e) {
    // quota dépassé, ou stockage refusé : l'app doit le DIRE, sinon l'utilisateur croit son plan
    // enregistré alors que rien n'est écrit
    return { erreur: e instanceof Error ? e.message : 'Écriture impossible dans ce navigateur.', conflit: null }
  }
}

/** Le stockage a-t-il été modifié par un autre client depuis notre dernière lecture/écriture ? */
export function stockageDivergent(): boolean {
  try {
    const existant = localStorage.getItem(PLAN_STORAGE_KEY)
    return existant !== null && existant !== dernierPayloadConnu
  } catch {
    return false
  }
}


interface PlanExport {
  app: 'fra-li-monti'
  kind: 'plan'
  planVersion: number
  exportedAt: string
  plan: TrekPlan
}

/** Sauvegarde hors navigateur : le seul recours si le stockage local est vidé ou l'appareil perdu. */
export function downloadPlanJson(plan: TrekPlan) {
  const payload: PlanExport = {
    app: 'fra-li-monti',
    kind: 'plan',
    planVersion: PLAN_VERSION,
    exportedAt: new Date().toISOString(),
    plan,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `gr20-plan-${new Date().toLocaleDateString('en-CA')}.json`
  // l'ancre doit être dans le DOM (Firefox) et l'URL révoquée en différé (cf. utils/gpx.ts)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

/** Lit un fichier de sauvegarde (enveloppe d'export ou plan nu). Jette un message affichable. */
export function parsePlanJson(text: string): TrekPlan {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("Ce fichier n'est pas du JSON valide.")
  }
  if (!isRaw(parsed)) throw new Error('Fichier inattendu : objet JSON attendu.')
  const candidate = isRaw(parsed.plan) ? parsed.plan : parsed
  if (!Array.isArray(candidate.nights)) {
    throw new Error("Ce fichier ne contient pas de plan (champ « nights » absent).")
  }
  const version = typeof candidate.version === 'number' ? candidate.version : PLAN_VERSION
  if (version > PLAN_VERSION) {
    throw new Error(
      `Sauvegarde en version ${version}, cette app lit jusqu'à la version ${PLAN_VERSION} — mets l'app à jour avant d'importer.`
    )
  }
  // même routine que loadStoredPlan : une étape absente AU MILIEU de la chaîne est refusée ici aussi
  const migre = appliquerMigrations(candidate, version)
  if (!migre.ok) {
    throw new Error(
      migre.motif === 'manquante'
        ? `Sauvegarde en version ${version} : aucune migration disponible depuis la version ${migre.version} vers la version ${PLAN_VERSION}.`
        : `Migration défectueuse depuis la version ${migre.version} (la version n'avance pas) — import refusé.`
    )
  }
  return sanitizePlan(migre.payload)
}
