#!/usr/bin/env node
/**
 * Scan des disponibilités des refuges PNRC — wrapper CLI du cœur partagé
 * `shared/scan-dispo.mjs` (aussi utilisé par la route /api/rescan).
 * Sortie : public/data/dispo-snapshot.json (horodaté, lu par l'app et embarqué au build).
 *
 * Usage :
 *   node scripts/scan-dispo.mjs                               # aujourd'hui → +13 jours
 *   node scripts/scan-dispo.mjs --debut 2026-08-10 --fin 2026-08-23
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { scanDispo, validerPlage, addDays } from '../shared/scan-dispo.mjs'

// « aujourd'hui » en heure LOCALE (toISOString est UTC : lancé après minuit en
// heure française, il renverrait encore la date de la veille)
function localIsoDate() {
  return new Date().toLocaleDateString('en-CA')
}

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--debut') args.debut = argv[++i]
    else if (argv[i] === '--fin') args.fin = argv[++i]
    else throw new Error(`Argument inconnu : ${argv[i]}`)
  }
  const debut = args.debut ?? localIsoDate()
  const fin = args.fin ?? addDays(debut, 13)
  validerPlage(debut, fin)
  return { debut, fin }
}

async function main() {
  const { debut, fin } = parseArgs(process.argv)
  const snapshot = await scanDispo(debut, fin, (ligne) => console.log(ligne))

  const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'dispo-snapshot.json')
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, JSON.stringify(snapshot, null, 2) + '\n')
  console.log(`→ ${path.relative(process.cwd(), outPath)}`)
}

main().catch((e) => {
  console.error(`✖ ${e.message}`)
  process.exit(1)
})
