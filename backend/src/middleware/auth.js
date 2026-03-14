const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'numa_secret_key_2026';

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader) return res.status(401).json({ ok: false, msg: 'No se proporcionó token' });

  let token = authHeader;
  if (typeof token === 'string' && token.toLowerCase().startsWith('bearer ')) {
    token = token.split(' ')[1];
  }

  if (!token) return res.status(401).json({ ok: false, msg: 'Token no válido' });

  jwt.verify(token, JWT_SECRET, (err, authData) => {
    if (err) return res.status(403).json({ ok: false, msg: 'Token inválido o expirado' });
    req.user = {
      id: authData.id,
      tenantId: authData.tenantId,
      nombre: authData.nombre,
      raw: authData
    };
    next();
  });
};

module.exports = verifyToken;