# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Langue** : le projet est intégralement en français (UI, commentaires, noms de champs de données,
messages de commit). S'y conformer.

## Nature du projet

« Fra li Monti » : planificateur du GR20 (Nuxt 4 + Nuxt UI v4 + Leaflet), né comme outil
personnel et publié en open source (MIT).
Pas de comptes, pas de backend, pas de base de données — les données de référence sont du **JSON
versionné dans le repo**, le plan de l'utilisateur vit dans **localStorage**, et les 5 pages sont
prérendues pour fonctionner **hors ligne** (PWA). Le cadrage produit et les contraintes juridiques
sont dans [BRAINSTORM.md](BRAINSTORM.md) ; la provenance des données dans [data/README.md](data/README.md).

## Commandes

```bash
npm install
npm run data:publish     # OBLIGATOIRE après clone : copie data/raw/trace-*-elev.geojson → public/data/
                         # (public/data/ est gitignoré ; sans ça, carte et profil altimétrique sont vides)
npm run dev              # http://localhost:3000
npm run build            # prérend / /carte /hebergements /meteo /plan (prebuild rejoue data:publish)
npm run preview
npm run lint             # ESLint (@nuxt/eslint + stylistic : pas de point-virgule, guillemets simples, 1tbs)
npm run typecheck        # vue-tsc via nuxt typecheck
```

Disponibilités des refuges (scan manuel, jamais automatisé) :

```bash
npm run data:dispo                                          # aujourd'hui → +13 j
node scripts/scan-dispo.mjs --debut 2026-08-10 --fin 2026-08-23
```

Régénération du référentiel géographique (rarement nécessaire, ordre impératif) :

```bash
node scripts/fetch-trace.mjs data/raw/waymarked-101692.json data/raw/trace-main.geojson
node scripts/add-elevation.mjs data/raw/trace-main.geojson data/raw/trace-main-elev.geojson
npm run data:segments                  # écrit data/segments.json avec terrain_factor = 1
node scripts/calibrate-times.mjs       # NE PAS OUBLIER : sinon les temps sont ceux de la formule nue
npm run data:publish
```

Hébergement : **Cloudflare Pages**. Deux invariants quel que soit l'hébergeur :

- **servi en HTTPS, à la racine d'une origine** : un service worker ne s'enregistre pas en clair,
  et `scope` / `navigateFallback` / `/_nuxt/…` supposent la racine (pas de sous-chemin). Sinon le
  hors-ligne disparaît sans erreur visible ;
- **`/api/dispo` a besoin d'un disque** (`process.cwd()/public/data/dispo-snapshot.json`) : sur un
  hébergement sans filesystem (Pages/Workers), la route échoue et `useDispo` se replie sur le
  snapshot statique précaché — comportement prévu, ne pas « corriger ». `public/data/` étant
  gitignoré, un build CI n'embarque aucun snapshot (pastilles vides).

**Pas de tests automatisés.** Le contrôle passe par `npm run lint`, `npm run typecheck` et
`npm run build` (la CI GitHub exécute les trois), puis par l'app en dev.

## Architecture

### Le graphe : waypoints → segments → étapes

`data/waypoints.json` (lieux, manuel) + le tracé altimétré donnent `data/segments.json`, **la
source de vérité** pour toutes les distances/D+/temps de l'app :

