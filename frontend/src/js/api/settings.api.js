// src/js/api/settings.api.js

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

    const res = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });

    if (res.status === 401) {
        window.location.href = 'login.html';
        throw new Error('Sesión expirada');
    }

    return res;
}

// ==========================================
// BASES
// ==========================================

export async function fetchBases() {
    const res = await authFetch('/api/bases');
    if (!res.ok) throw new Error('Error cargando bases');
    return res.json(); // { bases: [], defaultBaseId: '' }
}

export async function saveBase(payload, editingId = null) {
    const method   = editingId ? 'PUT' : 'POST';
    const endpoint = editingId ? `/api/bases/${editingId}` : '/api/bases';

    const res = await authFetch(endpoint, {
        method,
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al guardar la base');
    }
    return res.json();
}

export async function deleteBase(id) {
    const res = await authFetch(`/api/bases/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Error al eliminar la base');
    return res.json();
}

export async function setDefaultBase(id) {
    const res = await authFetch(`/api/bases/${id}/default`, { method: 'PUT' });
    if (!res.ok) throw new Error('Error al establecer base principal');
    return res.json();
}

export async function logout() {
    await authFetch('/api/admin/logout', { method: 'POST' });
    window.location.href = 'login.html';
}