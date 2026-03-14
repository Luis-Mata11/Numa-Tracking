// ./js/ui/detail.ui.js
import { escapeHtml } from '../utils/helpers.js';
import { setCurrentDetailRoute } from '../state/routes.store.js';
import { initOrResizeMainMap, drawRouteOnDetailMap } from '../services/maps.service.js';

// normalizeRoute si necesitas adaptar el shape de datos
const normalizeRoute = (route) => route || {};

export function showRouteDetailUI(route) {
  const r = normalizeRoute(route);
  const container = document.getElementById('route-detail');
  if (!container) return;

  // limpiar y crear wrapper
  container.innerHTML = '';
  const detailWrapper = document.createElement('div');
  detailWrapper.className = 'route-detail-wrapper';

  // Construyo el DOM usando clases (ya tenemos el CSS compat)
  detailWrapper.innerHTML = `
    <div class="route-detail-header">
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="route-color-swatch" style="background:${escapeHtml(r.color || '#6c8cff')}"></div>
        <div class="title-block">
          <h2>${escapeHtml(r.name || '—')}</h2>
          <div class="sub">Estado: <strong id="route-detail-status-text">${escapeHtml(r.estado || r.status || '—')}</strong></div>
        </div>
      </div>

      <div style="position:absolute;right:0;top:0;display:flex;gap:8px;">
        <button id="btn-edit-route" class="btn-icon" title="Editar ruta" aria-label="Editar ruta"><i class="fa fa-edit"></i></button>
        <button id="btn-delete-route" class="btn-icon" title="Eliminar ruta" aria-label="Eliminar ruta"><i class="fa fa-trash"></i></button>
      </div>
    </div>

    <div id="route-detail-map-holder">
      <div id="route-detail-map-notice" aria-hidden="true"></div>
      <div id="main-map"></div>
    </div>

    <div id="route-detail-info">
      <div class="metrics-row">
        <div><strong>Kilómetros</strong><div id="route-detail-distance">—</div></div>
        <div><strong>Tiempo aprox.</strong><div id="route-detail-duration">—</div></div>
        <div><strong>Chofer</strong><div id="route-detail-driver">${escapeHtml((r.driver && (r.driver.nombre || r.driver)) || '—')}</div></div>
        <div><strong>Vehículo</strong><div id="route-detail-vehicle">${escapeHtml((r.vehicle && (r.vehicle.alias || r.vehicle.placa)) || '—')}</div></div>
        <div><strong>Código acceso</strong><div id="route-detail-access">${escapeHtml(r.accessCode || '—')}</div></div>
        <div><strong>Estado</strong><div id="route-detail-status-2">${escapeHtml(r.estado || r.status || '—')}</div></div>
      </div>

      <div class="actions-row">
        <button id="btn-start-route" class="btn btn-primary">Iniciar ruta</button>
        <button id="btn-cancel-route" class="btn btn-danger">Cancelar ruta</button>
      </div>
    </div>
  `;

  container.appendChild(detailWrapper);

  // Inicializa / redimensiona mapa y dibuja ruta
  const mapEl = container.querySelector('#main-map');
  try {
    initOrResizeMainMap(mapEl);
    drawRouteOnDetailMap(r);
  } catch (err) {
    // Si no tienes mapas cargados, escribe aviso en el notice
    const notice = container.querySelector('#route-detail-map-notice');
    if (notice) notice.textContent = 'Mapa no disponible — verifica la carga de la API.';
    console.warn('Mapa detalle: ', err);
  }

  // Guarda en estado (si usas store)
  try { setCurrentDetailRoute(r); } catch (e) { /* noop */ }

  // ---- Event listeners: conecta con tus funciones reales ----
  const btnEdit = document.getElementById('btn-edit-route');
  const btnDelete = document.getElementById('btn-delete-route');
  const btnStart = document.getElementById('btn-start-route');
  const btnCancel = document.getElementById('btn-cancel-route');

  // Si ya tienes funciones globales o módulos que manejen estas acciones
  // reemplaza window.* por las funciones que uses (routes.api.js, etc.)
if (btnEdit) {
    btnEdit.addEventListener('click', () => {
      // Disparamos un evento a nivel documento con los datos de la ruta
      document.dispatchEvent(new CustomEvent('route:edit', { detail: r }));
    });
  }

  if (btnDelete) {
    btnDelete.addEventListener('click', () => {
      if (confirm(`¿Estás seguro de eliminar la ruta "${r.name || 'sin nombre'}"? Esta acción no se puede deshacer.`)) {
        document.dispatchEvent(new CustomEvent('route:delete', { detail: r }));
      }
    });
  }

  if (btnStart) {
    btnStart.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('route:start', { detail: r }));
    });
  }

  if (btnCancel) {
    btnCancel.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('route:cancel', { detail: r }));
    });
  }
}