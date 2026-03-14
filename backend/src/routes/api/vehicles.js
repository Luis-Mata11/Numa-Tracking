const express = require('express');
const router = express.Router();
const vehicleController = require('../../controllers/vehicleController');
const verifyToken = require('../../middleware/auth');

router.get('/', verifyToken, vehicleController.getVehicles);
router.post('/', verifyToken, vehicleController.createVehicle);
router.put('/:id', verifyToken, vehicleController.updateVehicle);
router.delete('/:id', verifyToken, vehicleController.deleteVehicle);

module.exports = router;