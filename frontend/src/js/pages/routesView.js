// src/js/modules/views/routesView.js
import '../../css/routes.css';
import '../../css/routes-detail-compat.css';
import { showNotification } from '../utils/utils.ui.js';
import '../../css/loader.css'; // Importamos el CSS del loader
import { showLoader, hideLoader } from '../utils/loader.js';
// Añade esto junto a tus otras importaciones
import { populateFiltersFromRoutes, setupSearch } from '../ui/filters.ui.js';

import { initOrResizeDrawMap, clearDrawMap, setDrawMode, drawStartFromBase, getRouteDataForDB, restoreRouteOnDrawMap, setBaseOperativaCoords } from '../services/maps.service.js';
import { setRoutes } from '../state/routes.store.js';
import { renderRoutes } from '../ui/list.ui.js';
import { fetchRoutes, fetchVehicles, fetchDrivers, saveRoute, deleteRoute } from '../api/routes.api.js';
// ... tus imports arriba ...

// Vite inyectará la URL correcta dependiendo del entorno
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

let currentVehicles = [];
let currentDrivers = [];

export async function init() {
    console.log('🛣️ Módulo de Rutas iniciado');
    showLoader();

    try {
        setupUIEvents();
        setupRouteBuilderUI();
        await loadInitialData();

        const baseCoords = await loadBaseCoords();
        if (baseCoords) setBaseOperativaCoords(baseCoords.lat, baseCoords.lng);

        if (document.getElementById('main-map') || document.getElementById('draw-map')) {
            const checkGoogle = setInterval(() => {
                if (window.google && window.google.maps) clearInterval(checkGoogle);
            }, 100);
        } // ← setInterval cierra aquí

        // ── Socket: escuchar cuando el chofer ingresa ──────────────────────
        // Tomamos la API_URL y le quitamos '/api' para la conexión del socket
        const SOCKET_URL = API_URL.replace('/api', '');
        const socket = window.io ? window.io(SOCKET_URL) : null;

        if (socket) {
            socket.on('routeReady', (data) => {
                console.log('🔔 Chofer ingresó a la ruta:', data);

                // Notifica al detalle para que actualice el chip en tiempo real
                document.dispatchEvent(new CustomEvent('socket:driverReady', {
                    detail: { routeId: data.routeId }
                }));

                // Actualiza driverIsReady en memoria para futuras aperturas del detalle
                import('../state/routes.store.js').then(({ getRoutes, setRoutes }) => {
                    const rutas = getRoutes();
                    if (!rutas) return;
                    setRoutes(rutas.map(r =>
                        String(r._id || r.id) === String(data.routeId)
                            ? { ...r, driverIsReady: true }
                            : r
                    ));
                }).catch(() => { });
            });
        } else {
            console.warn('⚠️ Socket.io no disponible — verifica que el <script> de socket.io esté cargado.');
        }

    } catch (error) {
        console.error("🔥 Error iniciando la vista de rutas:", error);
    } finally {
        hideLoader();
    }
}
document.addEventListener('route:delete', async (e) => {
    const routeData = e.detail;

    try {
        await deleteRoute(routeData._id);
        showNotification('¡Ruta eliminada con éxito!', 'warning');

        // 🔄 RECARGAMOS LA LISTA VISUALMENTE
        const rutasActualizadas = await fetchRoutes();
        setRoutes(rutasActualizadas);
        renderRoutes(rutasActualizadas);

        // Ocultar el panel de detalles
        document.getElementById('route-detail').innerHTML = '';
    } catch (error) {
        console.error("Error al eliminar:", error);
        showNotification('¡Hubo un error al eliminar la ruta!', 'warning');
    }
});

document.addEventListener('route:edit', (e) => {
    const routeData = e.detail;
    console.log("✏️ ¡Me pidieron editar esta ruta!", routeData);
    // Le pasamos los datos al panel para que se abra en "Modo Edición"
    openRoutePanel(routeData);
});

