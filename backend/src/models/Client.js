const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const clienteSchema = new Schema({
    nombre: { 
        type: String, 
        required: true,
        trim: true 
    },
    email: { 
        type: String, 
        required: true, 
        unique: true,
        trim: true,
        lowercase: true
    },
    password: { 
        type: String, 
        required: true 
    },
    telefono: { 
        type: String,
        trim: true
    },
    empresa: { 
        type: String,
        trim: true
    },
    
    // Tu "NUMA-ZAG8XG"
    tenantId: { 
        type: String, 
        required: true, 
        unique: true 
    }, 

    // Tu "Prospecto"
    tipo: { 
        type: String, 
        default: 'Prospecto' 
    }
}, { 
    timestamps: true // Genera createdAt y updatedAt
});

module.exports = mongoose.model('Client', clienteSchema);