require('dotenv').config();
const http = require('http');
const { Server } = require("socket.io");
const app = require('./app');
const connectDB = require('./config/db');
const socketService = require('./services/socketService');

// 1. Conectar a la Base de Datos
connectDB();

// 2. Crear el servidor HTTP (ESTO DEBE IR PRIMERO)
const server = http.createServer(app);

// 3. Crear la instancia de Socket.io usando el servidor creado
const io = new Server(server, {
    cors: { origin: "*" } // Configuración básica de CORS
});

// 4. Inyectar 'io' en la app para que los controladores puedan usarlo
// OJO: Usamos app.set para que sea accesible globalmente de forma segura
app.set('io', io);

// 5. Iniciar el servicio de Socket.io
socketService(io);

// 6. Encender el servidor
const PORT = process.env.NUMA_PORT || 4000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor NUMA corriendo en: http://localhost:${PORT}`);
});