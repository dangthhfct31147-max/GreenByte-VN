import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';

  return {
    server: {
      port: 5173,
      strictPort: true,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      // Production optimizations
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: isProd,
          drop_debugger: isProd,
        },
      },
      // Code splitting for better caching
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            ui: ['framer-motion', 'lucide-react'],
          },
        },
      },
      // Target modern browsers for smaller bundle
      target: 'es2020',
      // Generate source maps for debugging (hidden in production)
      sourcemap: isProd ? 'hidden' : true,
      // Chunk size warnings
      chunkSizeWarningLimit: 500,
    },
    // Optimize dependencies
    optimizeDeps: {
      include: ['react', 'react-dom', 'framer-motion', 'lucide-react'],
    },
  };
});

