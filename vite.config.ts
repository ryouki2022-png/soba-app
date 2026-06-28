import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages（https://<ユーザー名>.github.io/soba-app/）で正しく
  // アセットを読み込むためのベースパス。
  base: "/soba-app/",
  plugins: [
    react(),
    // ホーム画面に追加するとアプリのように全画面で起動できるようにする（PWA）
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "そば記録",
        short_name: "そば記録",
        description: "食べたそばを記録するアプリ",
        lang: "ja",
        theme_color: "#5a7d4f",
        background_color: "#f6f1e7",
        display: "standalone",
        orientation: "portrait",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
})
