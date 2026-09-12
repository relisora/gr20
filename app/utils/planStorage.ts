import type { BookingStatus, PlanNight, TrekPlan } from '~/types'
import { BOOKING_STATUS_META } from './format'
import { todayIso } from './dates'
import { downloadBlob } from './download'

/**
 * Persistance du plan (localStorage). Le plan est la seule donnée non reconstituable de l'app
 * (références de réservation, montants payés, notes), d'où quatre règles :
 *  - `PLAN_STORAGE_KEY` ne change jamais : le versionnement vit dans le payload (`version`) ;
 *  - changer la forme du plan = `PLAN_VERSION` + 1 et une entrée dans `MIGRATIONS` ;
 *  - rien n'est écrasé sans copie préalable (`backupRaw`) ;
 *  - `sanitizePlan` recopie les champs inconnus (payload écrit par une version plus récente).
 */
export const PLAN_STORAGE_KEY = 'gr20-trek-plan-v1'
export const PLAN_VERSION = 2

const BACKUP_PREFIX = 'gr20-trek-plan-sauvegarde-'
const MAX_BACKUPS = 3
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/
const HEURE_DEPART_DEFAUT = '07:00'

type Raw = Record<string, unknown>

/** Dernier payload lu ou écrit par cet onglet : témoin de concurrence pour `savePlan`. */
let dernierPayloadConnu: string | null = null

/** Un payload non chargé ET non copiable (quota) bloque l'enregistrement : l'écraser détruirait la seule trace. */
let ecritureBloquee: string | null = null

export function defaultPlan(): TrekPlan {
  return {
    version: PLAN_VERSION,
    startDate: null,
    heureDepart: HEURE_DEPART_DEFAUT,
    partySize: 1,
    paceFactor: 1,
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

/** Normalise un payload quelconque : champs connus validés, champs inconnus recopiés tels quels. */
export function sanitizePlan(raw: unknown): TrekPlan {
  if (!isRaw(raw)) return defaultPlan()
  const nights = Array.isArray(raw.nights)
    ? raw.nights.map(sanitizeNight).filter((n): n is PlanNight => n !== null)
    : []
  return {
    ...raw,
    version: PLAN_VERSION,
    startDate: typeof raw.startDate === 'string' && ISO_DATE.test(raw.startDate) ? raw.startDate : null,
    heureDepart: typeof raw.heureDepart === 'string' && HEURE.test(raw.heureDepart) ? raw.heureDepart : HEURE_DEPART_DEFAUT,
    partySize: Math.round(clamp(raw.partySize, 1, 12, 1)),
    paceFactor: clamp(raw.paceFactor, 0.5, 2, 1),
    nights,
  } as TrekPlan
}

/** `MIGRATIONS[n]` transforme un payload version n en version n+1 (et met à jour `version`). */
const MIGRATIONS: Record<number, (p: Raw) => Raw> = {
  // v2 : heure de départ quotidienne (météo horaire). `includeMealsInBudget` (v1) reste en champ inconnu.
  1: (p) => ({ ...p, version: 2, heureDepart: HEURE_DEPART_DEFAUT }),
}

type MigrationResult
  = | { ok: true, payload: Raw }
    | { ok: false, motif: 'manquante' | 'sans-progres', version: number }

/** Routine unique de migration, partagée par le chargement et l'import. */
function appliquerMigrations(payload: Raw, versionDepart: number): MigrationResult {
  let courant = payload
  let version = versionDepart
  while (version < PLAN_VERSION) {
    const etape = MIGRATIONS[version]
    if (!etape) return { ok: false, motif: 'manquante', version }
    courant = etape(courant)
    const suivante = typeof courant.version === 'number' ? courant.version : version + 1
    // une migration qui n'incrémente pas `version` bouclerait à l'infini
    if (suivante <= version) return { ok: false, motif: 'sans-progres', version }
    version = suivante
  }
  return { ok: true, payload: courant }
}

/** Clés de sauvegarde, horodatage ISO en tête : tri alphabétique = tri chronologique. */
function backupKeys(): string[] {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(BACKUP_PREFIX)) keys.push(k)
  }
  return keys.sort()
}

