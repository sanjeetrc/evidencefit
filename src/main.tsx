import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker, requestPersistentStorage } from './lib/persist'

// Data lives only in this browser: ask Chrome not to evict it, and cache the app shell for offline use.
void requestPersistentStorage()
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
