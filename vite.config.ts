import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages（https://<ユーザー名>.github.io/soba-app/）で正しく
  // アセットを読み込むためのベースパス。
  base: "/soba-app/",
  plugins: [react()],
})
