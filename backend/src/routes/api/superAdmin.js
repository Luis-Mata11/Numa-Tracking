// routes/api/superadmin.js
const express    = require('express');
const router     = express.Router();
const jwt        = require('jsonwebtoken');
const SuperAdmin = require('../../models/superadmin');
const Cliente    = require('../../models/Client');
const License    = require('../../models/License');
const Vehiculo   = require('../../models/Vehicle');
const Driver     = require('../../models/Driver');
const Route      = require('../../models/Route');
const requireSA  = require('../../middleware/superAdminAuth');

const SA_SECRET  = process.env.SUPERADMIN_JWT_SECRET || 'superadmin_secret_numa_2026';

// ─── POST /api/superadmin/auth/login ─────────────────────────────────────────
router.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ ok: false, msg: 'Email y contraseña requeridos.' });
        }

        const admin = await SuperAdmin.findOne({ email });
        if (!admin) {
            return res.status(401).json({ ok: false, msg: 'Credenciales inválidas.' });
        }

        const valid = await admin.verificarPassword(password);
        if (!valid) {
            return res.status(401).json({ ok: false, msg: 'Credenciales inválidas.' });
        }

        const token = jwt.sign(
            { id: admin._id, rol: 'superadmin', nombre: admin.nombre },
            SA_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            ok: true,
            token,
            usuario: { id: admin._id, nombre: admin.nombre, email: admin.email }
        });
    } catch (err) {
        res.status(500).json({ ok: false, msg: 'Error interno.' });
    }
});

// ─── POST /api/superadmin/auth/verify-action ─────────────────────────────────
// Verifica la contraseña del superadmin antes de ejecutar acciones críticas
router.post('/auth/verify-action', requireSA, async (req, res) => {
    try {
        const { password } = req.body;
        const admin = await SuperAdmin.findById(req.superAdmin._id);
        const valid = await admin.verificarPassword(password);
        if (!valid) return res.status(401).json({ ok: false, msg: 'Contraseña incorrecta.' });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, msg: 'Error interno.' });
    }
});

// ─── GET /api/superadmin/clientes ────────────────────────────────────────────
// Lista todos los clientes con su licencia y resumen de uso
router.get('/clientes', requireSA, async (req, res) => {
    try {
        const clientes = await Cliente.find().select('-password').lean();

        const result = await Promise.all(clientes.map(async (c) => {
            const licencia = await License.findOne({ clave: c.tenantId }).lean();
            const totalVehiculos = await Vehiculo.countDocuments({ tenantId: c.tenantId });
            const totalChoferes  = await Driver.countDocuments({ tenantId: c.tenantId });
            const totalRutas     = await Route.countDocuments({ tenantId: c.tenantId });

            const plan        = licencia?.plan || 'TRIAL';
            const limiteBase  = (License.PLAN_LIMITS || { TRIAL: 3, PRO: 5, CORPORATIVO: 8 })[plan] || 3;
            const limiteTotal = limiteBase + (licencia?.vehiculosExtra || 0);

            // Calcular días restantes
            const hoy  = new Date();
            const fin  = licencia?.fechaFin ? new Date(licencia.fechaFin) : null;
            const diasRestantes = fin ? Math.ceil((fin - hoy) / (1000 * 60 * 60 * 24)) : 0;

            // Estado real (puede haber vencido desde que se guardó)
            let estadoReal = licencia?.estado || 'sin licencia';
            if (fin && fin < hoy && estadoReal !== 'vencida') estadoReal = 'vencida';

            return {
                _id:            c._id,
                nombre:         c.nombre,
                email:          c.email,
                empresa:        c.empresa || '—',
                telefono:       c.telefono || '—',
                tenantId:       c.tenantId,
                createdAt:      c.createdAt,
                licencia: licencia ? {
                    _id:            licencia._id,
                    plan,
                    estado:         estadoReal,
                    fechaInicio:    licencia.fechaInicio,
                    fechaFin:       licencia.fechaFin,
                    diasRestantes:  Math.max(0, diasRestantes),
                    vehiculosExtra: licencia.vehiculosExtra || 0,
                    limiteVehiculos: limiteTotal
                } : null,
                uso: { vehiculos: totalVehiculos, choferes: totalChoferes, rutas: totalRutas }
            };
        }));

        res.json({ ok: true, data: result });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, msg: 'Error interno.' });
    }
});

