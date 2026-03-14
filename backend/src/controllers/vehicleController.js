const Vehiculo = require('../models/Vehicle'); // Importa el modelo

exports.getVehicles = async (req, res) => {
    try {
        const vehiculos = await Vehiculo.find({ tenantId: req.user.tenantId });
        const mapped = vehiculos.map(v => {
            const obj = v.toObject ? v.toObject() : v;
            return Object.assign({}, obj, { id: obj.placa, año: obj.anio });
        });
        res.json(mapped);
    } catch (error) { 
        res.status(500).json({ error: 'Error al obtener vehículos' }); 
    }
};

exports.createVehicle = async (req, res) => {
  try {
        // Soportar campos tanto 'id' como 'placa' y 'año' como 'anio'
        const { id, placa, alias, marca, modelo } = req.body;
        const año = req.body.año || req.body.anio || undefined;
        const placaValue = id || placa;
        if (!placaValue) return res.status(400).json({ error: 'Falta placa (id) del vehículo.' });

        const existe = await Vehiculo.findOne({ tenantId: req.user.tenantId, placa: placaValue });
        if (existe) return res.status(400).json({ error: 'Ya existe un vehículo con esa placa.' });

        const nuevo = await Vehiculo.create({ tenantId: req.user.tenantId, placa: placaValue, alias, marca, modelo, anio: año });

        const obj = nuevo.toObject ? nuevo.toObject() : nuevo;
        res.json(Object.assign({}, obj, { id: obj.placa, año: obj.anio }));
    } catch (error) { res.status(500).json({ error: 'Error al guardar vehículo' }); }
};

exports.updateVehicle = async (req, res) => {
  try {
        // Aceptar tanto 'año' como 'anio' en el body y mapear a 'anio' para la BD
        const payload = Object.assign({}, req.body);
        if (payload.año !== undefined && payload.anio === undefined) payload.anio = payload.año;
        // Evitar intentar cambiar la placa primaria desde el body
        delete payload.id; delete payload.placa;

        const actualizado = await Vehiculo.findOneAndUpdate({ tenantId: req.user.tenantId, placa: req.params.id }, payload, { new: true });
        if(!actualizado) return res.status(404).json({error: 'No encontrado'});
        const obj = actualizado.toObject ? actualizado.toObject() : actualizado;
        res.json(Object.assign({}, obj, { id: obj.placa, año: obj.anio }));
    } catch(e){ res.status(500).json({error: 'Error'}); }
};

exports.deleteVehicle = async (req, res) => {
      try {
        const eliminado = await Vehiculo.findOneAndDelete({ tenantId: req.user.tenantId, placa: req.params.id });
        if (!eliminado) return res.status(404).json({ error: 'Vehículo no encontrado' });
        res.json({ msg: 'Eliminado correctamente' });
    } catch (error) { res.status(500).json({ error: 'Error al eliminar' }); }
};