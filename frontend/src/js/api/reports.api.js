// src/js/api/reports.api.js

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

    const fullUrl = `${API_BASE_URL}${endpoint}`;
    return fetch(fullUrl, { ...options, headers });
}

// ==========================================
// ENDPOINTS
// ==========================================

export async function fetchRoutes() {
    const res = await authFetch('/routes');
    if (!res.ok) throw new Error('Error cargando rutas');
    return res.json();
}

export async function fetchDrivers() {
    const res = await authFetch('/drivers');
    if (!res.ok) return [];
    return res.json();
}

export async function fetchVehicles() {
    const res = await authFetch('/vehicles');
    if (!res.ok) return [];
    return res.json();
}

export async function fetchRecorrido(routeId) {
    const res = await authFetch(`/recorrido/${routeId}`);
    if (!res.ok) return null;
    return res.json();
}

/**
 * Construye la URL del proxy de mapa (mismo origen → sin CORS para html2canvas)
 */
export function buildProxyMapUrl({ encodedPolyline, realPositions = [], w = 700, h = 280 }) {
    const params = new URLSearchParams({ w, h });

    if (encodedPolyline) {
        params.set('polyline', encodedPolyline);
    }

    if (realPositions.length >= 2) {
        const step   = Math.max(1, Math.floor(realPositions.length / 50));
        const points = realPositions
            .filter((_, i) => i % step === 0)
            .map(p => `${p.lat},${p.lng}`)
            .join('|');
        params.set('path', points);
    }

    return `${API_BASE_URL}/api/map-image?${params.toString()}`;
}