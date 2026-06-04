import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

function runTesseractSetup() {
  try {
    execSync('node scripts/setup-tesseract-public.mjs', {
      cwd: root,
      stdio: 'inherit',
    })
  } catch (e) {
    console.warn('[vite] setup:tesseract falhou — o app tentará CDN:', e.message)
  }
}

/** Copia/baixa arquivos OCR para public/ antes do dev e do build */
function tesseractSetupPlugin() {
  return {
    name: 'logrotas-tesseract-setup',
    buildStart() {
      runTesseractSetup()
    },
    configureServer() {
      runTesseractSetup()
    },
  }
}

export default defineConfig({
  plugins: [tesseractSetupPlugin(), react()],
})
