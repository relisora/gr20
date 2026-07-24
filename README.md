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
- `/hebergements` — comparateur filtrable des 31 hébergements, tarifs 2026, contacts,
  disponibilités pnr-resa (dernier scan)
- `/plan` — plan de trek nuit par nuit (localStorage) : hébergement + formule par nuit, statut de
  réservation, échéancier PNRC, budget, dispo pnr-resa par nuit

## Hors ligne / PWA

L'app est installable et conçue pour fonctionner sans réseau (sur le terrain, la couverture est
quasi nulle).

- **Installation sur mobile** : ouvrir le site dans le navigateur puis « Ajouter à l'écran
  d'accueil » (Chrome / Android) ou menu Partager → « Sur l'écran d'accueil » (Safari / iOS).
  L'app s'ouvre alors en plein écran, sans barre d'URL.
- **Précharger les tuiles de carte** : avant de partir, ouvrir `/carte` et parcourir le tracé aux
  zooms utiles. Les tuiles **Plan IGN** (fond par défaut) et **OSM** consultées en ligne sont mises
  en cache (jusqu'à ~2000, 30 jours) et restent affichables hors ligne. **OpenTopoMap** n'est pas
  disponible hors ligne (son serveur n'autorise pas la mise en cache) : c'est une couche en ligne
  uniquement.
- **Météo** : la dernière prévision Open-Meteo consultée est conservée ~24 h ; hors réseau, l'app
  réaffiche cette prévision (périmée, mais mieux que rien) au lieu d'une erreur.
- Les 4 pages, les tracés GeoJSON et le dernier snapshot de disponibilités sont précachés : l'app
  se lance et se parcourt intégralement hors ligne. Hors réseau, les disponibilités affichées sont
  celles du dernier relevé connu (aucune mise à jour possible sans réseau). Un badge « Hors ligne »
  apparaît dans l'en-tête quand la connexion est perdue.

## Scan des disponibilités pnr-resa

La grille publique [pnr-resa.corsica/stock.php](https://pnr-resa.corsica/stock.php) donne la
dispo des refuges PNRC par formule (bât-flanc / bivouac / tente) sur 7 jours max par requête.

```bash
npm run data:dispo                                        # aujourd'hui → +13 jours
node scripts/scan-dispo.mjs --debut 2026-08-10 --fin 2026-08-23
```

Écrit `public/data/dispo-snapshot.json` (horodaté, gitignoré). En dev, le bouton « Rescanner »
des pages hébergements/plan relance le script via `POST /api/rescan`. Usage : scan manuel,
faible fréquence — pas de monitoring continu.

## Données

Voir [data/README.md](data/README.md) — provenance, licences (OSM ODbL, IGN Etalab 2.0) et
pipeline de régénération (`npm run data:trace` / `data:elevation` / `data:segments` +
`scripts/calibrate-times.mjs`). Le cadrage produit est dans [BRAINSTORM.md](BRAINSTORM.md).

## Roadmap

1. ~~V0 — données + tabloguide + carte + comparateur~~
2. ~~V1 — plan de trek nuit par nuit (localStorage), marquage des réservations, échéancier, budget, export GPX~~
3. ~~V1.5 — scan manuel des disponibilités pnr-resa (snapshot horodaté + bouton Rescan ; simple POST
   `stock.php`, Playwright inutile)~~
4. V2 — ~~météo par refuge (Open-Meteo, prévisions 16 j sur les nuitées du plan)~~, ~~PWA hors-ligne~~,
   profil altimétrique interactif