function setupRouteBuilderUI() {
    console.log("🛠️ Buscando botones de creación de ruta en el DOM...");

    // Usamos los IDs exactos de tu HTML
    const btnBase = document.getElementById('btn-use-base');
    const btnManual = document.getElementById('btn-draw-origin');
    const btnStops = document.getElementById('btn-add-waypoint');
    const btnEnd = document.getElementById('btn-draw-dest');
    const btnClear = document.getElementById('btn-clear-map'); // Agregamos el de limpiar

    if (!btnBase || !btnManual) {
        console.error("❌ ¡ALERTA! No se encontraron los botones. Revisa el HTML.");
        return;
    }

    console.log("✅ Botones encontrados. Asignando eventos...");

    // Inicialmente bloqueamos paradas y fin
    btnStops.disabled = true;
    btnEnd.disabled = true;

    // Escuchamos cuando el mapa nos avise que ya se puso el inicio
    document.addEventListener('mapStartSet', () => {
        console.log("🔔 Evento mapStartSet recibido. Habilitando paradas y final.");
        btnBase.disabled = true;
        btnManual.disabled = true;
        btnStops.disabled = false;
        btnEnd.disabled = false;
    });

    document.addEventListener('mapEndSet', () => {
        console.log("🔔 Evento mapEndSet recibido. Bloqueando herramientas de dibujo.");
        btnBase.disabled = true;
        btnManual.disabled = true;
        btnStops.disabled = true;
        btnEnd.disabled = true;
        // Nota: No bloqueamos btnClear para que el usuario pueda arrepentirse y reiniciar el mapa.
    });

    // 1. INICIO DESDE BASE
    btnBase.addEventListener('click', () => {
        console.log("🖱️ Clic en: Usar Base");

        // 🔥 Quitamos el mockBase. Al mandarlo vacío, maps.service.js usará las coordenadas reales.
        drawStartFromBase();

        btnBase.disabled = true;
        btnManual.disabled = true;
        btnStops.disabled = false;
        btnEnd.disabled = false;
    });
    // 2. INICIO MANUAL
    btnManual.addEventListener('click', (e) => {
        e.preventDefault();
        console.log("🖱️ Clic en: Trazar Inicio");
        setDrawMode('START_MANUAL');
        showNotification('Haz clic en el mapa para colocar el Punto de Partida', 'success', '#form-new-route');
    });

    // 3. PARADAS
    btnStops.addEventListener('click', (e) => {
        e.preventDefault();
        console.log("🖱️ Clic en: Agregar Parada");
        setDrawMode('WAYPOINTS');
        btnEnd.disabled = false;
    });

    // 4. DESTINO FINAL
    btnEnd.addEventListener('click', (e) => {
        e.preventDefault();
        console.log("🖱️ Clic en: Agregar Destino");
        setDrawMode('END');
        showNotification('Haz clic en el mapa para el Destino Final', 'success', '#form-new-route');
    });

    // 5. LIMPIAR MAPA (Botón de la basurita)
    if (btnClear) {
        btnClear.addEventListener('click', (e) => {
            e.preventDefault();
            console.log("🖱️ Clic en: Limpiar Mapa");
            clearDrawMap(); // Viene de maps.service.js

            // Reiniciamos los botones a su estado original
            btnBase.disabled = false;
            btnManual.disabled = false;
            btnStops.disabled = true;
            btnEnd.disabled = true;
        });
    }
}

// ... (Aquí van loadInitialData y populateSelects tal cual los tienes) ...

