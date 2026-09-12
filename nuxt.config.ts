export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@vite-pwa/nuxt', '@nuxt/eslint'],
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
  css: ['~/assets/css/main.css'],
  routeRules: {
    '/': { prerender: true },
    '/carte': { prerender: true },
    '/hebergements': { prerender: true },
    // le plan vit dans localStorage : rendu client uniquement, mais HTML prérendu pour le précache
    '/plan': { ssr: false, prerender: true },
    '/meteo': { ssr: false, prerender: true },
  },
  compatibilityDate: '2026-07-01',
  eslint: { config: { stylistic: { braceStyle: '1tbs', arrowParens: true } } },
  icon: {
    // Hors ligne, une icône rendue côté client est demandée à `/api/_nuxt_icon`, que le service
    // worker ne précache pas : clientBundle embarque les SVG utilisés dans le bundle JS (précaché).
    // Les .ts sont scannés aussi : les *_META y déclarent la moitié des icônes de l'app.
    clientBundle: { scan: { globInclude: ['app/**/*.{vue,ts}'] } },
    // la collection lucide est installée en local : un repli réseau ne ferait qu'échouer hors ligne
    fallbackToApi: false,
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
      // assets buildés + tracés GeoJSON et snapshot de dispo (optionnel) de public/data/
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff2}', 'data/**/*.{json,geojson}'],
      navigateFallback: '/',
      navigateFallbackDenylist: [/^\/api\//],
      runtimeCaching: [
        {
          // Fonds de carte : Plan IGN et OSM seulement (en-tête CORS * → réponses non opaques).
          // OpenTopoMap est exclu : sans CORS, chaque tuile opaque est comptée ~7 Mo dans le quota.
          // Pas de purgeOnQuotaError : mieux vaut un échec d'écriture que le vidage des tuiles.
          urlPattern: /^https:\/\/(data\.geopf\.fr|tile\.openstreetmap\.org)\/.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'gr20-tuiles-carte',
            expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 },
            cacheableResponse: { statuses: [200] },
          },
        },
        {
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
          // regex non ancrée : workbox teste l'URL absolue
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
    devOptions: { enabled: false },
  },
})
