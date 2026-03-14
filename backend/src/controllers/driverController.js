const Driver = require('../models/Driver'); // Importamos como 'Driver'

// CAMBIO: Renombrado a 'getDrivers' (plural) porque devuelve una lista
exports.getDrivers = async (req, res) => {
    try {
        // Usamos 'Driver' aquí
        const choferes = await Driver.find({ tenantId: req.user.tenantId });
        res.json(choferes);
    } catch (error) { 
        console.error(error);
        res.status(500).json({ error: 'Error al obtener choferes' }); 
    }
};

exports.createDriver = async (req, res) => {
    try {
        const { id, nombre, licencia, telefono, email } = req.body;
        
        // Validación básica
        if (!id || !nombre) {
            return res.status(400).json({ error: 'ID y Nombre son obligatorios' });
        }

        // Usamos 'Driver' aquí
        const existe = await Driver.findOne({ tenantId: req.user.tenantId, id: id });
        
        if (existe) return res.status(400).json({ error: 'Ya existe un chofer con ese ID.' });
        
        // Usamos 'Driver' aquí
        const nuevo = await Driver.create({ 
            tenantId: req.user.tenantId, 
            id, 
            nombre, 
            licencia, 
            telefono, 
            email 
        });
        
        res.json(nuevo);
    } catch (error) { 
        console.error(error);
        res.status(500).json({ error: 'Error al crear chofer' }); 
    }
};

exports.updateDriver = async (req, res) => {
    try {
        // Usamos 'Driver' aquí
        const actualizado = await Driver.findOneAndUpdate(
            { tenantId: req.user.tenantId, id: req.params.id }, 
            req.body, 
            { new: true }
        );
        
        if (!actualizado) return res.status(404).json({ error: 'No encontrado' });
        
        res.json(actualizado);
    } catch(e) { 
        console.error(e);
        res.status(500).json({ error: 'Error al actualizar chofer' }); 
    }
};

exports.deleteDriver = async (req, res) => {
    try {
        // Usamos 'Driver' aquí
        const eliminado = await Driver.findOneAndDelete({ tenantId: req.user.tenantId, id: req.params.id });
        
        if (!eliminado) return res.status(404).json({ error: 'Chofer no encontrado' });
        
        res.json({ msg: 'Eliminado correctamente' });
    } catch (error) { 
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar chofer' }); 
    }
};