function setupUIEvents() {
    const btnNewRoute = document.getElementById('btn-new-route');
    const btnToggleFilters = document.getElementById('btn-toggle-filters');
    const filterPopup = document.getElementById('filter-popup');
    const btnResetFilters = document.getElementById('btn-reset-filters');
    const searchInput = document.getElementById('search-route');


    if (btnNewRoute) btnNewRoute.addEventListener('click', () => openRoutePanel());

    const btnClosePanel = document.getElementById('close-panel');
    if (btnClosePanel) {
        btnClosePanel.addEventListener('click', () => {
            document.getElementById('new-route-panel')?.classList.remove('open');
            clearDrawMap();
            // Resetear botones
            document.getElementById('btn-start-base').disabled = false;
            document.getElementById('btn-start-manual').disabled = false;
            document.getElementById('btn-add-stops').disabled = true;
            document.getElementById('btn-add-end').disabled = true;
        });
    }

    const form = document.getElementById('form-new-route');
    if (form) form.addEventListener('submit', handleFormSubmit);

    if (btnToggleFilters && filterPopup) {
        // Mostrar/Ocultar popup
        btnToggleFilters.addEventListener('click', () => {
            filterPopup.classList.toggle('hidden');
        });

        // Ocultar al hacer clic fuera del popup (opcional pero súper recomendado para UX)
        document.addEventListener('click', (e) => {
            if (!filterPopup.contains(e.target) && !btnToggleFilters.contains(e.target)) {
                filterPopup.classList.add('hidden');
            }
        });
    }

    if (btnResetFilters) {
        // Limpiar todos los filtros y restaurar la lista
        btnResetFilters.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            document.getElementById('status-filter').value = '';
            document.getElementById('vehicle-filter').value = '';
            document.getElementById('driver-filter').value = '';

            // Disparamos artificialmente el evento 'input' para que la búsqueda vacía recargue todo
            if (searchInput) {
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            }

            filterPopup.classList.add('hidden'); // Cerramos el popup al limpiar
        });
    }
}

async function loadBaseCoords() {
    try {
        const token = sessionStorage.getItem('numa_token') || localStorage.getItem('numa_token');
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        // ── ÚNICO PASO: Obtener las bases (que ya incluye el defaultBaseId) ──
        const basesRes = await fetch(`${API_URL}/bases`, {
            method: 'GET',
            headers
        });

        if (!basesRes.ok) {
            console.warn("❌ No se pudo cargar la lista de bases. Status:", basesRes.status);
            return null; // Retornamos null para que quien llame sepa que falló
        }

        const responseData = await basesRes.json();
        console.log("📦 Datos crudos de bases:", responseData);

        // 1. Extraemos el defaultBaseId de la misma respuesta
        const defaultBaseId = responseData.defaultBaseId || null;

        // 2. Extraemos el arreglo de bases
        const basesArray = Array.isArray(responseData)
            ? responseData
            : responseData.bases ?? [];

        if (!basesArray.length) {
            console.warn("⚠️ No hay bases registradas para este usuario.");
            return null;
        }

        // 3. Buscamos la base principal coincidiendo el ID
        let basePrincipal;
        if (defaultBaseId) {
            basePrincipal = basesArray.find(b => {
                const currentId = String(b._id || b.id);
                return currentId === String(defaultBaseId);
            });
        }

        // 4. Si por alguna razón no la encuentra, tomamos la primera por seguridad
        if (!basePrincipal) {
            console.warn("⚠️ Falló la coincidencia con defaultBaseId, tomando la base [0].");
            basePrincipal = basesArray[0];
        }

        console.log("🏠 Base seleccionada:", basePrincipal);

        // 5. Extraemos latitud y longitud asegurando el orden de GeoJSON [lng, lat]
        const lat = basePrincipal.ubicacion.coordinates[1];
        const lng = basePrincipal.ubicacion.coordinates[0];

        console.log(`✅ Base operativa cargada → lat: ${lat}, lng: ${lng}`);

        // 6. 🚀 EL DETALLE CLAVE: Retornamos el objeto para que tu MapsService lo use
        return { lat, lng };

    } catch (error) {
        console.error("🔥 Error en loadBaseCoords:", error);
        return null;
    }
}

