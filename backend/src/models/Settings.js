const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
    tenantId: { 
        type: String, 
        required: true, 
        unique: true, // ⚡ ¡IMPORTANTE! Solo debe haber UN documento de settings por Tenant
        index: true 
    },
    defaultBaseId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Base',
        default: null
    }
    // Aquí agregarás más adelante:
    // zonaHoraria: { type: String, default: 'America/Mexico_City' },
    // notificacionesActivas: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Setting', settingSchema);