- `build-segments.mjs` snappe chaque waypoint sur le tracé, trie par `trace_index` (→ `waypoint_order`,
  l'ordre Calenzana → Conca) et découpe le tracé entre waypoints consécutifs. D+/D- avec
  hystérésis 5 m. `time_base_h` = formule additive (4 km/h plat, 350 m/h montée, 600 m/h descente).
- `calibrate-times.mjs` recale : `terrain_factor` = temps officiel médian de l'étape
  (`data/stages-official.json`) / somme des `time_base_h` ; `time_h = time_base_h × terrain_factor`.
  Le GR20 est bien plus lent que la formule nue — les temps affichés sont donc **calibrés, pas calculés**.
- Conséquence structurante : **tout est linéaire**. `segmentsBetween(from, to)` marche par indices
  dans `waypoint_order` et retourne `[]` si `to` précède `from`. Un waypoint hors tracé doit porter
  `off_route: true` (il est alors exclu du graphe).
- `haversineM` (`shared/geo.mjs`) est l'unique implémentation de la distance, partagée par les
  scripts node et `useTrace` (import `#shared/geo.mjs`).

### Composables (`app/composables/`)

- **`useGr20`** — référentiel statique. Les JSON sont importés (`~~/data/*.json`), transformés **une
  seule fois au niveau module** (Map par id, `stageRows`, totaux, `officialNightIds`) : ce n'est
  **pas** réactif, c'est du calcul à l'import, partagé par tous les appelants. Y ajouter un dérivé du
  référentiel plutôt que de recalculer dans une page. `sumSegments(segs, paceFactor)` est la seule
  façon d'agréger distance / D+ / D- / temps d'une suite de segments.
- **`usePlan`** — plan de trek : `useState` + persistance localStorage déléguée à
  `app/utils/planStorage.ts` (cf. « Sauvegarde du plan » plus bas). `days` recompose les journées à
  partir des nuitées choisies (départ et arrivée sont implicites, jamais des nuitées) ; chaque
  journée porte son `accommodation` résolu. Contient aussi `arrivalWaypoints` (points météo),
  l'échéancier PNRC, l'alerte de saison et `storageNotices` (état de la sauvegarde à afficher).
- **`useDispo`** — snapshot de dispo : `$fetch('/api/dispo')`, repli sur `/data/dispo-snapshot.json`
  (précaché) si l'API est injoignable. `DISPO_LEVEL_META` est la légende partagée.
- **`useMeteo`** — Open-Meteo : **une seule requête multi-points** (lat/lon/elevation joints par
  virgules) pour tous les waypoints du plan, TTL 1 h **par waypoint**, déduplication de la requête
  en vol. Réponse = objet si 1 point, tableau si N. La liste de points est `usePlan().arrivalWaypoints`
  (arrivées de toutes les journées datées, sans fenêtre glissante), partagée par `/plan` et `/meteo` :
  même URL → même entrée de cache service worker.
- **`useMeteoHoraire`** — météo heure par heure de `/meteo` : estime la position du randonneur à
  chaque heure pleine (temps calibrés des segments × `paceFactor`, interpolation dans les indices
  `segment.trace.start/end` du tracé), puis **une requête Open-Meteo `hourly` par journée datée à
  venir dans l'horizon** (`start_date = end_date`, multi-points dédupliqués, lat/lon arrondis à
  4 décimales pour des URLs stables → retrouvées dans le cache SW hors ligne). TTL 1 h + clé de
  plan (heure de départ, rythme, étape) pour refetcher quand le plan change.
- **`useTrace`** — 8 866 points du tracé principal, chargés une fois (promesse partagée entre
  `TrailMap` et `ElevationProfile`), stockés en `markRaw` (jamais mutés, réactivité profonde inutile).

### Disponibilités pnr-resa : la chaîne complète

Le cœur du scan vit dans **`shared/scan-dispo.mjs`** — JS pur, **aucun import `node:*`** (c'est ce
qui le rend exécutable sur Cloudflare Workers ; ne pas y introduire de dépendance node) : POST HTML
sur `pnr-resa.corsica/stock.php` (plafonné à 7 j par requête, donc itération par fenêtres, 800 ms
entre requêtes, garde-fou 62 j), parsing de la grille par couleur (`green`/`orange`/`darkred`) et
icône (`fa-bed`/`fa-moon`/`fa-campground`), et `scanDispo(debut, fin, log)` qui retourne le
snapshot. Deux consommateurs :

- `scripts/scan-dispo.mjs` (CLI, `npm run data:dispo`) : wrapper node qui écrit
  `public/data/dispo-snapshot.json` (gitignoré, horodaté) — la source du snapshot embarqué au build ;
- `server/api/rescan.post.ts` : scanne **en mémoire** et **retourne le snapshot au client** (pas
  d'écriture disque, sauf en dev pour la parité avec le CLI, via un import dynamique de `node:fs`).
  Fonctionne donc en prod sur Cloudflare Pages. Gardes : same-origin (403), verrou de scan (409) et
  cooldown 60 s (429) par isolate — l'endpoint est public, on ne proxifie pas des scans en boucle.

Le mapping nom pnr-resa → id d'hébergement est la table `REFUGE_IDS` du module partagé ; les noms
non reconnus sont remontés dans `refugesIgnores`. Le parsing **jette une erreur** si la grille ou
les dates sont introuvables : c'est voulu (détecter un changement de structure plutôt que produire
un snapshot vide).

`server/api/dispo.get.ts` relit le fichier du build depuis le disque — indispensable parce qu'un
asset de `public/` n'est **pas** joignable par le `$fetch` interne pendant le prérendu,
contrairement à une route serveur. Côté client, `useDispo` garde le snapshot d'un rescan dans
localStorage (`gr20-dispo-snapshot-v1`) et retient **le plus frais** (par `scannedAt`) entre ce
snapshot local et celui de `/api/dispo` / du fichier statique précaché.

### Sauvegarde du plan : ce qui ne doit jamais se perdre (`app/utils/planStorage.ts`)

