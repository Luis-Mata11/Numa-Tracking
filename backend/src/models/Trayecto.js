const mongoose = require('mongoose');

const trayectoSchema = new mongoose.Schema({
    // A qué cliente/empresa pertenece
    tenantId: { type: String, required: true, index: true }, 
    
    // Inicio de la ruta
    origin: {
        lat: Number,
        lng: Number,
        address: String
    },
    
    // Destino final
    destination: {
        lat: Number,
        lng: Number,
        address: String
    },
    
    // Puntos intermedios planificados
    waypoints: [{
        lat: Number,
        lng: Number,
        stopover: { type: Boolean, default: false },
        address: String
    }],

    // 🔥 "stops" ha sido eliminado.

    // 💡 EL TRAZO EXACTO (La línea elegida)
    // Google Maps te da un string comprimido con la forma exacta de la ruta.
    encodedPolyline: { type: String }, 
    
    // Datos útiles para métricas
    distancia_metros: { type: Number }, 
    tiempo_estimado_segundos: { type: Number },

    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Trayecto', trayectoSchema);