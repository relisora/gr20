# Fra li Monti — planificateur GR20

Outil personnel de planification du GR20 : tabloguide des étapes, carte, comparateur
d'hébergements (refuges PNRC + bergeries/gîtes privés) et — à venir — plan de trek
nuit par nuit avec suivi des réservations.

## Démarrage

```bash
npm install
npm run data:publish   # copie les tracés GeoJSON vers public/data/
npm run dev            # http://localhost:3000
```

## Pages

- `/` — Tabloguide : 16 étapes officielles 2026 (ou 23 segments fins), distances, D+/D-,
  temps calibrés sur les temps officiels, hébergements par étape
- `/carte` — tracé + variante Incudine sur fond Plan IGN / OpenTopoMap / OSM, waypoints cliquables
- `/hebergements` — comparateur filtrable des 31 hébergements, tarifs 2026, contacts

## Données

Voir [data/README.md](data/README.md) — provenance, licences (OSM ODbL, IGN Etalab 2.0) et
pipeline de régénération (`npm run data:trace` / `data:elevation` / `data:segments` +
`scripts/calibrate-times.mjs`). Le cadrage produit est dans [BRAINSTORM.md](BRAINSTORM.md).

## Roadmap

1. ~~V0 — données + tabloguide + carte + comparateur~~
2. V1 — plan de trek nuit par nuit (localStorage), marquage des réservations, échéancier, budget, export GPX
3. V1.5 — scan manuel des disponibilités pnr-resa (script Playwright, snapshot horodaté)
4. V2 — météo par refuge, PWA hors-ligne, profil altimétrique interactif
