const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const MONGO_URI = process.env.MONGO_URI_NUMA;
        
        if (!MONGO_URI) {
            console.warn('⚠️ MONGO_URI no definida en .env');
            return null;
        }

        mongoose.set('strictQuery', false);
        
        // ELIMINAMOS { useNewUrlParser: true, useUnifiedTopology: true }
        // Mongoose 6+ y 8+ ya lo hacen por defecto.
        const conn = await mongoose.connect(MONGO_URI);
        
        console.log(`✅ Conectado a DB: ${conn.connection.host}`);
        return conn;
    } catch (error) {
        console.error('❌ Error conexión DB:', error.message); // Solo mostramos el mensaje corto
        process.exit(1); 
    }
};

module.exports = connectDB;