# Contribuer

Merci de l'intérêt porté au projet. Quelques repères pour qu'une contribution s'intègre vite.

## Langue et style

- Tout est en français : interface, commentaires, noms de champs de données, messages de commit.
- Un commentaire dit *pourquoi*, pas *quoi*. Un invariant non évident mérite une ligne ; le reste, non.
- Le style est imposé par ESLint (`npm run lint`) : pas de point-virgule, guillemets simples, indentation 2.
- Nuxt UI v4 exclusivement, pas de CSS maison. Libellés et couleurs partagés vivent dans les
  `*_META` de `app/utils/format.ts`.

## Avant d'ouvrir une PR

```bash
npm run lint
npm run typecheck
npm run build
```

Il n'y a pas de tests automatisés : vérifier le comportement dans l'app (`npm run dev`), en
particulier `/plan` dont la persistance localStorage obéit à des invariants stricts, décrits dans
[CLAUDE.md](CLAUDE.md).

## Données

- `data/accommodations.json` : toute modification renseigne `sources[]` (URL consultée) et, si un
  point n'a pu être confirmé, `unverified[]`.
- Tarifs, téléphones, ouvertures et règles PNRC sont volatils : dater les vérifications.
- Régénération du référentiel géographique : voir [data/README.md](data/README.md) et l'ordre des
  commandes dans [CLAUDE.md](CLAUDE.md) — `calibrate-times.mjs` est obligatoire après `data:segments`.

## pnr-resa

Le scan des disponibilités n'est acceptable que parce qu'il est **manuel, rare et identifié**
(`User-Agent` explicite, 800 ms entre requêtes, 62 jours max). Ne pas l'automatiser, ne pas ajouter
d'alertes ni de monitoring.

## Commits

En français, à la première personne du projet, avec un préfixe conventionnel (`feat:`, `fix:`,
`chore:`, `data:`).
