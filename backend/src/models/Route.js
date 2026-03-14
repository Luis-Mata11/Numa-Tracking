const mongoose = require('mongoose');

const routeSchema = new mongoose.Schema({
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    color: { type: String, default: '#333333' },
    status: {
        type: String,
        enum: ['active', 'inactive', 'pending', 'cancelled', 'completed'],
        default: 'pending'
    },
    isTraceFree: { type: Boolean, default: false },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehiculo' },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Chofer' },
    accessCode: { type: String, index: true },
    // NUEVA RELACIÓN:
    trayecto: { type: mongoose.Schema.Types.ObjectId, ref: 'Trayecto' },
    driverIsReady: {
        type: Boolean,
        default: false
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Route', routeSchema);