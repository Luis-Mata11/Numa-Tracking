// src/js/utils/license.js
// Gestión de licencia: lee la info guardada en sessionStorage tras el login
// y bloquea la app si la licencia venció.
//
// USO en cualquier módulo:
//   import { checkLicense } from '../utils/license.js';
//   import '../../css/license.css';
//
//   export async function init() {
//       const allowed = await checkLicense();
//       if (!allowed) return;
//       // ... resto del init
//   }

import '../../css/license.css';

// ─── Leer licencia desde sessionStorage ──────────────────────────────────────
function _getLicenseData() {
    try {
        const raw  = sessionStorage.getItem('numa_licencia_info');
        const user = JSON.parse(sessionStorage.getItem('numa_user') || '{}');
        if (!raw) return null;

        const info = JSON.parse(raw);
        const hoy  = new Date();

        const fechaFin      = info.fechaFin ? new Date(info.fechaFin) : null;
        const diasRestantes = fechaFin
            ? Math.ceil((fechaFin - hoy) / (1000 * 60 * 60 * 24))
            : 0;

        const status = diasRestantes <= 0 ? 'expired' : (info.estado || 'active');

        return {
            licenseKey: user.tenantId || info.key || '—',
            plan:       (info.plan || 'TRIAL').toUpperCase(),
            status,
            daysLeft:   Math.max(0, diasRestantes),
            expiresAt:  info.fechaFin
        };
    } catch (e) {
        console.warn('Error leyendo licencia de sessionStorage:', e);
        return null;
    }
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function _buildModal(licenseKey = '—') {
    if (document.getElementById('license-modal-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id        = 'license-modal-overlay';
    overlay.className = 'license-modal-overlay';

    overlay.innerHTML = `
        <div class="license-modal" role="dialog" aria-modal="true" aria-labelledby="license-modal-title">

            <div class="license-header">
                <div class="alert-badge">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    Periodo de prueba vencido
                </div>
                <h2 id="license-modal-title">Activa tu licencia para continuar</h2>
                <p>Tu acceso ha sido suspendido temporalmente.</p>
                <div class="license-key">
                    <i class="fa-solid fa-key" style="margin-right:6px;color:var(--muted);"></i>
                    ${licenseKey}
                </div>
                <button id="license-logout-btn" class="license-logout-btn">
                    <i class="fa-solid fa-right-from-bracket"></i> Cerrar sesión
                </button>
            </div>

            <div class="plans-grid">

                <!-- Trial -->
                <div class="plan-card disabled">
                    <span class="soon-badge">Finalizado</span>
                    <h3 class="plan-name">Trial</h3>
                    <div class="plan-price">$0 <small>MXN</small></div>
                    <p class="plan-period">15 días de prueba gratis</p>
                    <ul class="plan-features">
                        <li class="ok">3 vehículos incluidos</li>
                        <li class="ok">Rastreo en tiempo real (App móvil)</li>
                        <li class="ok">Reportes y planeación de rutas</li>
                        <li class="ok">Registro de choferes y bases</li>
                    </ul>
                    <button class="btn-plan" disabled>Finalizado</button>
                </div>

                <!-- Pro -->
                <div class="plan-card featured">
                    <span class="featured-badge">Recomendado</span>
                    <h3 class="plan-name">Plan Pro</h3>
                    <div class="plan-price">$199 <small>/mes</small></div>
                    <p class="plan-period">o $2,100 / anual</p>
                    <ul class="plan-features">
                        <li class="ok">5 vehículos incluidos</li>
                        <li class="ok">Rastreo en tiempo real (App móvil)</li>
                        <li class="ok">Reportes, rutas, choferes y bases</li>
                        <li class="ok">+$89/mes por vehículo adicional</li>
                    </ul>
                    <button class="btn-plan btn-whatsapp select-plan">
                        <i class="fa-brands fa-whatsapp"></i> Cotizar por WhatsApp
                    </button>
                </div>

                <!-- Corporativo -->
                <div class="plan-card disabled">
                    <span class="soon-badge">Próximamente</span>
                    <h3 class="plan-name">Corporativo</h3>
                    <div class="plan-price">$399 <small>/mes</small></div>
                    <p class="plan-period">o $4,600 / anual</p>
                    <ul class="plan-features">
                        <li class="ok">8 vehículos incluidos</li>
                        <li class="ok">Rastreo vinculación GPS + App</li>
                        <li class="ok">Reportes avanzados</li>
                        <li class="ok">+$89/mes por vehículo adicional</li>
                    </ul>
                    <button class="btn-plan" disabled>No disponible</button>
                </div>

            </div>

            <div class="license-footer">
                <p>¿Necesitas ayuda? <a href="mailto:soporte@numa.mx">Contacta a soporte</a></p>
            </div>

        </div>
    `;

    document.body.appendChild(overlay);

    // Logout
    document.getElementById('license-logout-btn')?.addEventListener('click', () => {
        sessionStorage.clear();
        window.location.href = '/login.html';
    });

    // Plan Pro → WhatsApp
    overlay.querySelectorAll('.select-plan').forEach(btn => {
        btn.addEventListener('click', () => {
            const msg = encodeURIComponent(
                'Hola, me interesa activar el Plan Pro de NUMA Tracking. Mi licencia es: ' + licenseKey
            );
            window.open(`https://wa.me/523326378746?text=${msg}`, '_blank');
        });
    });
}

// ─── Toast de advertencia ─────────────────────────────────────────────────────
function _showExpirationWarning(daysLeft) {
    if (document.getElementById('license-warning-toast')) return;

    const toast = document.createElement('div');
    toast.id = 'license-warning-toast';
    toast.innerHTML = `
        <i class="fa-solid fa-triangle-exclamation"></i>
        Tu licencia vence en <strong>${daysLeft} día${daysLeft === 1 ? '' : 's'}</strong>.
        <a href="#" id="license-renew-link" style="color:inherit;font-weight:700;margin-left:6px;">
            Renovar ahora
        </a>
    `;
    toast.style.cssText = `
        position:fixed; top:16px; left:50%; transform:translateX(-50%);
        background:#fff3cd; color:#856404; border:1px solid #ffc107;
        padding:10px 20px; border-radius:10px; font-size:13px; font-weight:500;
        z-index:9999; display:flex; align-items:center; gap:8px;
        box-shadow:0 4px 16px rgba(0,0,0,.1); white-space:nowrap;
    `;
    document.body.appendChild(toast);

    document.getElementById('license-renew-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        const license = _getLicenseData();
        _buildModal(license?.licenseKey || '—');
    });
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Verifica el estado de la licencia leyendo sessionStorage.
 * - Activa con ≤3 días → toast de advertencia.
 * - Vencida/suspendida → modal bloqueante.
 *
 * @returns {boolean} true si el acceso está permitido.
 */
export function checkLicense() {
    const license = _getLicenseData();

    if (!license) {
        console.warn('⚠️ No hay datos de licencia en sesión.');
        return true;
    }

    if (license.status === 'expired') {
        _buildModal(license.licenseKey);
        return false;
    }

    if (license.daysLeft <= 3) {
        _showExpirationWarning(license.daysLeft);
    }

    return true;
}

/**
 * Abre el modal manualmente (ej: botón "Renovar" en sidebar).
 */
export function openLicenseModal() {
    const license = _getLicenseData();
    _buildModal(license?.licenseKey || '—');
}

/**
 * Cierra el modal si está abierto.
 */
export function closeLicenseModal() {
    document.getElementById('license-modal-overlay')?.remove();
}