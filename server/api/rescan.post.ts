import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import path from 'node:path'

const execFileAsync = promisify(execFile)
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isValidIsoDate(s: string): boolean {
  return ISO_DATE.test(s) && !Number.isNaN(new Date(s + 'T12:00:00Z').getTime())
}

// Un seul scan à la fois : le script écrit un fichier partagé.
let scanEnCours: Promise<unknown> | null = null

export default defineEventHandler(async (event) => {
  const body = await readBody<{ dateDebut?: string; dateFin?: string }>(event)
  const { dateDebut, dateFin } = body ?? {}
  if (!dateDebut || !dateFin || !isValidIsoDate(dateDebut) || !isValidIsoDate(dateFin)) {
    throw createError({ statusCode: 400, message: 'dateDebut et dateFin requis au format YYYY-MM-DD.' })
  }

  const script = path.resolve(process.cwd(), 'scripts', 'scan-dispo.mjs')
  if (!import.meta.dev || !existsSync(script)) {
    throw createError({
      statusCode: 501,
      message: 'Rescan disponible uniquement en dev (npm run dev) — sinon : npm run data:dispo.',
    })
  }

  if (scanEnCours) {
    throw createError({ statusCode: 409, message: 'Un scan est déjà en cours.' })
  }

  scanEnCours = execFileAsync(process.execPath, [script, '--debut', dateDebut, '--fin', dateFin], {
    timeout: 120_000,
  })
  try {
    const { stdout } = (await scanEnCours) as { stdout: string }
    return { ok: true, log: stdout }
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string }
    throw createError({ statusCode: 502, message: (err.stderr || err.message || 'Scan échoué.').trim() })
  } finally {
    scanEnCours = null
  }
})
