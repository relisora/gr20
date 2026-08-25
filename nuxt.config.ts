export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@vite-pwa/nuxt'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'Fra li Monti — planificateur GR20',
      htmlAttrs: { lang: 'fr' },
      meta: [
        { name: 'description', content: 'Planification du GR20 : étapes, carte, hébergements, réservations' },
        { name: 'theme-color', content: '#059669' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico', sizes: '48x48' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/manifest.webmanifest' },
      ],
    },
  },
  icon: {
    // Icônes hors ligne. @nuxt/icon rend une icône en CSS (`<span class="iconify i-lucide:bed">` +
    // masque SVG injecté dans un <style>) : le SVG doit donc être disponible au moment du rendu.
    // En SSR il est inliné dans l'HTML prérendu, mais tout ce qui est rendu côté client — /plan
    // (ssr: false), les navigations internes, les icônes conditionnelles (météo, dispo, alertes) —
    // le réclame à `/api/_nuxt_icon`, une requête réseau que le service worker ne précache pas :
    // hors ligne, ces icônes n'apparaissent jamais. clientBundle embarque les SVG dans le bundle JS,
    // lui précaché. Sans ça, seules les 43 icônes par défaut de Nuxt UI (ajoutées par son hook
    // `icon:clientBundleIcons`) survivent hors ligne, pas celles de l'app.
    clientBundle: {
      // scan des sources pour n'embarquer que les icônes réellement utilisées. globInclude est
      // surchargé car les .ts ne sont PAS scannés par défaut, alors que les *_META
      // (app/utils/format.ts, useDispo, usePlan) y déclarent la moitié des icônes de l'app.
      scan: { globInclude: ['app/**/*.{vue,ts}'] },
    },
    // aucun repli sur api.iconify.design : la collection lucide est installée en local
    // (@iconify-json/lucide), un aller-retour réseau ne ferait qu'attendre puis échouer hors ligne.
    fallbackToApi: false,
  },
  routeRules: {
    // rendu au build : HTML statique précachable → chargement hors ligne des 4 pages
    '/': { prerender: true },
    '/carte': { prerender: true },
    '/hebergements': { prerender: true },
    // le plan vit dans localStorage : rendu client uniquement (pas d'hydratation à risque)
    '/plan': { ssr: false, prerender: true },
    // même contrainte : la page météo lit le plan (localStorage) et Open-Meteo côté client
    '/meteo': { ssr: false, prerender: true },
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Fra li Monti — GR20',
      short_name: 'Fra li Monti',
      description: 'Planification et suivi hors ligne du GR20 : étapes, carte, hébergements, météo',
      lang: 'fr',
      dir: 'ltr',
      display: 'standalone',
      start_url: '/',
      scope: '/',
      theme_color: '#059669',
      background_color: '#064e3b',
      categories: ['travel', 'sports', 'navigation'],
      icons: [
        { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // assets buildés + tracés GeoJSON et snapshot dispo de public/data/
      // (dispo-snapshot.json est optionnel : le glob l'inclut s'il existe, sans faire échouer le build)
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff2}', 'data/**/*.{json,geojson}'],
      // navigation hors ligne : chaque page prerendue est servie depuis son propre HTML précaché ;
      // '/' sert de repli pour toute route non précachée (les routes /api restent hors du repli)
      navigateFallback: '/',
      navigateFallbackDenylist: [/^\/api\//],
      runtimeCaching: [
        {
          // fonds de carte hors ligne : Plan IGN et OSM (en-tête CORS *, réponses non opaques) —
          // remplir le cache en parcourant le tracé avant de partir. OpenTopoMap est volontairement
          // exclu (aucun en-tête CORS → réponses opaques qui gonflent le quota) : il reste en ligne
          // uniquement. statuses [200] seulement (plus de réponse opaque à accepter) ; pas de
          // purgeOnQuotaError : en cas de dépassement on préfère l'échec d'écriture au vidage des tuiles.
          urlPattern: /^https:\/\/(data\.geopf\.fr|tile\.openstreetmap\.org)\/.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'gr20-tuiles-carte',
            expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 },
            cacheableResponse: { statuses: [200] },
          },
        },
        {
          // météo Open-Meteo : réseau d'abord (5 s), sinon dernière prévision connue (jusqu'à 24 h)
          urlPattern: /^https:\/\/api\.open-meteo\.com\/.*/i,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'gr20-meteo',
            networkTimeoutSeconds: 5,
            expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          // snapshot de dispo servi par /api/dispo : réseau d'abord, sinon dernier snapshot en cache.
          // regex NON ancrée : workbox teste l'URL absolue (https://hôte/api/dispo), un ^ ne matcherait
          // jamais. ignoreSearch : matche même avec une éventuelle query string.
          urlPattern: /\/api\/dispo/,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'gr20-dispo',
            networkTimeoutSeconds: 5,
            expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 30 },
            cacheableResponse: { statuses: [0, 200] },
            matchOptions: { ignoreSearch: true },
          },
        },
      ],
    },
    devOptions: {
      enabled: false,
    },
  },
  compatibilityDate: '2026-07-01',
})
