# Fra li Monti — planificateur GR20

Planificateur **hors ligne** du GR20 (Corse, Calenzana → Conca) : tabloguide des étapes, carte et
profil altimétrique, comparateur d'hébergements, météo par étape et **plan de trek nuit par nuit**
avec suivi des réservations. Application web installable (PWA), sans compte ni base de données :
les données de référence sont du JSON versionné dans ce dépôt, le plan reste dans le navigateur.

> *Fra li Monti* (« entre les montagnes ») est le nom historique du sentier. Ce projet n'est
> affilié ni au Parc naturel régional de Corse ni à la FFRandonnée.

*English — an offline-first planner for Corsica's GR20: stage table, map with elevation profile,
hut comparison, per-stage weather and a night-by-night plan with booking tracking. French UI.*

## Pages

- `/` — **Tabloguide** : les 16 étapes officielles (ou les 23 segments fins), distances, D+/D−,
  temps calibrés sur les temps officiels, hébergements à l'arrivée.
- `/carte` — tracé + variante Incudine sur fond Plan IGN / OpenTopoMap / OSM, lieux cliquables,
  profil altimétrique synchronisé avec la carte, export GPX du parcours.
- `/hebergements` — comparateur filtrable des 31 hébergements (refuges PNRC, bergeries, gîtes,
  hôtels) : formules, tarifs, services, contacts, disponibilités pnr-resa du dernier scan.
- `/meteo` — météo Open-Meteo journée par journée (horizon 16 j) : résumé au point d'arrivée et
  détail heure par heure à la position estimée le long de l'étape.
- `/plan` — plan de trek nuit par nuit : hébergement et formule par nuit, statut et référence de
  réservation, échéancier PNRC, export GPX par journée, sauvegarde et restauration JSON.

## Démarrage

```bash
npm install
npm run data:publish   # copie les tracés GeoJSON dans public/data/ (gitignoré)
npm run dev            # http://localhost:3000
```

Vérifications : `npm run lint`, `npm run typecheck`, `npm run build`. Le build prérend les cinq
pages ; le site doit être servi en HTTPS à la racine d'une origine pour que le service worker
s'enregistre.

## Hors ligne

La couverture réseau est quasi nulle sur le sentier : l'app est conçue pour s'installer puis
fonctionner sans réseau.

- **Installer** : « Ajouter à l'écran d'accueil » (Chrome / Android) ou Partager → « Sur l'écran
  d'accueil » (Safari / iOS).
- **Tuiles** : parcourir `/carte` aux zooms utiles avant de partir. Les tuiles Plan IGN et OSM
  consultées sont mises en cache (jusqu'à 2 000, 30 jours). OpenTopoMap n'autorise pas la mise en
  cache : couche en ligne uniquement.
- **Météo** : la dernière prévision consultée reste affichée ~24 h hors réseau.
- Pages, tracés et dernier snapshot de disponibilités sont précachés. Un badge « Hors ligne »
  apparaît dans l'en-tête quand la connexion est perdue.

## Disponibilités pnr-resa

La grille publique [pnr-resa.corsica/stock.php](https://pnr-resa.corsica/stock.php) donne la dispo
des refuges PNRC par formule (bât-flanc / bivouac / tente louée), 7 jours par requête.

```bash
npm run data:dispo                                          # aujourd'hui → +13 jours
node scripts/scan-dispo.mjs --debut 2026-08-10 --fin 2026-08-23
```

Le script écrit `public/data/dispo-snapshot.json`, embarqué au build. Le bouton « Rescanner » des
pages fait le même scan via `POST /api/rescan` (en mémoire, portable Cloudflare Workers) et
conserve le résultat dans le navigateur. **Usage manuel et peu fréquent** : pas de monitoring, pas
d'alertes — la réservation se fait sur pnr-resa.corsica.

## Données et licences

Provenance et pipeline de régénération : [data/README.md](data/README.md).

- Tracé : © les contributeurs [OpenStreetMap](https://www.openstreetmap.org/relation/101692), ODbL.
- Altitudes : IGN RGE ALTI® via la Géoplateforme, licence Etalab 2.0.
- Fonds de carte : Plan IGN (Etalab 2.0), OpenStreetMap (ODbL), OpenTopoMap (CC-BY-SA, usage non commercial).
- Météo : [Open-Meteo](https://open-meteo.com) (CC-BY 4.0, usage non commercial).
- Hébergements, tarifs et règles PNRC : compilation manuelle vérifiée pour la saison 2026, à
  re-vérifier chaque saison (`sources[]` et `unverified[]` par hébergement).

« GR », « GR20 » et le balisage blanc-rouge sont des marques de la FFRandonnée, utilisées ici de
façon descriptive.

## Contribuer

Le projet est en français (interface, commentaires, commits). Voir [CONTRIBUTING.md](CONTRIBUTING.md)
et, pour l'architecture et ses invariants, [CLAUDE.md](CLAUDE.md).

## Licence

Code sous licence [MIT](LICENSE). Les données du dossier `data/` suivent les licences de leurs
sources, listées ci-dessus.
