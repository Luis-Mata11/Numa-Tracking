// routes/api/mapproxy.js
const express = require('express');
const router  = express.Router();

const GMAPS_KEY = process.env.GOOGLE_MAPS_KEY || process.env.GMAPS_STATIC_KEY || '';

router.get('/', async (req, res) => {
    if (!GMAPS_KEY) {
        return res.status(503).json({ error: 'GOOGLE_MAPS_KEY no configurada en el servidor.' });
    }

    try {
        const w = parseInt(req.query.w) || 700;
        const h = parseInt(req.query.h) || 280;

        // 1. Construimos la URL base sin URLSearchParams para evitar sobre-codificación
        let url = `https://maps.googleapis.com/maps/api/staticmap?size=${w}x${h}&scale=2&maptype=roadmap&key=${GMAPS_KEY}`;

        // 2. Trayecto planeado (polilínea) — Codificamos SOLO la polilínea
        if (req.query.polyline) {
            const encPoly = encodeURIComponent(req.query.polyline);
            // %7C es el código seguro para el separador "|"
            url += `&path=color:0x9E9E9Ecc%7Cweight:4%7Cenc:${encPoly}`;
        }

        // 3. Trayecto real (coordenadas crudas)
        if (req.query.path) {
            const encPath = encodeURIComponent(req.query.path);
            url += `&path=color:0x2196F3ff%7Cweight:5%7C${encPath}`;
        }

        // 4. Validación de longitud (Límite estricto de Google: 8192 caracteres)
        if (url.length > 8192) {
            console.warn(`[mapproxy] ⚠️ ADVERTENCIA: La URL supera los 8192 caracteres (${url.length}). Google rechazará esta petición.`);
            // Podríamos retornar un error 400 aquí, pero dejaremos que Google responda para ver el log.
        }

        // 5. Petición a Google
        const fetchFn = global.fetch || require('node-fetch');
        const imgRes  = await fetchFn(url);

        if (!imgRes.ok) {
            const errorText = await imgRes.text();
            console.error(`[mapproxy] Google Maps error (${imgRes.status}):`, errorText);
            return res.status(imgRes.status).json({ error: 'Error obteniendo imagen del mapa.' });
        }

        const contentType = imgRes.headers.get('content-type') || 'image/png';
        const buffer      = await imgRes.arrayBuffer();

        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=3600');
        res.send(Buffer.from(buffer));

    } catch (err) {
        console.error('[mapproxy] Error:', err);
        res.status(500).json({ error: 'Error interno en el proxy del mapa.' });
    }
});

module.exports = router;