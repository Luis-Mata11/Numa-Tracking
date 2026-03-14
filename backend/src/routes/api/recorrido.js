// routes/api/recorrido.js
const express       = require('express');
const router        = express.Router();
const verifyToken = require('../../middleware/auth');
const RecorridoReal = require('../../models/RecorridoReal');
const BitacoraRuta  = require('../../models/RouteLog');

/**
 * GET /api/recorrido/:routeId
 * Recorrido real (posiciones) + eventos de bitácora — para comparativa en reportes.
 */
router.get('/:routeId', verifyToken, async (req, res) => {
    try {
        const recorrido = await RecorridoReal
            .findOne({ routeId: req.params.routeId })
            .sort({ createdAt: -1 })
            .lean();

        const bitacora = await BitacoraRuta
            .find({ routeId: req.params.routeId })
            .sort({ timestamp: 1 })
            .lean();

        res.json({ recorrido: recorrido || null, bitacora });
    } catch (err) {
        console.error('Error obteniendo recorrido:', err);
        res.status(500).json({ message: 'Error interno' });
    }
});

/**
 * GET /api/recorrido/:routeId/historial
 * Lista histórica sin posiciones (para listados de reportes).
 */
router.get('/:routeId/historial', verifyToken, async (req, res) => {
    try {
        const recorridos = await RecorridoReal
            .find({ routeId: req.params.routeId })
            .sort({ createdAt: -1 })
            .select('-posiciones')
            .lean();

        res.json(recorridos);
    } catch (err) {
        res.status(500).json({ message: 'Error interno' });
    }
});

module.exports = router;
