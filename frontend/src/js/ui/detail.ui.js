// js/ui/detail.ui.js

import { escapeHtml } from '../utils/helpers.js';
import { setCurrentDetailRoute } from '../state/routes.store.js';
import { initOrResizeMainMap, drawRouteOnDetailMap } from '../services/maps.service.js';
import { showNotification } from '../utils/utils.ui.js';
import { updateRouteStatus } from '../api/routes.api.js';

const normalizeRoute = (route) => route;

// ── Referencia al listener de socket activo para poder limpiarlo ──────────────
let _driverStatusListener = null;

export function showRouteDetailUI(route) {
    const r = normalizeRoute(route) || {};
    const container = document.getElementById('route-detail');
    if (!container) return;

    // Limpiar listener anterior si existía (evita acumulación al cambiar de ruta)
    if (_driverStatusListener) {
        document.removeEventListener('socket:driverReady', _driverStatusListener);
        _driverStatusListener = null;
    }

    container.innerHTML = '';
    const detailWrapper = document.createElement('div');
    detailWrapper.className = 'route-detail-wrapper';

    // Estado de la ruta (normalizamos a minúsculas para evaluar fácilmente)
    const routeStatus = (r.estado || r.status || 'pending').toLowerCase();

    // Estado inicial del chofer
    const driverIsReady = r.driverIsReady || routeStatus === 'active';
    const driverStatusHtml = _buildDriverStatusChip(driverIsReady);

    // ── Lógica de visibilidad/estado de botones según el status ──
    const isPending = routeStatus === 'pending';
    const isActive = routeStatus === 'active';
    const isCompleted = routeStatus === 'completed' || routeStatus === 'finalizada';
    const isCancelled = routeStatus === 'cancelled' || routeStatus === 'cancelada';

    // Botones de la cabecera (Editar / Eliminar)
    const editBtnHtml = isPending
        ? `<button id="btn-edit-route" class="btn-icon" title="Editar ruta"><i class="fa fa-edit"></i></button>`
        : `<button id="btn-edit-route" class="btn-icon" disabled style="opacity:0.5;cursor:not-allowed;" title="No se puede editar"><i class="fa fa-edit"></i></button>`;

    // Solo se puede eliminar si NO está activa (puede estar pendiente, completada o cancelada)
    const deleteBtnHtml = !isActive
        ? `<button id="btn-delete-route" class="btn-icon" title="Eliminar ruta"><i class="fa fa-trash"></i></button>`
        : `<button id="btn-delete-route" class="btn-icon" disabled style="opacity:0.5;cursor:not-allowed;" title="No se puede eliminar activa"><i class="fa fa-trash"></i></button>`;

    // Botones del pie (Iniciar / Cancelar)
    // Solo se puede iniciar si está pendiente
    const startBtnHtml = isPending
        ? `<button id="btn-start-route" class="btn btn-primary">Iniciar ruta</button>`
        : `<button id="btn-start-route" class="btn btn-primary" disabled style="opacity:0.5;cursor:not-allowed;">Iniciar ruta</button>`;

    // Se puede cancelar en cualquier momento, excepto si ya está cancelada.
    const cancelBtnText = isActive ? 'Cancelar ruta (Detener)' : 'Cancelar ruta';
    const cancelBtnHtml = !isCancelled
        ? `<button id="btn-cancel-route" class="btn btn-danger">${cancelBtnText}</button>`
        : `<button id="btn-cancel-route" class="btn btn-danger" disabled style="opacity:0.5;cursor:not-allowed;">Ruta Cancelada</button>`;

    // Color del swatch (Si está cancelada, forzamos rojo claro)
    const displayColor = isCancelled ? '#ffcccc' : escapeHtml(r.color || '#ccc');

    detailWrapper.innerHTML = `
      <div class="route-detail-header" style="display:flex;align-items:center;gap:12px;margin-bottom:8px;position:relative;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div class="route-color-swatch" style="width:14px;height:36px;border-radius:6px;background:${displayColor};box-shadow:0 1px 3px rgba(0,0,0,0.12);"></div>
            <div style="flex:1;">
                <h2 style="margin:0;font-size:1.1rem;">${escapeHtml(r.name)}</h2>
                <div style="font-size:0.85rem;color:#666;margin-top:4px;">Estado: <strong>${escapeHtml(routeStatus.toUpperCase())}</strong></div>
            </div>
          </div>
          <div style="position:absolute;right:0;top:0;display:flex;gap:8px;">
              ${editBtnHtml}
              ${deleteBtnHtml}
          </div>
      </div>

      <div id="route-detail-map-holder" style="height:420px;border-radius:8px;overflow:hidden;background:#f8f8f8;position:relative;margin-bottom:10px;">
          <div id="route-detail-map-notice" style="position:absolute;left:12px;top:12px;z-index:9;color:#333;font-size:0.9rem;"></div>
          <div id="main-map" style="width:100%;height:100%;"></div>
      </div>

      <div id="route-detail-info" style="display:flex;flex-direction:column;gap:8px;padding:8px;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
          <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;">

              <div><strong>Kilómetros</strong><div id="route-detail-distance">—</div></div>
              <div><strong>Tiempo aprox.</strong><div id="route-detail-duration">—</div></div>

              <div>
                  <strong>Chofer</strong>
                  <div style="display:flex;align-items:center;gap:8px;margin-top:2px;">
                      <span>${escapeHtml((r.driver && (r.driver.nombre || r.driver)) || '—')}</span>
                      <span id="driver-status-chip">${driverStatusHtml}</span>
                  </div>
              </div>

              <div><strong>Vehículo</strong><div>${escapeHtml((r.vehicle && (r.vehicle.alias || r.vehicle.placa)) || '—')}</div></div>

              <div>
                  <strong>Código de Acceso</strong>
                  <div style="display:flex;align-items:center;gap:8px;margin-top:2px;">
                      <span style="font-family:monospace;font-size:1.1rem;font-weight:bold;color:#0056b3;letter-spacing:1px;">
                          ${escapeHtml(r.accessCode || '—')}
                      </span>
                      ${r.accessCode ? `
                      <button id="btn-copy-code" title="Copiar código" style="cursor:pointer;padding:2px 8px;font-size:0.8rem;border:1px solid #ccc;border-radius:4px;background:#f9f9f9;display:flex;align-items:center;gap:4px;">
                          <i class="fa fa-copy"></i>
                      </button>` : ''}
                  </div>
              </div>

          </div>

          <div style="margin-top:8px;display:flex;gap:10px;">
              ${startBtnHtml}
              ${cancelBtnHtml}
          </div>
      </div>
    `;

    container.appendChild(detailWrapper);

    // ── Copiar código ─────────────────────────────────────────────────────────
    const btnCopy = document.getElementById('btn-copy-code');
    if (btnCopy) {
        btnCopy.addEventListener('click', () => {
            navigator.clipboard.writeText(r.accessCode).then(() => {
                const orig = btnCopy.innerHTML;
                btnCopy.innerHTML = '<i class="fa fa-check" style="color:green;"></i> Copiado';
                btnCopy.style.borderColor = 'green';
                setTimeout(() => { btnCopy.innerHTML = orig; btnCopy.style.borderColor = '#ccc'; }, 2000);
            }).catch(() => alert('Error al copiar al portapapeles.'));
        });
    }

    // ── Mapa ──────────────────────────────────────────────────────────────────
    const mapEl = container.querySelector('#main-map');
    setTimeout(() => {
        initOrResizeMainMap(mapEl);
        drawRouteOnDetailMap(r);
    }, 100);

    try { setCurrentDetailRoute(r); } catch (e) { /* noop */ }

    // ── Listener en tiempo real: chofer ingresó ───────────────────────────────
    _driverStatusListener = (e) => {
        const { routeId } = e.detail || {};
        if (String(routeId) !== String(r._id || r.id)) return;

        const chip = document.getElementById('driver-status-chip');
        if (chip) chip.innerHTML = _buildDriverStatusChip(true);

        _showDriverToast(`🟢 ${(r.driver && (r.driver.nombre || 'El chofer')) || 'El chofer'} ingresó a la ruta`);
    };

    document.addEventListener('socket:driverReady', _driverStatusListener);

    // ── Delegación de clics ───────────────────────────────────────────────────
    container.onclick = async (e) => {
        const target = e.target;

        // EDITAR (Solo si no está disabled)
        if (target.closest('#btn-edit-route') && !target.closest('#btn-edit-route').disabled) {
            document.dispatchEvent(new CustomEvent('route:edit', { detail: r }));
            return;
        }

        // ELIMINAR (Solo si no está disabled)
        if (target.closest('#btn-delete-route') && !target.closest('#btn-delete-route').disabled) {
            if (confirm(`¿Estás seguro de eliminar la ruta "${r.name || 'sin nombre'}"?`)) {
                document.dispatchEvent(new CustomEvent('route:delete', { detail: r }));
            }
            return;
        }

        // INICIAR (Lógica que ya tenías)
        if (target.closest('#btn-start-route') && !target.closest('#btn-start-route').disabled) {
            const btn = target.closest('#btn-start-route');
            try {
                btn.innerHTML = 'Iniciando...';
                btn.disabled = true;

                // ✅ PONER ESTO
                await updateRouteStatus(r._id, 'start');
                showNotification('Ruta iniciada. Redirigiendo al mapa en vivo...', 'success');
                setTimeout(() => { window.location.href = '/'; }, 1500);

            } catch (error) {
                console.error('Error al iniciar ruta:', error);
                showNotification('Error de conexión con el servidor.', 'error');
                btn.innerHTML = 'Iniciar ruta';
                btn.disabled = false;
            }
            return;
        }

        // CANCELAR RUTA
        if (target.closest('#btn-cancel-route') && !target.closest('#btn-cancel-route').disabled) {
            const btn = target.closest('#btn-cancel-route');
            if (confirm(`¿Estás seguro de CANCELAR la ruta "${r.name}"? El chofer será notificado.`)) {
                try {
                    btn.innerHTML = 'Cancelando...';
                    btn.disabled = true;

                    // ✅ PONER ESTO
                    await updateRouteStatus(r._id || r.id, 'cancelled');

                    showNotification('Ruta cancelada exitosamente.', 'success');

                    // Disparamos un evento para que el panel principal se entere y recargue
                    document.dispatchEvent(new CustomEvent('route:cancel', { detail: r }));

                    // Actualizamos la UI localmente para reflejar el cambio rápido
                    r.status = 'cancelled';
                    r.estado = 'cancelada';
                    showRouteDetailUI(r); // Re-renderizamos la vista de detalle con el nuevo status

                } catch (error) {
                    console.error('Error al cancelar ruta:', error);
                    showNotification('Error al intentar cancelar la ruta.', 'error');
                    btn.innerHTML = cancelBtnText;
                    btn.disabled = false;
                }
            }
            return;
        }
    };
}