export function openRoutePanel(route = null) {
    // 🛡️ BLINDAJE: Verificamos que sea una ruta real y no un evento de clic
    const isEditMode = route && route._id !== undefined;

    const panel = document.getElementById('new-route-panel');
    const form = document.getElementById('form-new-route');
    if (!panel || !form) return;

    form.reset();
    delete form.dataset.editingId;
    if (document.getElementById('route-id')) document.getElementById('route-id').value = '';
    clearDrawMap();

    // 🔥 MODO EDICIÓN
    if (isEditMode) {
        console.log("✏️ Llenando formulario con:", route);

        form.dataset.editingId = route._id;
        if (document.getElementById('route-id')) document.getElementById('route-id').value = route._id;

        if (document.getElementById('route-name')) document.getElementById('route-name').value = route.name || '';
        if (document.getElementById('route-color')) document.getElementById('route-color').value = route.color || '#6c8cff';

        if (document.getElementById('route-vehicle')) document.getElementById('route-vehicle').value = route.vehicle?._id || route.vehicle || '';
        if (document.getElementById('route-driver')) document.getElementById('route-driver').value = route.driver?._id || route.driver || '';
        if (document.getElementById('route-client')) document.getElementById('route-client').value = route.client?._id || route.client || '';
    }

    panel.classList.add('open');
    setTimeout(() => {
        initOrResizeDrawMap();
        if (isEditMode && route.trayecto) {
            console.log("🗺️ Dibujando trayecto guardado en el mini-mapa...");
            restoreRouteOnDrawMap(route.trayecto);
        }
    }, 300);
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const form = e.target;

    // 🔥 EL CAMBIO CLAVE: Pedimos la data estructurada al mapa
    const trayectoData = getRouteDataForDB();

    if (!trayectoData) {

        showNotification('Debes trazar una ruta completa en el mapa (Inicio y Fin) antes de guardar', 'warning', '#form-new-route');
        return;
    }

    const routeData = {
        name: document.getElementById('route-name')?.value || 'Sin nombre',
        color: document.getElementById('route-color')?.value || '#2196F3',
        vehicle: document.getElementById('route-vehicle')?.value || null,
        driver: document.getElementById('route-driver')?.value || null,
        // Mandamos todo el objeto Trayecto anidado
        trayecto: trayectoData
    };

    const editingId = form.dataset.editingId;

    try {
        await saveRoute(routeData, editingId);

        form.reset();
        delete form.dataset.editingId;
        document.getElementById('new-route-panel').classList.remove('open');

        const rutasActualizadas = await fetchRoutes();
        setRoutes(rutasActualizadas);
        renderRoutes(rutasActualizadas);
        showNotification('¡Ruta guardada exitosamente!', 'success');

    } catch (error) {
        console.error("Error al guardar:", error);
        showNotification('Error al guardar la ruta', 'error');
    }
}



// Para que no truene si falta en el código de arriba
async function loadInitialData() {
    try {
        const [routes, vehicles, drivers] = await Promise.all([
            fetchRoutes(), fetchVehicles(), fetchDrivers()
        ]);
        currentVehicles = vehicles;
        currentDrivers = drivers;
        populateSelects(vehicles, drivers);
        setRoutes(routes);
        renderRoutes(routes);

        // 🔥 NUEVO: Inicializamos la búsqueda y llenamos los selects de filtros
        populateFiltersFromRoutes();
        setupSearch();


    } catch (error) { }
}


function populateSelects(vehicles, drivers) {
    const vSelect = document.getElementById('route-vehicle');
    const dSelect = document.getElementById('route-driver');

    if (vSelect) {
        vSelect.innerHTML = '<option value="">-- Seleccionar Vehículo --</option>';
        vehicles.filter(v => v.activo !== false).forEach(v => {
            const opt = document.createElement('option');
            opt.value = v._id;
            opt.textContent = v.alias || `${v.marca} - ${v.placa}`;
            vSelect.appendChild(opt);
        });
    }

    if (dSelect) {
        dSelect.innerHTML = '<option value="">-- Seleccionar Chofer --</option>';
        drivers.filter(d => d.activo !== false).forEach(d => {
            const opt = document.createElement('option');
            opt.value = d._id;
            opt.textContent = d.nombre;
            dSelect.appendChild(opt);
        });
    }
}