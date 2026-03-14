// frontend/vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  build: {
    // 👇 CAMBIO 1: Dejamos 'dist' adentro de la carpeta frontend
    outDir: 'dist', 
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login.html'),
        routes: resolve(__dirname, 'routes.html'),
        choferes: resolve(__dirname, 'choferes.html'),
        vehiculos: resolve(__dirname, 'vehiculos.html'),
        reportes: resolve(__dirname, 'reports.html'),
        configuraciones: resolve(__dirname, 'settings.html'),
      },
    },
  },

  resolve: {
    alias: {
      '/js': resolve(__dirname, 'src/js'),
    },
  },

  server: {
    port: 5173,
    open: true,
    // 👇 Esto seguirá funcionando perfecto para tu DESARROLLO LOCAL
    // Pero en PRODUCCIÓN, Render ignorará esto por completo.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      }
    }
  }
});