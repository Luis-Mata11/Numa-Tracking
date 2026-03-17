// src/js/api/vehicles.api.js

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

export async function fetchVehicles() {
    const res = await authFetch('/vehicles');
    if (!res.ok) throw new Error('Error cargando vehículos');
    return res.json();
}

export async function saveVehicle(vehicleData, editingId = null) {
    const method = editingId ? 'PUT' : 'POST';
    const url    = editingId ? `/vehicles/${editingId}` : '/vehicles';

    const res = await authFetch(url, {
        method,
        body: JSON.stringify(vehicleData)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al guardar el vehículo');
    }
    return res.json();
}

export async function deleteVehicle(id) {
    const res = await authFetch(`/vehicles/${id}`, {
        method: 'DELETE'
    });
    if (!res.ok) throw new Error('Error eliminando vehículo');
    return res.json();
}