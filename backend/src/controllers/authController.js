const Cliente = require('../models/Client');
const License = require('../models/License'); // <--- IMPORTANTE
const Driver = require('../models/Driver');   // <--- NUEVO: Modelo de Chofer
const Route = require('../models/Route');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'numa_secret_key_2026';

function generarLicencia() {
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `NUMA-${random}`;
}

exports.register = async (req, res) => {
    try {
        console.log("1. Iniciando registro..."); // DEBUG

        const { nombre, email, password, empresa, telefono } = req.body;

        // Validar duplicados
        const existe = await Cliente.findOne({ email });
        if (existe) return res.status(400).json({ error: 'El correo ya está registrado' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const licenciaKey = generarLicencia();

        // --- PASO 1: CREAR CLIENTE ---
        const nuevoCliente = await Cliente.create({
            nombre,
            email,
            password: hashedPassword,
            empresa,
            telefono,
            tenantId: licenciaKey,
            rol: 'admin' // <--- NUEVO: Aseguramos que se guarde con el rol correcto
        });

        console.log("2. Cliente creado ID:", nuevoCliente._id); // DEBUG

        // --- PASO 2: PREPARAR FECHAS ---
        const fechaInicio = new Date();
        const fechaFin = new Date();
        fechaFin.setDate(fechaInicio.getDate() + 15); // 15 días de Trial

       // --- PASO 3: CREAR LICENCIA ---
        console.log("3. Intentando crear licencia con tenantId:", licenciaKey); // DEBUG

        try {
            // 1. Ponemos los datos que Mongoose EXIGE para no lanzar error de validación
            const nuevaLicencia = new License({
                clienteId: nuevoCliente._id, // Mongoose lo pide
                clave: licenciaKey,          // Mongoose lo pide
                plan: 'TRIAL',
                fechaInicio: fechaInicio,
                fechaFin: fechaFin,
                estado: 'activa'
            });

            // 🔥 2. EL TRUCO: Forzamos los campos que realmente usa tu BD (strict: false)
            nuevaLicencia.set('cliente', nuevoCliente._id, { strict: false });
            nuevaLicencia.set('tenantId', licenciaKey, { strict: false });

            // 3. Guardamos en la base de datos
            await nuevaLicencia.save();
            
            console.log("4. Licencia guardada exitosamente:", nuevaLicencia._id); // DEBUG

            res.status(201).json({
                msg: 'Usuario registrado correctamente',
                licencia: nuevaLicencia
            });

        } catch (licenciaError) {
            // 👇 Agregué esta línea para que veas el error real de Mongoose en tu consola de Node
            console.error("❌ ERROR DETALLADO GUARDANDO LICENCIA:", licenciaError.message);

            // Si falla la licencia, borramos el usuario para no dejar datos corruptos
            await Cliente.findByIdAndDelete(nuevoCliente._id);

            return res.status(500).json({ error: 'Error al generar la licencia. Intente de nuevo.' });
        }
        
    } catch (error) {
        console.error('Error general en registro:', error);
        res.status(500).json({ error: 'Error interno en el servidor' });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Buscar Cliente
        const user = await Cliente.findOne({ email });
        if (!user) return res.status(400).json({ error: 'Credenciales inválidas' });

        const validPass = await bcrypt.compare(password, user.password);
        if (!validPass) return res.status(400).json({ error: 'Credenciales inválidas' });

        // 2. BUSCAR SU LICENCIA
        // 2. BUSCAR SU LICENCIA
const licencia = await License.findOne({ cliente: user._id }); // <--- Debe decir 'cliente'

        if (!licencia) {
            return res.status(403).json({ error: 'Usuario sin licencia asignada. Contacte soporte.' });
        }

        // 3. Verificar si venció
        const hoy = new Date();
        let estadoLicencia = licencia.estado;

        if (new Date(licencia.fechaFin) < hoy) {
            estadoLicencia = 'vencida';
            // Opcional: Actualizar en BD si no estaba marcada como vencida
            if (licencia.estado !== 'vencida') {
                await License.updateOne({ _id: licencia._id }, { estado: 'vencida' });
            }
        }

        // 4. Generar Token
        // Incluimos datos clave en el token para evitar consultas constantes
        const token = jwt.sign(
            {
                id: user._id,
                tenantId: user.tenantId,
                role: 'admin',
                plan: licencia.plan // Para saber si dejarle usar features PRO
            },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            token,
            user: {
                id: user._id,
                nombre: user.nombre,
                email: user.email,
                tenantId: user.tenantId
            },
            // Enviamos info extra de la licencia para el Frontend
            licenciaInfo: {
                plan: licencia.plan || 'TRIAL', // Si no existe, por defecto TRIAL
                estado: estadoLicencia,
                fechaFin: licencia.fechaFin,
                diasRestantes: Math.ceil((new Date(licencia.fechaFin) - hoy) / (1000 * 60 * 60 * 24))
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error en el login' });
    }
};
exports.driverLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('🔍 LOGIN body:', { email, password });

        const driver = await Driver.findOne({ email });
        console.log('🔍 Driver:', driver ? `${driver._id} | tenantId: ${driver.tenantId}` : 'NO ENCONTRADO');

        if (!driver) return res.status(404).json({ msg: 'No existe un chofer registrado con este correo.' });

        // Sin filtro de status para ver si la ruta existe
        const routeAny = await Route.findOne({ accessCode: password, driver: driver._id });
        console.log('🔍 Ruta (sin status filter):', routeAny ? `${routeAny._id} | status: "${routeAny.status}"` : 'NO ENCONTRADA');

        const route = await Route.findOne({
            accessCode: password,
            driver: driver._id,
            status: { $in: ['pending', 'active', 'pendiente', 'en curso', 'creada'] }
        })
        .populate('vehicle')
        .populate('driver')
        .populate('trayecto');

        console.log('🔍 Ruta (con status filter):', route ? route._id : 'NO ENCONTRADA');

        if (!route) {
            return res.status(401).json({ msg: 'Contraseña incorrecta, la ruta ya finalizó o no te pertenece.' });
        }

        // 3. El chofer está en la sala de espera de esta ruta
        await Route.updateMany(
            {
                driver: driver._id,
                _id: { $ne: route._id },
                status: { $in: ['pending', 'creada', 'pendiente'] }
            },
            { driverIsReady: false }
        );

        route.driverIsReady = true;
        await route.save();

        // 4. Generar Token para el chofer
        const token = jwt.sign(
            {
                id: driver._id,
                tenantId: driver.tenantId,
                role: 'driver',
                routeId: route._id
            },
            process.env.JWT_SECRET || 'mi_secreto_super_seguro',
            { expiresIn: '14h' }
        );

        // 5. Devolver la info al cliente móvil
        res.json({
            msg: 'Acceso autorizado. Preparando ruta...',
            token,
            chofer: {
                id: driver._id,
                nombre: driver.nombre,
                email: driver.email,
                tenantId: driver.tenantId
            },
            // 👇 CAMBIO CRÍTICO: Mandamos TODO el objeto route, para que incluya el 'trayecto'
            route: route
        });

    } catch (error) {
        console.error('Error en driverLogin:', error);
        res.status(500).json({ msg: 'Error interno en el servidor al intentar acceder.' });
    }
};