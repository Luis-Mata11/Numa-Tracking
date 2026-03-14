// public/js/modules/ui/sidebar.js
import { logout } from '../services/auth.js';

export function initSidebar() {
    console.log('⚡ Sidebar UI Inicializado');
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }
}

export function updateProfileCard(user, licencia) {
    const userNameEl = document.getElementById('user-name-display');
    const licenseKeyEl = document.getElementById('license-key-display');
    const statusTextEl = document.getElementById('license-status-text');
    const daysLeftEl = document.getElementById('license-days-left');
    const statusDotEl = document.getElementById('status-dot');

    if (!user || !licencia) return;

    // 1. Datos del Usuario
    if (userNameEl) userNameEl.textContent = user.nombre || "Usuario";
    if (licenseKeyEl) licenseKeyEl.textContent = user.tenantId || licencia.key || "---";

    // 2. Lógica del Plan y Estado
    const dias = licencia.diasRestantes;
    // Aseguramos que el plan venga en mayúsculas (ej: TRIAL, BASIC, PRO)
    const nombrePlan = (licencia.plan || 'TRIAL').toUpperCase();
    
    let textoMostrar = nombrePlan; 
    let claseColor = 'gray'; 

    // Reglas de visualización:
    if (dias <= 0) {
        // PRIORIDAD 1: Si ya venció, ignoramos el nombre del plan
        textoMostrar = 'VENCIDA';
        claseColor = 'danger'; // Rojo
    } else {
        // PRIORIDAD 2: Si está activa, mostramos el nombre del plan con su color
        if (nombrePlan === 'TRIAL') {
            claseColor = 'warning'; // Naranja para Trial
        } else {
            claseColor = 'success'; // Verde para cualquier plan de pago (PRO, BASIC, etc)
        }
    }

    // 3. Renderizar Texto del Plan (Ej: "TRIAL" o "VENCIDA")
    if (statusTextEl) {
        statusTextEl.textContent = textoMostrar;
        statusTextEl.className = ''; 
        statusTextEl.classList.add(`text-${claseColor}`);
    }

    // 4. Renderizar Días Restantes
    if (daysLeftEl) {
        if (dias > 0) {
            daysLeftEl.textContent = `(${dias} días)`;
            // Si quedan menos de 3 días, ponemos el texto de los días en rojo para alertar
            daysLeftEl.style.color = dias <= 3 ? '#e74c3c' : '#bdc3c7';
        } else {
            daysLeftEl.textContent = "(0 días)";
            daysLeftEl.style.color = '#e74c3c';
        }
    }

    // 5. Renderizar el Puntito
    if (statusDotEl) {
        statusDotEl.className = 'status-indicator'; 
        statusDotEl.classList.add(claseColor);
    }
}