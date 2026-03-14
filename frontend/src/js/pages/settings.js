import '../../css/settings.css';

// ==========================================
// 1. ESTADO GLOBAL DEL MÓDULO Y CONSTANTES
// ==========================================
const DEFAULT_COORDS = { lat: 19.7677724, lng: -104.3686507 }; // Unión de Tula

let state = {
    basesList: [],
    defaultBaseId: null,
    formMap: null,
    formMarker: null,
    viewMap: null,
    viewMarker: null,
    globalListenerAdded: false // Evita duplicar el clic en el document
};

// Objeto para almacenar referencias al DOM (se llena en init)
const DOM = {};

// ==========================================
// 2. INICIALIZADOR PRINCIPAL (El Director)
// ==========================================
export function init() {
    console.log("🚛 Módulo de settings iniciado");

    // Salir temprano si el HTML aún no se ha inyectado en el DOM
    if (!document.getElementById('view-base')) {
        console.warn("⚠️ El HTML de settings no está listo aún.");
        return;
    }

    // 🔥 LA SOLUCIÓN: Limpiar los mapas fantasmas de la navegación anterior
    state.formMap = null;
    state.formMarker = null;
    state.viewMap = null;
    state.viewMarker = null;

    // 1. Capturar elementos del DOM
    cacheDOMElements();

    // 2. Configurar Event Listeners
    setupEventListeners();
    setupTabs();
    setupGlobalEvents();

    // 3. Cargar datos iniciales
    loadBases();
}
// ==========================================
// 3. CACHÉ DEL DOM
// ==========================================
function cacheDOMElements() {
    // Inputs de Formulario
    DOM.latInput = document.getElementById('base-lat');
    DOM.lngInput = document.getElementById('base-lng');
    DOM.addressInput = document.getElementById('base-address');
    DOM.nameInput = document.getElementById('base-name');
    DOM.idInput = document.getElementById('base-id');
    DOM.form = document.getElementById('form-base-config');
    DOM.btnGeo = document.getElementById('btn-geo');
    
    // UI General
    DOM.btnNewBase = document.getElementById('btn-new-base');
    DOM.basesUl = document.getElementById('bases-list');
    
    // Drawer
    DOM.drawer = document.getElementById('base-side-drawer');
    DOM.btnCloseDrawer = document.getElementById('btn-close-drawer');
    DOM.drawerTitle = document.getElementById('drawer-title');
    
    // Modal
    DOM.modal = document.getElementById('base-view-modal');
    DOM.btnCloseModal = document.getElementById('btn-close-modal');
    DOM.modalTitle = document.getElementById('modal-view-title');
    DOM.modalAddress = document.getElementById('modal-view-address');
    
    // Menú
    DOM.menuItems = document.querySelectorAll('.settings-item');
    DOM.views = document.querySelectorAll('.settings-view');
    DOM.logoutButton = document.querySelector('a[href="#sing-out"]');
}

