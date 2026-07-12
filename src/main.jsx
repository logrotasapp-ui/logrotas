import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './src/app.jsx'

registerSW({
  immediate: true,
  onRegisteredSW() {
    // autoUpdate no vite.config só recarrega quando há build novo
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
