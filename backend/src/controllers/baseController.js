const Base = require('../models/Bases');
const Setting = require('../models/Settings');

// 1. Obtener todas las bases y cuál es la principal
exports.getBases = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;

        // Buscamos todas las bases del cliente
        const bases = await Base.find({ tenantId, activa: true }).sort({ createdAt: -1 });

        // Buscamos la configuración del cliente
        let settings = await Setting.findOne({ tenantId });
        
        // Si el cliente es nuevo y no tiene settings, se lo creamos al vuelo
        if (!settings) {
            settings = await Setting.create({ tenantId });
        }

        res.status(200).json({
            bases,
            defaultBaseId: settings.defaultBaseId
        });
    } catch (error) {
        console.error("Error obteniendo bases:", error);
        res.status(500).json({ error: 'Error al obtener las bases' });
    }
};

// 2. Crear una nueva base
exports.createBase = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const { name, address, lat, lng } = req.body;

        if (!name || lat === undefined || lng === undefined) {
            return res.status(400).json({ error: 'Nombre, latitud y longitud son obligatorios.' });
        }

        // Crear la base usando el formato GeoJSON
        const nuevaBase = await Base.create({
            tenantId,
            nombre: name,
            direccion: address,
            ubicacion: {
                type: 'Point',
                coordinates: [lng, lat] // [Longitud, Latitud]
            }
        });

        // Opcional: Si es la PRIMERA base que crea el cliente, hacerla la predeterminada automáticamente
        const count = await Base.countDocuments({ tenantId });
        if (count === 1) {
            await Setting.findOneAndUpdate(
                { tenantId },
                { $set: { defaultBaseId: nuevaBase._id } },
                { upsert: true } // Crea el setting si no existe
            );
        }

        res.status(201).json(nuevaBase);
    } catch (error) {
        console.error("Error creando base:", error);
        res.status(500).json({ error: 'Error interno al crear la base' });
    }
};

// 3. Establecer una base como la principal (Actualiza Settings)
exports.setDefaultBase = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const baseId = req.params.id;

        // Verificamos que la base exista y pertenezca a este cliente
        const baseExiste = await Base.findOne({ _id: baseId, tenantId });
        if (!baseExiste) {
            return res.status(404).json({ error: 'La base no existe o no te pertenece.' });
        }

        // Actualizamos (o creamos) el documento de Settings del cliente
        await Setting.findOneAndUpdate(
            { tenantId },
            { $set: { defaultBaseId: baseId } },
            { upsert: true, new: true }
        );

        res.status(200).json({ message: 'Base predeterminada actualizada', defaultBaseId: baseId });
    } catch (error) {
        console.error("Error actualizando base predeterminada:", error);
        res.status(500).json({ error: 'Error al actualizar la base predeterminada' });
    }
};

// 4. Actualizar una base existente
exports.updateBase = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const baseId = req.params.id;
        const { name, address, lat, lng } = req.body;

        if (!name || lat === undefined || lng === undefined) {
            return res.status(400).json({ error: 'Nombre, latitud y longitud son obligatorios.' });
        }

        // Actualizamos manteniendo la seguridad por tenantId y el formato GeoJSON
        const baseActualizada = await Base.findOneAndUpdate(
            { _id: baseId, tenantId }, // Filtro de búsqueda
            { 
                nombre: name,
                direccion: address,
                ubicacion: {
                    type: 'Point',
                    coordinates: [lng, lat] // Recuerda: [Longitud, Latitud]
                }
            },
            { new: true } // Para que devuelva el documento ya actualizado
        );

        if (!baseActualizada) {
            return res.status(404).json({ error: 'La base no existe o no tienes permisos para editarla.' });
        }

        res.status(200).json(baseActualizada);
    } catch (error) {
        console.error("Error actualizando base:", error);
        res.status(500).json({ error: 'Error interno al actualizar la base' });
    }
};


// 5. Eliminar (Ocultar) una base
exports.deleteBase = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const baseId = req.params.id;

        // Soft Delete: Solo cambiamos el estado 'activa' a false para no perder historial
        const baseEliminada = await Base.findOneAndUpdate(
            { _id: baseId, tenantId },
            { activa: false },
            { new: true }
        );

        if (!baseEliminada) {
            return res.status(404).json({ error: 'La base no existe o ya fue eliminada.' });
        }

        // Opcional: Si la base eliminada era la "default", podrías quitarla de Settings
        // await Setting.findOneAndUpdate(
        //     { tenantId, defaultBaseId: baseId },
        //     { $unset: { defaultBaseId: "" } }
        // );

        res.status(200).json({ message: 'Base eliminada correctamente' });
    } catch (error) {
        console.error("Error eliminando base:", error);
        res.status(500).json({ error: 'Error interno al eliminar la base' });
    }
};
