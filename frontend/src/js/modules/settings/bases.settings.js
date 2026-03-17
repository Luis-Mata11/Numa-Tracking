// src/js/modules/settings/bases.settings.js
// Módulo autónomo para la gestión de Bases Operativas.
// Para agregar una nueva sección de Settings, crea un archivo hermano
// (ej: profile.settings.js) con la misma firma: export function init(DOM) { ... }

import {
    fetchBases,
    saveBase,
    deleteBase,
    setDefaultBase
} from '../../api/settings.api.js';

const DEFAULT_COORDS = { lat: 19.7677724, lng: -104.3686507 };

// ─── Estado local del módulo ──────────────────────────────────────────────────
let state = {
    basesList:     [],
    defaultBaseId: null,
    formMap:       null,
    formMarker:    null,
    viewMap:       null,
    viewMarker:    null
};

// ─── Inicialización ───────────────────────────────────────────────────────────
export function init(DOM) {
    _setupEvents(DOM);
    _loadBases(DOM);
}

// ─── Eventos ──────────────────────────────────────────────────────────────────
function _setupEvents(DOM) {
    DOM.btnNewBase?.addEventListener('click',    () => _openDrawer(DOM, null));
    DOM.btnCloseDrawer?.addEventListener('click', () => _closeDrawer(DOM));
    DOM.btnCloseModal?.addEventListener('click',  () => _closeModal(DOM));
    DOM.btnGeo?.addEventListener('click',         () => _handleGeolocation(DOM));
    DOM.form?.addEventListener('submit',          (e) => _handleFormSubmit(e, DOM));
    DOM.basesUl?.addEventListener('click',        (e) => _handleListClick(e, DOM));

    // Cerrar modal al hacer clic en el overlay
    DOM.modal?.addEventListener('click', (e) => {
        if (e.target === DOM.modal) _closeModal(DOM);
    });

    // Cerrar drawer al hacer clic fuera
    document.addEventListener('click', (e) => {
        const drawerOpen    = DOM.drawer?.style.right === '0px';
        const insideDrawer  = DOM.drawer?.contains(e.target);
        const onNewBaseBtn  = DOM.btnNewBase?.contains(e.target);
        const onEditBtn     = !!e.target.closest('.action-edit');

        if (drawerOpen && !insideDrawer && !onNewBaseBtn && !onEditBtn) {
            _closeDrawer(DOM);
        }
    });
}

// ─── Carga y renderizado ──────────────────────────────────────────────────────
async function _loadBases(DOM) {
    try {
        const data         = await fetchBases();
        state.basesList    = data.bases        || [];
        state.defaultBaseId = data.defaultBaseId || null;
        _renderBases(DOM);
    } catch (err) {
        console.error('Error cargando bases:', err);
        if (DOM.basesUl) {
            DOM.basesUl.innerHTML = '<li class="text-muted">Error de conexión.</li>';
        }
    }
}

function _renderBases(DOM) {
    if (!DOM.basesUl) return;
    DOM.basesUl.innerHTML = '';

    if (!state.basesList.length) {
        DOM.basesUl.innerHTML =
            '<li class="text-muted" style="padding:1rem;">No hay bases registradas.</li>';
        return;
    }

    state.basesList.forEach(base => {
        const isDefault = base.id === state.defaultBaseId || base.esBasePrincipal;
        const li        = document.createElement('li');
        li.className    = `base-card ${isDefault ? 'is-default' : ''}`;

        li.innerHTML = `
            <div class="base-info">
                <h4>${base.nombre || base.name}</h4>
                <span>
                    <i class="fa-solid fa-location-dot"></i>
                    ${base.direccion || base.address}
                </span>
            </div>
            <div class="base-actions">
                <button class="action-default ${isDefault ? 'active' : ''}"
                        data-id="${base.id}"
                        title="Establecer como principal">
                    <i class="fa-solid fa-circle-check"></i>
                </button>
                <div class="dropdown-container">
                    <button class="btn-icon kebab-btn" data-id="${base.id}">
                        <i class="fa-solid fa-ellipsis-vertical"></i>
                    </button>
                    <div class="kebab-menu hidden" id="menu-${base.id}">
                        <button class="menu-action action-view"   data-id="${base.id}">Ver Base</button>
                        <button class="menu-action action-edit"   data-id="${base.id}">Editar</button>
                        <button class="menu-action action-delete" data-id="${base.id}">Eliminar</button>
                    </div>
                </div>
            </div>
        `;
        DOM.basesUl.appendChild(li);
    });
}

// ─── Handlers de lista ────────────────────────────────────────────────────────
async function _handleListClick(e, DOM) {
    // Kebab toggle
    const kebabBtn = e.target.closest('.kebab-btn');
    if (kebabBtn) {
        const id   = kebabBtn.dataset.id;
        const menu = document.getElementById(`menu-${id}`);
        document.querySelectorAll('.kebab-menu').forEach(m => {
            if (m !== menu) m.classList.add('hidden');
        });
        menu?.classList.toggle('hidden');
        return;
    }

    // Establecer como principal
    const defaultBtn = e.target.closest('.action-default');
    if (defaultBtn) {
        try {
            await setDefaultBase(defaultBtn.dataset.id);
            state.defaultBaseId = defaultBtn.dataset.id;
            _renderBases(DOM);
        } catch (err) {
            console.error(err);
        }
        return;
    }

    // Acciones del menú kebab
    const actionBtn = e.target.closest('.menu-action');
    if (actionBtn) {
        const base = state.basesList.find(b => b.id === actionBtn.dataset.id);
        document.querySelectorAll('.kebab-menu').forEach(m => m.classList.add('hidden'));

        if (actionBtn.classList.contains('action-view'))   _openModal(DOM, base);
        if (actionBtn.classList.contains('action-edit'))   _openDrawer(DOM, base);
        if (actionBtn.classList.contains('action-delete')) await _deleteBase(DOM, actionBtn.dataset.id);
    }
}