// ==========================================
// 4. CONFIGURACIÓN DE EVENTOS
// ==========================================
function setupEventListeners() {
    // Drawer y Modal (Botones de cierre)
    if (DOM.btnNewBase) DOM.btnNewBase.addEventListener('click', () => openDrawer(null));
    if (DOM.btnCloseDrawer) DOM.btnCloseDrawer.addEventListener('click', closeDrawer);
    if (DOM.btnCloseModal) DOM.btnCloseModal.addEventListener('click', closeModal);

    // ✨ MEJORA PRO: Cerrar modal al hacer clic en el overlay (fondo oscuro)
    if (DOM.modal) {
        DOM.modal.addEventListener('click', (e) => {
            if (e.target === DOM.modal) closeModal();
        });
    }

    // ✨ MEJORA PRO: Cerrar el drawer al hacer clic fuera de él (opcional)
    document.addEventListener('click', (e) => {
        const isClickInsideDrawer = DOM.drawer.contains(e.target);
        const isClickOnNewBaseBtn = DOM.btnNewBase && DOM.btnNewBase.contains(e.target);
        const isClickOnEditBtn = e.target.closest('.action-edit');
        
        // Si el drawer está abierto y el clic fue afuera, lo cerramos
        if (DOM.drawer.style.right === '0px' && !isClickInsideDrawer && !isClickOnNewBaseBtn && !isClickOnEditBtn) {
            closeDrawer();
        }
    });

    
    if (DOM.btnNewBase) DOM.btnNewBase.addEventListener('click', () => openDrawer(null));
    if (DOM.btnCloseDrawer) DOM.btnCloseDrawer.addEventListener('click', closeDrawer);
    if (DOM.btnCloseModal) DOM.btnCloseModal.addEventListener('click', closeModal);

    // Formulario de Base
    if (DOM.form) DOM.form.addEventListener('submit', handleFormSubmit);

    // Geolocalización
    if (DOM.btnGeo) DOM.btnGeo.addEventListener('click', handleGeolocation);

    // Delegación de eventos en la lista de bases
    if (DOM.basesUl) DOM.basesUl.addEventListener('click', handleBasesListClick);

    // Logout
    if (DOM.logoutButton) {
        DOM.logoutButton.addEventListener('click', handleLogout);
    }
}

function setupGlobalEvents() {
    // Evitamos agregar el evento al document cada vez que entramos a la vista (Memoria)
    if (!state.globalListenerAdded) {
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown-container')) {
                document.querySelectorAll('.kebab-menu').forEach(m => m.classList.add('hidden'));
            }
        });
        state.globalListenerAdded = true;
    }
}

function setupTabs() {
    if (!DOM.menuItems || DOM.menuItems.length === 0) return;

    DOM.menuItems.forEach(item => {
        item.addEventListener('click', () => {
            DOM.menuItems.forEach(i => i.classList.remove('active'));
            DOM.views.forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });

            item.classList.add('active');
            const targetId = item.getAttribute('data-target');
            const targetView = document.getElementById(`view-${targetId}`);
            if (targetView) {
                targetView.classList.remove('hidden');
                targetView.classList.add('active');
            }
        });
    });
}

