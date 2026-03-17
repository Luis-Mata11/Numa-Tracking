// src/js/pages/dashboard.js
import '../../css/dashboard.css'; // <-- VITE HARÁ LA MAGIA CON ESTO
import '../../css/loader.css'; // Importamos el CSS del loader
import { showLoader, hideLoader } from '../utils/loader.js'; 

// Variables de estado encapsuladas en el módulo
let map;
let socket;
let routePolylines = {};
let driverMarkers = {};
let activeRouteId = null;
let lastKnownLocations = {};
let vehiculoSeleccionado = null;
let directionsService, directionsRenderer;
let routes = [], drivers = [], vehicles = [];
let actualPathPolylines = {}; // 👈 NUEVA VARIABLE: Guardará las líneas azules por driverId
let routeStaticMarkers = {}; // 👈 NUEVA: Guardará marcadores de inicio/fin/paradas/infoWindows
let pendingConfirmations = new Set(); //

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const DashboardService = {
    getHeaders() {
        const token = sessionStorage.getItem('numa_token');
        return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
    },
    // En DashboardService (dashboard.js)
    // En DashboardService (dashboard.js)
    async getBaseConfig() {
        const res = await fetch(`${API_URL}/bases`, { headers: this.getHeaders() });
        if (!res.ok) throw new Error("Sin configuración");

        const data = await res.json();

        // 🕵️‍♂️ LÍNEAS DE DEPURACIÓN: Vamos a ver qué trae esto realmente
        console.log("👉 Data completa:", data);
        console.log("👉 Buscando el ID:", data.defaultBaseId);

        if (data.bases && data.bases.length > 0) {
            // Hacemos la búsqueda considerando _id o id (Mongoose a veces hace de las suyas)
            let basePrincipal = data.bases.find(b => {
                const currentId = String(b._id || b.id);
                const targetId = String(data.defaultBaseId);
                return currentId === targetId;
            });

            if (!basePrincipal) {
                // Si falla, que nos diga exactamente qué IDs tenía disponibles para comparar
                console.warn("⚠️ Falló la coincidencia. IDs disponibles en bases:", data.bases.map(b => b._id || b.id));
                basePrincipal = data.bases[0];
            }

            return {
                lat: basePrincipal.ubicacion.coordinates[1],
                lng: basePrincipal.ubicacion.coordinates[0]
            };
        }

        throw new Error("No hay bases activas");
    },
    async getRoutes() {
        const res = await fetch(`${API_URL}/routes`, { headers: this.getHeaders() });
        if (!res.ok) throw new Error('Error API Rutas');
        return res.json();
    },
    async getDrivers() {
        const res = await fetch(`${API_URL}/drivers`, { headers: this.getHeaders() });
        if (!res.ok) throw new Error('Error API Choferes');
        return res.json();
    }
};

const UI = {
    showToast(message, duration = 3000) {
        const existingToast = document.getElementById('toast-notification');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed; bottom: 20px; right: 20px;
            background-color: #2ecc71; color: white;
            padding: 12px 20px; border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 9999; font-weight: 500;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    },

    updateKPIs(routesData) {
        if (Array.isArray(routesData)) {
            document.getElementById('kpi-activos').textContent = routesData.filter(r => r.estado === 'pendiente').length;
            document.getElementById('kpi-rutas').textContent = routesData.filter(r => r.estado === 'en curso').length;
            document.getElementById('kpi-alertas').textContent = routesData.filter(r => r.estado === 'finalizada').length;
            document.getElementById('kpi-distancia').textContent = drivers.length; // Ejemplo de choferes activos
        }
    },

    updateInfoPanel(route) {
        document.getElementById('route-name-display').textContent = route.name || 'Sin asignar';
        document.getElementById('route-id-display').textContent = route.id || '...';

        let driverName = "Sin asignar";
        if (route.driver) {
            const d = drivers.find(dr => dr.id === route.driver || dr.id === route.driver.id);
            if (d) driverName = d.name;
        }
        document.getElementById('chofer-name-display').textContent = driverName;

        const lastLoc = route.driver ? lastKnownLocations[route.driver.id || route.driver] : null;
        if (lastLoc) {
            document.getElementById('coords-display').textContent = `${lastLoc.lat.toFixed(5)}, ${lastLoc.lng.toFixed(5)}`;
        }
    }
};

