const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const licenciaSchema = new Schema({
    // Tu "699698f8d43606b4decd4825"
    clienteId: { 
        type: Schema.Types.ObjectId, 
        ref: 'Client', 
        required: true 
    },
    
    // Tu "PH70M-KL0I0"
    clave: { 
        type: String, 
        required: true, 
        unique: true 
    }, 
    
    fechaInicio: { 
        type: Date, 
        default: Date.now 
    },
    fechaFin: { 
        type: Date, 
        required: true 
    },
    
    // Tu "trial"
    estado: { 
        type: String, 
        enum: ['trial', 'activa', 'vencida', 'cancelada'], 
        default: 'trial' 
    }
}, { 
    timestamps: true 
});

module.exports = mongoose.model('License', licenciaSchema);