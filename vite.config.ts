import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { excalidrawRichText } from './scripts/excalidraw-rich-text.ts'

// https://vite.dev/config/
export default defineConfig({
  define: { __VUE_OPTIONS_API__: true, __VUE_PROD_DEVTOOLS__: false, __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false },
  plugins: [excalidrawRichText(), react()],
})
