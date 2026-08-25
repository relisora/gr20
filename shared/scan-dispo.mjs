/**
 * Cœur du scan des disponibilités pnr-resa, partagé entre le CLI (`scripts/scan-dispo.mjs`) et la
 * route serveur `/api/rescan`. Volontairement en JS pur SANS import `node:*` : le CLI l'importe
 * sans build, et nitro le bundle pour Cloudflare Workers (fetch global, URLSearchParams,
 * AbortSignal.timeout et setTimeout y existent tous).
 *
 * La grille https://pnr-resa.corsica/stock.php (POST date_debut/date_fin, HTML server-side) est
 * plafonnée à 7 jours par requête : on itère par fenêtres, 800 ms entre requêtes, 62 j max.
 */

export const STOCK_URL = 'https://pnr-resa.corsica/stock.php'
const USER_AGENT = 'fra-li-monti/0.1 (outil personnel de planification GR20 ; scan manuel)'
const WINDOW_DAYS = 7
const DELAY_BETWEEN_REQUESTS_MS = 800
export const MAX_DAYS = 62 // garde-fou : pas de scan massif

// Nom affiché par pnr-resa (normalisé) → id dans data/accommodations.json
const REFUGE_IDS = {
  'site d ortu di u piobbu': 'refuge-ortu-di-u-piobbu',
  'refuge de carozzu': 'refuge-carrozzu',
  'refuge d ascu stagnu': 'refuge-ascu-stagnu',
  'refuge de tighjettu': 'refuge-tighjettu',
  'refuge de ciottulu di i mori': 'refuge-ciottulu-di-i-mori',
  'refuge de manganu': 'refuge-manganu',
  'refuge de petra piana': 'refuge-petra-piana',
  'refuge de l onda': 'refuge-onda',
  'refuge de prati': 'refuge-prati',
  'refuge d usciolu': 'refuge-usciolu',
  'site d asinau': 'refuge-asinau',
  'refuge de paliri': 'refuge-i-paliri',
}

const ICON_TO_FORMULE = {
  'fa-bed': 'dortoir',
  'fa-moon': 'bivouac',
  'fa-campground': 'tente_louee',
}

const COLOR_TO_LEVEL = {
  green: 'dispo', // > 5 places
  orange: 'peu', // ≤ 5 places
  darkred: 'complet',
}

function normalizeName(s) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&#0?39;|['’]/g, ' ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z]+/g, ' ')
    .trim()
}

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return isoDate(d)
}

/** Valide une plage de scan. Jette un message affichable ; retourne le nombre de jours. */
export function validerPlage(debut, fin) {
  for (const [label, v] of [['début', debut], ['fin', fin]]) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(new Date(v + 'T12:00:00Z').getTime())) {
      throw new Error(`Date invalide pour ${label} : ${v} (format attendu YYYY-MM-DD)`)
    }
  }
  if (fin < debut) throw new Error(`La fin (${fin}) est avant le début (${debut})`)
  const nbDays = Math.round((new Date(fin) - new Date(debut)) / 86_400_000) + 1
  if (nbDays > MAX_DAYS) throw new Error(`Plage trop longue (${nbDays} j > ${MAX_DAYS} j max)`)
  return nbDays
}

async function fetchWindow(debut, fin) {
  const res = await fetch(STOCK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: new URLSearchParams({ date_debut: debut, date_fin: fin }).toString(),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`stock.php a répondu HTTP ${res.status} pour ${debut} → ${fin}`)
  return res.text()
}

/**
 * Parse la grille : en-têtes <th>DD/MM</th>, puis par refuge une ligne
 * <tr><td rowspan='3'>Nom</td><td class='option-icon'><i class='fas fa-bed'></i></td><td style='color:X'>…
 * suivie de deux lignes (moon, campground) sans la cellule rowspan.
 * Jette si la grille ou les dates sont introuvables : détecter un changement de structure plutôt
 * que produire un snapshot vide.
 */
