// src/js/pages/choferes.js

import '../../css/drivers.css';
import '../../css/loader.css';
import { showLoader, hideLoader } from '../utils/loader.js';
import { showNotification } from '../utils/utils.ui.js';
import { fetchDrivers, saveDriver, deleteDriver } from '../api/drivers.api.js';

import { checkLicense } from '../utils/license.js';


// ─── Estado del módulo ────────────────────────────────────────────────────────
let driversList = [];
let currentDriver = null;
let isEditing = false;
let elements = {};

// ─── Inicialización ───────────────────────────────────────────────────────────
export async function init() {
    console.log('🚗 Módulo de Choferes iniciado');
    if (!checkLicense()) return; // ← síncrono, sin await necesario

    showLoader();

    try {
        cacheElements();
        setupUIEvents();
        await loadInitialData();
    } catch (error) {
        console.error('🔥 Error iniciando el módulo de choferes:', error);
    } finally {
        hideLoader();
    }
}

function cacheElements() {
    elements = {
        listContainer: document.getElementById('chofer-items'),
        detailContainer: document.getElementById('chofer-detail'),
        btnNew: document.getElementById('btn-new-chofer'),
        searchInput: document.getElementById('search-driver'),
        formTemplate: document.getElementById('driver-form-template')
    };
}

// ─── Carga de datos ───────────────────────────────────────────────────────────
async function loadInitialData() {
    try {
        driversList = await fetchDrivers();
        UI.renderList(driversList);
    } catch (error) {
        console.error('Error cargando choferes:', error);
        if (elements.listContainer) {
            elements.listContainer.innerHTML =
                '<li class="empty-msg error">Error de conexión con el servidor.</li>';
        }
    }
}

// ─── Eventos globales ─────────────────────────────────────────────────────────
function setupUIEvents() {
    elements.btnNew?.addEventListener('click', () => {
        currentDriver = null;
        isEditing = false;
        UI.renderList(driversList);
        UI.renderForm();
    });

    elements.searchInput?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = driversList.filter(d =>
            d.nombre?.toLowerCase().includes(query) ||
            d.id?.toLowerCase().includes(query)
        );
        UI.renderList(filtered);
    });
}

// ─── Acciones ─────────────────────────────────────────────────────────────────
async function handleDelete(driver) {
    if (!confirm(`¿Estás seguro de eliminar al chofer ${driver.nombre}?`)) return;

    try {
        await deleteDriver(driver.id);
        showNotification('Chofer eliminado con éxito', 'warning');
        driversList = await fetchDrivers();
        UI.renderList(driversList);
        UI.renderEmptyDetail();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function handleFormSubmit(e, driver, inputs) {
    e.preventDefault();
    const { inputId, inputNombre, inputLicencia, inputTelefono, inputEmail } = inputs;

    const driverData = {
        id: inputId.value.trim(),
        nombre: inputNombre.value.trim(),
        licencia: inputLicencia.value.trim(),
        telefono: inputTelefono.value.trim(),
        email: inputEmail.value.trim()
    };

    const editingId = isEditing ? driver.id : null;

    try {
        await saveDriver(driverData, editingId);
        showNotification(
            isEditing ? 'Chofer actualizado con éxito' : 'Chofer creado con éxito',
            'success'
        );

        driversList = await fetchDrivers();
        UI.renderList(driversList);

        if (isEditing) {
            currentDriver = driversList.find(d => d.id === driver.id);
            UI.renderDetail(currentDriver);
        } else {
            UI.renderEmptyDetail();
        }

        isEditing = false;
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// ─── UI ───────────────────────────────────────────────────────────────────────
const UI = {
    renderList(drivers) {
        if (!elements.listContainer) return;
        elements.listContainer.innerHTML = '';

        if (!drivers.length) {
            elements.listContainer.innerHTML =
                '<li class="empty-msg">No hay choferes registrados.</li>';
            return;
        }

        drivers.forEach(driver => {
            const li = document.createElement('li');
            li.className = 'chofer-item';
            if (currentDriver?.id === driver.id) li.classList.add('is-active');

            li.innerHTML = `
                <div class="chofer-avatar">
                    <i class="fa fa-user"></i>
                </div>
                <div class="chofer-info-list">
                    <strong>${driver.nombre}</strong>
                    <span>${driver.id}</span>
                </div>
            `;

            li.addEventListener('click', () => {
                currentDriver = driver;
                UI.renderList(driversList);
                UI.renderDetail(driver);
            });

            elements.listContainer.appendChild(li);
        });
    },

    renderDetail(driver) {
        if (!elements.detailContainer) return;

        elements.detailContainer.innerHTML = `
            <div class="detail-header">
                <h2>Detalles del Chofer</h2>
                <div class="action-buttons">
                    <button id="btn-edit" class="btn-secondary">
                        <i class="fa fa-pen"></i> Editar
                    </button>
                    <button id="btn-delete" class="btn-danger">
                        <i class="fa fa-trash"></i> Eliminar
                    </button>
                </div>
            </div>
            <div class="detail-body">
                <p><strong>ID:</strong> ${driver.id}</p>
                <p><strong>Nombre:</strong> ${driver.nombre}</p>
                <p><strong>Licencia:</strong> ${driver.licencia || 'N/A'}</p>
                <p><strong>Teléfono:</strong> ${driver.telefono || 'N/A'}</p>
                <p><strong>Email:</strong> ${driver.email || 'N/A'}</p>
            </div>
        `;

        document.getElementById('btn-edit').addEventListener('click', () => {
            isEditing = true;
            UI.renderForm(driver);
        });

        document.getElementById('btn-delete').addEventListener('click', () =>
            handleDelete(driver)
        );
    },

    renderForm(driver = null) {
        const template = elements.formTemplate.content.cloneNode(true);
        elements.detailContainer.innerHTML = '';
        elements.detailContainer.appendChild(template);

        const form = document.getElementById('driver-form');
        const title = document.getElementById('form-title');
        const inputId = document.getElementById('driver-id');
        const inputNombre = document.getElementById('driver-name');
        const inputLicencia = document.getElementById('driver-license');
        const inputTelefono = document.getElementById('driver-phone');
        const inputEmail = document.getElementById('driver-email');

        if (driver) {
            title.textContent = 'Editar Chofer';
            inputId.value = driver.id;
            inputId.disabled = true;
            inputNombre.value = driver.nombre || '';
            inputLicencia.value = driver.licencia || '';
            inputTelefono.value = driver.telefono || '';
            inputEmail.value = driver.email || '';
        } else {
            title.textContent = 'Nuevo Chofer';
        }

        document.getElementById('btn-cancel-form').addEventListener('click', () => {
            isEditing = false;
            currentDriver ? UI.renderDetail(currentDriver) : UI.renderEmptyDetail();
        });

        form.addEventListener('submit', (e) =>
            handleFormSubmit(e, driver, { inputId, inputNombre, inputLicencia, inputTelefono, inputEmail })
        );
    },

    renderEmptyDetail() {
        currentDriver = null;
        if (elements.detailContainer) {
            elements.detailContainer.innerHTML =
                '<p class="empty-detail-msg">Selecciona un chofer o crea uno nuevo.</p>';
        }
    }
};