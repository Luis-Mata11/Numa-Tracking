// src/js/pages/choferes.js
import '../../css/drivers.css'; // <-- VITE HARÁ LA MAGIA CON ESTO

import '../../css/loader.css'; // Importamos el CSS del loader
import { showLoader, hideLoader } from '../utils/loader.js'; 


const API_URL = 'http://localhost:4000/api/drivers'; 
let driversList = [];
let currentDriver = null;
let isEditing = false;
let elements = {}; // Lo dejamos vacío por ahora

const DriverService = {
    getHeaders() {
        const token = sessionStorage.getItem('numa_token'); 
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    },
    async getAll() {
        const res = await fetch(API_URL, { headers: this.getHeaders() });
        if (!res.ok) throw new Error('Error al obtener choferes');
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
    renderList(drivers) {
        if (!elements.listContainer) return;
        elements.listContainer.innerHTML = '';

        if (drivers.length === 0) {
            elements.listContainer.innerHTML = '<li class="empty-msg" style="padding:15px; color:#888;">No hay choferes registrados.</li>';
            return;
        }

        drivers.forEach(driver => {
            const li = document.createElement('li');
            li.className = 'chofer-item';
            if (currentDriver && currentDriver.id === driver.id) li.classList.add('active');
            
            li.innerHTML = `
                <div class="chofer-avatar"><i class="fa fa-user"></i></div>
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
                    <button id="btn-edit" class="secondary-btn"><i class="fa fa-pen"></i> Editar</button>
                    <button id="btn-delete" class="btn-danger"><i class="fa fa-trash"></i> Eliminar</button>
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

        document.getElementById('btn-delete').addEventListener('click', async () => {
            if (confirm(`¿Estás seguro de eliminar al chofer ${driver.nombre}?`)) {
                try {
                    await DriverService.delete(driver.id);
                    await App.loadData();
                    UI.renderEmptyDetail();
                } catch (error) {
                    alert(error.message);
                }
            }
        });
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
            inputNombre.value = driver.nombre;
            inputLicencia.value = driver.licencia || '';
            inputTelefono.value = driver.telefono || '';
            inputEmail.value = driver.email || '';
        } else {
            title.textContent = 'Nuevo Chofer';
        }

        document.getElementById('btn-cancel-form').addEventListener('click', () => {
            isEditing = false;
            if (currentDriver) {
                UI.renderDetail(currentDriver);
            } else {
                UI.renderEmptyDetail();
            }
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = {
                id: inputId.value,
                nombre: inputNombre.value,
                licencia: inputLicencia.value,
                telefono: inputTelefono.value,
                email: inputEmail.value
            };

            try {
                if (isEditing) {
                    await DriverService.update(driver.id, formData);
                    alert('Chofer actualizado con éxito');
                } else {
                    await DriverService.create(formData);
                    alert('Chofer creado con éxito');
                }
                
                await App.loadData();
                
                if (isEditing) {
                    currentDriver = driversList.find(d => d.id === driver.id);
                    UI.renderDetail(currentDriver);
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
        currentDriver = null;
        if(elements.detailContainer) {
            elements.detailContainer.innerHTML = `<p id="initial-message" style="text-align:center; margin-top:50px; color:#888;">Selecciona un chofer o crea uno nuevo.</p>`;
        }
    }
};

const App = {
    async loadData() {
        try {
            driversList = await DriverService.getAll();
            UI.renderList(driversList);
        } catch (error) {
            console.error('Error cargando datos:', error);
            if(elements.listContainer) {
                elements.listContainer.innerHTML = '<li class="empty-msg">Error de conexión con el servidor.</li>';
            }
        }
    }
};

// 🛠️ LA MAGIA DEL ROUTER: Exportamos init()
export async function init() { // 👈 Lo hacemos asíncrono
    console.log("🚛 Módulo de Choferes iniciado");
    
    // 🟢 1. Encendemos el loader
    showLoader();

    try {
        // 2. Recién aquí buscamos los elementos en el DOM (porque ya están inyectados)
        elements = {
            listContainer: document.getElementById('chofer-items'),
            detailContainer: document.getElementById('chofer-detail'),
            btnNew: document.getElementById('btn-new-chofer'),
            searchInput: document.getElementById('search-driver'),
            formTemplate: document.getElementById('driver-form-template')
        };

        // 3. Asignamos eventos
        if (elements.btnNew) {
            elements.btnNew.addEventListener('click', () => {
                currentDriver = null;
                isEditing = false;
                UI.renderList(driversList); 
                UI.renderForm();
            });
        }

        if (elements.searchInput) {
            elements.searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                const filtered = driversList.filter(d => 
                    d.nombre.toLowerCase().includes(query) || 
                    d.id.toLowerCase().includes(query)
                );
                UI.renderList(filtered);
            });
        }

        // 4. Cargamos la data
        // 👈 Le ponemos 'await' para que el logo siga girando hasta que lleguen los datos
        await App.loadData(); 

    } catch (error) {
        console.error("🔥 Error cargando el módulo de choferes:", error);
    } finally {
        // 🔴 5. Apagamos el loader pase lo que pase
        hideLoader();
    }
}