// ==========================================
// 5. MANEJADORES DE ACCIONES (Handlers)
// ==========================================
async function handleBasesListClick(e) {
    const target = e.target;

    // Abrir/Cerrar menú Kebab
    const kebabBtn = target.closest('.kebab-btn');
    if (kebabBtn) {
        const baseId = kebabBtn.getAttribute('data-id');
        const menu = document.getElementById(`menu-${baseId}`);
        document.querySelectorAll('.kebab-menu').forEach(m => {
            if (m !== menu) m.classList.add('hidden');
        });
        menu.classList.toggle('hidden');
        return;
    }

    // Establecer como Principal
    const defaultBtn = target.closest('.action-default');
    if (defaultBtn) {
        const id = defaultBtn.getAttribute('data-id');
        await setDefaultBase(id);
        return;
    }

    // Acciones del menú (Ver, Editar, Eliminar)
    const actionBtn = target.closest('.menu-action');
    if (actionBtn) {
        const id = actionBtn.getAttribute('data-id');
        const base = state.basesList.find(b => b.id === id);
        
        document.querySelectorAll('.kebab-menu').forEach(m => m.classList.add('hidden'));

        if (actionBtn.classList.contains('action-view')) openModal(base);
        else if (actionBtn.classList.contains('action-edit')) openDrawer(base);
        else if (actionBtn.classList.contains('action-delete')) deleteBase(id);
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    const payload = {
        name: DOM.nameInput.value,
        address: DOM.addressInput.value,
        lat: parseFloat(DOM.latInput.value),
        lng: parseFloat(DOM.lngInput.value)
    };

    const isEdit = DOM.idInput.value !== '';
    const url = isEdit ? `/api/bases/${DOM.idInput.value}` : '/api/bases';
    const method = isEdit ? 'PUT' : 'POST';

    try {
        // Obtenemos el token
        const token = sessionStorage.getItem('numa_token'); 

        const res = await fetch(url, {
            method: method,
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` // <-- ¡Aquí faltaba la llave de acceso!
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            closeDrawer();
            loadBases();
        } else if (res.status === 401) {
            alert('Tu sesión expiró. Por favor, vuelve a iniciar sesión.');
            window.location.href = 'login.html';
        } else {
            alert('Error al guardar la base.');
        }
    } catch (err) {
        console.error("Error saving base", err);
        alert('Error de conexión.');
    }
}

function handleGeolocation() {
    if (!('geolocation' in navigator)) return;
    
    DOM.btnGeo.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    navigator.geolocation.getCurrentPosition((pos) => {
        const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (state.formMarker) state.formMarker.setPosition(newPos);
        if (state.formMap) state.formMap.panTo(newPos);
        updateInputs(newPos.lat, newPos.lng);
        DOM.btnGeo.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Ubicarme';
    }, () => {
        alert('No se pudo obtener tu ubicación.');
        DOM.btnGeo.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Ubicarme';
    });
}

async function handleLogout(e) {
    e.preventDefault();
    if (window.confirm("¿Estás seguro de que deseas cerrar la sesión?")) {
        await fetch('/api/admin/logout', { method: 'POST' });
        window.location.href = 'login.html';
    }
}

// ==========================================
// 6. LÓGICA DE API (Fetch, Delete, Update)
// ==========================================
async function loadBases() {
    try {
        const token = sessionStorage.getItem('numa_token'); 
        const res = await fetch('/api/bases', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        }); 

        if (res.status === 401) {
            console.warn("Sesión expirada o no autorizada.");
            window.location.href = 'login.html';
            return;
        }

        if (res.ok) {
            const data = await res.json();
            state.basesList = data.bases || [];
            state.defaultBaseId = data.defaultBaseId || null;
        } else {
            state.basesList = [];
        }
        renderBases();
    } catch (err) {
        console.error("Error cargando bases", err);
        if (DOM.basesUl) DOM.basesUl.innerHTML = '<li class="text-muted">Error de conexión.</li>';
    }
}

async function setDefaultBase(id) {
    try {
        const token = sessionStorage.getItem('numa_token');
        const res = await fetch(`/api/bases/${id}/default`, { 
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` } // <-- Agregado
        });
        if (res.ok) {
            state.defaultBaseId = id;
            renderBases();
        }
    } catch (error) { console.error("Error setting default", error); }
}