// ── Helpers privados ──────────────────────────────────────────────────────────

function _buildDriverStatusChip(isReady) {
    if (isReady) {
        return `<span style="
            display:inline-flex;align-items:center;gap:5px;
            background:#d4edda;color:#155724;
            font-size:11px;font-weight:700;
            padding:3px 9px;border-radius:999px;
            border:1px solid #c3e6cb;">
            <i class="fa fa-circle" style="font-size:7px;color:#28a745;"></i> En línea
        </span>`;
    }
    return `<span style="
        display:inline-flex;align-items:center;gap:5px;
        background:#f8f9fa;color:#6c757d;
        font-size:11px;font-weight:700;
        padding:3px 9px;border-radius:999px;
        border:1px solid #dee2e6;">
        <i class="fa fa-circle" style="font-size:7px;color:#adb5bd;"></i> Sin conectar
    </span>`;
}

function _showDriverToast(message) {
    const existing = document.getElementById('driver-ready-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'driver-ready-toast';
    toast.textContent = message;
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '28px',
        right: '28px',
        background: '#28a745',
        color: '#fff',
        padding: '13px 22px',
        borderRadius: '10px',
        fontWeight: '600',
        fontSize: '14px',
        boxShadow: '0 6px 18px rgba(0,0,0,0.15)',
        zIndex: '9999',
        opacity: '0',
        transform: 'translateY(12px)',
        transition: 'opacity .25s ease, transform .25s ease'
    });

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(12px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}