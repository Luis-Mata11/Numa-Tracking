// public/js/modules/ui/ui.js
import { state } from '../state.js';
import { getCurrentUser, getLicenseData } from '../services/auth.js';

// --- Notificaciones (Toasts) ---
export function showToast(message, duration = 3000) {
    const existingToast = document.getElementById('toast-notification');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed; bottom: 20px; right: 20px;
        background-color: #2ecc71; color: white;
        padding: 12px 20px; border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 9999;
        font-weight: 500; animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// --- KPIs ---
export async function updateKPIs() {
    try {
        const token = sessionStorage.getItem('numa_token');
        const res = await fetch('/api/routes', { headers: { 'Authorization': `Bearer ${token}` }});
        if (!res.ok) return;
        
        const data = await res.json();
        if (Array.isArray(data)) {
            const elActivos = document.getElementById('kpi-activos');
            const elRutas = document.getElementById('kpi-rutas');
            const elAlertas = document.getElementById('kpi-alertas');

            if(elActivos) elActivos.textContent = data.filter(r => r.estado === 'pendiente').length;
            if(elRutas) elRutas.textContent = data.filter(r => r.estado === 'en curso').length;
            if(elAlertas) elAlertas.textContent = data.filter(r => r.estado === 'finalizada').length;
        }
    } catch (err) { console.error("Error KPIs", err); }
}

// --- Panel Lateral de Información ---
export function updateInfoPanel(route) {
    const elName = document.getElementById('route-name-display');
    const elId = document.getElementById('route-id-display');
    const elDriver = document.getElementById('chofer-name-display');
    const elCoords = document.getElementById('coords-display');

    if (elName) elName.textContent = route.name || 'Sin asignar';
    if (elId) elId.textContent = route.id || '...';

    let driverName = "Sin asignar";
    if (route.driver) {
        // Buscamos en el estado global
        const d = state.drivers.find(dr => dr.id === route.driver || dr.id === route.driver.id);
        if (d) driverName = d.name;
    }
    if (elDriver) elDriver.textContent = driverName;

    const lastLoc = route.driver ? state.lastKnownLocations[route.driver.id || route.driver] : null;
    if (lastLoc && elCoords) {
        elCoords.textContent = `${lastLoc.lat.toFixed(5)}, ${lastLoc.lng.toFixed(5)}`;
    }
}

// --- Estado del Chofer (Badge) ---
export function updateRouteDriverStatus(routeId, status) {
    const statusEl = document.getElementById('driver-status-badge');
    if (!statusEl) return;

    if (status === 'ready') {
        statusEl.innerHTML = '<i class="fa-solid fa-circle" style="margin-right: 5px;"></i>Listo para iniciar';
        statusEl.className = 'text-warning'; // Usamos las clases de tu CSS nuevo
    } else if (status === 'started') {
        statusEl.innerHTML = '<i class="fa-solid fa-circle" style="margin-right: 5px;"></i>En curso';
        statusEl.className = 'text-success';
    }
}