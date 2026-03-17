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

        let url = `https://maps.googleapis.com/maps/api/staticmap?size=${w}x${h}&scale=2&maptype=roadmap&key=${GMAPS_KEY}`;

        if (req.query.polyline) {
            const encPoly = encodeURIComponent(req.query.polyline);
            url += `&path=color:0x9E9E9Ecc%7Cweight:4%7Cenc:${encPoly}`;
        }

        // req.query.path llega decodificado por Express como "lat,lng|lat,lng"
        // Re-encodamos cada punto individualmente para que Google lo acepte
        if (req.query.path) {
            const pathSegments = req.query.path
                .split('|')
                .map(seg => encodeURIComponent(seg))
                .join('%7C');
            url += `&path=color:0x2196F3ff%7Cweight:5%7C${pathSegments}`;
        }

        if (url.length > 8192) {
            console.warn(`[mapproxy] ⚠️ URL supera 8192 chars (${url.length}). Google puede rechazarla.`);
        }

        const fetchFn = global.fetch || require('node-fetch');
        const imgRes  = await fetchFn(url);

        if (!imgRes.ok) {
            const errorText = await imgRes.text();
            console.error(`[mapproxy] Google Maps error (${imgRes.status}):`, errorText);
            return res.status(imgRes.status).json({ error: 'Error obteniendo imagen del mapa.' });
        }

        const contentType = imgRes.headers.get('content-type') || 'image/png';
        const buffer      = await imgRes.arrayBuffer();

        // ─── Headers necesarios para que el browser no bloquee la imagen ──────
        // Cross-Origin-Resource-Policy: permite que el frontend (distinto origen) cargue esta imagen
        // Access-Control-Allow-Origin: necesario para fetch() y html2canvas
        res.set('Content-Type',                  contentType);
        res.set('Cross-Origin-Resource-Policy',  'cross-origin');
        res.set('Access-Control-Allow-Origin',   '*');
        res.set('Cache-Control',                 'public, max-age=3600');
        // ─────────────────────────────────────────────────────────────────────

        res.send(Buffer.from(buffer));

    } catch (err) {
        console.error('[mapproxy] Error:', err);
        res.status(500).json({ error: 'Error interno en el proxy del mapa.' });
    }
});

module.exports = router;