async function deleteBase(id) {
    if (!confirm('¿Estás seguro de eliminar esta base operativa?')) return;
    try {
        const token = sessionStorage.getItem('numa_token');
        const res = await fetch(`/api/bases/${id}`, { 
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` } // <-- Agregado
        });
        if (res.ok) {
            loadBases();
        } else {
            alert('No se pudo eliminar la base.');
        }
    } catch (error) { console.error("Error deleting", error); }
}

// ==========================================
// 7. RENDERIZADO (UI)
// ==========================================
function renderBases() {
    if (!DOM.basesUl) return;
    DOM.basesUl.innerHTML = '';

    if (state.basesList.length === 0) {
        DOM.basesUl.innerHTML = '<li class="text-muted" style="padding: 1rem;">No hay bases registradas.</li>';
        return;
    }

    state.basesList.forEach(base => {
        const isDefault = base.id === state.defaultBaseId || base.esBasePrincipal;
        const li = document.createElement('li');
        li.className = `base-card ${isDefault ? 'is-default' : ''}`;

        li.innerHTML = `
            <div class="base-info">
                <h4>${base.nombre || base.name}</h4>
                <span><i class="fa-solid fa-location-dot"></i> ${base.direccion || base.address}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 15px;">
                <button class="action-default ${isDefault ? 'active' : ''}" data-id="${base.id}" title="Establecer principal">
                    <i class="fa-solid fa-circle-check"></i>
                </button>
                <div style="position: relative;" class="dropdown-container">
                    <button class="btn-icon kebab-btn" data-id="${base.id}">
                        <i class="fa-solid fa-ellipsis-vertical"></i>
                    </button>
                    <div class="kebab-menu hidden" id="menu-${base.id}">
                        <button class="menu-action action-view" data-id="${base.id}">Ver Base</button>
                        <button class="menu-action action-edit" data-id="${base.id}">Editar</button>
                        <button class="menu-action action-delete" data-id="${base.id}">Eliminar</button>
                    </div>
                </div>
            </div>
        `;
        DOM.basesUl.appendChild(li);
    });
}

function openDrawer(base = null) {
    DOM.drawer.style.right = '0'; 

    if (base) {
        DOM.drawerTitle.textContent = 'Editar Base';
        DOM.idInput.value = base.id;
        DOM.nameInput.value = base.nombre || base.name;
        DOM.addressInput.value = base.direccion || base.address;
        updateInputs(base.lat, base.lng);
    } else {
        DOM.drawerTitle.textContent = 'Agregar Nueva Base';
        DOM.form.reset();
        DOM.idInput.value = '';
        updateInputs(DEFAULT_COORDS.lat, DEFAULT_COORDS.lng);
    }

    setTimeout(() => {
        initFormMap();
        const pos = { lat: parseFloat(DOM.latInput.value), lng: parseFloat(DOM.lngInput.value) };
        if (state.formMarker) state.formMarker.setPosition(pos);
        if (state.formMap) {
            state.formMap.setCenter(pos);
            google.maps.event.trigger(state.formMap, 'resize');
        }
    }, 300);
}

function closeDrawer() {
    DOM.drawer.style.right = '-100%';
}

function openModal(base) {
    DOM.modal.classList.remove('hidden');
    DOM.modalTitle.textContent = base.nombre || base.name;
    DOM.modalAddress.textContent = base.direccion || base.address;

    setTimeout(() => {
        initViewMap();
        const pos = { lat: base.lat, lng: base.lng };
        if (state.viewMarker) state.viewMarker.setPosition(pos);
        if (state.viewMap) {
            state.viewMap.setCenter(pos);
            google.maps.event.trigger(state.viewMap, 'resize');
        }
    }, 150);
}

function closeModal() {
    DOM.modal.classList.add('hidden');
}

function updateInputs(lat, lng) {
    if (DOM.latInput) DOM.latInput.value = Number(lat).toFixed(7);
    if (DOM.lngInput) DOM.lngInput.value = Number(lng).toFixed(7);
}

// ==========================================
// 8. GOOGLE MAPS INIT
// ==========================================
function initFormMap() {
    // Verificamos si Google existe y si no tenemos un mapa ya
    if (!window.google || state.formMap) return;
    
    // Candado extra: asegurarnos que el DOM está listo
    const mapContainer = document.getElementById('form-map');
    if (!mapContainer) return; 
    
    state.formMap = new google.maps.Map(mapContainer, {
        center: DEFAULT_COORDS, zoom: 15, mapTypeControl: false, streetViewControl: false
    });

    state.formMarker = new google.maps.Marker({
        position: DEFAULT_COORDS, map: state.formMap, draggable: true, animation: google.maps.Animation.DROP
    });

    state.formMarker.addListener('dragend', () => {
        const pos = state.formMarker.getPosition();
        updateInputs(pos.lat(), pos.lng());
    });

    state.formMap.addListener('click', (e) => {
        state.formMarker.setPosition(e.latLng);
        updateInputs(e.latLng.lat(), e.latLng.lng());
    });
}


function initViewMap() {
    if (!window.google || state.viewMap) return;

    const mapContainer = document.getElementById('view-map');
    if (!mapContainer) return;

    state.viewMap = new google.maps.Map(mapContainer, {
        center: DEFAULT_COORDS, zoom: 16, mapTypeControl: false, streetViewControl: false,
        gestureHandling: 'cooperative'
    });

    state.viewMarker = new google.maps.Marker({
        position: DEFAULT_COORDS, map: state.viewMap, draggable: false
    });
}