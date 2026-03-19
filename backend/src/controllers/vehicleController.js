// controllers/vehicleController.js
const Vehiculo = require('../models/Vehicle');
const License  = require('../models/License');

const PLAN_LIMITS = { TRIAL: 3, PRO: 5, CORPORATIVO: 8 };

// ─── GET /api/vehicles ────────────────────────────────────────────────────────
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

// ─── POST /api/vehicles ───────────────────────────────────────────────────────
exports.createVehicle = async (req, res) => {
    try {
        const { id, placa, alias, marca, modelo } = req.body;
        const año        = req.body.año || req.body.anio || undefined;
        const placaValue = id || placa;

        if (!placaValue) {
            return res.status(400).json({ error: 'Falta placa (id) del vehículo.' });
        }

        // ── Validar límite de licencia ────────────────────────────────────────
        const licencia = await License.findOne({ clave: req.user.tenantId });

        if (licencia) {
            const plan        = licencia.plan || 'TRIAL';
            const limiteBase  = PLAN_LIMITS[plan] ?? PLAN_LIMITS.TRIAL;
            const limiteTotal = limiteBase + (licencia.vehiculosExtra || 0);
            const totalActual = await Vehiculo.countDocuments({ tenantId: req.user.tenantId });

            if (totalActual >= limiteTotal) {
                return res.status(403).json({
                    error: `Límite de vehículos alcanzado. Tu plan ${plan} permite ${limiteTotal} vehículo(s). Contacta a soporte para ampliar tu límite.`,
                    code:  'VEHICLE_LIMIT_REACHED',
                    limit: limiteTotal,
                    current: totalActual
                });
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        const existe = await Vehiculo.findOne({ tenantId: req.user.tenantId, placa: placaValue });
        if (existe) {
            return res.status(400).json({ error: 'Ya existe un vehículo con esa placa.' });
        }

        const nuevo = await Vehiculo.create({
            tenantId: req.user.tenantId,
            placa:    placaValue,
            alias,
            marca,
            modelo,
            anio:     año
        });

        const obj = nuevo.toObject ? nuevo.toObject() : nuevo;
        res.json(Object.assign({}, obj, { id: obj.placa, año: obj.anio }));

    } catch (error) {
        console.error('Error al crear vehículo:', error);
        res.status(500).json({ error: 'Error al guardar vehículo' });
    }
};

// ─── PUT /api/vehicles/:id ────────────────────────────────────────────────────
exports.updateVehicle = async (req, res) => {
    try {
        const payload = Object.assign({}, req.body);
        if (payload.año !== undefined && payload.anio === undefined) payload.anio = payload.año;
        delete payload.id;
        delete payload.placa;

        const actualizado = await Vehiculo.findOneAndUpdate(
            { tenantId: req.user.tenantId, placa: req.params.id },
            payload,
            { new: true }
        );
        if (!actualizado) return res.status(404).json({ error: 'No encontrado' });

        const obj = actualizado.toObject ? actualizado.toObject() : actualizado;
        res.json(Object.assign({}, obj, { id: obj.placa, año: obj.anio }));
    } catch (e) {
        res.status(500).json({ error: 'Error al actualizar vehículo' });
    }
};

// ─── DELETE /api/vehicles/:id ─────────────────────────────────────────────────
exports.deleteVehicle = async (req, res) => {
    try {
        const eliminado = await Vehiculo.findOneAndDelete({
            tenantId: req.user.tenantId,
            placa:    req.params.id
        });
        if (!eliminado) return res.status(404).json({ error: 'Vehículo no encontrado' });
        res.json({ msg: 'Eliminado correctamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar' });
    }
};