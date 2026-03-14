// app.js
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const vehicleRoutes   = require('./routes/api/vehicles');
const driverRoutes    = require('./routes/api/drivers');
const routesRoutes    = require('./routes/api/routes');
const authRoutes      = require('./routes/api/auth');
const basesRoutes     = require('./routes/api/bases');
const recorridoRoutes = require('./routes/api/recorrido'); // 🆕
const mapProxyRoutes = require('./routes/api/mapproxy');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '../../../frontend/public')));
app.use('/api/map-image', mapProxyRoutes);
app.use('/api/vehicles',  vehicleRoutes);
app.use('/api/drivers',   driverRoutes);
app.use('/api/routes',    routesRoutes);
app.use('/api/auth',      authRoutes);
app.use('/api/bases',     basesRoutes);
app.use('/api/recorrido', recorridoRoutes); // 🆕 GET /api/recorrido/:routeId

module.exports = app;