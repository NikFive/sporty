import preact from '@preact/preset-vite'
import yaml from '@rollup/plugin-yaml'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const BG = '#121318'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    preact(),
    yaml(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Sporty — план к 70.3',
        short_name: 'Sporty',
        description: 'План тренировок к 70.3',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: BG,
        theme_color: BG,
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,ico}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
})