Le plan est la **seule donnée non reconstituable** du projet (nuitées, références de réservation,
montants payés, notes) et il n'existe qu'en localStorage. Tout le code de persistance est isolé dans
`planStorage.ts` ; ses invariants, à respecter en faisant évoluer l'app :

- **`PLAN_STORAGE_KEY` ne change jamais.** Le versionnement se fait dans le payload (champ `version`),
  pas dans le nom de la clé : renommer la clé = perdre les plans déjà enregistrés chez l'utilisateur.
  Même règle pour `gr20-hebergements-ui-v1` (filtres de `/hebergements`).
- **Changer la forme du plan = `PLAN_VERSION` + 1 ET une entrée dans `MIGRATIONS`** (`MIGRATIONS[n]`
  transforme un payload version n en version n+1). Sans l'entrée, le chargement est refusé
  (`status: 'migration-manquante'`) : le plan est mis de côté, jamais deviné ni écrasé.
- **Rien n'est écrasé sans copie** : payload illisible, migration, version plus récente,
  réinitialisation, import **et écriture concurrente** passent par `backupRaw` / `backupCurrentPlan`
  (clés `gr20-trek-plan-sauvegarde-<horodatage>-<motif>`, 3 conservées, dédoublonnées par contenu —
  sinon les rechargements d'un même payload illisible purgent les copies distinctes utiles).
- **`savePlan` est un compare-and-swap** : il relit le stockage et, s'il diffère du dernier payload
  connu de cet onglet, copie l'existant (motif `autre-onglet`) avant de l'écraser. Deux clients de la
  même origine (onglet + fenêtre PWA installée) gardent chacun leur état en mémoire : sans ça, la
  moindre modification dans le plus ancien remplace tout le travail de l'autre, sans copie ni alerte.
  Corollaire : `usePlan` écoute `storage` et **adopte** la version externe si cet onglet n'a rien
  modifié (`modifieLocalement`), sinon il avertit sans jamais remplacer ce que l'utilisateur a sous les
  yeux. Ne pas déduire « édition en cours » d'une comparaison avec le stockage : l'enregistrement étant
  immédiat à chaque frappe, l'état en mémoire est presque toujours égal au dernier payload écrit.
- **Un payload non chargé ET non copiable (quota) bloque l'enregistrement** (`ecritureBloquee`) :
  laisser le plan par défaut s'écrire par-dessus détruirait la seule trace des données. L'import ou la
  réinitialisation lève le blocage (`autoriserEcriture`).
- **Ne jamais rabaisser l'étiquette `version`** d'un plan de version plus récente : le réécrire en
  version courante ferait rejouer les migrations sur des données déjà migrées. `sanitizePlan` force
  `version: PLAN_VERSION`, donc la branche `version-future` de `loadStoredPlan` la restaure après coup.
- **La chaîne de migrations est une routine unique** (`appliquerMigrations`, partagée par
  `loadStoredPlan` et `parsePlanJson`) avec garde-fou de progression : une migration qui n'incrémente
  pas `version` ferait boucler la page à l'infini.
- **`sanitizePlan` valide les champs connus et recopie les inconnus** (`...raw` en tête) : un plan écrit
  par une version plus récente, ouvert par un shell plus ancien (autre appareil, service worker en
  retard), ne perd pas ses champs au prochain enregistrement.
- **Un échec d'écriture doit être visible** : `savePlan` retourne un message (quota, Safari navigation
  privée) que `/plan` affiche. Écrire en silence dans le vide alors que la page annonce « sauvegardé
  automatiquement » est le pire scénario.
- **Le watcher d'enregistrement vit dans un `effectScope` détaché** (`usePlan`) : créé dans le setup de
  `/plan`, il serait arrêté au démontage de la page et les modifications suivantes ne seraient plus
  écrites. Ce scope sert aussi de garde d'hydratation (on ne relit le stockage qu'une fois).
- **Le plan survit aux évolutions de `data/`** : une nuitée dont le lieu n'est plus **dans le graphe**
  (`waypoint_order` — id disparu, renommé, ou passé `off_route`) est conservée en stockage mais exclue de
  `days` (`orphanNights`). Un `waypointById.get(id)!` undefined dans `days` plante le rendu de `/plan`,
  donc l'accès à *toutes* les autres nuitées ; et un waypoint hors graphe encore présent dans
  `waypoints.json` donnerait deux journées à 0 km sans le moindre signalement. Le critère est donc
  l'appartenance à `waypoint_order`, pas à `waypointById`. Les hébergements/formules disparus sont
  signalés par `staleChoices`. Ne jamais supprimer automatiquement ces nuitées : les infos de résa
  qu'elles portent ne sont pas récupérables — `/plan` les affiche avec leurs références et montants et
  ne propose que des suppressions explicites (elles restent comptées dans l'avancement des
  réservations, donc les cacher serait un piège). L'état vide et la garde « garde au moins une nuitée » se basent sur
  `placedNights`, sinon un plan entièrement orphelin n'offre ni nuitée éditable ni bouton d'amorçage.