// ─── GET /api/superadmin/clientes/:tenantId ───────────────────────────────────
// Detalle completo de un cliente + historial de eventos
router.get('/clientes/:tenantId', requireSA, async (req, res) => {
    try {
        const { tenantId } = req.params;

        const cliente  = await Cliente.findOne({ tenantId }).select('-password').lean();
        if (!cliente) return res.status(404).json({ ok: false, msg: 'Cliente no encontrado.' });

        const licencia   = await License.findOne({ clave: tenantId }).lean();
        const vehiculos  = await Vehiculo.find({ tenantId }).lean();
        const choferes   = await Driver.find({ tenantId }).lean();
        const rutas      = await Route.find({ tenantId })
            .select('name status createdAt')
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        res.json({
            ok: true,
            cliente,
            licencia,
            uso: {
                vehiculos: vehiculos.map(v => ({ placa: v.placa, alias: v.alias, marca: v.marca })),
                choferes:  choferes.map(d => ({ nombre: d.nombre, email: d.email })),
                rutas:     rutas.map(r => ({ name: r.name, status: r.status, fecha: r.createdAt }))
            }
        });
    } catch (err) {
        res.status(500).json({ ok: false, msg: 'Error interno.' });
    }
});

// ─── PATCH /api/superadmin/licencias/:tenantId/plan ───────────────────────────
router.patch('/licencias/:tenantId/plan', requireSA, async (req, res) => {
    try {
        const { plan } = req.body;
        const planesValidos = ['TRIAL', 'PRO', 'CORPORATIVO'];
        if (!planesValidos.includes(plan)) {
            return res.status(400).json({ ok: false, msg: `Plan inválido. Opciones: ${planesValidos.join(', ')}` });
        }

        const licencia = await License.findOneAndUpdate(
            { clave: req.params.tenantId },
            { plan, estado: 'activa' },
            { new: true }
        );
        if (!licencia) return res.status(404).json({ ok: false, msg: 'Licencia no encontrada.' });

        res.json({ ok: true, msg: `Plan actualizado a ${plan}.`, licencia });
    } catch (err) {
        res.status(500).json({ ok: false, msg: 'Error interno.' });
    }
});

// ─── PATCH /api/superadmin/licencias/:tenantId/extender ──────────────────────
// Extiende la fecha de vencimiento X días a partir de hoy
router.patch('/licencias/:tenantId/extender', requireSA, async (req, res) => {
    try {
        const { dias } = req.body;
        if (!dias || dias <= 0) {
            return res.status(400).json({ ok: false, msg: 'Indica cuántos días extender.' });
        }

        const licencia = await License.findOne({ clave: req.params.tenantId });
        if (!licencia) return res.status(404).json({ ok: false, msg: 'Licencia no encontrada.' });

        // Si ya venció, extendemos desde hoy. Si sigue activa, desde su fecha actual de fin.
        const base     = licencia.fechaFin && new Date(licencia.fechaFin) > new Date()
            ? new Date(licencia.fechaFin)
            : new Date();
        base.setDate(base.getDate() + parseInt(dias));

        licencia.fechaFin = base;
        licencia.estado   = 'activa';
        await licencia.save();

        res.json({
            ok:       true,
            msg:      `Licencia extendida ${dias} día(s). Nueva fecha de vencimiento: ${base.toLocaleDateString('es-MX')}`,
            fechaFin: base
        });
    } catch (err) {
        res.status(500).json({ ok: false, msg: 'Error interno.' });
    }
});

// ─── PATCH /api/superadmin/licencias/:tenantId/vehiculos-extra ───────────────
router.patch('/licencias/:tenantId/vehiculos-extra', requireSA, async (req, res) => {
    try {
        const { vehiculosExtra } = req.body;
        if (typeof vehiculosExtra !== 'number' || vehiculosExtra < 0) {
            return res.status(400).json({ ok: false, msg: 'vehiculosExtra debe ser número >= 0.' });
        }

        const licencia = await License.findOneAndUpdate(
            { clave: req.params.tenantId },
            { vehiculosExtra },
            { new: true }
        );
        if (!licencia) return res.status(404).json({ ok: false, msg: 'Licencia no encontrada.' });

        const LIMITS     = License.PLAN_LIMITS || { TRIAL: 3, PRO: 5, CORPORATIVO: 8 };
        const limiteBase = LIMITS[licencia.plan] || 3;

        res.json({
            ok:          true,
            msg:         `Ahora permite ${limiteBase + vehiculosExtra} vehículo(s) en total.`,
            limiteTotal: limiteBase + vehiculosExtra
        });
    } catch (err) {
        res.status(500).json({ ok: false, msg: 'Error interno.' });
    }
});

// ─── POST /api/superadmin/seed ────────────────────────────────────────────────
// Crea el primer superadmin. Desactivar en producción después de usarlo.
router.post('/seed', async (req, res) => {
    try {
        const existe = await SuperAdmin.findOne();
        if (existe) {
            return res.status(400).json({ ok: false, msg: 'Ya existe un superadmin.' });
        }

        const { nombre, email, password } = req.body;
        if (!nombre || !email || !password) {
            return res.status(400).json({ ok: false, msg: 'Faltan campos.' });
        }

        const admin = await SuperAdmin.create({ nombre, email, password });
        res.status(201).json({ ok: true, msg: 'Superadmin creado.', id: admin._id });
    } catch (err) {
        res.status(500).json({ ok: false, msg: err.message });
    }
});

module.exports = router;