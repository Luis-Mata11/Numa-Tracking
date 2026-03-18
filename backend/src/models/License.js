// models/License.js
const mongoose = require('mongoose');
const Schema   = mongoose.Schema;

// ─── Límites base por plan ────────────────────────────────────────────────────
const PLAN_VEHICLE_LIMITS = {
    TRIAL:       3,
    PRO:         5,
    CORPORATIVO: 8
};

const licenciaSchema = new Schema({
    clienteId: {
        type:     Schema.Types.ObjectId,
        ref:      'Client',
        required: true
    },
    clave: {
        type:     String,
        required: true,
        unique:   true
    },
    plan: {
        type:    String,
        enum:    ['TRIAL', 'PRO', 'CORPORATIVO'],
        default: 'TRIAL'
    },
    fechaInicio: {
        type:    Date,
        default: Date.now
    },
    fechaFin: {
        type:     Date,
        required: true
    },
    estado: {
        type:    String,
        enum:    ['trial', 'activa', 'vencida', 'cancelada'],
        default: 'trial'
    },

    // ─── Control de vehículos ─────────────────────────────────────────────────
    // Slots extra que el admin (tú) otorga manualmente por encima del límite del plan
    vehiculosExtra: {
        type:    Number,
        default: 0,
        min:     0
    }
}, {
    timestamps: true
});

// ─── Virtual: límite total de vehículos ───────────────────────────────────────
licenciaSchema.virtual('vehiculosPermitidos').get(function () {
    const base = PLAN_VEHICLE_LIMITS[this.plan] || PLAN_VEHICLE_LIMITS.TRIAL;
    return base + (this.vehiculosExtra || 0);
});

// Exportamos los límites para usarlos en el controlador sin re-declararlos
licenciaSchema.statics.PLAN_LIMITS = PLAN_VEHICLE_LIMITS;

module.exports = mongoose.model('License', licenciaSchema);