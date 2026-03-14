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
        // Asumiendo que estos dos SÍ están en la raíz del frontend:
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login.html'),
        
        // 👇 Le agregamos 'views/' a los que están dentro de la carpeta
        routes: resolve(__dirname, 'views/routes.html'),
        choferes: resolve(__dirname, 'views/choferes.html'),
        vehiculos: resolve(__dirname, 'views/vehiculos.html'),
        reportes: resolve(__dirname, 'views/reports.html'),
        configuraciones: resolve(__dirname, 'views/settings.html'),
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
