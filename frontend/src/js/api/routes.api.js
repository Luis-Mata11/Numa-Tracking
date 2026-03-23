// src/js/api/routes.api.js

// 👇 1. ATRAPAMOS LA VARIABLE DE ENTORNO DE VITE
// Si estamos en local (con el proxy), esto será vacío ('').
// Si estamos en Render, esto será 'https://tu-backend-en-render.onrender.com'
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Helper interno para hacer peticiones con el token de autenticación.
 * Sustituye al antiguo Auth.authFetch
 */
async function authFetch(endpoint, options = {}) { // <-- Cambié 'url' por 'endpoint' para mayor claridad
    const token = sessionStorage.getItem('numa_token');
    
    // Preparamos los headers base
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    // Si hay token, lo inyectamos
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // 👇 2. ARMAMOS LA URL COMPLETA
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

export async function fetchVehicles() {
    const res = await authFetch('/vehicles');
    if (!res.ok) return [];
    return res.json();
}

export async function fetchDrivers() {
    const res = await authFetch('/drivers');
    if (!res.ok) return [];
    return res.json();
}

export async function saveRoute(routeData, editingId = null) {
    const method = editingId ? 'PUT' : 'POST';
    const url    = editingId ? `/routes/${editingId}` : '/routes';
 
    // En edición, limpiar campos null/vacíos para no pisar datos existentes en el backend
    // Solo enviamos los campos que realmente tienen valor
    const payload = editingId
        ? Object.fromEntries(
            Object.entries(routeData).filter(([_, v]) => v !== null && v !== '' && v !== undefined)
          )
        : routeData;
 
    console.log(`📡 ${method} ${url}`, payload);
 
    const res = await authFetch(url, {
        method,
        body: JSON.stringify(payload)
    });
 
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Error al guardar la ruta');
    }
    return res.json();
}
 

// ✅ PONER
export async function updateRouteStatus(id, action) {
    // POST  /:id/start  → iniciar ruta
    // PATCH /:id/status → cancelar, finalizar, etc.
    const isStart  = action === 'start';
    const method   = isStart ? 'POST'  : 'PATCH';
    const endpoint = isStart ? `/routes/${id}/start` : `/routes/${id}/status`;
    const body     = isStart ? {} : { status: action };

    const res = await authFetch(endpoint, {
        method,
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || 'Error cambiando estado de la ruta');
    }
    return res.json();
}

export async function deleteRoute(id) {
    const res = await authFetch(`/routes/${id}`, {
        method: 'DELETE'
    });
    if (!res.ok) throw new Error('Error eliminando ruta');
    return res.json();
}