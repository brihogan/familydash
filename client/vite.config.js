import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: {
    // Ensure emoji and other Unicode characters are preserved in build output
    cssTarget: 'safari15',
    target: 'es2020',
  },
  plugins: [
    react(),
    // Add charset=utf-8 to script tags for Capacitor WKWebView compatibility
    {
      name: 'html-charset',
      transformIndexHtml(html) {
        return html.replace(/<script(?=[\s>])/g, '<script charset="utf-8"');
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Family Dash',
        short_name: 'Family Dash',
        description: 'Family chores, banking, tickets & rewards dashboard',
        theme_color: '#6366f1',
        background_color: '#f9fafb',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  server: {
    allowedHosts: true,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.VITE_API_PORT || '3001'}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `http://localhost:${process.env.VITE_API_PORT || '3001'}`,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
