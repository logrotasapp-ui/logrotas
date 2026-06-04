import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './src/app.jsx'
import { ensureTesseractAssets, warmupOcrWorker } from './services/ocrService.js'

// Na abertura: prepara arquivos OCR (local ou download automático via CDN)
ensureTesseractAssets()
  .then(() => warmupOcrWorker())
  .then((r) => {
    if (!r?.ok) {
      console.warn('[LogRotas] Leitor OCR:', r?.error || 'indisponível')
    }
  })
  .catch((e) => console.warn('[LogRotas] OCR:', e))

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
