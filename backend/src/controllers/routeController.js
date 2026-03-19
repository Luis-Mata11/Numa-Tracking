// controllers/routeController.js
// ÚNICO CAMBIO: getRoutes ahora lee RecorridoReal en lugar de BitacoraRuta para recorridoReal.
// El resto de las funciones (createRoute, updateRoute, etc.) no cambia.

const Route = require('../models/Route');
const Trayecto = require('../models/Trayecto');
const BitacoraRuta = require('../models/RouteLog');
const RecorridoReal = require('../models/RecorridoReal'); // 🆕

const generate6DigitCode = () =>
    Math.floor(100000 + Math.random() * 900000).toString();

const normalizeRouteStatus = (routeDoc) => {
    const route = routeDoc.toObject ? routeDoc.toObject() : routeDoc;
    return {
        ...route,
        vehicle: route.vehicle || null,
        driver: route.driver || null,
        trayecto: route.trayecto || null
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/routes
// ─────────────────────────────────────────────────────────────────────────────
exports.getRoutes = async (req, res) => {
    try {
        const rutas = await Route.find({ tenantId: req.user.tenantId })
            .populate('vehicle')
            .populate('driver')
            .populate('trayecto');

        let mapped = rutas.map(v => normalizeRouteStatus(v));

        // 🔑 CAMBIO: leer posiciones desde RecorridoReal, NO desde BitacoraRuta
        mapped = await Promise.all(mapped.map(async (route) => {
            const esActiva = route.status === 'active' || route.status === 'pending';

            if (esActiva) {
                const recorrido = await RecorridoReal.findOne({
                    routeId: route._id || route.id,
                    status: 'activo'
                }).select('posiciones').lean();

                route.recorridoReal = recorrido
                    ? recorrido.posiciones.map(p => ({ lat: p.lat, lng: p.lng, timestamp: p.timestamp }))
                    : [];
            } else {
                route.recorridoReal = [];
            }
            return route;
        }));

        res.json(mapped);
    } catch (error) {
        console.error('Error en getRoutes:', error);
        res.status(500).json({ error: 'Error al obtener rutas' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/routes
// ─────────────────────────────────────────────────────────────────────────────
exports.createRoute = async (req, res) => {
    console.log('📥 Datos recibidos para crear ruta:', JSON.stringify(req.body, null, 2));
    try {
        const { name, color, vehicle, driver, trayecto } = req.body;
        let newTrayecto = null;

        if (trayecto?.origin && trayecto?.destination) {
            console.log('📥 trayecto.distancia_metros:', req.body.trayecto?.distancia_metros);
            console.log('📥 trayecto.encodedPolyline:', String(req.body.trayecto?.encodedPolyline).slice(0, 50));
            newTrayecto = await Trayecto.create({
                tenantId: req.user.tenantId,
                origin: trayecto.origin,
                destination: trayecto.destination,
                waypoints: trayecto.waypoints || [],
                encodedPolyline: trayecto.encodedPolyline,
                distancia_metros: trayecto.distancia_metros,
                tiempo_estimado_segundos: trayecto.tiempo_estimado_segundos
            });
        }

        const newRoute = await Route.create({
            tenantId: req.user.tenantId,
            name: name || 'Ruta sin nombre',
            color: color || '#2196F3',
            vehicle: vehicle || null,
            driver: driver || null,
            accessCode: generate6DigitCode(),
            trayecto: newTrayecto ? newTrayecto._id : null
        });

        const populatedRoute = await Route.findById(newRoute._id)
            .populate('vehicle').populate('driver').populate('trayecto');

        const normalizedPayload = normalizeRouteStatus(populatedRoute);

        const io = req.app.get('io');
        if (io) io.emit('routeStatusChanged', { action: 'created', route: normalizedPayload });

        res.status(201).json(normalizedPayload);
    } catch (error) {
        console.error('❌ Error POST Route:', error);
        res.status(500).json({ error: 'Error al guardar ruta' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/routes/:id
// ─────────────────────────────────────────────────────────────────────────────
exports.updateRoute = async (req, res) => {
    try {
        const { id: routeId } = req.params;
        const { tenantId } = req.user;

        const currentRoute = await Route.findOne({ _id: routeId, tenantId });
        if (!currentRoute) return res.status(404).json({ error: 'Ruta no encontrada' });

        const routeUpdates = {};
        ['name', 'color', 'vehicle', 'driver', 'isTraceFree', 'status'].forEach(field => {
            if (req.body[field] !== undefined) routeUpdates[field] = req.body[field];
        });

        const { origin, destination, waypoints, stops } = req.body;
        if (origin || destination || waypoints || stops) {
            let valWaypoints = waypoints;
            if (Array.isArray(waypoints) && waypoints.length > 25)
                valWaypoints = waypoints.slice(0, 25);

            await Trayecto.findOneAndUpdate(
                { _id: currentRoute.trayecto, tenantId },
                { $set: { origin, destination, waypoints: valWaypoints, stops } }
            );
        }

        const updatedRoute = await Route.findOneAndUpdate(
            { _id: routeId, tenantId },
            { $set: routeUpdates },
            { new: true }
        ).populate('vehicle').populate('driver').populate('trayecto');

        const normalized = normalizeRouteStatus(updatedRoute);
        const io = req.app.get('io');
        if (io) io.emit('routeStatusChanged', { action: 'updated', route: normalized });

        res.json(normalized);
    } catch (error) {
        console.error('Error PUT /api/routes/:id', error);
        res.status(500).json({ error: 'Error actualizando ruta' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/routes/:id/status
// ─────────────────────────────────────────────────────────────────────────────
exports.updateRouteStatus = async (req, res) => {
    try {
        const { status } = req.body;

        const updatedRoute = await Route.findOneAndUpdate(
            { _id: req.params.id, tenantId: req.user.tenantId },
            { $set: { status } },
            { new: true }
        ).populate('vehicle').populate('driver').populate('trayecto');

        if (!updatedRoute) return res.status(404).json({ error: 'Ruta no encontrada' });

        const normalized = normalizeRouteStatus(updatedRoute);

        // Cerrar RecorridoReal si la ruta se finalizó
        if (status === 'finalizada' || status === 'completed') {
            normalized.recorridoReal = [];
            await _cerrarRecorrido(req.params.id);
        }

        const io = req.app.get('io');
        if (io) {
            io.emit('routeStatusChanged', { action: 'updated', route: normalized });
            if (status === 'finalizada' || status === 'completed') {
                io.emit('routeFinalized', {
                    routeId: req.params.id,
                    message: 'La ruta ha sido finalizada por el administrador',
                    route: normalized
                });
            }
        }

        res.json(normalized);
    } catch (error) {
        console.error('Error PATCH /api/routes/:id/status', error);
        res.status(500).json({ error: 'Error actualizando estado de la ruta' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/routes/:id
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteRoute = async (req, res) => {
    try {
        const routeToDelete = await Route.findOne({
            _id: req.params.id,
            tenantId: req.user.tenantId
        });
        if (!routeToDelete) return res.status(404).json({ msg: 'No encontrada' });

        if (routeToDelete.trayecto)
            await Trayecto.findByIdAndDelete(routeToDelete.trayecto);

        await Route.findByIdAndDelete(routeToDelete._id);

        const io = req.app.get('io');
        if (io) io.emit('routeStatusChanged', { deletedId: req.params.id });

        res.json({ msg: 'Ruta y trayecto eliminados correctamente' });
    } catch (error) {
        console.error('Error eliminando ruta:', error);
        res.status(500).json({ error: 'Error eliminando' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/routes/:id/start
// ─────────────────────────────────────────────────────────────────────────────
exports.startRoute = async (req, res) => {
    try {
        const routeToStart = await Route.findById(req.params.id);
        if (!routeToStart) return res.status(404).json({ message: 'Ruta no encontrada.' });

        if (!['pending', 'creada'].includes(routeToStart.status)) {
            return res.status(400).json({
                message: `La ruta ya se encuentra en estado: ${routeToStart.status}`
            });
        }

        const conflictingRoute = await Route.findOne({
            status: { $in: ['active', 'en curso'] },
            $or: [{ driver: routeToStart.driver }, { vehicle: routeToStart.vehicle }]
        }).populate('driver vehicle');

        if (conflictingRoute) {
            const isDriverBusy = conflictingRoute.driver._id.toString() === routeToStart.driver.toString();
            return res.status(400).json({
                message: isDriverBusy
                    ? `El chofer ya está en la ruta activa "${conflictingRoute.name}".`
                    : `El vehículo ya está en uso en la ruta activa "${conflictingRoute.name}".`
            });
        }

        if (!routeToStart.driverIsReady) {
            return res.status(400).json({
                message: `El chofer aún no ingresó el código (${routeToStart.accessCode}) en su app.`
            });
        }

        routeToStart.status = 'active';
        await routeToStart.save();

        const io = req.app.get('io');
        if (io) {
            const routeIdStr = String(routeToStart._id);
            io.emit('routeStarted', {
                routeId: routeIdStr,
                message: '¡La ruta ha sido iniciada!'
            });

            const populatedRoute = await Route.findById(routeToStart._id)
                .populate('vehicle').populate('driver').populate('trayecto');
            io.emit('routeStatusChanged', {
                action: 'started',
                route: normalizeRouteStatus(populatedRoute)
            });
        }

        return res.status(200).json({ message: 'Ruta iniciada correctamente', route: routeToStart });
    } catch (error) {
        console.error('Error al iniciar ruta:', error);
        res.status(500).json({ message: 'Error interno al iniciar la ruta.' });
    }
};

// ─── Función interna compartida ───────────────────────────────────────────────
async function _cerrarRecorrido(routeId) {
    try {
        const recorrido = await RecorridoReal.findOne({ routeId, status: 'activo' });
        if (!recorrido) return;

        let distanciaTotal = 0;
        const pts = recorrido.posiciones;
        for (let i = 1; i < pts.length; i++) {
            const R = 6371000;
            const dLat = (pts[i].lat - pts[i - 1].lat) * Math.PI / 180;
            const dLng = (pts[i].lng - pts[i - 1].lng) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(pts[i - 1].lat * Math.PI / 180) *
                Math.cos(pts[i].lat * Math.PI / 180) *
                Math.sin(dLng / 2) ** 2;
            distanciaTotal += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }

        await RecorridoReal.updateOne(
            { _id: recorrido._id },
            { $set: { status: 'completado', endTime: new Date(), distanciaMetros: Math.round(distanciaTotal) } }
        );
    } catch (e) {
        console.error('_cerrarRecorrido:', e);
    }
}