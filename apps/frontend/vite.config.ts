import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// the app's version, which the release sets in the root package.json
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    // SF Symbols are licensed for Apple platforms only: a Windows build ships the Fluent icons alone
    {
      name: 'no-sf-symbols-on-windows',
      apply: 'build',
      closeBundle() {
        if (process.platform === 'win32') rmSync(fileURLToPath(new URL('./dist/sf', import.meta.url)), { recursive: true, force: true });
      }
    }
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        ws: true,
        xfwd: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 2000
  }
});
