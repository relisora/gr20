// @ts-expect-error module JS partagé sans types (aussi importé par le CLI scripts/scan-dispo.mjs)
import { scanDispo, validerPlage } from '#shared/scan-dispo.mjs'
import type { DispoSnapshot } from '~/types'

/**
 * Scan des dispos pnr-resa en mémoire, portable Cloudflare Workers : aucun accès disque ni
 * sous-processus. Le snapshot est RETOURNÉ au client (useDispo le garde en localStorage) — il
 * n'est écrit sur disque qu'en dev, pour rester la source du snapshot embarqué au build.
 */

// Un seul scan à la fois + politesse pnr-resa. Verrous en mémoire du module : par instance/isolate
// seulement, mais suffisant contre le double-clic et les rafales — l'endpoint est public sur
// pages.dev, on ne proxifie pas des scans en boucle (CLAUDE.md : scan manuel, basse fréquence).
let scanEnCours: Promise<unknown> | null = null
let dernierScanMs = 0
const COOLDOWN_MS = 60_000

export default defineEventHandler(async (event) => {
  // Requête d'un autre site : refusée (le bouton de l'app envoie toujours same-origin)
  const fetchSite = getHeader(event, 'sec-fetch-site')
  const origin = getHeader(event, 'origin')
  const host = getHeader(event, 'host')
  const sameOrigin = fetchSite ? fetchSite === 'same-origin' : !origin || origin.endsWith(`//${host}`)
  if (!sameOrigin) {
    throw createError({ statusCode: 403, message: 'Rescan réservé à l’application.' })
  }

  const body = await readBody<{ dateDebut?: string; dateFin?: string }>(event)
  const { dateDebut, dateFin } = body ?? {}
  try {
    validerPlage(dateDebut, dateFin)
  } catch (e: unknown) {
    throw createError({ statusCode: 400, message: e instanceof Error ? e.message : 'Plage invalide.' })
  }

  if (scanEnCours) {
    throw createError({ statusCode: 409, message: 'Un scan est déjà en cours.' })
  }
  if (Date.now() - dernierScanMs < COOLDOWN_MS) {
    throw createError({ statusCode: 429, message: 'Scan trop récent — réessaie dans une minute.' })
  }

  const log: string[] = []
  const run = scanDispo(dateDebut, dateFin, (ligne: string) => log.push(ligne)) as Promise<DispoSnapshot>
  scanEnCours = run
  try {
    const snapshot = await run
    dernierScanMs = Date.now()

    if (import.meta.dev) {
      // parité avec `npm run data:dispo` : le fichier reste la source du snapshot de build.
      // Import dynamique dans la branche dev : rien de node:* dans le bundle Workers.
      const { writeFile, mkdir } = await import('node:fs/promises')
      const { default: path } = await import('node:path')
      const outPath = path.resolve(process.cwd(), 'public', 'data', 'dispo-snapshot.json')
      await mkdir(path.dirname(outPath), { recursive: true })
      await writeFile(outPath, JSON.stringify(snapshot, null, 2) + '\n')
    }

    return { ok: true, snapshot, log }
  } catch (e: unknown) {
    const err = e as { message?: string }
    throw createError({ statusCode: 502, message: (err.message || 'Scan échoué.').trim() })
  } finally {
    scanEnCours = null
  }
})
