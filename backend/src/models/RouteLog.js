const mongoose = require('mongoose');

const bitacoraRutaSchema = new mongoose.Schema({
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true, index: true },
    timestamp: { type: Date, default: Date.now, index: true },
    
    // 👇 Para eventos discretos (inicio, fin, desvío, paradas)
    location: {
        lat: Number,
        lng: Number,
        address: String
    },
    action: String, // 'start', 'stop', 'waypoint', 'complete', 'desvio', 'trace'
    description: String,
    
    // 👇 NUEVO: Array para almacenar la ruta seguida (solo se usa si action === 'trace')
    path: [{
        lat: Number,
        lng: Number,
        speed: Number,
        heading: Number,
        batteryLevel: Number,
        timestamp: { type: Date, default: Date.now }
    }]
}, { 
    versionKey: false 
});

module.exports = mongoose.model('BitacoraRuta', bitacoraRutaSchema);