/** Met un payload brut de côté avant toute opération destructive. Retourne la clé, ou null si le quota l'empêche. */
function backupRaw(raw: string, motif: string): string | null {
  try {
    // dédoublonnage par contenu : recharger N fois un payload illisible ne doit pas purger les copies distinctes
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

export type PlanLoadStatus
  = | 'vide' // rien en stockage
    | 'ok'
    | 'migre' // version antérieure, migrée
    | 'version-future' // écrit par une version plus récente de l'app, chargé au mieux
    | 'migration-manquante' // NON chargé, copie gardée
    | 'illisible' // JSON corrompu : NON chargé, copie gardée

export interface PlanLoadResult {
  plan: TrekPlan | null
  status: PlanLoadStatus
  versionTrouvee: number | null
  /** clé de la copie brute créée, le cas échéant */
  sauvegarde: string | null
}

function bloquerEcriture(quoi: string) {
  ecritureBloquee
    = `${quoi} n'a pas pu être copié (stockage plein ou inaccessible), il n'a donc pas été écrasé — `
      + `mais tes modifications ne sont pas enregistrées. Libère de l'espace, ou repars d'une `
      + `« Sauvegarde JSON » : l'import débloque l'enregistrement.`
}

/** Réautorise l'enregistrement après une décision explicite de l'utilisateur (import, réinitialisation). */
export function autoriserEcriture() {
  ecritureBloquee = null
}

export function loadStoredPlan(): PlanLoadResult {
  const vide: PlanLoadResult = { plan: null, status: 'vide', versionTrouvee: null, sauvegarde: null }
  let raw: string | null = null
  try {
    raw = localStorage.getItem(PLAN_STORAGE_KEY)
  } catch {
    return vide // stockage inaccessible (navigation privée, permissions)
  }
  if (!raw) {
    dernierPayloadConnu = null
    return vide
  }
  dernierPayloadConnu = raw

  const illisible = (): PlanLoadResult => {
    const sauvegarde = backupRaw(raw, 'illisible')
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
    const plan = sanitizePlan(parsed)
    // ne pas rabaisser l'étiquette : réenregistré en version courante, le payload rejouerait les
    // migrations sur des données déjà migrées au prochain chargement par l'app à jour
    plan.version = versionTrouvee
    return { plan, status: 'version-future', versionTrouvee, sauvegarde: backupRaw(raw, `v${versionTrouvee}`) }
  }

  if (versionTrouvee === PLAN_VERSION) {
    return { plan: sanitizePlan(parsed), status: 'ok', versionTrouvee, sauvegarde: null }
  }

  const sauvegarde = backupRaw(raw, `v${versionTrouvee}`)
  const migre = appliquerMigrations(parsed, versionTrouvee)
  if (!migre.ok) {
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
 * Enregistre le plan en compare-and-swap : si le stockage a changé depuis la dernière lecture ou
 * écriture de cet onglet (autre onglet, fenêtre PWA installée), l'existant est copié avant écrasement.
 */
export function savePlan(plan: TrekPlan): SaveResult {
  if (ecritureBloquee) return { erreur: ecritureBloquee, conflit: null }
  try {
    const payload = JSON.stringify(plan)
    const existant = localStorage.getItem(PLAN_STORAGE_KEY)

    if (existant === payload) {
      dernierPayloadConnu = payload
      return { erreur: null, conflit: null }
    }

    const conflit = existant !== null && existant !== dernierPayloadConnu
      ? backupRaw(existant, 'autre-onglet')
      : null

    localStorage.setItem(PLAN_STORAGE_KEY, payload)
    dernierPayloadConnu = payload
    return { erreur: null, conflit }
  } catch (e) {
    // quota dépassé ou stockage refusé : la page doit le dire, sinon l'utilisateur croit son plan enregistré
    return { erreur: e instanceof Error ? e.message : 'Écriture impossible dans ce navigateur.', conflit: null }
  }
}

interface PlanExport {
  app: 'fra-li-monti'
  kind: 'plan'
  planVersion: number
  exportedAt: string
  plan: TrekPlan
}

/** Sauvegarde hors navigateur : seul recours si le stockage local est vidé ou l'appareil perdu. */
export function downloadPlanJson(plan: TrekPlan) {
  const payload: PlanExport = {
    app: 'fra-li-monti',
    kind: 'plan',
    planVersion: PLAN_VERSION,
    exportedAt: new Date().toISOString(),
    plan,
  }
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `gr20-plan-${todayIso()}.json`,
  )
}

/** Lit un fichier de sauvegarde (enveloppe d'export ou plan nu). Jette un message affichable. */
export function parsePlanJson(text: string): TrekPlan {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Ce fichier n\'est pas du JSON valide.')
  }
  if (!isRaw(parsed)) throw new Error('Fichier inattendu : objet JSON attendu.')
  const candidate = isRaw(parsed.plan) ? parsed.plan : parsed
  if (!Array.isArray(candidate.nights)) {
    throw new Error('Ce fichier ne contient pas de plan (champ « nights » absent).')
  }
  const version = typeof candidate.version === 'number' ? candidate.version : PLAN_VERSION
  if (version > PLAN_VERSION) {
    throw new Error(
      `Sauvegarde en version ${version}, cette app lit jusqu'à la version ${PLAN_VERSION} — mets l'app à jour avant d'importer.`,
    )
  }
  const migre = appliquerMigrations(candidate, version)
  if (!migre.ok) {
    throw new Error(
      migre.motif === 'manquante'
        ? `Sauvegarde en version ${version} : aucune migration disponible depuis la version ${migre.version} vers la version ${PLAN_VERSION}.`
        : `Migration défectueuse depuis la version ${migre.version} (la version n'avance pas) — import refusé.`,
    )
  }
  return sanitizePlan(migre.payload)
}