const MapManager = {
    async init() {
        const drawMapEl = document.getElementById("draw-map");
        if (!drawMapEl) return;

        if (!window.google || !window.google.maps) {
            document.getElementById('status');
            // 👇 Convertimos la espera en una Promesa para que 'await' sí espere
            await new Promise(resolve => setTimeout(resolve, 1000));
            return this.init();
        }

        map = new window.google.maps.Map(drawMapEl, {
            center: { lat: 19.7677724, lng: -104.3686507 },
            zoom: 13,
            styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }],
            mapTypeControl: false, streetViewControl: false, fullscreenControl: true
        });

        directionsService = new window.google.maps.DirectionsService();
        directionsRenderer = new window.google.maps.DirectionsRenderer({ map: map, draggable: true });

        await this.loadBaseOperativa();
    },

    async loadBaseOperativa() {
        try {
            const config = await DashboardService.getBaseConfig();
            if (config && config.lat && config.lng) {
                const basePos = { lat: parseFloat(config.lat), lng: parseFloat(config.lng) };
                map.setCenter(basePos);
                map.setZoom(15);
                new window.google.maps.Marker({
                    position: basePos, map: map, title: "Base Operativa",
                    icon: {
                        url: "/assets/base.svg", // Tu nuevo icono
                        scaledSize: new window.google.maps.Size(42, 42), // Tamaño ideal
                        anchor: new window.google.maps.Point(21, 42) // Apunta exactamente con el pico de abajo
                    },
                    zIndex: 1000 // Para que siempre quede por encima de las rutas
                });
                document.getElementById('status');
            } else {
                throw new Error("Config incompleta");
            }
        } catch (error) {
            console.warn("Base operativa no cargada");
            const modal = document.getElementById('modal-no-base');
            if (modal) modal.style.display = 'flex';
        }
    },

    async drawRoutes(routesData) {
        // Limpiar rutas previas
        for (const id in routePolylines) {
            if (routePolylines[id].grey) routePolylines[id].grey.setMap(null);
            if (routePolylines[id].color) routePolylines[id].color.setMap(null);
        }
        routePolylines = {};

        const inProgress = routesData.filter(r => r.estado === 'en curso' && r.waypoints && r.waypoints.length > 0);
        document.getElementById('status');
        if (inProgress.length === 0) return;

        const bounds = new window.google.maps.LatLngBounds();

        inProgress.forEach(route => {
            const pathCoords = route.waypoints.map(wp => ({ lat: parseFloat(wp.lat), lng: parseFloat(wp.lng) }));
            const routeColor = (route.status === 'cancelled') ? '#e74c3c' : (route.color || '#f357a1');

            const greyLine = new window.google.maps.Polyline({
                path: pathCoords, geodesic: true, strokeColor: '#616142',
                strokeOpacity: 0.6, strokeWeight: 4, map: map, zIndex: 1
            });

            const colorLine = new window.google.maps.Polyline({
                path: [], geodesic: true, strokeColor: routeColor,
                strokeOpacity: 1.0, strokeWeight: 6, map: map, zIndex: 2
            });

            greyLine.addListener('click', () => {
                activeRouteId = route.id;
                UI.updateInfoPanel(route);
            });

            routePolylines[route.id] = { grey: greyLine, color: colorLine, fullPath: pathCoords, maxIndex: -1, routeData: route };
            pathCoords.forEach(p => bounds.extend(p));
        });

        map.fitBounds(bounds);
    }
};

