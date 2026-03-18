// middleware/superAdminAuth.js
const jwt        = require('jsonwebtoken');
const SuperAdmin = require('../models/superadmin');

const SA_SECRET = process.env.SUPERADMIN_JWT_SECRET || 'superadmin_secret_numa_2026';

module.exports = async (req, res, next) => {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({ ok: false, msg: 'Token de superadmin requerido.' });
    }

    try {
        const decoded = jwt.verify(token, SA_SECRET);
        if (decoded.rol !== 'superadmin') {
            return res.status(403).json({ ok: false, msg: 'Acceso denegado.' });
        }

        // Verificar que el superadmin sigue existiendo en la BD
        const admin = await SuperAdmin.findById(decoded.id).select('-password');
        if (!admin) {
            return res.status(401).json({ ok: false, msg: 'Superadmin no encontrado.' });
        }

        req.superAdmin = admin;
        next();
    } catch (err) {
        return res.status(403).json({ ok: false, msg: 'Token inválido o expirado.' });
    }
};