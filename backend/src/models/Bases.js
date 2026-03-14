const mongoose = require('mongoose');

const baseSchema = new mongoose.Schema({
    tenantId: { type: String, required: true, index: true }, // Para multitenant / licencia
    nombre: { type: String, required: true },
    direccion: { type: String },
    
    // Formato estándar GeoJSON para MongoDB
    ubicacion: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true } // [Longitud, Latitud] ¡Ojo, en ese orden!
    },
    
    radio_geocerca: { type: Number, default: 50 }, // Radio en metros para saber si entró/salió
    activa: { type: Boolean, default: true },
    
    // El flag para saber cuál es la base por defecto de este tenant
    esBasePrincipal: { type: Boolean, default: false }
    
}, { timestamps: true });

// Índice geoespacial para búsquedas rápidas en el mapa
baseSchema.index({ ubicacion: '2dsphere' });

// --- Transformación para enviar datos limpios al Frontend ---
baseSchema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        
        // Extraemos lat y lng para que tu JS del frontend (Google Maps) 
        // lo lea directamente sin tener que buscar dentro de 'ubicacion.coordinates'
        if (ret.ubicacion && ret.ubicacion.coordinates) {
            ret.lng = ret.ubicacion.coordinates[0];
            ret.lat = ret.ubicacion.coordinates[1];
        }
    }
});

module.exports = mongoose.model('Base', baseSchema);