export function parseStockHtml(html, windowStartIso, log = () => {}) {
  // Isole la table de la grille (celle qui contient l'en-tête Refuge)
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? []
  const grid = tables.find((t) => /<th[^>]*>\s*Refuge/i.test(t))
  if (!grid) throw new Error(`Grille introuvable dans la réponse ${windowStartIso} (structure changée ?)`)

  // Dates des colonnes : DD/MM, année déduite de la fenêtre (gère le passage d'année)
  const headers = [...grid.matchAll(/<th[^>]*>\s*(\d{2})\/(\d{2})\s*<\/th>/g)].map((m) => ({
    day: m[1],
    month: m[2],
  }))
  if (headers.length === 0) throw new Error(`Aucune colonne de date dans la réponse ${windowStartIso}`)
  const startYear = Number(windowStartIso.slice(0, 4))
  const startMonth = Number(windowStartIso.slice(5, 7))
  const dates = headers.map(({ day, month }) => {
    const year = Number(month) < startMonth ? startYear + 1 : startYear
    return `${year}-${month}-${day}`
  })

  const result = {} // accId → dateIso → formule → level
  const unknownNames = new Set()
  let currentAccId = null
  let currentKnown = false

  for (const [row] of grid.matchAll(/<tr>[\s\S]*?<\/tr>/g)) {
    const nameMatch = row.match(/<td[^>]*rowspan[^>]*>([\s\S]*?)<\/td>/)
    if (nameMatch) {
      const rawName = nameMatch[1].replace(/<[^>]+>/g, '').trim()
      const accId = REFUGE_IDS[normalizeName(rawName)]
      currentAccId = accId ?? null
      currentKnown = Boolean(accId)
      if (!accId) unknownNames.add(rawName.replace(/&#0?39;/g, "'"))
    }

    const iconMatch = row.match(/option-icon[\s\S]*?fa-(bed|moon|campground)/)
    if (!iconMatch || !currentKnown) continue
    const formule = ICON_TO_FORMULE['fa-' + iconMatch[1]]

    const cells = [...row.matchAll(/<td[^>]*style=['"]color:\s*(green|orange|darkred)['"][^>]*>/g)]
    if (cells.length !== dates.length) {
      log(
        `⚠ ${currentAccId}/${formule} : ${cells.length} cellules pour ${dates.length} dates (fenêtre ${windowStartIso}) — ligne ignorée`
      )
      continue
    }
    for (let i = 0; i < dates.length; i++) {
      const level = COLOR_TO_LEVEL[cells[i][1]]
      ;((result[currentAccId] ??= {})[dates[i]] ??= {})[formule] = level
    }
  }

  if (Object.keys(result).length === 0) {
    throw new Error(`Aucun refuge reconnu dans la réponse ${windowStartIso} (structure changée ?)`)
  }
  return { result, unknownNames: [...unknownNames], dates }
}

/**
 * Scanne la plage [debut, fin] par fenêtres de 7 j et retourne le snapshot (forme `DispoSnapshot`).
 * `log(ligne)` reçoit la progression et les avertissements (stdout côté CLI, réponse côté route).
 */
export async function scanDispo(debut, fin, log = () => {}) {
  validerPlage(debut, fin)
  log(`Scan pnr-resa : ${debut} → ${fin}`)

  const dispo = {}
  const ignored = new Set()
  const coveredDates = new Set()

  for (let winStart = debut; winStart <= fin; winStart = addDays(winStart, WINDOW_DAYS)) {
    const winEnd = addDays(winStart, WINDOW_DAYS - 1) < fin ? addDays(winStart, WINDOW_DAYS - 1) : fin
    const html = await fetchWindow(winStart, winEnd)
    const { result, unknownNames, dates } = parseStockHtml(html, winStart, log)
    for (const [accId, byDate] of Object.entries(result)) {
      for (const [date, formules] of Object.entries(byDate)) {
        // le serveur peut renvoyer moins de jours que demandé : on ne garde que la plage voulue
        if (date < debut || date > fin) continue
        ;(dispo[accId] ??= {})[date] = formules
        coveredDates.add(date)
      }
    }
    unknownNames.forEach((n) => ignored.add(n))
    log(`  fenêtre ${winStart} → ${winEnd} : ${dates.length} jours, ${Object.keys(result).length} refuges`)
    if (addDays(winStart, WINDOW_DAYS) <= fin) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_REQUESTS_MS))
    }
  }

  log(`✔ ${Object.keys(dispo).length} refuges, ${coveredDates.size} jours couverts`)
  if (ignored.size) log(`  (ignorés : ${[...ignored].join(', ')})`)
  if (coveredDates.size === 0) {
    log('⚠ Aucune date couverte — la période est probablement hors saison de vente.')
  }

  return {
    version: 1,
    scannedAt: new Date().toISOString(),
    dateDebut: debut,
    dateFin: fin,
    source: STOCK_URL,
    legende: { dispo: '> 5 places', peu: '≤ 5 places', complet: 'complet' },
    refugesIgnores: [...ignored],
    dispo,
  }
}
