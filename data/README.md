# Données GR20

## Provenance et licences

- **Tracé** : relation OpenStreetMap [101692](https://www.openstreetmap.org/relation/101692)
  (superroute « GR 20 », membre principal 12484370, variante Monte Incudine 1771390).
  Ordre des tronçons via l'API [Waymarked Trails](https://hiking.waymarkedtrails.org/),
  géométrie pleine résolution via [Overpass](https://overpass-api.de/).
  Licence **ODbL** — « © les contributeurs OpenStreetMap ».
- **Altitudes** : API altimétrique IGN Géoplateforme (RGE ALTI®), licence **Etalab 2.0** — mention « IGN ».
- **Hébergements & tarifs** : compilation manuelle (sources croisées : pnr-resa.corsica,
  gr20-infos.com, treksimple.fr, refuges.info, sites des établissements), vérifiée pour la
  saison 2026. Données volatiles — à re-vérifier chaque saison.
- **Notes Google** (`google-ratings.json`) : relevé manuel des fiches Google Maps, à titre
  indicatif (note, nombre d'avis, lien vers la fiche) ; pas de contenu d'avis.

Les compilations manuelles de ce dossier sont publiées sous la même licence que le code (MIT) ;
les tracés restent sous ODbL et leurs altitudes sous Etalab 2.0 (cf. [LICENSE](../LICENSE)).

## Fichiers

| Fichier | Contenu | Généré par |
|---|---|---|
| `raw/waymarked-*.json` | Réponses brutes API Waymarked Trails | `curl` (manuel) |
| `raw/trace-main.geojson` | Tracé principal assemblé, WGS84 | `scripts/fetch-trace.mjs` |
| `raw/trace-var-incudine.geojson` | Variante Monte Incudine | `scripts/fetch-trace.mjs` |
| `raw/trace-*-elev.geojson` | Tracés + altitudes IGN | `scripts/add-elevation.mjs` |
| `waypoints.json` | Nœuds du graphe (lieux de nuitée, accès) | manuel |
| `segments.json` | Arcs du graphe : géométrie, distance, D+/D-, temps | `scripts/build-segments.mjs` |
| `accommodations.json` | Hébergements + formules + tarifs 2026 | manuel (vérifié par recherche) |
| `google-ratings.json` | Notes Google des 31 hébergements, refuges PNRC inclus (note, nb d'avis, lien Maps) | manuel — fiches Google Maps ouvertes une à une et désambiguïsées (adresse/tél/coordonnées), relevé du 24 juil. 2026 |
