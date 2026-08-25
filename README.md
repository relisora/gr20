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

## Hébergement (Cloudflare Pages)

Le site est hébergé sur Cloudflare Pages, qui satisfait d'office les deux contraintes de la PWA :
**HTTPS** (un service worker ne s'enregistre qu'en *secure context*) et **racine d'une origine**
(l'app est buildée pour la racine : `scope`, `navigateFallback`, `/_nuxt/…` — pas de sous-chemin).
Le build (`npm run build`) rejoue `data:publish` via `prebuild`, l'image déployée embarque donc les
5 pages prérendues et les tracés.

Particularités d'un hébergement sans disque :

- **Le bouton « Rescanner » fonctionne en prod** : `/api/rescan` fait le scan pnr-resa en mémoire
  (Workers) et retourne le snapshot, conservé dans le navigateur de l'appareil (localStorage).
- **`/api/dispo` ne fonctionne pas** (la route lit `public/data/dispo-snapshot.json` sur le disque) :
  `useDispo` se replie sur le snapshot statique précaché, et le dernier rescan local prend le
  dessus s'il est plus frais. Comme `public/data/` est gitignoré, un build CI depuis le dépôt part
  sans snapshot embarqué (pastilles vides jusqu'au premier rescan) — scanner en local
  (`npm run data:dispo`) et déployer depuis la machine de dev pour en embarquer un.

Avant de partir : installer la PWA et parcourir `/carte` aux zooms utiles pour remplir le cache de
tuiles. Ensuite elle se lance et se parcourt sans réseau.

## Pages

- `/` — Tabloguide : 16 étapes officielles 2026 (ou 23 segments fins), distances, D+/D-,
  temps calibrés sur les temps officiels, hébergements par étape
- `/carte` — tracé + variante Incudine sur fond Plan IGN / OpenTopoMap / OSM, waypoints cliquables,
  profil altimétrique interactif synchronisé avec la carte (survol → marqueur, clic → recentrage)
- `/hebergements` — comparateur filtrable des 31 hébergements, tarifs 2026, contacts,
  disponibilités pnr-resa (dernier scan)
- `/meteo` — météo du trek journée par journée (Open-Meteo, horizon 16 j) : résumé quotidien au
  point d'arrivée et détail heure par heure à la position estimée le long de l'étape (selon
  l'heure de départ et le rythme du plan)
- `/plan` — plan de trek nuit par nuit (localStorage) : hébergement + formule par nuit, statut de
  réservation, échéancier PNRC, dispo pnr-resa par nuit

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
- Les 5 pages, les tracés GeoJSON et le dernier snapshot de disponibilités sont précachés : l'app
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

Écrit `public/data/dispo-snapshot.json` (horodaté, gitignoré) — le snapshot embarqué au build.
Le bouton « Rescanner » des pages hébergements/plan fait le même scan via `POST /api/rescan`
(en mémoire, portable Cloudflare Workers) : le résultat est affiché immédiatement et conservé
dans le navigateur de l'appareil (localStorage), le plus frais des deux gagnant à l'affichage.
Usage : scan manuel, faible fréquence — pas de monitoring continu.

## Données

Voir [data/README.md](data/README.md) — provenance, licences (OSM ODbL, IGN Etalab 2.0) et
pipeline de régénération (`npm run data:trace` / `data:elevation` / `data:segments` +
`scripts/calibrate-times.mjs`). Le cadrage produit est dans [BRAINSTORM.md](BRAINSTORM.md).

## Roadmap

1. ~~V0 — données + tabloguide + carte + comparateur~~
2. ~~V1 — plan de trek nuit par nuit (localStorage), marquage des réservations, échéancier, export GPX~~
3. ~~V1.5 — scan manuel des disponibilités pnr-resa (snapshot horodaté + bouton Rescan ; simple POST
   `stock.php`, Playwright inutile)~~
4. V2 — ~~météo par refuge (Open-Meteo, prévisions 16 j sur les nuitées du plan)~~, ~~PWA hors-ligne~~,
   ~~profil altimétrique interactif~~
