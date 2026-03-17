// mobile.js
require('dotenv').config();

const express  = require('express');
const path     = require('path');
const http     = require('http');
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

// ── Proxy: login del chofer ────────────────────────────────────────────────
app.post('/api/auth/driver/login', async (req, res) => {
    try {
        const r = await fetch(`${MAIN_SERVER}/api/auth/driver/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        const body = await r.json().catch(() => ({}));
        res.status(r.status).json(body);
    } catch (err) {
        console.error('[mobile] error proxying driver/login', err);
        res.status(500).json({ error: 'Error proxy login' });
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
        console.error('[mobile] proxy driver login', err);
        res.status(500).json({ error: 'Error proxy driver login' });
    }
});

// ── HTTP + Socket.IO para navegadores móviles ─────────────────────────────
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ── Socket.IO CLIENT → MAIN SERVER ───────────────────────────────────────
const mainSocket = ClientIO(MAIN_SERVER, {
    reconnection: true,
    transports: ['websocket', 'polling']
});

mainSocket.on('connect',       () => console.log('[mobile→main] conectado:', mainSocket.id));
mainSocket.on('connect_error', (e) => console.warn('[mobile→main] connect_error', e?.message));

// ── Reenvíos MAIN → móviles ───────────────────────────────────────────────
mainSocket.on('routeStatusChanged', (payload) => {
    try {
        const routeId = payload?.id || payload?._id || payload?.route?._id;
        routeId
            ? io.to(String(routeId)).emit('routeStatusChanged', payload)
            : io.emit('routeStatusChanged', payload);
    } catch (e) { console.error('[mobile] rebroadcast routeStatusChanged', e); }
});

mainSocket.on('routeStarted', (payload) => {
    try {
        const routeId = payload?.routeId;
        routeId
            ? io.to(String(routeId)).emit('routeStarted', payload)
            : io.emit('routeStarted', payload);
    } catch (e) { console.error('[mobile] rebroadcast routeStarted', e); }
});

mainSocket.on('routeFinalized', (payload) => {
    try {
        const routeId = payload?.routeId;
        routeId
            ? io.to(String(routeId)).emit('routeFinalized', payload)
            : io.emit('routeFinalized', payload);
    } catch (e) { console.error('[mobile] rebroadcast routeFinalized', e); }
});

mainSocket.on('locationUpdate', (payload) => {
    try {
        const routeId = payload?.routeId;
        routeId
            ? io.to(String(routeId)).emit('locationUpdate', payload)
            : io.emit('locationUpdate', payload);
    } catch (e) { console.error('[mobile] rebroadcast locationUpdate', e); }
});

// ── Conexiones de navegadores móviles ────────────────────────────────────
io.on('connection', (socket) => {
    console.log('[mobile.io] navegador móvil conectado', socket.id);

    // Chofer se une a la sala de su ruta
    socket.on('joinRoute', ({ routeId, driverId }) => {
        if (!routeId) return;
        socket.join(String(routeId));
        socket.routeId  = routeId;
        socket.driverId = driverId || null;
        console.log(`[mobile.io] ${socket.id} → ruta ${routeId} (driver:${driverId})`);

        // Avisar al servidor principal que el chofer está conectado
        mainSocket.emit('mobileConnected', { routeId, driverId, socketId: socket.id });
        // 🗑️ ELIMINADO: fetch a /api/bitacoraRuta aquí (el endpoint no existe y
        //    socketService.js ya registra este evento en BitacoraRuta automáticamente)
    });

    // GPS del chofer → reenviar al servidor principal
    // 🔑 CAMBIO CLAVE: Ya NO llamamos fetch('/api/bitacoraRuta') en cada ping.
    //    socketService.js es el único responsable de persistir las posiciones
    //    en RecorridoReal con $push.
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
            console.error('[mobile] driverLocation', e);
        }
    });

    // Solicitud de finalización: reenviar al admin en MAIN SERVER
    socket.on('requestFinishRoute', (data) => {
        try {
            console.log(`[mobile.io] requestFinishRoute de ${socket.id} → reenviando a MAIN`);
            if (mainSocket?.connected) {
                mainSocket.emit('requestFinishRoute', data);
            } else {
                console.warn('[mobile] mainSocket desconectado — solicitud no enviada');
            }
            // 🗑️ ELIMINADO: fetch a /api/bitacoraRuta (mismo motivo que arriba)
        } catch (e) {
            console.error('[mobile] requestFinishRoute', e);
        }
    });

    socket.on('disconnect', () => {
        console.log('[mobile.io] desconectado', socket.id);
    });
});

// ── Arrancar servidor ─────────────────────────────────────────────────────
const PORT = process.env.MOBILE_PORT || 8000;
server.listen(PORT, () => {
    console.log(`[mobile] escuchando en http://localhost:${PORT} (sirve ${PUBLIC_DIR})`);
    console.log(`[mobile] proxying a MAIN_SERVER=${MAIN_SERVER}`);
});