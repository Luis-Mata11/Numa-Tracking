const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';


async function request(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    
    // Usamos sessionStorage como en tu configuración actual
    const token = sessionStorage.getItem('numa_token');
    
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    try {
        const response = await fetch(`${API_URL}${endpoint}`, config);
        
        // Intentamos parsear la respuesta, si falla devolvemos objeto vacío
        const data = await response.json().catch(() => ({}));

        if (response.status === 401 || response.status === 403) {
            // Limpiamos sesión si el token expiró o es inválido
            sessionStorage.removeItem('numa_token');
            sessionStorage.removeItem('numa_user');
            window.location.href = '/login.html';
            return null;
        }

        if (!response.ok) {
            // AJUSTE CLAVE: Tu backend devuelve { error: '...' }, así que agregamos data.error
            const message = data.error || data.msg || 'Error en la petición';
            throw new Error(message);
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

export const api = {
    get: (endpoint) => request(endpoint, 'GET'),
    post: (endpoint, body) => request(endpoint, 'POST', body),
    put: (endpoint, body) => request(endpoint, 'PUT', body),
    delete: (endpoint) => request(endpoint, 'DELETE'),
    
    // --- LOGIN ---
   login: async (email, password) => {
        const data = await request('/auth/login', 'POST', { email, password });
        if (data.token) {
            sessionStorage.setItem('numa_token', data.token);
            sessionStorage.setItem('numa_user', JSON.stringify(data.user));
            
            // 👇 NUEVO: Guardamos la info calculada de la licencia
            if (data.licenciaInfo) {
                sessionStorage.setItem('numa_licencia_info', JSON.stringify(data.licenciaInfo));
            }
        }
        return data;
    },

    // --- REGISTER (NUEVO) ---
    register: async (userData) => {
        // userData debe ser un objeto: { nombre, email, password, empresa, telefono }
        return request('/auth/register', 'POST', userData);
    },

    // --- LOGOUT ---
    logout: () => {
        sessionStorage.clear(); 
        localStorage.removeItem('numa_licencia'); // Limpiamos también la licencia
        window.location.href = '/login.html';
    }
};