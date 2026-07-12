import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// アプリの新しいバージョンを自動で取り込む。
// PWA はキャッシュで動くため、何もしないと古い画面のまま使い続けてしまう。
// 起動時・画面へ戻ってきたとき・1時間ごとに更新を確認し、
// 新しいバージョンが見つかったら自動で入れ替わる（registerType: autoUpdate）。
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = () => {
      registration.update().catch(() => {
        /* オフラインなどで確認できないときは次の機会に */
      })
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
    setInterval(check, 60 * 60 * 1000)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
