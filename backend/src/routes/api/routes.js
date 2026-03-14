const express = require('express');
const router = express.Router();
const routeController = require('../../controllers/routeController');
const authController = require('../../controllers/authController'); // <--- ⚠️ IMPORTANTE: Faltaba esto
const verifyToken = require('../../middleware/auth');

// Rutas base: /api/routes
router.get('/', verifyToken, routeController.getRoutes);
router.post('/', verifyToken, routeController.createRoute);
router.put('/:id', verifyToken, routeController.updateRoute);
router.delete('/:id', verifyToken, routeController.deleteRoute);

// 🚀 AQUÍ ESTÁ LA SOLUCIÓN AL 404: Ruta para iniciar el trayecto
router.post('/:id/start', verifyToken, routeController.startRoute);

// AQUÍ CONECTAMOS EL PATCH QUE SEPARAMOS
router.patch('/:id/status', verifyToken, routeController.updateRouteStatus);


module.exports = router;