// routes/api/admin.licenses.js
// Endpoints exclusivos para el superadmin (tú) para gestionar licencias.
// Proteger con un middleware de rol 'superadmin' o con una API key secreta.

const express = require('express');
const router  = express.Router();
const License = require('../../models/License');
const Vehiculo= require('../../models/Vehicle');

// Middleware simple de API key — pon ADMIN_SECRET en tus variables de entorno
function requireAdminSecret(req, res, next) {
    const secret = req.headers['x-admin-secret'] || req.query.secret;
    if (!secret || secret !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ error: 'No autorizado.' });
    }
    next();
}

// ─── GET /api/admin/licenses ──────────────────────────────────────────────────
// Lista todas las licencias con su uso actual de vehículos
router.get('/', requireAdminSecret, async (req, res) => {
    try {
        const licencias = await License.find().lean();

        const result = await Promise.all(licencias.map(async (lic) => {
            const limiteBase  = License.PLAN_LIMITS[lic.plan] || 3;
            const limiteTotal = limiteBase + (lic.vehiculosExtra || 0);
            const totalVehiculos = await Vehiculo.countDocuments({ tenantId: lic.clave });

            return {
                _id:            lic._id,
                clave:          lic.clave,
                plan:           lic.plan,
                estado:         lic.estado,
                fechaFin:       lic.fechaFin,
                vehiculosExtra: lic.vehiculosExtra || 0,
                limiteBase,
                limiteTotal,
                vehiculosActuales: totalVehiculos
            };
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── PATCH /api/admin/licenses/:clave/vehiculos-extra ─────────────────────────
// Otorga o quita slots adicionales de vehículos a una licencia específica
// Body: { vehiculosExtra: 2 }  ← número absoluto (no incremental)
router.patch('/:clave/vehiculos-extra', requireAdminSecret, async (req, res) => {
    try {
        const { vehiculosExtra } = req.body;

        if (typeof vehiculosExtra !== 'number' || vehiculosExtra < 0) {
            return res.status(400).json({ error: 'vehiculosExtra debe ser un número >= 0.' });
        }

        const licencia = await License.findOneAndUpdate(
            { clave: req.params.clave },
            { vehiculosExtra },
            { new: true }
        );

        if (!licencia) {
            return res.status(404).json({ error: 'Licencia no encontrada.' });
        }

        const limiteBase  = License.PLAN_LIMITS[licencia.plan] || 3;
        const limiteTotal = limiteBase + licencia.vehiculosExtra;

        res.json({
            msg:            `Licencia actualizada. Ahora permite ${limiteTotal} vehículo(s).`,
            clave:          licencia.clave,
            plan:           licencia.plan,
            vehiculosExtra: licencia.vehiculosExtra,
            limiteTotal
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── PATCH /api/admin/licenses/:clave/plan ────────────────────────────────────
// Cambia el plan de una licencia (TRIAL → PRO → CORPORATIVO)
router.patch('/:clave/plan', requireAdminSecret, async (req, res) => {
    try {
        const { plan } = req.body;
        const planesValidos = Object.keys(License.PLAN_LIMITS);

        if (!planesValidos.includes(plan)) {
            return res.status(400).json({
                error: `Plan inválido. Opciones: ${planesValidos.join(', ')}`
            });
        }

        const licencia = await License.findOneAndUpdate(
            { clave: req.params.clave },
            { plan, estado: 'activa' },
            { new: true }
        );

        if (!licencia) {
            return res.status(404).json({ error: 'Licencia no encontrada.' });
        }

        res.json({
            msg:   `Plan actualizado a ${plan}.`,
            clave: licencia.clave,
            plan:  licencia.plan,
            limiteTotal: License.PLAN_LIMITS[plan] + (licencia.vehiculosExtra || 0)
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;