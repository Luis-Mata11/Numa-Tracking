// src/js/api/dashboard.api.js

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

async function authFetch(endpoint, options = {}) {
    const token = sessionStorage.getItem('numa_token');

    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    return fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
}

// ==========================================
// ENDPOINTS
// ==========================================

export async function fetchBases() {
    const res = await authFetch('/bases');
    if (!res.ok) throw new Error('Error cargando bases');
    return res.json(); // { bases: [], defaultBaseId: '' }
}

export async function fetchRoutes() {
    const res = await authFetch('/routes');
    if (!res.ok) throw new Error('Error cargando rutas');
    return res.json();
}

export async function fetchDrivers() {
    const res = await authFetch('/drivers');
    if (!res.ok) throw new Error('Error cargando choferes');
    return res.json();
}

export async function finalizeRoute(routeId) {
    const res = await authFetch(`/routes/${routeId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'finalizada' })
    });
    if (!res.ok) throw new Error(`Error HTTP: ${res.status}`);
    return res.json();
}

/**
 * Resuelve las coordenadas de la base operativa principal
 * a partir de la respuesta de /bases.
 */
export async function fetchBaseCoords() {
    const data = await fetchBases();

    if (!data.bases?.length) throw new Error('No hay bases activas');

    let base = data.bases.find(b =>
        String(b._id || b.id) === String(data.defaultBaseId)
    );

    if (!base) {
        console.warn('⚠️ No coincidió defaultBaseId, usando bases[0]');
        base = data.bases[0];
    }

    return {
        lat: base.ubicacion.coordinates[1],
        lng: base.ubicacion.coordinates[0]
    };
}