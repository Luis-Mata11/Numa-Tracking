// frontend/vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    root: '.',
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                // ─── Solo las páginas reales con su propio HTML ───────────────
                // Las vistas del router (routes.html, drivers.html, etc.) NO van
                // aquí — se importan como texto plano con ?raw desde router.js
                main:   resolve(__dirname, 'index.html'),
                login:  resolve(__dirname, 'login.html'),
                signup: resolve(__dirname, 'signUp.html'),
            }
        }
    },

    resolve: {
        alias: {
            '/js': resolve(__dirname, 'src/js'),
        }
    },

    server: {
        port: 5173,
        open: true,
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