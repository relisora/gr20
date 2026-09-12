/** Déclenche le téléchargement d'un fichier généré côté client. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  // Firefox exige l'ancre dans le DOM ; révocation différée sinon le téléchargement peut être annulé
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
