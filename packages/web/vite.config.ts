import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The same client build runs on GitHub Pages and behind the loopback CLI server.
export default defineConfig({
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  base: process.env.JLEDGER_BASE_PATH || '/',
  plugins: [
    tanstackStart({
      prerender: { enabled: true, autoStaticPathsDiscovery: false },
      pages: [
        {
          path: '/',
          prerender: {
            enabled: true,
            outputPath: '/index.html',
            crawlLinks: false,
          },
        },
      ],
    }),
    react(),
    tailwindcss(),
  ],
  server: { port: 3000 },
});
