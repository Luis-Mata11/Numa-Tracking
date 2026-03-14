// js/ui/filters.ui.js
import { debounce } from '../utils/helpers.js';
import { getRoutes } from '../state/routes.store.js';
import { renderRoutes } from './list.ui.js';

export function applyRouteFilters(searchText = '') {
    const text = searchText.toString().toLowerCase().trim();
    const tokens = text.split(/\s+/).filter(Boolean);

    const fVehicle = document.getElementById('filter-vehicle') || document.getElementById('vehicle-filter');
    const fDriver = document.getElementById('filter-driver') || document.getElementById('driver-filter');
    const fStatus = document.getElementById('filter-status') || document.getElementById('status-filter');

    const filterVehicle = fVehicle ? String(fVehicle.value).trim() : '';
    const filterDriver = fDriver ? String(fDriver.value).trim() : '';
    const filterStatus = fStatus ? String(fStatus.value).trim() : '';

    const list = getRoutes();

    return list.filter(r => {
        const name = (r.name || r.title || '').toString().toLowerCase();
        // Aseguramos que el estado coincida con nuestros valores fijos
        const status = (r.status || '').toString().toLowerCase(); 
        const drv = (r.driver && (r.driver.nombre || r.driver) || r.driver || '').toString().toLowerCase();
        const veh = (r.vehicle && (r.vehicle.alias || r.vehicle.placa || r.vehicle) || '').toString().toLowerCase();

        const hay = [name, status, drv, veh].join(' ');
        const tokensMatch = tokens.length === 0 ? true : tokens.every(t => hay.includes(t));

        let vehicleMatch = true, driverMatch = true, statusMatch = true;
        if (filterVehicle) vehicleMatch = !!(r.vehicle && (r.vehicle._id == filterVehicle || r.vehicle.id == filterVehicle || String(r.vehicle).toLowerCase().includes(filterVehicle.toLowerCase())));
        if (filterDriver) driverMatch = !!(r.driver && (r.driver._id == filterDriver || r.driver.id == filterDriver || String(r.driver).toLowerCase().includes(filterDriver.toLowerCase())));
        if (filterStatus) statusMatch = status === filterStatus.toLowerCase(); // Comparación exacta del estado

        return tokensMatch && vehicleMatch && driverMatch && statusMatch;
    });
}

export function populateFiltersFromRoutes() {
    const routes = getRoutes();
    if (!Array.isArray(routes)) return;

    const fV = document.getElementById('filter-vehicle') || document.getElementById('vehicle-filter');
    const fD = document.getElementById('filter-driver') || document.getElementById('driver-filter');
    const fS = document.getElementById('filter-status') || document.getElementById('status-filter');
    const searchInput = document.getElementById('search-route');

    const vehicles = new Map();
    const drivers = new Map();
    
    // 🔥 1. Definimos los estados fijos de tu sistema
    const fixedStatuses = [
        { value: 'pending', label: 'Pendiente' },
        { value: 'activa', label: 'Activa' },
        { value: 'finalizada', label: 'Finalizada' },
        { value: 'cancelled', label: 'Cancelada' }
    ];

    // Extraemos dinámicamente solo vehículos y choferes
    routes.forEach(r => {
        if (r.vehicle) {
            const key = (r.vehicle._id || r.vehicle.id || r.vehicle).toString();
            const label = (r.vehicle.alias || r.vehicle.placa || r.vehicle.marca || r.vehicle).toString();
            vehicles.set(key, label);
        }
        if (r.driver) {
            const key = (r.driver._id || r.driver.id || r.driver).toString();
            const label = (r.driver.nombre || r.driver).toString();
            drivers.set(key, label);
        }
    });

    // Función que dispara el filtro
    const triggerFilter = () => {
        const filteredRoutes = applyRouteFilters(searchInput ? searchInput.value : '');
        renderRoutes(filteredRoutes);
    };

    if (fV) {
        const prev = fV.value;
        fV.innerHTML = '<option value="">-- Todos los Vehículos --</option>';
        vehicles.forEach((label, key) => { fV.appendChild(new Option(label, key)); });
        fV.value = prev || '';
        // Evitamos duplicar eventos si se llama varias veces
        fV.removeEventListener('change', triggerFilter);
        fV.addEventListener('change', triggerFilter);
    }
    
    if (fD) {
        const prev = fD.value;
        fD.innerHTML = '<option value="">-- Todos los Choferes --</option>';
        drivers.forEach((label, key) => { fD.appendChild(new Option(label, key)); });
        fD.value = prev || '';
        fD.removeEventListener('change', triggerFilter);
        fD.addEventListener('change', triggerFilter);
    }
    
    if (fS) {
        const prev = fS.value;
        fS.innerHTML = '<option value="">-- Todos los Estados --</option>';
        
        // 🔥 2. Llenamos el select con los estados fijos
        fixedStatuses.forEach(st => { 
            fS.appendChild(new Option(st.label, st.value)); 
        });
        
        fS.value = prev || '';
        fS.removeEventListener('change', triggerFilter);
        fS.addEventListener('change', triggerFilter);
    }
}

export function setupSearch() {
    const searchInput = document.getElementById('search-route');
    if (searchInput) {
        const onSearch = (e) => {
            const text = (e.target.value || '').toLowerCase().trim();
            const list = getRoutes();
            
            // Si no hay texto y no hay filtros activos, mostrar todo
            const filtered = applyRouteFilters(text);
            renderRoutes(filtered);
        };
        searchInput.addEventListener('input', debounce(onSearch, 180));
    }
}