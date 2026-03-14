const mongoose = require('mongoose');

const vehiculoSchema = new mongoose.Schema({
    tenantId: { type: String, required: true, index: true }, 
    placa: { type: String, required: true }, 
    alias: String,
    marca: String,
    modelo: String,
    anio: Number,
    activo: { type: Boolean, default: true }
}, { timestamps: true });

vehiculoSchema.index({ tenantId: 1, placa: 1 }, { unique: true });

module.exports = mongoose.model('Vehiculo', vehiculoSchema);