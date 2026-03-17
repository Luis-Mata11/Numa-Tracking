// src/js/api/drivers.api.js

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

export async function fetchDrivers() {
    const res = await authFetch('/drivers');
    if (!res.ok) throw new Error('Error cargando choferes');
    return res.json();
}

export async function saveDriver(driverData, editingId = null) {
    const method = editingId ? 'PUT' : 'POST';
    const url    = editingId ? `/drivers/${editingId}` : '/drivers';

    const res = await authFetch(url, {
        method,
        body: JSON.stringify(driverData)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al guardar el chofer');
    }
    return res.json();
}

export async function deleteDriver(id) {
    const res = await authFetch(`/drivers/${id}`, {
        method: 'DELETE'
    });
    if (!res.ok) throw new Error('Error eliminando chofer');
    return res.json();
}