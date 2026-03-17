// src/js/pages/vehicles.js

import '../../css/vehicles.css';
import '../../css/loader.css';
import { showLoader, hideLoader } from '../utils/loader.js';
import { showNotification } from '../modules/utils/utils.ui.js';
import { fetchVehicles, saveVehicle, deleteVehicle } from '../api/vehicles.api.js';

// ─── Estado del módulo ────────────────────────────────────────────────────────
let vehiclesList = [];
let currentVehicle = null;
let isEditing = false;
let elements = {};

// ─── Inicialización ───────────────────────────────────────────────────────────
export async function init() {
    console.log('🚛 Módulo de Vehículos iniciado');
    showLoader();

    try {
        cacheElements();
        setupUIEvents();
        await loadInitialData();
    } catch (error) {
        console.error('🔥 Error iniciando el módulo de vehículos:', error);
    } finally {
        hideLoader();
    }
}

function cacheElements() {
    elements = {
        listContainer:  document.getElementById('vehicle-items'),
        detailContainer:document.getElementById('vehicle-detail'),
        btnNew:         document.getElementById('btn-new-vehicle'),
        searchInput:    document.getElementById('search-vehicle'),
        formTemplate:   document.getElementById('vehicle-form-template')
    };
}

// ─── Carga de datos ───────────────────────────────────────────────────────────
async function loadInitialData() {
    try {
        vehiclesList = await fetchVehicles();
        UI.renderList(vehiclesList);
    } catch (error) {
        console.error('Error cargando vehículos:', error);
        if (elements.listContainer) {
            elements.listContainer.innerHTML =
                '<li class="empty-msg error">Error de conexión con el servidor.</li>';
        }
    }
}

// ─── Eventos globales ─────────────────────────────────────────────────────────
function setupUIEvents() {
    elements.btnNew?.addEventListener('click', () => {
        currentVehicle = null;
        isEditing = false;
        UI.renderList(vehiclesList);
        UI.renderForm();
    });

    elements.searchInput?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = vehiclesList.filter(v =>
            v.id?.toLowerCase().includes(query) ||
            v.marca?.toLowerCase().includes(query) ||
            v.alias?.toLowerCase().includes(query)
        );
        UI.renderList(filtered);
    });
}

// ─── Acciones ─────────────────────────────────────────────────────────────────
async function handleDelete(vehicle) {
    if (!confirm(`¿Estás seguro de eliminar el vehículo ${vehicle.id}?`)) return;

    try {
        await deleteVehicle(vehicle.id);
        showNotification('Vehículo eliminado con éxito', 'warning');
        vehiclesList = await fetchVehicles();
        UI.renderList(vehiclesList);
        UI.renderEmptyDetail();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function handleFormSubmit(e, vehicle, inputs) {
    e.preventDefault();
    const { inputId, inputAlias, inputMarca, inputModelo, inputYear } = inputs;

    const vehicleData = {
        id:     inputId.value.trim(),
        alias:  inputAlias.value.trim(),
        marca:  inputMarca.value.trim(),
        modelo: inputModelo.value.trim(),
        anio:   inputYear.value.trim()
    };

    const editingId = isEditing ? vehicle.id : null;

    try {
        await saveVehicle(vehicleData, editingId);
        showNotification(
            isEditing ? 'Vehículo actualizado con éxito' : 'Vehículo registrado con éxito',
            'success'
        );

        vehiclesList = await fetchVehicles();
        UI.renderList(vehiclesList);

        if (isEditing) {
            currentVehicle = vehiclesList.find(v => v.id === vehicle.id);
            UI.renderDetail(currentVehicle);
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
    renderList(vehicles) {
        if (!elements.listContainer) return;
        elements.listContainer.innerHTML = '';

        if (!vehicles.length) {
            elements.listContainer.innerHTML =
                '<li class="empty-msg">No hay vehículos registrados.</li>';
            return;
        }

        vehicles.forEach(vehicle => {
            const li = document.createElement('li');
            li.className = 'vehicle-item';
            if (currentVehicle?.id === vehicle.id) li.classList.add('is-active');

            li.innerHTML = `
                <div class="vehicle-icon">
                    <i class="fa-solid fa-truck"></i>
                </div>
                <div class="vehicle-info-list">
                    <strong>${vehicle.id}${vehicle.alias ? ` (${vehicle.alias})` : ''}</strong>
                    <span>${vehicle.marca} ${vehicle.modelo}</span>
                </div>
            `;

            li.addEventListener('click', () => {
                currentVehicle = vehicle;
                UI.renderList(vehiclesList);
                UI.renderDetail(vehicle);
            });

            elements.listContainer.appendChild(li);
        });
    },

    renderDetail(vehicle) {
        if (!elements.detailContainer) return;

        elements.detailContainer.innerHTML = `
            <div class="detail-header">
                <h2>Detalles del Vehículo</h2>
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
                <p><strong>Placa (ID):</strong> ${vehicle.id}</p>
                <p><strong>Alias:</strong> ${vehicle.alias || 'N/A'}</p>
                <p><strong>Marca:</strong> ${vehicle.marca}</p>
                <p><strong>Modelo:</strong> ${vehicle.modelo}</p>
                <p><strong>Año:</strong> ${vehicle.anio || 'N/A'}</p>
            </div>
        `;

        document.getElementById('btn-edit').addEventListener('click', () => {
            isEditing = true;
            UI.renderForm(vehicle);
        });

        document.getElementById('btn-delete').addEventListener('click', () =>
            handleDelete(vehicle)
        );
    },

    renderForm(vehicle = null) {
        const template = elements.formTemplate.content.cloneNode(true);
        elements.detailContainer.innerHTML = '';
        elements.detailContainer.appendChild(template);

        const form        = document.getElementById('vehicle-form');
        const title       = document.getElementById('form-title');
        const inputId     = document.getElementById('vehicle-id');
        const inputAlias  = document.getElementById('vehicle-alias');
        const inputMarca  = document.getElementById('vehicle-marca');
        const inputModelo = document.getElementById('vehicle-modelo');
        const inputYear   = document.getElementById('vehicle-year');

        if (vehicle) {
            title.textContent = 'Editar Vehículo';
            inputId.value     = vehicle.id;
            inputId.disabled  = true;
            inputAlias.value  = vehicle.alias  || '';
            inputMarca.value  = vehicle.marca  || '';
            inputModelo.value = vehicle.modelo || '';
            inputYear.value   = vehicle.anio   || '';
        } else {
            title.textContent = 'Nuevo Vehículo';
        }

        document.getElementById('btn-cancel-form').addEventListener('click', () => {
            isEditing = false;
            currentVehicle ? UI.renderDetail(currentVehicle) : UI.renderEmptyDetail();
        });

        form.addEventListener('submit', (e) =>
            handleFormSubmit(e, vehicle, { inputId, inputAlias, inputMarca, inputModelo, inputYear })
        );
    },

    renderEmptyDetail() {
        currentVehicle = null;
        if (elements.detailContainer) {
            elements.detailContainer.innerHTML =
                '<p class="empty-detail-msg">Selecciona un vehículo o registra uno nuevo.</p>';
        }
    }
};