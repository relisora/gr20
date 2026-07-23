export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'Fra li Monti — planificateur GR20',
      htmlAttrs: { lang: 'fr' },
      meta: [{ name: 'description', content: 'Planification du GR20 : étapes, carte, hébergements, réservations' }],
    },
  },
  compatibilityDate: '2026-07-01',
})
