import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config'

const bg = '#11100e'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...preset,
    // maskable: фон до краёв + поле, чтобы столбики попали в безопасный круг (80%)
    maskable: { ...preset.maskable, padding: 0.2, resizeOptions: { background: bg } },
    // apple: iOS сам скругляет углы, фон тот же — поле не нужно
    apple: { ...preset.apple, padding: 0, resizeOptions: { background: bg } },
  },
  images: ['public/icon.svg'],
})
