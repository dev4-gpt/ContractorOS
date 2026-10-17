import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const entry = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:4000',
        ws: true
      }
    }
  },
  // The SSR build (prerender) takes its entry from --ssr; only the client build is multi-page.
  build: isSsrBuild
    ? {}
    : {
        rollupOptions: {
          input: {
            main: entry('./index.html'),
            console: entry('./console/index.html'),
            pricing: entry('./pricing/index.html')
          }
        }
      }
}));
