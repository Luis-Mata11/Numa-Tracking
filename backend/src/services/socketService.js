// services/socketService.js
const mongoose     = require('mongoose');
const Route        = require('../models/Route');
const BitacoraRuta = require('../models/RouteLog');
const RecorridoReal = require('../models/RecorridoReal');

// ─── Configuración ────────────────────────────────────────────────────────────
// Tolerancia de desvío — 80m para absorber imprecisión GPS + diferencia de trazo
const DEVIATION_TOLERANCE_METERS = 80;

// Debounce: tiempo mínimo en ms entre registro de un desvío y su reingreso
// Evita que fluctuaciones GPS de 1-2 segundos generen pares desvío/reingreso
const DEVIATION_DEBOUNCE_MS = 30000; // 30 segundos

// Seguimiento en memoria del estado de desvío por ruta (evita consultas a BD en cada ping)
// { [routeId]: { isOffRoute: bool, lastChangeTime: Date, lastDeviationCount: number } }
const deviationState = {};

// ─── Helper: Haversine ────────────────────────────────────────────────────────
function calcDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Helper: normalizar estado ────────────────────────────────────────────────
function normalizeRouteStatus(route) {
    const obj = route.toObject ? route.toObject() : route;
    const statusMap = {
        'pending':   'pendiente',
        'active':    'en curso',
        'cancelled': 'cancelada',
        'completed': 'finalizada',
        'inactive':  'inactiva'
    };
    const status = obj.status || 'pending';
    obj.estado = statusMap[status] || 'pendiente';
    return obj;
}

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log('🔌 Cliente conectado a Socket.io:', socket.id);

        // ── MÓVIL: chofer ingresó al lobby de la ruta ─────────────────────────
        socket.on('mobileConnected', async (payload) => {
            try {
                const routeId  = payload?.routeId;
                const driverId = payload?.driverId;
                if (!routeId) return;

                const route = await Route.findById(routeId).populate('vehicle').populate('driver');
                if (!route) return;

                const normalized = normalizeRouteStatus(route);
                io.to(String(routeId)).emit('routeStatusChanged',
                    Object.assign({}, normalized, { estado: 'Lista para iniciar', action: 'ready' })
                );
                io.emit('routeReady', {
                    routeId:  String(routeId),
                    driverId,
                    message:  'Ruta marcada como lista para iniciar por el chofer'
                });

                // FIX: evitar duplicados — solo registrar si el último evento de esta
                // ruta NO es ya un 'start'
                const ultimoBitacora = await BitacoraRuta
                    .findOne({ routeId })
                    .sort({ timestamp: -1 })
                    .select('action');

                if (!ultimoBitacora || ultimoBitacora.action !== 'start') {
                    await BitacoraRuta.create({
                        routeId,
                        action:      'start',
                        description: 'Chofer ingresó a la sala de espera de la ruta',
                        timestamp:   new Date()
                    }).catch(e => console.error('[io] bitácora mobileConnected:', e));
                }

            } catch (e) { console.error('[io] mobileConnected:', e); }
        });

        // ── SALA: unirse a una ruta ───────────────────────────────────────────
        socket.on('joinRoute', ({ routeId, driverId }) => {
            try {
                if (!routeId) return;
                socket.join(String(routeId));
                socket.routeId  = routeId;
                socket.driverId = driverId || null;
                console.log(`[io] ${socket.id} se unió a ruta ${routeId} (driver:${driverId})`);
                socket.emit('joinedRoute', { routeId: String(routeId), ok: true });
            } catch (e) { console.error('[io] joinRoute:', e); }
        });

        // ── GPS: ubicación del chofer ─────────────────────────────────────────
        socket.on('driverLocation', async (payload) => {
            try {
                if (!payload?.routeId) return;

                const lat = payload.lat ?? payload.location?.lat;
                const lng = payload.lng ?? payload.location?.lng;
                if (!lat || !lng) return;

                const routeIdStr = String(payload.routeId);
                const driverId   = payload.driverId || null;

                // 1. Reenviar al dashboard en tiempo real
                io.to(routeIdStr).emit('locationUpdate', payload);

                // 2. Alerta de desvío en tiempo real (sin filtro — el dashboard la necesita)
                if (payload.isOffRoute) {
                    io.emit('routeDeviationAlert', {
                        routeId:   payload.routeId,
                        driverId:  payload.driverId,
                        location:  { lat, lng },
                        timestamp: payload.timestamp,
                        message:   '⚠️ Chofer fuera de ruta'
                    });
                }

                // 3. Convertir routeId a ObjectId
                let routeObjectId;
                try {
                    routeObjectId = new mongoose.Types.ObjectId(String(payload.routeId));
                } catch (e) {
                    console.error('[io] routeId inválido:', payload.routeId);
                    return;
                }

                // 4. Buscar o crear RecorridoReal activo
                let recorrido = await RecorridoReal.findOne({
                    routeId: routeObjectId,
                    status:  'activo'
                });

                if (!recorrido) {
                    recorrido = await RecorridoReal.create({
                        routeId:    routeObjectId,
                        driverId,
                        status:     'activo',
                        posiciones: []
                    });
                    console.log(`🗺️  RecorridoReal creado para ruta ${payload.routeId}`);
                }

                // 5. Filtro anti-ruido: descartar coordenada idéntica
                const ultima = recorrido.posiciones[recorrido.posiciones.length - 1];
                if (ultima) {
                    const mismaLat = Math.abs(ultima.lat - parseFloat(lat)) < 0.000001;
                    const mismaLng = Math.abs(ultima.lng - parseFloat(lng)) < 0.000001;
                    if (mismaLat && mismaLng) return;
                }

                // 6. $push posición (sin incrementar desviaciones por punto — se hace por incidente)
                await RecorridoReal.updateOne(
                    { _id: recorrido._id },
                    {
                        $push: {
                            posiciones: {
                                lat:        parseFloat(lat),
                                lng:        parseFloat(lng),
                                accuracy:   payload.accuracy  || null,
                                speed:      payload.speed     || null,
                                heading:    payload.heading   || null,
                                isOffRoute: payload.isOffRoute || false,
                                timestamp:  payload.timestamp ? new Date(payload.timestamp) : new Date()
                            }
                        }
                    }
                );

                // ── 7. LÓGICA DE DESVÍOS CON DEBOUNCE ────────────────────────
                // Usamos estado en memoria para no consultar BD en cada ping GPS
                const state = deviationState[routeIdStr] || {
                    isOffRoute:      false,
                    lastChangeTime:  0,
                    incidentCount:   0
                };

                const ahora        = Date.now();
                const isOffNow     = payload.isOffRoute || false;
                const tiempoDesde  = ahora - state.lastChangeTime;

                if (isOffNow && !state.isOffRoute && tiempoDesde > DEVIATION_DEBOUNCE_MS) {
                    // 🔴 NUEVO DESVÍO — chofer salió del trayecto y han pasado >30s desde el último
                    state.isOffRoute     = true;
                    state.lastChangeTime = ahora;
                    state.incidentCount  = (state.incidentCount || 0) + 1;

                    // Incrementar contador de incidentes en BD (1 por incidente, no por punto)
                    await RecorridoReal.updateOne(
                        { _id: recorrido._id },
                        { $inc: { desviaciones: 1 } }
                    );

                    await BitacoraRuta.create({
                        routeId:     routeObjectId,
                        action:      'desvio',
                        description: 'Chofer fuera del trayecto planeado',
                        location:    { lat: parseFloat(lat), lng: parseFloat(lng) },
                        timestamp:   new Date()
                    }).catch(e => console.error('[io] bitácora desvío:', e));

                    console.log(`⚠️  Desvío #${state.incidentCount} registrado en ruta ${routeIdStr}`);

                } else if (!isOffNow && state.isOffRoute && tiempoDesde > DEVIATION_DEBOUNCE_MS) {
                    // ✅ REINGRESO — chofer volvió al trayecto y han pasado >30s
                    state.isOffRoute     = false;
                    state.lastChangeTime = ahora;

                    await BitacoraRuta.create({
                        routeId:     routeObjectId,
                        action:      'reingreso',
                        description: 'Chofer regresó al trayecto',
                        location:    { lat: parseFloat(lat), lng: parseFloat(lng) },
                        timestamp:   new Date()
                    }).catch(e => console.error('[io] bitácora reingreso:', e));

                    console.log(`✅  Reingreso registrado en ruta ${routeIdStr}`);
                }

                // Persistir estado en memoria
                deviationState[routeIdStr] = state;

            } catch (e) { console.error('[io] driverLocation:', e); }
        });

        // ── SOLICITUD DE FINALIZACIÓN (chofer → admin) ────────────────────────
        socket.on('requestFinishRoute', (data) => {
            try {
                (async () => {
                    try {
                        let routeName  = null;
                        let driverName = null;
                        if (data?.routeId) {
                            const route = await Route.findById(data.routeId).populate('driver');
                            if (route) {
                                routeName  = route.name || String(route._id);
                                driverName = route.driver?.nombre || route.driver?.name || null;
                            }
                        }
                        io.emit('finishRouteRequested', {
                            routeId:    data.routeId,
                            driverId:   data.driverId,
                            routeName,
                            driverName,
                            timestamp:  Date.now(),
                            message:    'Solicitud de finalización pendiente de aprobación'
                        });
                    } catch (e) {
                        console.error('[io] requestFinishRoute lookup:', e);
                        io.emit('finishRouteRequested', {
                            routeId:   data.routeId,
                            driverId:  data.driverId,
                            timestamp: Date.now()
                        });
                    }
                })();
            } catch (e) { console.error('[io] requestFinishRoute:', e); }
        });

        // ── ADMIN RESUELVE LA SOLICITUD ───────────────────────────────────────
        socket.on('resolveFinishRequest', async (data) => {
            try {
                const { routeId, accepted } = data;

                if (accepted) {
                    const updated = await Route.findByIdAndUpdate(
                        routeId,
                        { $set: { status: 'completed' } },
                        { new: true }
                    ).populate('vehicle').populate('driver');

                    if (updated) {
                        const normalized = normalizeRouteStatus(updated);
                        io.emit('routeFinalized',     { routeId, message: 'Ruta finalizada', route: normalized });
                        io.emit('routeStatusChanged',  { action: 'status', route: normalized });

                        await _cerrarRecorrido(routeId);

                        // Limpiar estado de desvío en memoria al finalizar
                        delete deviationState[String(routeId)];

                        await BitacoraRuta.create({
                            routeId,
                            action:      'complete',
                            description: 'Administrador aprobó la finalización de la ruta',
                            timestamp:   new Date()
                        }).catch(e => console.error('[io] bitácora finalizacion_aprobada:', e));
                    }
                } else {
                    io.emit('finishRouteRejected', { routeId, message: 'Solicitud rechazada' });
                    await BitacoraRuta.create({
                        routeId,
                        action:      'stop',
                        description: 'Administrador rechazó la solicitud de finalización',
                        timestamp:   new Date()
                    }).catch(e => console.error('[io] bitácora finalizacion_rechazada:', e));
                }
            } catch (e) { console.error('[io] resolveFinishRequest:', e); }
        });

        socket.on('disconnect', () => {
            console.log('🔌 Cliente desconectado:', socket.id);
        });
    });
};

// ─── Cierra RecorridoReal y calcula distancia total ───────────────────────────
async function _cerrarRecorrido(routeId) {
    try {
        const recorrido = await RecorridoReal.findOne({ routeId, status: 'activo' });
        if (!recorrido) return;

        let distanciaTotal = 0;
        const pts = recorrido.posiciones;
        for (let i = 1; i < pts.length; i++) {
            distanciaTotal += calcDistance(
                pts[i-1].lat, pts[i-1].lng,
                pts[i].lat,   pts[i].lng
            );
        }

        await RecorridoReal.updateOne(
            { _id: recorrido._id },
            {
                $set: {
                    status:          'completado',
                    endTime:         new Date(),
                    distanciaMetros: Math.round(distanciaTotal)
                }
            }
        );
        console.log(`🏁 RecorridoReal cerrado para ruta ${routeId} — ${Math.round(distanciaTotal)}m`);
    } catch (e) {
        console.error('[io] _cerrarRecorrido:', e);
    }
}