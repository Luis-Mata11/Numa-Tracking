const express = require('express');
const router = express.Router();
const driverController = require('../../controllers/driverController');
const verifyToken = require('../../middleware/auth');

// Aplicar middleware de autenticación a todas las rutas de choferes
router.use(verifyToken);

router.get('/', driverController.getDrivers);
router.post('/', driverController.createDriver);
router.put('/:id', driverController.updateDriver);
router.delete('/:id', driverController.deleteDriver);

module.exports = router;