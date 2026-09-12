/**
 * Cœur du scan des disponibilités pnr-resa, partagé entre le CLI (`scripts/scan-dispo.mjs`) et la
 * route `/api/rescan`. JS pur sans import `node:*` : le CLI l'importe sans build et nitro le bundle
 * pour Cloudflare Workers.
 *
 * La grille https://pnr-resa.corsica/stock.php (POST date_debut/date_fin, HTML) est plafonnée à
 * 7 jours par requête : on itère par fenêtres, 800 ms entre requêtes, 62 jours max.
 *
 * @typedef {import('../app/types').DispoSnapshot} DispoSnapshot
 * @typedef {import('../app/types').DispoLevel} DispoLevel
 * @typedef {(ligne: string) => void} Log
 */

export const STOCK_URL = 'https://pnr-resa.corsica/stock.php'
const USER_AGENT = 'fra-li-monti/0.1 (outil personnel de planification GR20 ; scan manuel)'
const WINDOW_DAYS = 7
const DELAY_BETWEEN_REQUESTS_MS = 800
export const MAX_DAYS = 62

/** Nom affiché par pnr-resa (normalisé) → id dans data/accommodations.json */
const REFUGE_IDS = /** @type {Record<string, string>} */ ({
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
})

const ICON_TO_FORMULE = /** @type {Record<string, string>} */ ({
  'fa-bed': 'dortoir',
  'fa-moon': 'bivouac',
  'fa-campground': 'tente_louee',
})

const COLOR_TO_LEVEL = /** @type {Record<string, DispoLevel>} */ ({
  green: 'dispo', // > 5 places
  orange: 'peu', // ≤ 5 places
  darkred: 'complet',
})

/** @param {string} s */
function normalizeName(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&#0?39;|['’]/g, ' ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z]+/g, ' ')
    .trim()
}

/**
 * @param {string} iso
 * @param {number} n
 */
export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * @param {unknown} v
 * @returns {v is string}
 */
function isIsoDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T12:00:00Z'))
}

/**
 * Valide une plage de scan et la retourne typée. Jette un message affichable.
 * @param {unknown} debut
 * @param {unknown} fin
 */
export function validerPlage(debut, fin) {
  if (!isIsoDate(debut)) throw new Error(`Date invalide pour début : ${debut} (format attendu YYYY-MM-DD)`)
  if (!isIsoDate(fin)) throw new Error(`Date invalide pour fin : ${fin} (format attendu YYYY-MM-DD)`)
  if (fin < debut) throw new Error(`La fin (${fin}) est avant le début (${debut})`)
  const nbDays = Math.round((Date.parse(fin) - Date.parse(debut)) / 86_400_000) + 1
  if (nbDays > MAX_DAYS) throw new Error(`Plage trop longue (${nbDays} j > ${MAX_DAYS} j max)`)
  return { debut, fin, nbDays }
}

/**
 * @param {string} debut
 * @param {string} fin
 */
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
 * Parse la grille : en-têtes `<th>DD/MM</th>`, puis par refuge une ligne avec la cellule `rowspan`
 * du nom et l'icône `fa-bed`, suivie de deux lignes (`fa-moon`, `fa-campground`) sans le nom.
 * Jette si la grille ou les dates sont introuvables : mieux vaut détecter un changement de
 * structure que produire un snapshot vide.
 * @param {string} html
 * @param {string} windowStartIso
 * @param {Log} [log]
 */
export function parseStockHtml(html, windowStartIso, log = () => {}) {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? []
  const grid = tables.find((t) => /<th[^>]*>\s*Refuge/i.test(t))
  if (!grid) throw new Error(`Grille introuvable dans la réponse ${windowStartIso} (structure changée ?)`)

  // colonnes DD/MM ; l'année est déduite de la fenêtre (passage d'année compris)
  const headers = [...grid.matchAll(/<th[^>]*>\s*(\d{2})\/(\d{2})\s*<\/th>/g)]
  if (headers.length === 0) throw new Error(`Aucune colonne de date dans la réponse ${windowStartIso}`)
  const startYear = Number(windowStartIso.slice(0, 4))
  const startMonth = Number(windowStartIso.slice(5, 7))
  const dates = headers.map(([, day, month]) => {
    const year = Number(month) < startMonth ? startYear + 1 : startYear
    return `${year}-${month}-${day}`
  })

  /** @type {DispoSnapshot['dispo']} */
  const result = {}
  const unknownNames = new Set()
  /** @type {string | null} */
  let currentAccId = null

  for (const [row] of grid.matchAll(/<tr>[\s\S]*?<\/tr>/g)) {
    const rawName = row.match(/<td[^>]*rowspan[^>]*>([\s\S]*?)<\/td>/)?.[1]
    if (rawName != null) {
      const name = rawName.replace(/<[^>]+>/g, '').trim()
      currentAccId = REFUGE_IDS[normalizeName(name)] ?? null
      if (!currentAccId) unknownNames.add(name.replace(/&#0?39;/g, '\''))
    }

    const formule = ICON_TO_FORMULE['fa-' + row.match(/option-icon[\s\S]*?fa-(bed|moon|campground)/)?.[1]]
    if (!formule || !currentAccId) continue

    const colors = [...row.matchAll(/<td[^>]*style=['"]color:\s*(green|orange|darkred)['"][^>]*>/g)].map((m) => m[1] ?? '')
    if (colors.length !== dates.length) {
      log(`⚠ ${currentAccId}/${formule} : ${colors.length} cellules pour ${dates.length} dates (fenêtre ${windowStartIso}) — ligne ignorée`)
      continue
    }
    const byDate = (result[currentAccId] ??= {})
    dates.forEach((date, i) => {
      (byDate[date] ??= {})[formule] = COLOR_TO_LEVEL[colors[i] ?? '']
    })
  }

  if (Object.keys(result).length === 0) {
    throw new Error(`Aucun refuge reconnu dans la réponse ${windowStartIso} (structure changée ?)`)
  }
  return { result, unknownNames: [...unknownNames], dates }
}

/**
 * Scanne la plage [debut, fin] par fenêtres de 7 jours et retourne le snapshot.
 * `log` reçoit la progression et les avertissements (stdout côté CLI, réponse côté route).
 * @param {string} debut
 * @param {string} fin
 * @param {Log} [log]
 * @returns {Promise<DispoSnapshot>}
 */
export async function scanDispo(debut, fin, log = () => {}) {
  validerPlage(debut, fin)
  log(`Scan pnr-resa : ${debut} → ${fin}`)

  /** @type {DispoSnapshot['dispo']} */
  const dispo = {}
  const ignored = new Set()
  const coveredDates = new Set()

  for (let winStart = debut; winStart <= fin; winStart = addDays(winStart, WINDOW_DAYS)) {
    const winEnd = addDays(winStart, WINDOW_DAYS - 1) < fin ? addDays(winStart, WINDOW_DAYS - 1) : fin
    const html = await fetchWindow(winStart, winEnd)
    const { result, unknownNames, dates } = parseStockHtml(html, winStart, log)
    for (const [accId, byDate] of Object.entries(result)) {
      for (const [date, formules] of Object.entries(byDate)) {
        // le serveur peut renvoyer plus de jours que demandé
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