const SocketManager = {
    init() {
        if (!window.io) return console.warn("Socket.io no cargado");

        const SERVER_URL = API_URL.replace('/api', '');
        socket = window.io(SERVER_URL);

        // 🚨 ESCUCHAR SOLICITUD DE FINALIZACIÓN
        // 🚨 ESCUCHAR SOLICITUD DE FINALIZACIÓN
        socket.on('finishRouteRequested', (data) => {
            // 🛑 Si ya estamos procesando esta ruta, ignoramos el evento (Evita spam)
            if (pendingConfirmations.has(data.routeId)) return;
            pendingConfirmations.add(data.routeId);

            console.log('🔔 Solicitud de finalización recibida:', data);

            const nombreRuta = data.routeName || data.routeId;
            const nombreChofer = data.driverName || 'el chofer';

            const aprobada = confirm(`🚨 SOLICITUD DE FINALIZACIÓN 🚨\n\nEl chofer (${nombreChofer}) solicita finalizar la ruta:\n"${nombreRuta}"\n\n¿Deseas APROBAR y finalizar esta ruta ahora?`);

            if (aprobada) {
                const token = sessionStorage.getItem('numa_token');

                fetch(`${API_URL}/routes/${data.routeId}/status`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ status: 'finalizada' })
                })
                    .then(async res => {
                        if (!res.ok) throw new Error(`Error HTTP: ${res.status}`);
                        return res.json();
                    })
                    .then(response => {
                        console.log('✅ Ruta finalizada por el administrador', response);

                        // 🧹 LÓGICA DE LIMPIEZA DEL MAPA 🧹
                        const driverId = data.driverId;
                        const routeId = data.routeId;

                        // 1. Borrar líneas bases de MapManager
                        if (routePolylines[routeId]) {
                            if (routePolylines[routeId].grey) routePolylines[routeId].grey.setMap(null);
                            if (routePolylines[routeId].color) routePolylines[routeId].color.setMap(null);
                            delete routePolylines[routeId];
                        }
                        // 2. Borrar línea de progreso azul
                        if (actualPathPolylines[driverId]) {
                            actualPathPolylines[driverId].setMap(null);
                            delete actualPathPolylines[driverId];
                        }
                        // 3. Borrar el carrito
                        if (driverMarkers[driverId]) {
                            driverMarkers[driverId].setMap(null);
                            delete driverMarkers[driverId];
                        }
                        // 4. Borrar pines e InfoWindow estáticos
                        if (routeStaticMarkers[routeId]) {
                            routeStaticMarkers[routeId].forEach(item => {
                                if (item.setMap) item.setMap(null);
                                if (item.close) item.close(); // Para el InfoWindow
                            });
                            delete routeStaticMarkers[routeId];
                        }

                        alert('Ruta finalizada exitosamente. El mapa se ha limpiado.');
                        pendingConfirmations.delete(data.routeId); // Liberar candado
                    })
                    .catch(err => {
                        console.error('❌ Error finalizando ruta:', err);
                        alert('Hubo un error al intentar finalizar la ruta. Revisa la consola.');
                        pendingConfirmations.delete(data.routeId); // Liberar candado
                    });
            } else {
                // Si el admin cancela, liberamos el candado para futuras peticiones
                pendingConfirmations.delete(data.routeId);
            }
        });


        socket.on('locationUpdate', (data) => {
            if (!data || !data.lat || !data.lng) return;

            // 🛑 EL CADENERO: Si ya borramos la ruta de nuestros registros (routeStaticMarkers), 
            // significa que la ruta ya terminó. ¡Ignoramos esta ubicación fantasma!
            if (data.routeId && !routeStaticMarkers[data.routeId]) {
                console.warn(`Se ignoró ubicación del chofer ${data.driverId} porque su ruta ya finalizó.`);
                return;
            }

            const pos = { lat: parseFloat(data.lat), lng: parseFloat(data.lng) };

            console.log(`📍 Coordenadas recibidas del chofer ${data.driverId}:`, pos);

            // --- LÓGICA PARA DIBUJAR/ACTUALIZAR EL MARCADOR DEL CHOFER ---
            if (map) { // Asegurarnos de que el mapa ya cargó
                if (driverMarkers[data.driverId]) {
                    // 1. El marcador ya existe: Solo animamos/actualizamos su posición (siempre)
                    driverMarkers[data.driverId].setPosition(pos);
                } else {
                    // 2. El marcador no existe: Lo creamos por primera vez
                    driverMarkers[data.driverId] = new window.google.maps.Marker({
                        position: pos,
                        map: map,
                        title: `Vehículo en movimiento`,
                        icon: {
                            // --- NUEVO: Configuración de tu SVG personalizado ---
                            url: '/assets/car.svg', // Ruta a tu archivo en la carpeta public
                            scaledSize: new window.google.maps.Size(36, 36), // Ajusta el tamaño (ancho, alto)
                            anchor: new window.google.maps.Point(18, 18) // El centro de rotación (la mitad del size)
                        },
                        zIndex: 999
                    });
                }

                // 🔵 NUEVO: Dibujo de trazo en tiempo real con FILTRO ANTI-NUDOS
                const lastLoc = lastKnownLocations[data.driverId];
                let distance = 0;

                if (lastLoc) {
                    const lastLatLng = new window.google.maps.LatLng(lastLoc.lat, lastLoc.lng);
                    const newLatLng = new window.google.maps.LatLng(pos.lat, pos.lng);
                    // Calcula la distancia en metros entre el punto anterior y el nuevo
                    distance = window.google.maps.geometry.spherical.computeDistanceBetween(lastLatLng, newLatLng);
                }

                // Solo agregamos el punto a la línea si es la primera vez (!lastLoc) 
                // o si se movió MÁS de 15 metros.
                if (!lastLoc || distance > 15) {
                    // Buscamos si existe una línea azul para este chofer
                    if (actualPathPolylines[data.driverId]) {
                        // Obtenemos el arreglo de coordenadas de la línea
                        const currentPath = actualPathPolylines[data.driverId].getPath();
                        // Le inyectamos la nueva coordenada (Google Maps actualizará la UI al instante)
                        currentPath.push(new window.google.maps.LatLng(pos.lat, pos.lng));
                    }

                    // Actualizamos la última ubicación conocida SOLO si pasó el filtro
                    // Si rebotó 5 metros, lo ignoramos y seguimos comparando desde el último punto "bueno".
                    lastKnownLocations[data.driverId] = { lat: pos.lat, lng: pos.lng, timestamp: Date.now() };
                }
            }

            // Opcional: Actualizar el panel lateral si este es el chofer que estamos viendo
            // Agregué validación de typeof para evitar errores si activeRouteId no está definido globalmente
            if (typeof activeRouteId !== 'undefined' && activeRouteId && routePolylines[activeRouteId] && routePolylines[activeRouteId].routeData.driver === data.driverId) {
                const coordsDisplay = document.getElementById('coords-display');
                if (coordsDisplay) {
                    coordsDisplay.textContent = `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;
                }
            }
        });

        socket.on('routeStatusChanged', App.updateAll);
        socket.on('driversUpdated', App.updateAll);
        socket.on('vehiclesUpdated', App.updateAll);
    } // Asumo que esta llave cierra tu función SocketManager.init() o similar
}; // Asumo que esta llave cierra el objeto
const App = {
    async updateAll() {
        try {
            drivers = await DashboardService.getDrivers();
            routes = await DashboardService.getRoutes();
            UI.updateKPIs(routes);
            await MapManager.drawRoutes(routes);

            // --- NUEVO: Suscribir el Dashboard a las salas de las rutas activas ---
            if (socket) {
                const activeRoutes = routes.filter(r => r.status === 'active' || r.estado === 'en curso');
                activeRoutes.forEach(route => {
                    const routeId = route.id || route._id; // Asegurar tomar el ID correcto
                    if (routeId) {
                        socket.emit('joinRoute', { routeId: String(routeId) });
                        console.log(`📡 Dashboard suscrito a la sala de la ruta: ${routeId}`);
                    }
                });
            }

        } catch (err) {
            console.error("Error al actualizar datos:", err);
        }
    }
};

// 🛠️ Función de inicialización exportada para el Router
// 🛠️ Función de inicialización exportada para el Router
export async function init() {
    console.log("🗺️ Módulo Dashboard Iniciado");

    // 1. Verificar login primero (antes del loader)
    if (typeof window.Auth !== 'undefined' && !window.Auth.isLoggedIn()) {
        window.location.href = '/login.html';
        return;
    }

    // 2. 🟢 Encendemos la pantalla de carga
    showLoader();

    try {
        // Configurar modales y botones de UI
        const btnCloseModal = document.getElementById('btn-close-modal');
        if (btnCloseModal) btnCloseModal.onclick = () => document.getElementById('modal-no-base').style.display = 'none';

        const btnConfigureBase = document.getElementById('btn-go-config');
        if (btnConfigureBase) {
            btnConfigureBase.onclick = () => {
                document.getElementById('modal-no-base').style.display = 'none'; // Oculta el modal antes de irse
                window.location.href = '/settings'; // Te manda a la vista de settings
            };
        }

        // Iniciar Mapa y Sockets
        await MapManager.init();
        SocketManager.init();
        
        // Carga inicial de datos y dibujado
        await App.updateAll();
        await drawActiveRoutesOnMap(map);

    } catch (error) {
        console.error("🔥 Error iniciando el Dashboard:", error);
        UI.showToast("Hubo un error al cargar el panel.", 5000);
    } finally {
        // 3. 🔴 Apagamos la pantalla de carga SIEMPRE (haya error o no)
        hideLoader();
    }
}
export async function drawActiveRoutesOnMap(mapInstance) {
    if (!window.google || !window.google.maps || !mapInstance) return;
    try {
        const routes = await DashboardService.getRoutes();
        const activeRoutes = routes.filter(r => r.status === 'active');

        activeRoutes.forEach(route => {
            if (!route.trayecto || !route.trayecto.encodedPolyline) return;

            const routeId = route.id || route._id; // Asegurar el ID
            const markersForThisRoute = []; // 👈 Aquí guardaremos los pines de ESTA ruta

            // A) Dibujar la ruta (en gris por defecto)
            const decodedPath = window.google.maps.geometry.encoding.decodePath(route.trayecto.encodedPolyline);

            const polyline = new window.google.maps.Polyline({
                path: decodedPath,
                geodesic: true,
                strokeColor: '#808080',
                strokeOpacity: 0.7,
                strokeWeight: 4,
                map: mapInstance,
                zIndex: 1
            });
            // 👇 NUEVO: Guardamos la polyline gris para poder borrarla después
            markersForThisRoute.push(polyline);

            // 🔵 B) Dibujar el recorrido real (CAPA DINÁMICA AZUL)
            const puntosReales = (route.recorridoReal || []).map(p => ({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) }));

            const actualPolyline = new window.google.maps.Polyline({
                path: puntosReales,
                geodesic: true,
                strokeColor: '#007BFF',
                strokeOpacity: 1.0,
                strokeWeight: 5,
                map: mapInstance,
                zIndex: 2
            });

            const driverId = typeof route.driver === 'object' ? (route.driver._id || route.driver.id) : route.driver;
            if (driverId) {
                actualPathPolylines[driverId] = actualPolyline;
            }

            // --- B) Marcadores de Inicio y Fin ---
            const originLatLng = { lat: route.trayecto.origin.lat, lng: route.trayecto.origin.lng };
            const destLatLng = { lat: route.trayecto.destination.lat, lng: route.trayecto.destination.lng };

            // Marcador de Inicio (Punto A)
            const startMarker = new window.google.maps.Marker({ // 👈 Asignamos a variable
                position: originLatLng,
                map: mapInstance,
                icon: {
                    path: window.google.maps.SymbolPath.CIRCLE,
                    scale: 6,
                    fillColor: '#4CAF50',
                    fillOpacity: 1,
                    strokeWeight: 2,
                    strokeColor: '#FFFFFF'
                },
                title: 'Inicio'
            });
            markersForThisRoute.push(startMarker); // 👈 Y lo guardamos

            // Marcador de Fin (Punto B)
            const endMarker = new window.google.maps.Marker({ // 👈 Asignamos a variable
                position: destLatLng,
                map: mapInstance,
                icon: {
                    path: window.google.maps.SymbolPath.CIRCLE,
                    scale: 6,
                    fillColor: '#F44336',
                    fillOpacity: 1,
                    strokeWeight: 2,
                    strokeColor: '#FFFFFF'
                },
                title: 'Destino'
            });
            markersForThisRoute.push(endMarker); // 👈 Y lo guardamos

            // --- C) Marcadores para Paradas (Waypoints) ---
            if (route.trayecto.waypoints && route.trayecto.waypoints.length > 0) {
                route.trayecto.waypoints.forEach((wp, index) => {
                    const wpMarker = new window.google.maps.Marker({ // 👈 Asignamos a variable
                        position: { lat: wp.lat, lng: wp.lng },
                        map: mapInstance,
                        icon: {
                            path: window.google.maps.SymbolPath.CIRCLE,
                            scale: 4,
                            fillColor: '#FFC107',
                            fillOpacity: 1,
                            strokeWeight: 1,
                            strokeColor: '#000000'
                        },
                        title: `Parada ${index + 1}`
                    });
                    markersForThisRoute.push(wpMarker); // 👈 Y lo guardamos
                });
            }

            // --- D) Etiqueta (InfoWindow) Discreta ---
            const driverName = (route.driver && route.driver.nombre) ? route.driver.nombre : 'Sin chofer';
            const routeColor = route.color || '#0056b3';

            const infoWindow = new window.google.maps.InfoWindow({
                content: `
                    <div class="route-tag" role="group" aria-label="Ruta ${route.name}, conductor ${driverName}" style="--dot-color: ${routeColor};">
                        <span class="route-dot" aria-hidden="true"></span>
                        <span class="route-text">
                            <span class="route-name">${route.name}</span>
                            <span class="route-driver">(${driverName})</span>
                        </span>
                    </div>
                `,
                position: originLatLng,
                disableAutoPan: true,
                pixelOffset: new window.google.maps.Size(0, -10)
            });

            infoWindow.open(mapInstance);
            markersForThisRoute.push(infoWindow); // 👈 Y lo guardamos

            // 👈 AL FINAL DEL FOREACH: Guardamos el arreglo completo usando el ID de la ruta
            routeStaticMarkers[routeId] = markersForThisRoute;
        });

    } catch (error) {
        console.error("No se pudieron pintar las rutas activas:", error);
    }
}

// Opcional: Función para limpiar sockets si cambias de página
export function cleanup() {
    if (socket) {
        socket = null;
        socket.disconnect();
        console.log("Socket desconectado al salir del Dashboard");
    }
}