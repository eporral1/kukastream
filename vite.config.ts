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
    envPrefix: ['VITE_', 'SITE_', 'GA_'],
    define: {
      'process.env.SITE_NAME': JSON.stringify(
        process.env.SITE_NAME || process.env.VITE_SITE_NAME || 'StreamData'
      ),
      'process.env.GA_ID': JSON.stringify(
        process.env.GA_ID || process.env.VITE_GA_ID || process.env.GA_MEASUREMENT_ID || ''
      ),
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
