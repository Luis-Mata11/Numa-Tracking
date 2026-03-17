// src/js/pages/vehicles.js
import '../../css/vehicles.css'; // <-- VITE HARÁ LA MAGIA CON ESTO
import '../../css/loader.css'; // Importamos el CSS del loader
import { showLoader, hideLoader } from '../utils/loader.js'; 


const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/vehicles'; 
let vehiclesList = [];
let currentVehicle = null;
let isEditing = false;
let elements = {}; 

const VehicleService = {
    getHeaders() {
        const token = sessionStorage.getItem('numa_token'); // Mismo método que choferes
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    },
    async getAll() {
        const res = await fetch(API_URL, { headers: this.getHeaders() });
        if (!res.ok) throw new Error('Error al obtener vehículos');
        return res.json();
    },
    async create(data) {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Error al crear');
        return result;
    },
    async update(id, data) {
        const res = await fetch(`${API_URL}/${id}`, {
            method: 'PUT',
            headers: this.getHeaders(),
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Error al actualizar');
        return result;
    },
    async delete(id) {
        const res = await fetch(`${API_URL}/${id}`, {
            method: 'DELETE',
            headers: this.getHeaders()
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Error al eliminar');
        return result;
    }
};

const UI = {
    renderList(vehicles) {
        if (!elements.listContainer) return;
        elements.listContainer.innerHTML = '';

        if (vehicles.length === 0) {
            elements.listContainer.innerHTML = '<li class="empty-msg" style="padding:15px; color:#888;">No hay vehículos registrados.</li>';
            return;
        }

        vehicles.forEach(vehicle => {
            const li = document.createElement('li');
            li.className = 'vehicle-item';
            li.style.cssText = 'padding: 10px; border-bottom: 1px solid #eee; cursor: pointer; display: flex; align-items: center; gap: 10px;';
            if (currentVehicle && currentVehicle.id === vehicle.id) li.style.backgroundColor = '#f0f8ff';
            
            li.innerHTML = `
                <div class="vehicle-icon"><i class="fa-solid fa-truck" style="color: #555;"></i></div>
                <div class="vehicle-info-list" style="display: flex; flex-direction: column;">
                    <strong>${vehicle.id} ${vehicle.alias ? `(${vehicle.alias})` : ''}</strong>
                    <span style="font-size: 0.85em; color: #666;">${vehicle.marca} ${vehicle.modelo}</span>
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
            <div class="detail-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #ccc; padding-bottom: 10px; margin-bottom: 20px;">
                <h2>Detalles del Vehículo</h2>
                <div class="action-buttons">
                    <button id="btn-edit" class="btn-secondary"><i class="fa fa-pen"></i> Editar</button>
                    <button id="btn-delete" class="btn-danger" style="background: #dc3545; color: white; border: none; padding: 5px 10px; cursor: pointer;"><i class="fa fa-trash"></i> Eliminar</button>
                </div>
            </div>
            <div class="detail-body" style="font-size: 1.1em; line-height: 1.8;">
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

        document.getElementById('btn-delete').addEventListener('click', async () => {
            if (confirm(`¿Estás seguro de eliminar el vehículo ${vehicle.id}?`)) {
                try {
                    await VehicleService.delete(vehicle.id);
                    await App.loadData();
                    UI.renderEmptyDetail();
                } catch (error) {
                    alert(error.message);
                }
            }
        });
    },

    renderForm(vehicle = null) {
        const template = elements.formTemplate.content.cloneNode(true);
        elements.detailContainer.innerHTML = '';
        elements.detailContainer.appendChild(template);

        const form = document.getElementById('vehicle-form');
        const title = document.getElementById('form-title');
        const inputId = document.getElementById('vehicle-id');
        const inputAlias = document.getElementById('vehicle-alias');
        const inputMarca = document.getElementById('vehicle-marca');
        const inputModelo = document.getElementById('vehicle-modelo');
        const inputYear = document.getElementById('vehicle-year');

        if (vehicle) {
            title.textContent = 'Editar Vehículo';
            inputId.value = vehicle.id;
            inputId.disabled = true; // La placa/ID no se debería cambiar
            inputAlias.value = vehicle.alias || '';
            inputMarca.value = vehicle.marca || '';
            inputModelo.value = vehicle.modelo || '';
            inputYear.value = vehicle.year || '';
        } else {
            title.textContent = 'Nuevo Vehículo';
        }

        document.getElementById('btn-cancel-form').addEventListener('click', () => {
            isEditing = false;
            if (currentVehicle) {
                UI.renderDetail(currentVehicle);
            } else {
                UI.renderEmptyDetail();
            }
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = {
                id: inputId.value,
                alias: inputAlias.value,
                marca: inputMarca.value,
                modelo: inputModelo.value,
                anio: inputYear.value
            };

            try {
                if (isEditing) {
                    await VehicleService.update(vehicle.id, formData);
                    alert('Vehículo actualizado con éxito');
                } else {
                    await VehicleService.create(formData);
                    alert('Vehículo registrado con éxito');
                }
                
                await App.loadData();
                
                if (isEditing) {
                    currentVehicle = vehiclesList.find(v => v.id === vehicle.id);
                    UI.renderDetail(currentVehicle);
                } else {
                    UI.renderEmptyDetail();
                }
                isEditing = false;

            } catch (error) {
                alert(error.message);
            }
        });
    },

    renderEmptyDetail() {
        currentVehicle = null;
        if(elements.detailContainer) {
            elements.detailContainer.innerHTML = `<p id="initial-message" style="text-align:center; margin-top:50px; color:#888;">Selecciona un vehículo o registra uno nuevo.</p>`;
        }
    }
};

const App = {
    async loadData() {
        try {
            vehiclesList = await VehicleService.getAll();
            UI.renderList(vehiclesList);
        } catch (error) {
            console.error('Error cargando datos:', error);
            if(elements.listContainer) {
                elements.listContainer.innerHTML = '<li class="empty-msg" style="color: red; padding: 15px;">Error de conexión con el servidor.</li>';
            }
        }
    }
};

export async function init() { // 👈 Ojo aquí: agregamos "async"
    console.log("🚛 Módulo de Vehículos iniciado");
    
    // 🟢 1. Encendemos el loader
    showLoader();
    
    try {
        // 2. Buscamos los elementos inyectados en el DOM
        elements = {
            listContainer: document.getElementById('vehicle-items'),
            detailContainer: document.getElementById('vehicle-detail'),
            btnNew: document.getElementById('btn-new-vehicle'),
            searchInput: document.getElementById('search-vehicle'),
            formTemplate: document.getElementById('vehicle-form-template')
        };

        // 3. Eventos base
        if (elements.btnNew) {
            elements.btnNew.addEventListener('click', () => {
                currentVehicle = null;
                isEditing = false;
                UI.renderList(vehiclesList); 
                UI.renderForm();
            });
        }

        if (elements.searchInput) {
            elements.searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                const filtered = vehiclesList.filter(v => 
                    v.id.toLowerCase().includes(query) || 
                    (v.alias && v.alias.toLowerCase().includes(query)) ||
                    v.marca.toLowerCase().includes(query)
                );
                UI.renderList(filtered);
            });
        }

        // 4. Cargar la data
        // 👈 Ojo aquí: agregamos "await" para que el loader espere a que termine
        await App.loadData(); 

    } catch (error) {
        console.error("🔥 Error cargando el módulo de vehículos:", error);
    } finally {
        // 🔴 5. Apagamos el loader SIEMPRE
        hideLoader();
    }
}