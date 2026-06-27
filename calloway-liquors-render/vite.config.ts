import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // DEPLOYMENT FIX: Vercel serves static assets from /public via its
      // CDN and does not support express.static() for a custom dist/
      // folder at all in production. Building directly into public/
      // means Vercel picks up the frontend automatically, with no extra
      // server-side serving logic needed at runtime on Vercel. Local dev
      // (npm run dev) is unaffected - it uses Vite's dev middleware
      // instead, never reading from this build output directly.
      outDir: 'public',
      emptyOutDir: true,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
