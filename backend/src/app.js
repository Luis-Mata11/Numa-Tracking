// app.js
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const vehicleRoutes   = require('./routes/api/vehicles');
const driverRoutes    = require('./routes/api/drivers');
const routesRoutes    = require('./routes/api/routes');
const authRoutes      = require('./routes/api/auth');
const basesRoutes     = require('./routes/api/bases');
const recorridoRoutes = require('./routes/api/recorrido');
const mapProxyRoutes  = require('./routes/api/mapproxy');
const adminLicensesRoutes = require('./routes/api/admin.licenses');
const superadminRoutes = require('./routes/api/superAdmin');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Rutas de API ─────────────────────────────────────────────────────────────
app.use('/api/map-image', mapProxyRoutes);
app.use('/api/vehicles',  vehicleRoutes);
app.use('/api/drivers',   driverRoutes);
app.use('/api/routes',    routesRoutes);
app.use('/api/auth',      authRoutes);
app.use('/api/bases',     basesRoutes);
app.use('/api/recorrido', recorridoRoutes);
app.use('/api/admin/licenses', adminLicensesRoutes);
app.use('/api/superadmin', superadminRoutes);


// ─── Frontend (build de Vite) ─────────────────────────────────────────────────
// Ajustamos el path al dist generado por Vite
const FRONTEND_DIST = path.join(__dirname, '../../frontend/dist');
app.use(express.static(FRONTEND_DIST));

// ─── SPA Catch-all ────────────────────────────────────────────────────────────
// Cualquier GET que no sea /api devuelve index.html para que el router
// del frontend maneje /rutas, /choferes, /dashboard, etc.
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Endpoint no encontrado' });
    }
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

module.exports = app;