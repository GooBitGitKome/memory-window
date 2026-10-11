import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [react(), VitePWA({
    injectRegister: false,
    registerType: 'prompt',
    includeAssets: ['window-icon.svg'],
    manifest: {
      name: '思い出の窓', short_name: '思い出の窓', lang: 'ja',
      description: '窓の向こうにある、静かで温かな小さな暮らし。',
      start_url: '/', scope: '/', display: 'standalone',
      background_color: '#ffffff', theme_color: '#ffffff',
      icons: [{ src: '/window-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png}'],
      maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      cleanupOutdatedCaches: true,
      navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
      runtimeCaching: [],
    },
  })],
});
