import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    // While developing, "npm run dev" (the screen) talks to "npm run server" (the backend) on port 3000.
    proxy: { '/api': 'http://localhost:3000' },
  },
})
