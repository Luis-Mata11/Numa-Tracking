// src/js/pages/settings.js
// Orquestador de Settings.
// Este archivo NO contiene lógica de negocio — solo monta tabs y delega
// cada sección a su módulo correspondiente en src/js/modules/settings/.
//
// Para agregar una nueva sección:
//   1. Crea src/js/modules/settings/mi-seccion.settings.js con export function init(DOM)
//   2. Impórtalo aquí y agrégalo al objeto SECTION_MODULES con el data-target del tab

import '../../css/settings.css';
import { logout }           from '../api/settings.api.js';
import * as BasesModule     from '../modules/settings/bases.settings.js';
// import * as ProfileModule from '../modules/settings/profile.settings.js';  ← ejemplo futuro
// import * as NotifModule   from '../modules/settings/notifications.settings.js';

// ─── Mapa de secciones: data-target del tab → módulo ─────────────────────────
const SECTION_MODULES = {
    base: BasesModule
    // profile: ProfileModule,
    // notifications: NotifModule,
};

// ─── DOM compartido entre secciones ──────────────────────────────────────────
// Cada módulo recibe el DOM que le corresponde.
// Las keys deben coincidir con los ids del HTML.
function _cacheDOMForBases() {
    return {
        // Formulario
        latInput:     document.getElementById('base-lat'),
        lngInput:     document.getElementById('base-lng'),
        addressInput: document.getElementById('base-address'),
        nameInput:    document.getElementById('base-name'),
        idInput:      document.getElementById('base-id'),
        form:         document.getElementById('form-base-config'),
        btnGeo:       document.getElementById('btn-geo'),
        // Lista
        btnNewBase:   document.getElementById('btn-new-base'),
        basesUl:      document.getElementById('bases-list'),
        // Drawer
        drawer:       document.getElementById('base-side-drawer'),
        btnCloseDrawer: document.getElementById('btn-close-drawer'),
        drawerTitle:  document.getElementById('drawer-title'),
        // Modal
        modal:        document.getElementById('base-view-modal'),
        btnCloseModal: document.getElementById('btn-close-modal'),
        modalTitle:   document.getElementById('modal-view-title'),
        modalAddress: document.getElementById('modal-view-address')
    };
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function _setupTabs() {
    const menuItems = document.querySelectorAll('.settings-item');
    const views     = document.querySelectorAll('.settings-view');

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            menuItems.forEach(i => i.classList.remove('active'));
            views.forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });

            item.classList.add('active');
            const targetId   = item.dataset.target;
            const targetView = document.getElementById(`view-${targetId}`);
            targetView?.classList.remove('hidden');
            targetView?.classList.add('active');
        });
    });
}

// ─── Kebab global (cerrar al hacer clic fuera) ────────────────────────────────
function _setupGlobalKebabClose() {
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown-container')) {
            document.querySelectorAll('.kebab-menu').forEach(m => m.classList.add('hidden'));
        }
    });
}

// ─── Logout ───────────────────────────────────────────────────────────────────
function _setupLogout() {
    const logoutBtn = document.querySelector('a[href="#sing-out"]');
    logoutBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        if (confirm('¿Estás seguro de que deseas cerrar la sesión?')) {
            await logout();
        }
    });
}

// ─── Inicialización ───────────────────────────────────────────────────────────
export function init() {
    console.log('⚙️ Módulo de Settings iniciado');

    if (!document.getElementById('view-base')) {
        console.warn('⚠️ El HTML de settings no está listo aún.');
        return;
    }

    _setupTabs();
    _setupGlobalKebabClose();
    _setupLogout();

    // Iniciamos cada sección con su propio DOM cacheado
    BasesModule.init(_cacheDOMForBases());
    // ProfileModule.init(_cacheDOMForProfile());   ← ejemplo futuro
}