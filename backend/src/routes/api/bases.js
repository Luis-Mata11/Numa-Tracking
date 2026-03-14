const express = require('express');
const router = express.Router();
const baseController = require('../../controllers/baseController');
const verifyToken = require('../../middleware/auth');

// Protegemos todas las rutas
router.use(verifyToken);

// Endpoints existentes
router.get('/', baseController.getBases);
router.post('/', baseController.createBase);
router.put('/:id/default', baseController.setDefaultBase);

// ✨ NUEVOS Endpoints para Editar y Eliminar
router.put('/:id', baseController.updateBase);
router.delete('/:id', baseController.deleteBase);

module.exports = router;