// ─── Formulario ───────────────────────────────────────────────────────────────
async function _handleFormSubmit(e, DOM) {
    e.preventDefault();

    const editingId = DOM.idInput.value || null;
    const payload   = {
        name:    DOM.nameInput.value.trim(),
        address: DOM.addressInput.value.trim(),
        lat:     parseFloat(DOM.latInput.value),
        lng:     parseFloat(DOM.lngInput.value)
    };

    try {
        await saveBase(payload, editingId);
        _closeDrawer(DOM);
        await _loadBases(DOM);
    } catch (err) {
        alert(err.message);
    }
}

async function _deleteBase(DOM, id) {
    if (!confirm('¿Estás seguro de eliminar esta base operativa?')) return;
    try {
        await deleteBase(id);
        await _loadBases(DOM);
    } catch (err) {
        alert('No se pudo eliminar la base.');
    }
}

// ─── Drawer ───────────────────────────────────────────────────────────────────
function _openDrawer(DOM, base = null) {
    if (!DOM.drawer) return;
    DOM.drawer.style.right = '0';

    if (base) {
        if (DOM.drawerTitle) DOM.drawerTitle.textContent = 'Editar Base';
        if (DOM.idInput)      DOM.idInput.value           = base.id;
        if (DOM.nameInput)    DOM.nameInput.value          = base.nombre    || base.name;
        if (DOM.addressInput) DOM.addressInput.value       = base.direccion || base.address;
        _updateInputs(DOM, base.lat, base.lng);
    } else {
        if (DOM.drawerTitle) DOM.drawerTitle.textContent = 'Agregar Nueva Base';
        DOM.form?.reset();
        if (DOM.idInput) DOM.idInput.value = '';
        _updateInputs(DOM, DEFAULT_COORDS.lat, DEFAULT_COORDS.lng);
    }

    setTimeout(() => {
        _initFormMap(DOM);
        const pos = {
            lat: parseFloat(DOM.latInput?.value),
            lng: parseFloat(DOM.lngInput?.value)
        };
        state.formMarker?.setPosition(pos);
        if (state.formMap) {
            state.formMap.setCenter(pos);
            google.maps.event.trigger(state.formMap, 'resize');
        }
    }, 300);
}

function _closeDrawer(DOM) {
    if (DOM.drawer) DOM.drawer.style.right = '-100%';
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function _openModal(DOM, base) {
    DOM.modal?.classList.remove('hidden');
    if (DOM.modalTitle)   DOM.modalTitle.textContent   = base.nombre    || base.name;
    if (DOM.modalAddress) DOM.modalAddress.textContent = base.direccion || base.address;

    setTimeout(() => {
        _initViewMap(DOM);
        const pos = { lat: base.lat, lng: base.lng };
        state.viewMarker?.setPosition(pos);
        if (state.viewMap) {
            state.viewMap.setCenter(pos);
            google.maps.event.trigger(state.viewMap, 'resize');
        }
    }, 150);
}

function _closeModal(DOM) {
    DOM.modal?.classList.add('hidden');
}

// ─── Geolocalización ──────────────────────────────────────────────────────────
function _handleGeolocation(DOM) {
    if (!('geolocation' in navigator)) return;

    if (DOM.btnGeo) DOM.btnGeo.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            state.formMarker?.setPosition(newPos);
            state.formMap?.panTo(newPos);
            _updateInputs(DOM, newPos.lat, newPos.lng);
            if (DOM.btnGeo) DOM.btnGeo.innerHTML =
                '<i class="fa-solid fa-crosshairs"></i> Ubicarme';
        },
        () => {
            alert('No se pudo obtener tu ubicación.');
            if (DOM.btnGeo) DOM.btnGeo.innerHTML =
                '<i class="fa-solid fa-crosshairs"></i> Ubicarme';
        }
    );
}

// ─── Maps ─────────────────────────────────────────────────────────────────────
function _initFormMap(DOM) {
    if (!window.google || state.formMap) return;

    const container = document.getElementById('form-map');
    if (!container) return;

    state.formMap = new google.maps.Map(container, {
        center:            DEFAULT_COORDS,
        zoom:              15,
        mapTypeControl:    false,
        streetViewControl: false
    });

    state.formMarker = new google.maps.Marker({
        position:  DEFAULT_COORDS,
        map:       state.formMap,
        draggable: true,
        animation: google.maps.Animation.DROP
    });

    state.formMarker.addListener('dragend', () => {
        const pos = state.formMarker.getPosition();
        _updateInputs(DOM, pos.lat(), pos.lng());
    });

    state.formMap.addListener('click', (e) => {
        state.formMarker.setPosition(e.latLng);
        _updateInputs(DOM, e.latLng.lat(), e.latLng.lng());
    });
}

function _initViewMap(DOM) {
    if (!window.google || state.viewMap) return;

    const container = document.getElementById('view-map');
    if (!container) return;

    state.viewMap = new google.maps.Map(container, {
        center:            DEFAULT_COORDS,
        zoom:              16,
        mapTypeControl:    false,
        streetViewControl: false,
        gestureHandling:   'cooperative'
    });

    state.viewMarker = new google.maps.Marker({
        position:  DEFAULT_COORDS,
        map:       state.viewMap,
        draggable: false
    });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _updateInputs(DOM, lat, lng) {
    if (DOM.latInput) DOM.latInput.value = Number(lat).toFixed(7);
    if (DOM.lngInput) DOM.lngInput.value = Number(lng).toFixed(7);
}