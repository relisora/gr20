import { readFile } from 'node:fs/promises'
import path from 'node:path'

// Sert le snapshot de dispo depuis le disque : contrairement aux assets de public/,
// cette route est joignable par le $fetch interne pendant le rendu serveur.
export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  try {
    const p = path.resolve(process.cwd(), 'public', 'data', 'dispo-snapshot.json')
    return JSON.parse(await readFile(p, 'utf8'))
  } catch {
    throw createError({ statusCode: 404, message: 'Aucun snapshot de disponibilités.' })
  }
})
