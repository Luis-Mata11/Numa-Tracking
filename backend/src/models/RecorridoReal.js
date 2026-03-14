// models/RecorridoReal.js
const mongoose = require('mongoose');

const posicionSchema = new mongoose.Schema({
    lat:       { type: Number, required: true },
    lng:       { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
    accuracy:  Number,
    speed:     Number,
    heading:   Number,
    isOffRoute: { type: Boolean, default: false }
}, { _id: false }); // Sin _id en cada punto

const recorridoRealSchema = new mongoose.Schema({
    routeId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Route',  required: true, index: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chofer', index: true },

    status:    { type: String, enum: ['activo', 'completado', 'cancelado'], default: 'activo' },
    startTime: { type: Date, default: Date.now },
    endTime:   { type: Date, default: null },

    posiciones:      { type: [posicionSchema], default: [] },
    distanciaMetros: { type: Number, default: 0 },
    desviaciones:    { type: Number, default: 0 }
}, {
    versionKey: false,
    timestamps: true
});

recorridoRealSchema.index({ routeId: 1, status: 1 });

module.exports = mongoose.model('RecorridoReal', recorridoRealSchema);
