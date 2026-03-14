import { DriverService } from '../services/driver.service.js';
// Si tienes un módulo de UI global para notificaciones, úsalo:
// import { showToast } from './ui.js'; 

export function initDriversUI() {
    const listContainer = document.getElementById('chofer-items');
    const detailContainer = document.getElementById('chofer-detail');
    const btnNew = document.getElementById('btn-new-chofer');
    const searchInput = document.getElementById('search-driver');
    const templateForm = document.getElementById('driver-form-template');

    let allDrivers = [];

    // --- Funciones UI ---
    function showSkeleton() {
        listContainer.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            listContainer.innerHTML += `
                <li class="skeleton-item" style="padding:15px; border-bottom:1px solid #eee;">
                    <div style="background:#ddd; height:15px; width:60%; margin-bottom:5px; border-radius:4px;"></div>
                    <div style="background:#eee; height:12px; width:40%; border-radius:4px;"></div>
                </li>`;
        }
    }

    function renderList(drivers) {
        listContainer.innerHTML = '';
        if (drivers.length === 0) {
            listContainer.innerHTML = '<li style="padding:20px; text-align:center; color:#999;">No hay choferes.</li>';
            return;
        }

        drivers.forEach(d => {
            const li = document.createElement('li');
            li.className = 'chofer-item';
            li.innerHTML = `
                <div class="chofer-icon"><i class="fa-solid fa-user-tie"></i></div>
                <div class="chofer-info">
                    <h3>${d.nombre}</h3>
                    <p class="chofer-meta">ID: ${d.id}</p>
                </div>
            `;
            
            li.addEventListener('click', () => {
                document.querySelectorAll('.chofer-item').forEach(el => el.classList.remove('active'));
                li.classList.add('active');
                showDetails(d);
            });
            listContainer.appendChild(li);
        });
    }

    function showDetails(driver) {
        detailContainer.innerHTML = `
            <div style="animation: fadeIn 0.3s ease;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h2 style="margin:0;">${driver.nombre}</h2>
                    <span style="background:#eef2ff; color:#6c8cff; padding:4px 10px; border-radius:20px; font-size:12px; font-weight:bold;">ACTIVO</span>
                </div>
                
                <div class="details-card" style="background:#f8f9fa; padding:20px; border-radius:12px; border:1px solid #eee;">
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                        <div><small style="color:#888;">ID Interno</small><div style="font-weight:600;">${driver.id}</div></div>
                        <div><small style="color:#888;">Licencia</small><div style="font-weight:600;">${driver.licencia}</div></div>
                        <div><small style="color:#888;">Teléfono</small><div>${driver.telefono || '--'}</div></div>
                        <div><small style="color:#888;">Email</small><div>${driver.email || '--'}</div></div>
                    </div>
                </div>

                <div style="margin-top:30px; display:flex; gap:10px;">
                    <button id="btn-edit" class="primary-btn"><i class="fa fa-edit"></i> Editar</button>
                    <button id="btn-delete" class="secondary-btn" style="color:var(--danger);"><i class="fa fa-trash"></i> Eliminar</button>
                </div>
            </div>
        `;

        document.getElementById('btn-edit').onclick = () => showForm('edit', driver);
        document.getElementById('btn-delete').onclick = () => handleDelete(driver.id);
    }

    function showForm(mode, driver = {}) {
        const clone = templateForm.content.cloneNode(true);
        const form = clone.querySelector('form');
        const title = clone.querySelector('#form-title');

        if (mode === 'edit') {
            title.textContent = "Editar Chofer";
            form.querySelector('#driver-id').value = driver.id;
            form.querySelector('#driver-id').disabled = true;
            form.querySelector('#driver-name').value = driver.nombre;
            form.querySelector('#driver-license').value = driver.licencia;
            form.querySelector('#driver-phone').value = driver.telefono || '';
            form.querySelector('#driver-email').value = driver.email || '';
        }

        detailContainer.innerHTML = '';
        detailContainer.appendChild(clone);

        document.getElementById('btn-cancel-form').onclick = () => {
            detailContainer.innerHTML = '<p id="initial-message">Selecciona un chofer para ver sus detalles.</p>';
        };

        form.onsubmit = async (e) => {
            e.preventDefault();
            const formData = {
                id: form.querySelector('#driver-id').value,
                nombre: form.querySelector('#driver-name').value,
                licencia: form.querySelector('#driver-license').value,
                telefono: form.querySelector('#driver-phone').value,
                email: form.querySelector('#driver-email').value
            };

            try {
                if (mode === 'create') {
                    await DriverService.create(formData);
                } else {
                    await DriverService.update(formData.id, formData);
                }
                loadData();
                detailContainer.innerHTML = '<div style="color:green; padding:20px; text-align:center;"><i class="fa fa-check-circle"></i> Guardado correctamente</div>';
            } catch (err) {
                alert("Error: " + err.message);
            }
        };
    }

    // --- Lógica de Control ---
    async function loadData() {
        showSkeleton();
        try {
            allDrivers = await DriverService.getAll();
            renderList(allDrivers);
        } catch (err) {
            console.error(err);
        }
    }

    async function handleDelete(id) {
        try {
            const ok = await window.showAdminAuthConfirm({ title: 'Eliminar chofer', message: 'Introduce credenciales.', actionLabel: 'Eliminar' });
            if (!ok) return;
            await DriverService.delete(id);
            detailContainer.innerHTML = '<p>Chofer eliminado.</p>';
            loadData();
        } catch (err) {
            alert(err.message || 'Error al eliminar');
        }
    }

    // --- Event Listeners ---
    if (btnNew) btnNew.addEventListener('click', () => showForm('create'));

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const text = e.target.value.toLowerCase();
            const filtered = allDrivers.filter(d => 
                d.nombre.toLowerCase().includes(text) || 
                d.id.toLowerCase().includes(text)
            );
            renderList(filtered);
        });
    }

    // Inicializar carga de datos
    loadData();
}