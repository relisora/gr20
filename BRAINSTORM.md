# Brainstorm — Web app GR20 (planification + comparateur d'hébergements + suivi de réservations)

> Synthèse de recherche, juillet 2026. Objectif : faire « gr-go, mais uniquement pour le GR20 »,
> avec en plus un comparateur d'hébergements (refuges + bergeries) et un marquage
> « réservé / pas réservé » géré par l'utilisateur (la réservation réelle se fait ailleurs).

## ✅ Décisions de cadrage (24/07/2026)

| Question | Décision | Conséquences |
|---|---|---|
| Perso ou public ? | **Outil perso** | Pas de comptes, pas de SEO, pas de fiches B2B ; localStorage suffit ; risque marque GR® quasi nul (usage privé) |
| Modèle éco ? | **Gratuit** | Licences non-commercial (Open-Meteo, OpenTopoMap) utilisables sans réserve |
| Langues ? | **FR uniquement** (pour l'instant) | Pas d'i18n dans le MVP, architecture à ne pas verrouiller pour autant |
| Dispo temps réel ? | **Non — scan manuel** | Un scan des disponibilités pnr-resa déclenché à la demande (« Rescan »), snapshot horodaté affiché dans l'app ; pas de monitoring continu ni d'alertes |

---

## 1. L'insight principal

Depuis 2023, **la réservation est obligatoire pour toute nuitée sur le GR20** (dortoir, tente louée
et même bivouac avec sa propre tente) via la plateforme du Parc naturel régional de Corse :
[pnr-resa.corsica](https://pnr-resa.corsica). Conséquence : toute la douleur des randonneurs s'est
déplacée de « trouver son chemin » vers **« construire et maintenir une chaîne de N réservations »**
— et aucun outil existant ne couvre cette couche :

- gr-go.fr : excellent Tabloguide, mais **aucun plan persistant, aucun lien avec les réservations**.
- pnr-resa : la dispo n'est visible que dans le tunnel de résa, refuge par refuge, **pas de vue
  calendrier multi-refuges**, pas d'alertes.
- Les sites GR20 (gr20-infos.com, treksimple.fr, mongr20.com, objectif-gr20.fr) : annuaires
  statiques ou planificateurs sans notion de réservation.
- Les randonneurs gèrent ça… dans des tableurs maison.

**Le positionnement gagnant : le plan de trek persistant, nuit par nuit, couplé aux hébergements
et au suivi des réservations.** C'est exactement le brief initial, et c'est un vrai gap.

## 2. Ce que fait gr-go (à répliquer pour le GR20)

Source : analyse de gr-go.fr, y compris les bundles JS du Tabloguide.

### Gratuit chez gr-go
- **Tabloguide** : tableau interactif des étapes — distance, temps estimé, D+, D-, altitude,
  icônes de POI (12 types : refuge gardé/gîte, abri, camping/bivouac, hôtel, maison d'hôte,
  ravitaillement, ravitaillement sommaire, café/boulangerie, restaurant, fast-food, bus, train).
  Variantes et hors-GR en lignes repliables.
- **Carte interactive** Leaflet : fonds OSM + OpenTopoMap, waypoints cliquables, géolocalisation
  temps réel, profil altimétrique au clic sur le tracé (leaflet-elevation).
- **Calculateur d'étapes** : départ, arrivée, distance, temps, D+/D-, alt max/min.
- GPX officiel (sens classique, sans variantes) envoyé par email.
- Météo : meilleure saison + liens prévisions 7 j vers 4 villes (Calenzana, Vivario, Bocognano, Conca).
- Idées de parcours pré-conçus (GR20 en 8/12/14 jours), blog, guide de préparation.

### Premium chez gr-go (12,40 €/mois ou 39,40 €/an ; fiches hébergeurs B2B à 20 €/an)
- Inversion du sens (recalcul complet), mode marche ↔ course.
- Personnalisation avancée des temps : niveau physique, vitesse, poids du sac, taille du groupe,
  fréquence des pauses, technicité du terrain.
- Calculateur entre 2 étapes au choix (+ vitesses moyennes plat/montée/descente).
- GPX personnalisé (départ/arrivée + variantes sélectionnées), GPX complets 2 sens.
- Variantes/hors-GR interactifs sur la carte, fonds IGN/SCAN 25®.

### Ce que gr-go NE fait PAS (nos opportunités)
- Pas de **plan sauvegardé** (le compte ne sert qu'à l'abonnement), pas de mode hors-ligne/PWA,
  pas d'app mobile.
- Pas de fiches hébergements systématiques (tarifs, capacité, période d'ouverture) — seulement
  des icônes + fiches sponsorisées.
- **Pas de points d'eau**, pas de météo par étape/refuge, pas de communauté, pas d'export PDF,
  français uniquement.

## 3. Le terrain : GR20 en chiffres

- ~180–185 km, ~12 600 m de D+, Calenzana → Conca, 16 étapes classiques, alt max 2 591 m
  (variante Monte Cinto 2 706 m, devenue tracé officiel après la fermeture définitive du Cirque
  de la Solitude en 2015).
- **14 refuges PNRC** (~15 à 48 places selon refuge). Attention : Ortu di u Piobbu (incendié en
  2019) et Asinau (incendié en 2016) n'ont **pas de dortoir** — bivouac + tentes louées seulement
  (statut à revérifier chaque saison).
- **Hébergements privés** aux points clés : bergeries de Ballone/U Vallone, Castel di Vergio
  (hôtel+gîte+camping), Vaccaghja, bergeries de l'Onda, hôtels de Vizzavona (Monte d'Oro,
  I Laricci) + gare de train, gîtes U Fugone/Capannelle, relais San Petru di Verde (Bocca di
  Verdi), Basseta/I Croci/Matalza (plateau du Cuscionu), bergerie « chez Aline » (Asinau),
  gîtes du col de Bavella, La Tonnelle (Conca).
- **Variantes majeures** : crêtes Petra Piana→l'Onda, Monte d'Oro, Monte Renoso, Monte Incudine
  vs itinéraire bas par Matalza, variante alpine de Bavella (câbles/chaînes).
- ⚠️ **Trois découpages coexistent** : les 16 étapes « classiques » (arrêt Castel di Verghio),
  le découpage officiel PNRC actuel (Ciottulu→Manganu direct ; Usciolu→Matalza→Asinau scindé),
  et les découpages « en N jours ». Il faudra choisir un référentiel canonique — d'où l'intérêt
  d'un modèle en graphe de segments (cf. §6).

## 4. Le système de réservation (règles à encoder dans l'app)

Plateforme unique [pnr-resa.corsica](https://pnr-resa.corsica) ([CGV](https://pnr-resa.corsica/CGV.pdf)) :

| Règle | Valeur (saison 2026) |
|---|---|
| Ouverture des ventes | ~20 janvier |
| Saison de gardiennage | 16 mai – 4 octobre |
| Formules | Bat-flanc 20 € · Bivouac (tente perso) 12 € · Tente louée 27 € (1 p.) / 39 € (2 p.) |
| Réservation | Nominative, CB uniquement, jusqu'à 48 h avant, **y compris bivouac** |
| Place garantie | Jusqu'à **19 h** le jour J |
| Modification | Dates/refuges jusqu'à **J-2** ; la formule n'est **pas** modifiable |
| Remboursement | Intégral seulement **> 2 mois avant** ; médical → avoir (demande à J-10, justificatif) |
| Repas | Non réservables en ligne — auprès du gardien, **espèces** (prévoir 150–200 €, pas de DAB) |

Les **hébergements privés** (bergeries, gîtes, hôtels) se réservent par **téléphone/mail/site
propre** — hors plateforme. C'est cette fragmentation PNRC-en-ligne vs privés-au-téléphone que
notre suivi de réservations doit unifier.

**Pain points documentés** (forums camptocamp, gr20-infos, UKHillwalking) :
1. Un seul refuge complet casse toute la chaîne (goulots : Manganu, Tighjettu, Ortu di u Piobbu,
   Carrozzu, Usciolu — complets dès juin/juillet).
2. Rigidité vs aléas (météo, fatigue) : re-planifier en cascade est un cauchemar.
3. Places libérées invisibles (annulations fréquentes, aucune alerte).
4. Deux canaux de résa non unifiés, suivis dans des tableurs.
5. Eau (sources à sec), cash only, conditions terrain dispersées.

## 5. Fonctionnalités proposées

### Cœur (parité gr-go, spécialisé GR20)
- **Tabloguide GR20** : étapes, distance, temps, D+/D-, altitude, POI — avec en plus les
  **points d'eau** (gap gr-go) et les variantes repliables.
- **Carte interactive** (fond Plan IGN v2 gratuit + OpenTopoMap) : tracé principal + variantes,
  hébergements, points d'eau, profil altimétrique.
- **Calculateur de temps personnalisé** (vitesse, poids du sac, niveau) entre deux points
  quelconques ; fusion/scission d'étapes.
- **Export GPX** du plan réel de l'utilisateur (pas juste du tracé officiel).
- **Météo par étape/refuge** avec correction d'altitude (Open-Meteo/AROME 1,5 km) — bien mieux
  que les liens « ville » de gr-go.

### Différenciateurs (le brief)
- **Comparateur d'hébergements** : par nuit/zone d'étape, tableau comparatif refuge PNRC vs
  bergeries vs gîtes — formules (bat-flanc / tente louée / bivouac / dortoir privé / chambre),
  prix, services (repas, douche, épicerie, accès route), capacité, canal et lien/téléphone de
  réservation, période d'ouverture.
- **Plan de trek persistant** : je choisis mes dates, mon sens, mon rythme → l'app propose un
  découpage en nuitées ; chaque nuit = un hébergement + une formule choisie ; recalcul du plan si
  je déplace une nuit (l'effet cascade devient visible et gérable).
- **Suivi de réservations** (marquage manuel) : statut par nuit — `à réserver` / `réservé` /
  `complet` / `liste d'attente` — avec n° de confirmation, prix payé, notes, et **rappels
  d'échéances** (ouverture des ventes en janvier, remboursement J-60, modif J-2, avoir J-10).
- **Budget** : nuitées + repas + estimation du cash à emporter.
- **Checklist logistique** : quittances à sauvegarder hors-ligne, transports (train Vizzavona,
  navettes Calenzana/Conca), ravitaillements.

### Scan manuel des disponibilités (retenu au cadrage)
- Un bouton/script « Rescan » interroge pnr-resa pour les dates du plan et stocke un
  **snapshot horodaté** (JSON) ; l'app affiche « dispo au JJ/MM HH:MM » dans le comparateur
  et le planificateur. Pas de monitoring continu, pas d'alertes.
- Réalité technique (sondé le 24/07/2026) : le tunnel `pnr-resa.corsica/index.php?s=1`
  n'expose rien en HTML statique — session + JS. Le scan passera par un navigateur piloté
  (script **Playwright** local) ; première étape : cartographier les requêtes XHR du tunnel
  pour voir si un endpoint JSON de dispo est appelable directement (plus robuste que le
  scraping DOM). Usage perso + fréquence manuelle = profil bas et charge négligeable.

### V2+ (hors MVP)
- Conditions terrain (neige, sources à sec, fermetures) — saisie manuelle perso d'abord.
- Version EN si l'outil devient public un jour.
- PWA hors-ligne complète pour usage sur le sentier.

## 6. Modèle de données (esquisse)

Le point clé : **ne pas modéliser en « 16 étapes » mais en graphe de segments** — ça absorbe les
trois découpages, les variantes et la fusion d'étapes naturellement.

```
waypoint        — lieu remarquable (refuge, col, village, jonction de variante)
segment         — arc entre 2 waypoints : geometry, distance, D+, D-, temps de base, is_variant
accommodation   — site d'hébergement rattaché à un waypoint : type (refuge_pnrc | bergerie |
                  gite | hotel | camping), services, contact, canal_resa (pnr-resa | tel | mail
                  | web), période d'ouverture, coordonnées
sleep_option    — formule par hébergement : dortoir | bivouac | tente_louee | chambre (+ prix,
                  capacité, demi-pension dispo)
trek_plan       — utilisateur : date de départ, sens, taille du groupe, facteur de rythme
plan_day        — jour du plan : suite ordonnée de segments, waypoint d'arrivée
night           — par plan_day : accommodation + sleep_option choisis
booking_mark    — par night : statut (a_reserver | reserve | complet | liste_attente),
                  référence, prix payé, notes, échéances calculées
```

Volumétrie minuscule (≈ 40 waypoints, ≈ 60 segments, ≈ 45 hébergements) → la base « contenu »
peut être un simple fichier JSON/SQLite versionné dans le repo, mis à jour chaque saison.

## 7. Sources de données & juridique

| Besoin | Solution retenue | Licence / piège |
|---|---|---|
| Tracé | Relation OSM [101692](https://www.openstreetmap.org/relation/101692) via Overpass / [Waymarked Trails](https://hiking.waymarkedtrails.org/#route?id=101692&type=relation) | ODbL : attribution « © contributeurs OSM ». **Jamais** de GPX FFRP (mongr.fr/topoguides = usage privé uniquement) |
| Fond de carte | Plan IGN v2 via `data.geopf.fr` (WMTS, **gratuit sans clé**) + OpenTopoMap en option | Etalab 2.0 (mention IGN). **SCAN 25® exclu** sans licence. OpenTopoMap : projets gratuits only |
| Altimétrie | API altimétrique IGN (RGE ALTI) — **précalculer** les profils et les stocker | 5 req/s/IP |
| Météo | [Open-Meteo](https://open-meteo.com/en/docs/meteofrance-api) (AROME 1,5 km, correction altitude) | **Non-commercial only** → à réévaluer si monétisation |
| Hébergements | Base maison (cœur de la valeur) + croisement [refuges.info API](https://www.refuges.info/api/doc/) et OSM | refuges.info : CC BY-SA 2.0 |
| Résa refuges | **Lien sortant** vers pnr-resa.corsica | Pas d'API publique ; scraping = risque |

**Marque GR®** : « GR », « GR20 », le balisage blanc/rouge et GR@ccess® sont des marques FFRandonnée.
L'usage descriptif (« itinéraire du GR® 20 ») est admis ; en revanche **éviter un nom de domaine /
branding construit sur « GR20 »**, le logo, ou toute apparence d'affiliation. Prévoir un vrai nom
de produit (piste : un nom corse — « Fra li monti » est le nom historique du sentier).

**Données volatiles** (à re-vérifier chaque saison, idéalement avec une page « fraîcheur des
données ») : tarifs PNRC, statut dortoirs Ortu di u Piobbu / Asinau, téléphones des bergeries,
dates d'ouverture.

## 8. Stack technique proposée

- **Nuxt 4 + @nuxt/ui + TypeScript** — outil perso : pas besoin de SSR/SEO, une SPA générée
  statiquement (`nuxi generate`) ou servie en local suffit.
- **Carte** : Leaflet (simple et suffisant ; MapLibre GL si envie de vectoriel) + WMTS IGN
  (`data.geopf.fr`, gratuit sans clé) + tracé GeoJSON depuis OSM.
- **Contenu** : JSON versionné dans le repo (waypoints, segments, hébergements, tarifs 2026)
  + snapshots de dispo horodatés produits par le script de scan.
- **Plans utilisateur** : **localStorage** (zéro compte, zéro backend), export/import JSON en
  guise de sauvegarde.
- **Scan de dispo** : script Node + Playwright à côté de l'app (`scripts/scan-dispo.ts`),
  lancé à la main, qui écrit le snapshot JSON lu par l'app.
- **PWA** en V2 : le hors-ligne reste utile sur le sentier (quittances, plan, carte).

## 9. Découpage MVP

1. **V0 — le socle** : base de données canonique (waypoints + segments + hébergements +
   tarifs 2026), Tabloguide, carte + profils, fiches et comparateur d'hébergements.
2. **V1 — le différenciateur** : plan de trek nuit par nuit (localStorage), marquage des
   réservations, échéancier des dates clés, budget, export GPX du plan.
3. **V1.5 — le scan** : script Playwright de scan des dispos pnr-resa + affichage du snapshot
   horodaté dans le comparateur/planificateur, bouton « Rescan » (relance manuelle).
4. **V2 — le confort** : météo par étape/refuge, PWA hors-ligne, personnalisation fine des
   temps de marche, import des quittances.

## 10. Prochaines étapes concrètes

1. Extraire le tracé (relation OSM 101692 via Overpass) et construire le graphe
   waypoints/segments ; précalculer les profils altimétriques (API IGN).
2. Constituer la base hébergements (14 refuges PNRC + ~30 privés) avec formules et tarifs
   2026 — en re-validant les points signalés douteux (dortoirs Ortu di u Piobbu / Asinau,
   téléphones des bergeries).
3. Ossature Nuxt 4 + @nuxt/ui : pages Tabloguide, carte, comparateur, planificateur.
4. Cartographier le tunnel pnr-resa (XHR) pour écrire le script de scan.

---

### Sources principales
[gr-go.fr](https://gr-go.fr/) · [gr-go GR20](https://gr-go.fr/grande-randonnee/gr20/) ·
[pnr-resa.corsica](https://pnr-resa.corsica/) + [CGV](https://pnr-resa.corsica/CGV.pdf) ·
[FFRandonnée — ouverture résa 2026](https://www.ffrandonnee.fr/s-informer/actualites/gr-20-ouverture-des-reservations-pour-la-saison-2026) ·
[gr20-infos.com](https://gr20-infos.com/) ([hébergements](https://gr20-infos.com/hebergements/), [prix 2026](https://gr20-infos.com/gr20-2026-les-prix/)) ·
[treksimple.fr — refuges](https://www.treksimple.fr/gr20/guide/refuges) ·
[mongr20.com](https://mongr20.com/) · [objectif-gr20.fr](https://objectif-gr20.fr/refuges-gr20/) ·
[livre-gr20-corse.com](https://livre-gr20-corse.com/etapes) ·
[camptocamp — refuges complets](https://forum.camptocamp.org/t/gr20-refuges-complets/346800) ·
[FFRandonnée — propriété intellectuelle](https://www.ffrandonnee.fr/la-federation/qui-sommes-nous/la-propriete-intellectuelle-federale) ·
[OSM relation 101692](https://www.openstreetmap.org/relation/101692) ·
[Géoplateforme IGN](https://geoservices.ign.fr/services-web) ·
[Open-Meteo Météo-France](https://open-meteo.com/en/docs/meteofrance-api) ·
[refuges.info API](https://www.refuges.info/api/doc/)
