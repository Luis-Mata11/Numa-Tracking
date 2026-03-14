// src/js/modules/views/reportsView.js
import '../../css/reports.css';
import '../../css/loader.css';
import { showLoader, hideLoader } from '../utils/loader.js';
import { fetchRoutes, fetchVehicles, fetchDrivers } from '../api/routes.api.js';

// ─── Estado global ────────────────────────────────────────────────────────────
const state = {
    routes:           [],
    drivers:          [],
    vehicles:         [],
    filteredRoutes:   [],
    activeDateFilter: 'day'
};

let elements = {};

// ─── URL del mapa a través del proxy del backend (mismo origen → sin CORS) ───
function buildProxyMapUrl({ encodedPolyline, realPositions = [], w = 700, h = 280 }) {
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

    return `/api/map-image?${params.toString()}`;
}

// ─── Servicio de datos ────────────────────────────────────────────────────────
const ReportService = {
    async fetchData() {
        const [allRoutes, driversRes, vehiclesRes] = await Promise.all([
            fetchRoutes(),
            fetchDrivers(),
            fetchVehicles()
        ]);

        const finalizadas = allRoutes.filter(route => {
            const st = (route.estado || route.status || '').toLowerCase().trim();
            return st === 'finalizada' || st === 'completed' || st === 'finished';
        });

        return { routes: finalizadas, drivers: driversRes, vehicles: vehiclesRes };
    },

    async fetchRecorrido(routeId) {
        try {
            const token = sessionStorage.getItem('numa_token');
            const res   = await fetch(`/api/recorrido/${routeId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) return null;
            return await res.json();
        } catch (e) {
            console.warn('No se pudo obtener recorrido:', e);
            return null;
        }
    }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getCompletionDate(route) {
    return new Date(route.completedAt || route.updatedAt || route.createdAt || Date.now());
}
function getDriverName(route) {
    const id  = route.driver?._id || route.driver?.id || route.driver;
    const obj = state.drivers.find(d => String(d._id || d.id) === String(id)) || {};
    return obj.nombre || route.driver?.nombre || 'No asignado';
}
function getVehicleName(route) {
    const id  = route.vehicle?._id || route.vehicle?.id || route.vehicle;
    const obj = state.vehicles.find(v => String(v._id || v.id) === String(id)) || {};
    return obj.alias || obj.placa || route.vehicle?.alias || 'No asignado';
}
function formatDuration(seconds) {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}min` : `${m} min`;
}
function formatDistance(meters) {
    if (!meters) return '—';
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}

// ─── UI ───────────────────────────────────────────────────────────────────────
const UI = {
    showSkeletonLoader(count = 6) {
        if (!elements.resultsGrid) return;
        elements.resultsGrid.innerHTML = Array(count).fill(`
            <div class="route-card skeleton-card">
                <div class="skel-line" style="width:60%;height:16px;margin-bottom:14px;border-radius:4px;"></div>
                <div class="skel-line" style="width:100%;height:12px;margin-bottom:8px;border-radius:4px;"></div>
                <div class="skel-line" style="width:80%;height:12px;margin-bottom:8px;border-radius:4px;"></div>
                <div class="skel-line" style="width:40%;height:12px;border-radius:4px;"></div>
            </div>`).join('');
    },
    setDefaultMonth() {
        if (!elements.monthInput) return;
        const now   = new Date();
        elements.monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    },
    populateFilterValues() {
        const filterType  = elements.filterType.value;
        const valueSelect = elements.filterValue;
        valueSelect.innerHTML = '';
        valueSelect.disabled  = true;

        if (filterType === 'all') {
            valueSelect.innerHTML = '<option value="">-- Elige un tipo de filtro --</option>';
            return;
        }

        const data        = filterType === 'driver' ? state.drivers : state.vehicles;
        const defaultText = filterType === 'driver'  ? 'Todos los choferes' : 'Todos los vehículos';
        let html = `<option value="">${defaultText}</option>`;
        data.forEach(item => {
            const id   = item._id || item.id;
            const name = item.nombre || item.alias || `${item.marca || ''} ${item.modelo || ''}`.trim() || 'Sin especificar';
            html += `<option value="${id}">${name}</option>`;
        });
        valueSelect.innerHTML = html;
        valueSelect.disabled  = false;
    },
    renderResults(routesToRender) {
        if (!elements.resultsGrid) return;

        if (!routesToRender.length) {
            elements.resultsGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-inbox"></i>
                    <p>No se encontraron rutas finalizadas para los filtros seleccionados.</p>
                </div>`;
            return;
        }

        elements.resultsGrid.innerHTML = routesToRender.map(route => {
            const driverName  = getDriverName(route);
            const vehicleName = getVehicleName(route);
            const dateStr     = getCompletionDate(route).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
            const distancia   = route.trayecto?.distancia_metros;
            const duracion    = route.trayecto?.tiempo_estimado_segundos;

            return `
                <div class="route-card">
                    <div class="card-header">
                        <div class="route-dot" style="background:${route.color || '#6c8cff'};"></div>
                        <h3 class="route-name">${route.name || 'Ruta sin nombre'}</h3>
                        <span class="completion-date">${dateStr}</span>
                    </div>
                    <div class="card-body">
                        <p><i class="fa-solid fa-user"></i> <strong>Chofer:</strong> ${driverName}</p>
                        <p><i class="fa-solid fa-truck"></i> <strong>Vehículo:</strong> ${vehicleName}</p>
                        ${distancia ? `<p><i class="fa-solid fa-route"></i> <strong>Distancia:</strong> ${formatDistance(distancia)}</p>` : ''}
                        ${duracion  ? `<p><i class="fa-regular fa-clock"></i> <strong>Tiempo est.:</strong> ${formatDuration(duracion)}</p>` : ''}
                        <p><i class="fa-solid fa-check-circle" style="color:#10b981;"></i> <strong>Estatus:</strong> Finalizada</p>
                    </div>
                    <div class="card-footer">
                        <button class="btn-details" data-id="${route._id || route.id}">
                            <i class="fa-solid fa-eye"></i> Ver detalle
                        </button>
                    </div>
                </div>`;
        }).join('');

        elements.resultsGrid.querySelectorAll('.btn-details').forEach(btn => {
            btn.addEventListener('click', () => {
                const route = state.routes.find(r => String(r._id || r.id) === btn.dataset.id);
                if (route) PDFManager.openSingleDetail(route);
            });
        });
    },
    showError(message) {
        if (!elements.resultsGrid) return;
        elements.resultsGrid.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-triangle-exclamation" style="color:#ff6b6b;"></i>
                <p>${message}</p>
            </div>`;
    }
};

// ─── Filtrado ─────────────────────────────────────────────────────────────────
const FilterLogic = {
    applyFilters() {
        let result = [...state.routes];
        const now  = new Date();

        if (state.activeDateFilter === 'day') {
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            result = result.filter(r => getCompletionDate(r) >= start);
            if (elements.reportTitle) elements.reportTitle.textContent = 'Reporte de Hoy';

        } else if (state.activeDateFilter === 'week') {
            const day  = now.getDay();
            const diff = day === 0 ? -6 : 1 - day;
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
            result = result.filter(r => getCompletionDate(r) >= start);
            if (elements.reportTitle) elements.reportTitle.textContent = 'Reporte de la Semana';

        } else if (state.activeDateFilter === 'month') {
            const monthValue = elements.monthInput?.value;
            if (monthValue) {
                const [year, month] = monthValue.split('-').map(Number);
                const start = new Date(year, month - 1, 1);
                const end   = new Date(year, month, 1);
                result = result.filter(r => { const d = getCompletionDate(r); return d >= start && d < end; });
                const name = start.toLocaleString('es-ES', { month: 'long' });
                if (elements.reportTitle)
                    elements.reportTitle.textContent = `Reporte de ${name.charAt(0).toUpperCase() + name.slice(1)} ${year}`;
            }
        }

        const filterType  = elements.filterType?.value;
        const filterValue = elements.filterValue?.value;
        if (filterType !== 'all' && filterValue) {
            result = result.filter(route => {
                const id = filterType === 'driver'
                    ? (route.driver?._id  || route.driver?.id  || route.driver)
                    : (route.vehicle?._id || route.vehicle?.id || route.vehicle);
                return String(id) === String(filterValue);
            });
        }

        state.filteredRoutes = result;
        UI.renderResults(result);
    }
};

// ─── Modal PDF ────────────────────────────────────────────────────────────────
const PDFManager = {
    _setContent(html) {
        const el = document.querySelector('#pdf-modal-content');
        if (el) el.innerHTML = html;
    },
    _openModal() {
        this._setContent(`<div style="text-align:center;padding:40px;color:#888;"><i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;margin-bottom:12px;"></i><p>Cargando datos...</p></div>`);
        document.getElementById('pdf-modal')?.classList.add('open');
        document.getElementById('pdf-modal-overlay')?.classList.remove('hidden');
        document.getElementById('pdf-modal-overlay')?.removeAttribute('style');
    },
    _header(title) {
        const now = new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
        return `
            <div class="pdf-report-header">
                <div class="pdf-logo-area">
                    <img src="/assets/logo.svg" alt="NUMA" onerror="this.style.display='none'" style="height:36px;" />
                    <span class="pdf-brand">NUMA Tracking</span>
                </div>
                <div class="pdf-report-meta"><h2>${title}</h2><p>Generado: ${now}</p></div>
            </div>`;
    },

    async open() {
        this._openModal();
        const routes = state.filteredRoutes;
        if (!routes.length) { this._setContent('<p style="padding:40px;text-align:center;color:#888;">No hay rutas para mostrar.</p>'); return; }

        const recorridos = await Promise.all(routes.map(r => ReportService.fetchRecorrido(r._id || r.id)));
        this._setContent(this._header(elements.reportTitle?.textContent || 'Reporte') +
            `<div class="pdf-routes-list">${routes.map((r, i) => this._buildRouteCard(r, recorridos[i])).join('')}</div>`);
    },

    async openSingleDetail(route) {
        this._openModal();
        const recorrido = await ReportService.fetchRecorrido(route._id || route.id);
        this._setContent(this._header('Detalle de Ruta') +
            `<div class="pdf-routes-list">${this._buildRouteCard(route, recorrido)}</div>`);
    },

    _buildRouteCard(route, recorridoData) {
        const driverName   = getDriverName(route);
        const vehicleName  = getVehicleName(route);
        const dateStr      = getCompletionDate(route).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
        const distPlaneada = formatDistance(route.trayecto?.distancia_metros);
        const tiempoEst    = formatDuration(route.trayecto?.tiempo_estimado_segundos);

        const recorrido    = recorridoData?.recorrido || null;
        const posiciones   = recorrido?.posiciones    || [];
        const distReal     = formatDistance(recorrido?.distanciaMetros);
        const desviaciones = recorrido?.desviaciones  ?? '—';
        const eventos      = (recorridoData?.bitacora || []).filter(e => e.action !== 'trace');

        // Imagen del mapa servida por /api/map-image (mismo origen → html2canvas sin CORS)
        const hasMap  = !!(route.trayecto?.encodedPolyline || posiciones.length >= 2);
        const mapUrl  = hasMap ? buildProxyMapUrl({ encodedPolyline: route.trayecto?.encodedPolyline, realPositions: posiciones }) : '';
        const mapHtml = hasMap
            ? `<img src="${mapUrl}" class="pdf-map-img" alt="Mapa comparativo" />`
            : `<div class="pdf-map-placeholder"><i class="fa-solid fa-map" style="font-size:2rem;opacity:0.3;"></i><p>Sin datos de mapa</p></div>`;

        const eventosHtml = eventos.length
            ? eventos.map(e => `
                <div class="pdf-event-row">
                    <span>${{ desvio:'⚠️', reingreso:'✅', start:'🚀', complete:'🏁', stop:'🛑' }[e.action] || '•'}</span>
                    <span class="pdf-event-desc">${e.description || e.action}</span>
                    <span class="pdf-event-time">${new Date(e.timestamp).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' })}</span>
                </div>`).join('')
            : '<p class="pdf-no-events">Sin eventos registrados</p>';

        return `
            <div class="pdf-route-card">
                <div class="pdf-card-header" style="border-left:4px solid ${route.color || '#6c8cff'};">
                    <div><h3>${route.name || 'Ruta sin nombre'}</h3><span class="pdf-date">${dateStr}</span></div>
                    <span class="pdf-status-badge">Finalizada</span>
                </div>
                <div class="pdf-card-body">
                    <div class="pdf-map-section">
                        ${mapHtml}
                        ${hasMap ? `<div class="pdf-map-legend">
                            <span class="legend-item planned"><span></span> Trayecto planeado</span>
                            <span class="legend-item real"><span></span> Trayecto real</span>
                        </div>` : ''}
                    </div>
                    <div class="pdf-metrics-grid">
                        <div class="pdf-metric"><i class="fa-solid fa-user"></i><div><small>Chofer</small><strong>${driverName}</strong></div></div>
                        <div class="pdf-metric"><i class="fa-solid fa-truck"></i><div><small>Vehículo</small><strong>${vehicleName}</strong></div></div>
                        <div class="pdf-metric"><i class="fa-solid fa-route"></i><div><small>Distancia planeada</small><strong>${distPlaneada}</strong></div></div>
                        <div class="pdf-metric"><i class="fa-solid fa-road"></i><div><small>Distancia real</small><strong>${distReal}</strong></div></div>
                        <div class="pdf-metric"><i class="fa-regular fa-clock"></i><div><small>Tiempo estimado</small><strong>${tiempoEst}</strong></div></div>
                        <div class="pdf-metric ${Number(desviaciones) > 0 ? 'metric-warning' : ''}">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                            <div><small>Desvíos</small><strong>${desviaciones}</strong></div>
                        </div>
                    </div>
                    <div class="pdf-events-section">
                        <h4>Bitácora de Eventos</h4>
                        ${eventosHtml}
                    </div>
                </div>
            </div>`;
    },

    close() {
        document.getElementById('pdf-modal')?.classList.remove('open');
        document.getElementById('pdf-modal-overlay')?.classList.add('hidden');
    },

    async exportPDF() {
        const element = document.querySelector('#pdf-modal-content');
        if (!element) return;
        if (typeof html2pdf === 'undefined') { alert('Incluye html2pdf.js antes de exportar.'); return; }

        const btn = document.getElementById('btn-export-pdf');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando...'; }

        // Las imágenes ya son del mismo origen → html2canvas las captura sin CORS ni bloqueos
        await html2pdf().set({
            margin:      [10, 10, 10, 10],
            filename:    `NUMA_Reporte_${new Date().toISOString().slice(0, 10)}.pdf`,
            image:       { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2, useCORS: false, logging: false },
            jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak:   { mode: ['avoid-all', 'css', 'legacy'] }
        }).from(element).save();

        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-download"></i> Descargar PDF'; }
    }
};

// ─── App ──────────────────────────────────────────────────────────────────────
const App = {
    async loadData() {
        try {
            const data     = await ReportService.fetchData();
            state.routes   = data.routes;
            state.drivers  = data.drivers;
            state.vehicles = data.vehicles;
            UI.setDefaultMonth();
            FilterLogic.applyFilters();
        } catch (error) {
            console.error('Error cargando datos de reportes:', error);
            UI.showError('No se pudieron cargar los datos. Intenta recargar la página.');
        }
    }
};

export async function init() {
    console.log('📊 Módulo de Reportes iniciado');
    showLoader();
    try {
        elements = {
            filterType:  document.getElementById('filter-type'),
            filterValue: document.getElementById('filter-value'),
            monthInput:  document.getElementById('month-filter-input'),
            reportTitle: document.getElementById('report-title'),
            resultsGrid: document.getElementById('report-results'),
        };

        UI.showSkeletonLoader();

        document.querySelectorAll('.btn-tool[data-period]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.btn-tool[data-period]').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                if (elements.monthInput) elements.monthInput.value = '';
                state.activeDateFilter = e.currentTarget.dataset.period;
                FilterLogic.applyFilters();
            });
        });

        elements.monthInput?.addEventListener('change', () => {
            document.querySelectorAll('.btn-tool[data-period]').forEach(b => b.classList.remove('active'));
            state.activeDateFilter = 'month';
            FilterLogic.applyFilters();
        });

        elements.filterType?.addEventListener('change',  () => { UI.populateFilterValues(); FilterLogic.applyFilters(); });
        elements.filterValue?.addEventListener('change', FilterLogic.applyFilters);

        document.getElementById('btn-preview-pdf')?.addEventListener('click',   () => PDFManager.open());
        document.getElementById('btn-close-modal')?.addEventListener('click',   () => PDFManager.close());
        document.getElementById('pdf-modal-overlay')?.addEventListener('click', () => PDFManager.close());
        document.getElementById('btn-export-pdf')?.addEventListener('click',    () => PDFManager.exportPDF());

        await App.loadData();
    } catch (error) {
        console.error('🔥 Error iniciando Reportes:', error);
    } finally {
        hideLoader();
    }
}