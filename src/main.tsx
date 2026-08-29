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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
