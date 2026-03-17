// mobile.js
require('dotenv').config();

const express      = require('express');
const path         = require('path');
const http         = require('http');
const { Server }   = require('socket.io');
const { io: ClientIO } = require('socket.io-client');
const fetch = global.fetch || require('node-fetch');

const app = express();
app.use(express.json());

const PUBLIC_DIR = path.join(__dirname, 'public_mobile');
app.use(express.static(PUBLIC_DIR));

app.get('/', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'mobile-login.html'));
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

const MAIN_SERVER = process.env.MAIN_SERVER_URL || 'http://localhost:4000';

// ── Proxy: login del chofer ───────────────────────────────────────────────────
app.post('/api/auth/driver/login', async (req, res) => {
    try {
        console.log(`[mobile] proxying driver login → ${MAIN_SERVER}/api/auth/driver/login`);
        const r = await fetch(`${MAIN_SERVER}/api/auth/driver/login`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(req.body)
        });
        const body = await r.json().catch(() => ({}));
        console.log(`[mobile] driver login response: ${r.status}`, body?.msg || body?.error || '');
        res.status(r.status).json(body);
    } catch (err) {
        console.error('[mobile] error proxying driver/login:', err.message);
        res.status(500).json({ error: 'Error de conexión con el servidor principal.' });
    }
});

app.post('/api/drivers/:id/login', async (req, res) => {
    try {
        const r = await fetch(
            `${MAIN_SERVER}/api/drivers/${encodeURIComponent(req.params.id)}/login`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body || {}) }
        );
        const body = await r.json().catch(() => ({}));
        res.status(r.status).json(body);
    } catch (err) {
        console.error('[mobile] proxy driver login:', err.message);
        res.status(500).json({ error: 'Error proxy driver login' });
    }
});

// ── HTTP + Socket.IO para navegadores móviles ─────────────────────────────────
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ── Socket.IO CLIENT → MAIN SERVER ───────────────────────────────────────────
// FIX: En Render los WebSockets entre servicios backend fallan.
// Usamos polling primero y dejamos que socket.io escale a websocket si puede.
const mainSocket = ClientIO(MAIN_SERVER, {
    reconnection:       true,
    reconnectionDelay:  3000,
    reconnectionAttempts: 10,
    transports:         ['polling', 'websocket'], // polling primero ← clave
    path:               '/socket.io'
});

mainSocket.on('connect', () =>
    console.log('[mobile→main] ✅ conectado:', mainSocket.id)
);
mainSocket.on('connect_error', (e) =>
    console.warn('[mobile→main] connect_error:', e?.message)
);
mainSocket.on('disconnect', (reason) =>
    console.warn('[mobile→main] desconectado:', reason)
);

// ── Reenvíos MAIN → móviles ───────────────────────────────────────────────────
const rebroadcast = (event, getRouteId) => {
    mainSocket.on(event, (payload) => {
        try {
            const routeId = getRouteId(payload);
            routeId
                ? io.to(String(routeId)).emit(event, payload)
                : io.emit(event, payload);
        } catch (e) {
            console.error(`[mobile] rebroadcast ${event}:`, e.message);
        }
    });
};

rebroadcast('routeStatusChanged', (p) => p?.id || p?._id || p?.route?._id);
rebroadcast('routeStarted',       (p) => p?.routeId);
rebroadcast('routeFinalized',     (p) => p?.routeId);
rebroadcast('locationUpdate',     (p) => p?.routeId);

// ── Conexiones de navegadores móviles ─────────────────────────────────────────
io.on('connection', (socket) => {
    console.log('[mobile.io] navegador móvil conectado:', socket.id);

    socket.on('joinRoute', ({ routeId, driverId }) => {
        if (!routeId) return;
        socket.join(String(routeId));
        socket.routeId  = routeId;
        socket.driverId = driverId || null;
        console.log(`[mobile.io] ${socket.id} → ruta ${routeId} (driver:${driverId})`);

        if (mainSocket?.connected) {
            mainSocket.emit('mobileConnected', { routeId, driverId, socketId: socket.id });
        }
    });

    socket.on('driverLocation', (data) => {
        try {
            if (!data) return;
            const payload = {
                lat:        Number(data.lat),
                lng:        Number(data.lng),
                timestamp:  data.timestamp  || Date.now(),
                driverId:   data.driverId   || socket.driverId || null,
                routeId:    data.routeId    || socket.routeId  || null,
                isOffRoute: data.isOffRoute || false,
                accuracy:   data.accuracy   || null,
                speed:      data.speed      || null,
                heading:    data.heading    || null
            };

            if (mainSocket?.connected) {
                mainSocket.emit('driverLocation', payload);
            } else {
                console.warn('[mobile] mainSocket desconectado — ubicación no enviada');
            }

            socket.emit('locationAck', { ok: true, ts: Date.now() });
        } catch (e) {
            console.error('[mobile] driverLocation:', e.message);
        }
    });

    socket.on('requestFinishRoute', (data) => {
        try {
            console.log(`[mobile.io] requestFinishRoute → reenviando a MAIN`);
            if (mainSocket?.connected) {
                mainSocket.emit('requestFinishRoute', data);
            } else {
                console.warn('[mobile] mainSocket desconectado — solicitud no enviada');
            }
        } catch (e) {
            console.error('[mobile] requestFinishRoute:', e.message);
        }
    });

    socket.on('disconnect', () => {
        console.log('[mobile.io] desconectado:', socket.id);
    });
});

// ── Arrancar servidor ──────────────────────────────────────────────────────────
const PORT = process.env.MOBILE_PORT || 8000;
server.listen(PORT, () => {
    console.log(`[mobile] escuchando en http://localhost:${PORT}`);
    console.log(`[mobile] MAIN_SERVER = ${MAIN_SERVER}`);
});