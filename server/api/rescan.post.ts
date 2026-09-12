import { scanDispo, validerPlage } from '#shared/scan-dispo.mjs'

/**
 * Scan pnr-resa en mémoire, portable Cloudflare Workers : aucun accès disque, le snapshot est
 * retourné au client (`useDispo` le garde en localStorage). En dev seulement, il est aussi écrit
 * sur disque pour rester la source du snapshot embarqué au build.
 */

// Verrous en mémoire du module (par isolate) : suffisant contre le double-clic et les rafales sur
// un endpoint public — le scan reste manuel et peu fréquent.
let scanEnCours: Promise<unknown> | null = null
let dernierScanMs = 0
const COOLDOWN_MS = 60_000

/** Import dynamique : rien de `node:*` dans le bundle Workers. */
async function writeDevSnapshot(snapshot: unknown) {
  const { writeFile, mkdir } = await import('node:fs/promises')
  const { default: path } = await import('node:path')
  const outPath = path.resolve(process.cwd(), 'public', 'data', 'dispo-snapshot.json')
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, JSON.stringify(snapshot, null, 2) + '\n')
}

export default defineEventHandler(async (event) => {
  const fetchSite = getHeader(event, 'sec-fetch-site')
  const origin = getHeader(event, 'origin')
  const host = getHeader(event, 'host')
  const sameOrigin = fetchSite ? fetchSite === 'same-origin' : !origin || origin.endsWith(`//${host}`)
  if (!sameOrigin) throw createError({ statusCode: 403, message: 'Rescan réservé à l’application.' })

  const body = await readBody<{ dateDebut?: unknown, dateFin?: unknown }>(event)
  let plage: { debut: string, fin: string }
  try {
    plage = validerPlage(body?.dateDebut, body?.dateFin)
  } catch (e) {
    throw createError({ statusCode: 400, message: e instanceof Error ? e.message : 'Plage invalide.' })
  }

  if (scanEnCours) throw createError({ statusCode: 409, message: 'Un scan est déjà en cours.' })
  if (Date.now() - dernierScanMs < COOLDOWN_MS) {
    throw createError({ statusCode: 429, message: 'Scan trop récent — réessaie dans une minute.' })
  }

  const log: string[] = []
  const run = scanDispo(plage.debut, plage.fin, (ligne) => log.push(ligne))
  scanEnCours = run
  try {
    const snapshot = await run
    dernierScanMs = Date.now()
    if (import.meta.dev) await writeDevSnapshot(snapshot)
    return { ok: true, snapshot, log }
  } catch (e) {
    throw createError({ statusCode: 502, message: (e instanceof Error && e.message.trim()) || 'Scan échoué.' })
  } finally {
    scanEnCours = null
  }
})
