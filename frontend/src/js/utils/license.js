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

        // Recalculamos días restantes en el cliente para mayor precisión
        const fechaFin     = info.fechaFin ? new Date(info.fechaFin) : null;
        const diasRestantes = fechaFin
            ? Math.ceil((fechaFin - hoy) / (1000 * 60 * 60 * 24))
            : 0;

        // Estado real: puede haber vencido desde que se hizo login
        const status = diasRestantes <= 0 ? 'expired' : (info.estado || 'active');

        return {
            licenseKey:  user.tenantId || info.key || '—',
            plan:        (info.plan || 'TRIAL').toUpperCase(),
            status,
            daysLeft:    Math.max(0, diasRestantes),
            expiresAt:   info.fechaFin
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

            <div class="plans-container">

                <div class="plan-card disabled">
                    <div class="plan-info">
                        <h3>Trial</h3>
                        <div class="price">$0 <small>MXN</small></div>
                        <p class="plan-desc">15 días de acceso básico.</p>
                        <ul><li>Acceso básico</li><li>Sin soporte prioritario</li></ul>
                    </div>
                    <button class="btn-plan" disabled>Finalizado</button>
                </div>

                <div class="plan-card featured">
                    <div class="plan-info">
                        <span class="badge">Recomendado</span>
                        <h3>Plan Pro</h3>
                        <div class="price">$140 <small>/mes</small></div>
                        <p class="plan-desc">Todo lo que necesitas para operar sin límites.</p>
                        <ul>
                            <li>Operaciones ilimitadas</li>
                            <li>Reportes avanzados</li>
                            <li>Soporte 24/7</li>
                        </ul>
                    </div>
                    <button class="btn-plan select-plan featured-btn">Elegir Plan Pro</button>
                </div>

                <div class="plan-card">
                    <div class="plan-info">
                        <span class="badge" style="background:#64748b;">Próximamente</span>
                        <h3>Corporativo</h3>
                        <div class="price" style="font-size:18px;">Cotizar</div>
                        <p class="plan-desc">Solución a medida para flotas grandes.</p>
                        <ul>
                            <li>Todo lo del Plan Pro</li>
                            <li>GPS individual</li>
                            <li>Gestión de flotas</li>
                        </ul>
                    </div>
                    <button class="btn-plan select-plan cotizar-btn">
                        <i class="fa-brands fa-whatsapp"></i> Cotizar por WhatsApp
                    </button>
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

    // Eventos de planes
    overlay.querySelectorAll('.select-plan').forEach(btn => {
        btn.addEventListener('click', () => {
            const planName = btn.closest('.plan-card').querySelector('h3').innerText;
            const isCotizar = btn.classList.contains('cotizar-btn');
            if (isCotizar) {
                const msg = encodeURIComponent('Hola, me interesa cotizar el plan Corporativo de NUMA Tracking.');
                window.open(`https://wa.me/523326378746?text=${msg}`, '_blank');
            } else {
                _handlePlanSelection(planName, btn);
            }
        });
    });
}

function _handlePlanSelection(planName, btn) {
    const original = btn.innerHTML;
    btn.disabled   = true;
    btn.innerHTML  = '<i class="fa-solid fa-circle-notch fa-spin"></i> Procesando...';

    setTimeout(() => {
        alert(`Seleccionaste: ${planName}\n\nPronto serás redirigido a la pasarela de pago.`);
        btn.disabled  = false;
        btn.innerHTML = original;
    }, 1200);
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

    // Sin datos en sesión → dejamos pasar (el login se encarga de guardarlos)
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