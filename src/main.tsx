import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { resetMockDataSource } from './data'

// The mock backend persists everything, so there needs to be a way back to a
// blank slate. Development only — `import.meta.env.DEV` is false in a build, so
// this whole block is stripped out.
if (import.meta.env.DEV) {
  Object.defineProperty(window, 'haunt', {
    value: {
      /** Wipes the prototype's data and reloads from the fixtures. */
      reset() {
        resetMockDataSource()
        window.location.reload()
      },
    },
    configurable: true,
  })
}

/*
 * Ask the browser to keep our storage, and don't wait for the answer.
 *
 * The entire account lives in one localStorage key — Supabase's refresh token —
 * and there is no server-side way back in, because the recovery code is derived
 * rather than stored. So an eviction is not an inconvenience, it is account loss.
 * Chromium grants this silently once a site has any engagement; Safari ties it to
 * the app being on the Home Screen, which is also where its seven-day cap on
 * script-writable storage stops applying.
 */
void navigator.storage?.persist?.()?.catch(() => undefined)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
