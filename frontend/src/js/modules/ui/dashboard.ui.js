// src/js/ui/dashboard.ui.js
// Maneja toda la lógica de presentación del Dashboard:
// KPIs clicables con dropdown, info-panel de ruta seleccionada y toast.

// ─── Estado compartido (inyectado desde dashboard.js) ─────────────────────────
let _routes            = [];
let _drivers           = [];
let _lastKnownLocations = {};
let _onRouteSelected   = null; // callback(route) para notificar al mapa

/**
 * Inicializa el módulo con las referencias de estado del dashboard.
 * Llamar una vez desde dashboard.js después de cargar los datos.
 */
export function initDashboardUI({ routes, drivers, lastKnownLocations, onRouteSelected }) {
    _routes             = routes;
    _drivers            = drivers;
    _lastKnownLocations = lastKnownLocations;
    _onRouteSelected    = onRouteSelected || null;
}

/**
 * Sincroniza las referencias de datos cuando se actualicen (App.updateAll).
 */
export function syncDashboardUIState({ routes, drivers, lastKnownLocations }) {
    _routes             = routes;
    _drivers            = drivers;
    _lastKnownLocations = lastKnownLocations;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
export function showToast(message, duration = 3000) {
    document.getElementById('toast-notification')?.remove();

    const toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.textContent = message;
    toast.style.cssText = `
        position:fixed; bottom:20px; right:20px;
        background:#2ecc71; color:#fff;
        padding:12px 20px; border-radius:6px;
        box-shadow:0 4px 12px rgba(0,0,0,.15);
        z-index:9999; font-weight:500;
        animation: toastIn .2s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}

// ─── Info Panel ───────────────────────────────────────────────────────────────
/**
 * Rellena las info-cards inferiores con los datos de la ruta seleccionada.
 */
export function updateInfoPanel(route) {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    set('route-name-display', route.name || 'Sin asignar');
    set('route-id-display',   route.accessCode || String(route._id || route.id) || '—');

    // Chofer
    let driverName = 'Sin asignar';
    if (route.driver) {
        driverName = typeof route.driver === 'object'
            ? (route.driver.nombre || route.driver.name || 'Sin nombre')
            : (_drivers.find(d => String(d._id || d.id) === String(route.driver))?.nombre || '—');
    }
    set('chofer-name-display', driverName);

    // Vehículo
    let vehicleName = 'Sin asignar';
    if (route.vehicle && typeof route.vehicle === 'object') {
        vehicleName = route.vehicle.alias || route.vehicle.placa || 'Sin nombre';
    }
    set('vehiculo-name-display', vehicleName);

    // Coordenadas: tiempo real > origen del trayecto > vacío
    const driverId = typeof route.driver === 'object'
        ? String(route.driver._id || route.driver.id)
        : String(route.driver || '');
    const lastLoc = driverId ? _lastKnownLocations[driverId] : null;

    if (lastLoc) {
        set('coords-display',        `${lastLoc.lat.toFixed(5)}, ${lastLoc.lng.toFixed(5)}`);
        set('coords-status-display', 'Ubicación en tiempo real');
    } else if (route.trayecto?.origin) {
        set('coords-display',        `${route.trayecto.origin.lat.toFixed(5)}, ${route.trayecto.origin.lng.toFixed(5)}`);
        set('coords-status-display', 'Coordenadas de origen');
    } else {
        set('coords-display',        '—');
        set('coords-status-display', 'Sin ubicación');
    }

    // Notificar al mapa para que resalte la polilínea
    _onRouteSelected?.(String(route._id || route.id));
}

/**
 * Actualiza solo las coordenadas en el info-panel (llamado desde locationUpdate del socket).
 */
export function updateCoordsDisplay(lat, lng) {
    const el  = document.getElementById('coords-display');
    const els = document.getElementById('coords-status-display');
    if (el)  el.textContent  = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    if (els) els.textContent = 'Ubicación en tiempo real';
}

// ─── KPI Manager ──────────────────────────────────────────────────────────────
export const KPIManager = {
    _bound: false,

    /** Cierra todos los dropdowns abiertos */
    closeAll() {
        document.querySelectorAll('.kpi-dropdown.open').forEach(d => d.classList.remove('open'));
    },

    /** Abre el dropdown de un KPI card con la lista de items */
    open(kpiId, items, emptyMsg = 'Sin registros') {
        this.closeAll();

        const card = document.querySelector(`[data-kpi="${kpiId}"]`);
        if (!card) return;

        let dropdown = card.querySelector('.kpi-dropdown');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.className = 'kpi-dropdown';
            card.appendChild(dropdown);
        }

        dropdown.innerHTML = items.length
            ? items.map(item => `
                <div class="kpi-dropdown-item"
                     data-route-id="${item.routeId  || ''}"
                     data-driver-id="${item.driverId || ''}">
                    <div class="kpi-di-name">${item.name}</div>
                    ${item.sub ? `<div class="kpi-di-sub">${item.sub}</div>` : ''}
                </div>`).join('')
            : `<div class="kpi-dropdown-empty">${emptyMsg}</div>`;

        // Click en un item → seleccionar ruta o chofer
        dropdown.querySelectorAll('.kpi-dropdown-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const routeId = el.dataset.routeId;
                if (routeId) {
                    const route = _routes.find(r => String(r._id || r.id) === routeId);
                    if (route) updateInfoPanel(route);
                }
                this.closeAll();
            });
        });

        dropdown.classList.add('open');
    },

    /**
     * Calcula los 4 grupos de datos, actualiza los números en pantalla
     * y vincula el click a cada card (una sola vez).
     */
    update(routesData, driversData) {
        if (!Array.isArray(routesData)) return;

        const pendientes   = routesData.filter(r => ['pendiente','pending'].includes(r.estado || r.status));
        const enCurso      = routesData.filter(r => ['en curso','active'].includes(r.estado || r.status));
        const driverIdsOcupados = enCurso
            .map(r => String(r.driver?._id || r.driver?.id || r.driver))
            .filter(Boolean);
        const choferesDisp = (driversData || []).filter(d => !driverIdsOcupados.includes(String(d._id || d.id)));

        // Actualizar números
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('kpi-activos',   enCurso.length);
        set('kpi-rutas',     pendientes.length);
        set('kpi-alertas',   choferesDisp.length);
        set('kpi-distancia', driversData?.length || 0);

        // Vincular clicks (solo la primera vez para no acumular listeners)
        const bindKpi = (kpiId, selector, buildItems) => {
            const card = document.querySelector(selector);
            if (!card || card.dataset.kpiBound) return;
            card.dataset.kpi      = kpiId;
            card.dataset.kpiBound = '1';
            card.style.cursor     = 'pointer';
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = card.querySelector('.kpi-dropdown')?.classList.contains('open');
                if (isOpen) { this.closeAll(); return; }
                this.open(kpiId, buildItems());
            });
        };

        bindKpi('enCurso',    '.kpi-card:nth-child(1)', () => enCurso.map(r => ({
            name:    r.name || 'Ruta sin nombre',
            sub:     `${r.driver?.nombre || 'Sin chofer'} · ${r.vehicle?.alias || r.vehicle?.placa || 'Sin vehículo'}`,
            routeId: String(r._id || r.id)
        })));

        bindKpi('pendientes', '.kpi-card:nth-child(2)', () => pendientes.map(r => ({
            name:    r.name || 'Ruta sin nombre',
            sub:     `Código: ${r.accessCode || '—'} · ${r.driver?.nombre || 'Sin chofer'}`,
            routeId: String(r._id || r.id)
        })));

        bindKpi('choferes',   '.kpi-card:nth-child(3)', () => choferesDisp.map(d => ({
            name:     d.nombre || d.name || 'Chofer',
            sub:      d.email  || '—',
            driverId: String(d._id || d.id)
        })));

        bindKpi('vehiculos',  '.kpi-card:nth-child(4)', () => (driversData || []).map(d => ({
            name:     d.nombre || d.name || 'Chofer',
            sub:      d.email  || '—',
            driverId: String(d._id || d.id)
        })));

        // Listener global de cierre (una sola vez)
        if (!this._bound) {
            this._bound = true;
            document.addEventListener('click', () => this.closeAll());
        }
    }
};