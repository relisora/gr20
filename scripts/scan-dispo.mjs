#!/usr/bin/env node
/**
 * Scan des disponibilités des refuges PNRC via la grille publique
 * https://pnr-resa.corsica/stock.php (POST date_debut/date_fin, HTML server-side).
 *
 * Le serveur plafonne chaque requête à 7 jours : on itère par fenêtres.
 * Sortie : public/data/dispo-snapshot.json (horodaté, lu par l'app).
 *
 * Usage :
 *   node scripts/scan-dispo.mjs                               # aujourd'hui → +13 jours
 *   node scripts/scan-dispo.mjs --debut 2026-08-10 --fin 2026-08-23
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const STOCK_URL = 'https://pnr-resa.corsica/stock.php'
const USER_AGENT = 'fra-li-monti/0.1 (outil personnel de planification GR20 ; scan manuel)'
const WINDOW_DAYS = 7
const DELAY_BETWEEN_REQUESTS_MS = 800
const MAX_DAYS = 62 // garde-fou : pas de scan massif

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

// « aujourd'hui » en heure LOCALE (toISOString est UTC : lancé après minuit en
// heure française, il renverrait encore la date de la veille)
function localIsoDate() {
  return new Date().toLocaleDateString('en-CA')
}

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return isoDate(d)
}

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--debut') args.debut = argv[++i]
    else if (argv[i] === '--fin') args.fin = argv[++i]
    else throw new Error(`Argument inconnu : ${argv[i]}`)
  }
  const today = localIsoDate()
  const debut = args.debut ?? today
  const fin = args.fin ?? addDays(debut, 13)
  for (const [label, v] of [['--debut', debut], ['--fin', fin]]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(new Date(v + 'T12:00:00Z').getTime())) {
      throw new Error(`Date invalide pour ${label} : ${v} (format attendu YYYY-MM-DD)`)
    }
  }
  if (fin < debut) throw new Error(`--fin (${fin}) est avant --debut (${debut})`)
  const nbDays = Math.round((new Date(fin) - new Date(debut)) / 86_400_000) + 1
  if (nbDays > MAX_DAYS) throw new Error(`Plage trop longue (${nbDays} j > ${MAX_DAYS} j max)`)
  return { debut, fin }
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
 */
function parseStockHtml(html, windowStartIso) {
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
      console.warn(
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

async function main() {
  const { debut, fin } = parseArgs(process.argv)
  console.log(`Scan pnr-resa : ${debut} → ${fin}`)

  const dispo = {}
  const ignored = new Set()
  const coveredDates = new Set()

  for (let winStart = debut; winStart <= fin; winStart = addDays(winStart, WINDOW_DAYS)) {
    const winEnd = addDays(winStart, WINDOW_DAYS - 1) < fin ? addDays(winStart, WINDOW_DAYS - 1) : fin
    process.stdout.write(`  fenêtre ${winStart} → ${winEnd}… `)
    const html = await fetchWindow(winStart, winEnd)
    const { result, unknownNames, dates } = parseStockHtml(html, winStart)
    for (const [accId, byDate] of Object.entries(result)) {
      for (const [date, formules] of Object.entries(byDate)) {
        // le serveur peut renvoyer moins de jours que demandé : on ne garde que la plage voulue
        if (date < debut || date > fin) continue
        ;(dispo[accId] ??= {})[date] = formules
        coveredDates.add(date)
      }
    }
    unknownNames.forEach((n) => ignored.add(n))
    console.log(`${dates.length} jours, ${Object.keys(result).length} refuges`)
    if (addDays(winStart, WINDOW_DAYS) <= fin) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_REQUESTS_MS))
    }
  }

  const snapshot = {
    version: 1,
    scannedAt: new Date().toISOString(),
    dateDebut: debut,
    dateFin: fin,
    source: STOCK_URL,
    legende: { dispo: '> 5 places', peu: '≤ 5 places', complet: 'complet' },
    refugesIgnores: [...ignored],
    dispo,
  }

  const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'dispo-snapshot.json')
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, JSON.stringify(snapshot, null, 2) + '\n')

  const nRefuges = Object.keys(dispo).length
  console.log(
    `✔ ${nRefuges} refuges, ${coveredDates.size} jours couverts → ${path.relative(process.cwd(), outPath)}`
  )
  if (ignored.size) console.log(`  (ignorés : ${[...ignored].join(', ')})`)
  if (coveredDates.size === 0) {
    console.warn('⚠ Aucune date couverte — la période est probablement hors saison de vente.')
  }
}

main().catch((e) => {
  console.error(`✖ ${e.message}`)
  process.exit(1)
})