- **Sauvegarde hors navigateur** : `downloadPlanJson` / `parsePlanJson` (boutons « Sauvegarde JSON » et
  « Restaurer » de `/plan`) — seul recours si le stockage est vidé ou l'appareil perdu. Le fichier porte
  son `planVersion` et repasse par les mêmes migrations à l'import.

### Hors ligne / PWA (`nuxt.config.ts`)

Le hors-ligne n'est pas un bonus : la couverture réseau est quasi nulle sur le sentier. Les choix
sont fragiles et documentés en commentaire dans `nuxt.config.ts` — les lire avant d'y toucher :

- Les 3 pages SSR sont `prerender: true` (HTML précachable) ; `/plan` et `/meteo` sont `ssr: false`
  **et** prérendues (le plan vit dans localStorage → aucun risque d'hydratation).
- `globPatterns` inclut `data/**/*.{json,geojson}` : tracés et dernier snapshot de dispo sont précachés.
- Tuiles : **Plan IGN et OSM seulement** (en-tête CORS `*` → réponses non opaques, taille réelle
  comptée dans le quota ; les couches Leaflet correspondantes portent `crossOrigin: true`).
  **OpenTopoMap est volontairement exclu du cache** (aucun en-tête CORS → réponses opaques paddées
  à ~7 Mo) : couche en ligne uniquement. Ne pas « corriger » cette asymétrie.
- Météo et `/api/dispo` en `NetworkFirst` ; le pattern `/api/dispo` n'est **pas** ancré (`^`)
  car workbox teste l'URL absolue.
- Piège des pages prérendues : le payload est figé au build. Les pages forcent un re-fetch client
  quand `navigator.onLine` (cf. `hebergements.vue`) et gardent le précache sinon.

### UI

Nuxt UI v4 exclusivement — `app/assets/css/main.css` ne contient que deux `@import`, il n'y a pas de
CSS maison (un commit a explicitement remplacé le CSS artisanal par des composants Nuxt UI). Thème :
`primary: emerald`, `neutral: stone` (`app/app.config.ts`), locale `fr` sur `<UApp>`, icônes
`i-lucide-*`. Les libellés/couleurs partagés vivent dans des `*_META` exportés (`app/utils/format.ts`,
`useDispo`) — les réutiliser au lieu de redéfinir des labels. `WAYPOINT_TYPE_META` donne la couleur
des lieux, commune à la carte, au profil et à la légende ; les `color` sont typés `BadgeProps['color']`,
donc pas de `as any` dans les templates.
Leaflet est importé dans `TrailMap.vue`, toujours monté sous `<ClientOnly>`.

## Conventions et pièges

- **Dates** : toujours des chaînes ISO `YYYY-MM-DD`, manipulées via `todayIso()`, `addDaysIso()` et
  `formatDateFr()` (`app/utils/dates.ts`). Jamais `toISOString().slice(0, 10)` pour une date locale
  (UTC → date de la veille après minuit en France) ; parser avec `new Date(iso + 'T12:00:00')`.
- **localStorage sur page SSR** : restaurer dans `onMounted` (cf. `hebergements.vue`), jamais dans
  le setup, sinon mismatch d'hydratation. `/plan` est `ssr: false` et échappe à cette contrainte.
- **Tarifs des tentes PNRC** : facturées **à la tente** (2 places), pas à la personne —
  `formule.par === 'tente'` avec `prix_2p_eur`.
- **Données volatiles** : tarifs, notes Google (`google-ratings.json`, `releveLe`), téléphones et
  ouvertures se re-vérifient chaque saison. `accommodations.json` porte `sources[]` et
  `unverified[]` par hébergement — les renseigner en cas de modification.
- **Licences / attribution** : le footer (OSM ODbL, IGN Etalab 2.0, Open-Meteo CC-BY) et les
  `attribution` Leaflet sont des obligations, pas de la décoration. Interdits : GPX FFRandonnée,
  SCAN 25® IGN. Open-Meteo et OpenTopoMap sont non-commercial only.
- **pnr-resa** : scan manuel, basse fréquence, `User-Agent` explicite, jamais de monitoring continu
  ni d'alertes. La réservation réelle se fait par lien sortant vers pnr-resa.corsica.
- **Git** : commits en français, à la première personne du projet, sans mention d'IA.
