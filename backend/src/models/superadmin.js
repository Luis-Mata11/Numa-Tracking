// models/SuperAdmin.js
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const superAdminSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    email:  { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    rol: { type: String, default: 'superadmin' }
}, { timestamps: true });

// Hash automático antes de guardar
superAdminSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

superAdminSchema.methods.verificarPassword = function (plain) {
    return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('SuperAdmin', superAdminSchema);