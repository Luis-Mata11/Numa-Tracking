const mongoose = require('mongoose');

const choferSchema = new mongoose.Schema({
    tenantId: { type: String, required: true, index: true }, 
    id: { type: String, required: true }, // ID de empleado
    nombre: { type: String, required: true },
    licencia: { type: String, required: true },
    telefono: String,
    email: String,
    activo: { type: Boolean, default: true }
}, { timestamps: true });

choferSchema.index({ tenantId: 1, id: 1 }, { unique: true });

module.exports = mongoose.model('Chofer', choferSchema);