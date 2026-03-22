// src/js/pages/dashboard.js

import '../../css/dashboard.css';
import '../../css/loader.css';
import { showLoader, hideLoader } from '../utils/loader.js';
import {
    fetchBaseCoords,
    fetchRoutes,
    fetchDrivers,
    fetchVehicles,
    finalizeRoute
} from '../api/dashboard.api.js';
import { checkLicense } from '../utils/license.js';

// ── Importamos el módulo de UI separado ──────────────────────────────────────
// ── Importamos el módulo de UI separado ──────────────────────────────────────
import {
    initDashboardUI,
    syncDashboardUIState,
    showToast,
    updateInfoPanel,
    updateCoordsDisplay,
    KPIManager
} from '../modules/ui/dashboard.ui.js';

// ─── Estado del módulo ────────────────────────────────────────────────────────
let map = null;
let socket = null;
let routes = [];
let drivers = [];
let vehicles = [];
let routePolylines = {};
let actualPathPolylines = {};
let driverMarkers = {};
let routeStaticMarkers = {};
let lastKnownLocations = {};
let activeRouteId = null;
let pendingConfirmations = new Set();

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// ─── Resaltar ruta seleccionada en el mapa ────────────────────────────────────
function _highlightRoute(selectedId) {
    Object.entries(routePolylines).forEach(([id, polys]) => {
        const sel = id === selectedId;
        polys.grey?.setOptions({
            strokeOpacity: sel ? 0.95 : 0.35,
            strokeWeight: sel ? 7 : 4,
            zIndex: sel ? 10 : 1
        });
    });
}

// ─── Modal de confirmación de finalización ────────────────────────────────────
const FinishModal = {
    _pendingData: null,

    show(data) {
        this._pendingData = data;

        const container = document.getElementById('notification-container');
        const text = document.getElementById('notification-text');
        if (!container || !text) return;

        const nombreRuta = data.routeName || data.routeId;
        const nombreChofer = data.driverName || 'El chofer';

        text.innerHTML = `<strong>${nombreChofer}</strong> solicita finalizar la ruta <strong>"${nombreRuta}"</strong>. ¿Deseas aprobarla?`;
        container.style.display = 'flex';

        window.addNotification?.(
            'Solicitud de finalización',
            `${nombreChofer} quiere finalizar "${nombreRuta}"`,
            'fa-solid fa-flag-checkered', '#f59e0b'
        );
    },

    hide() {
        const c = document.getElementById('notification-container');
        if (c) c.style.display = 'none';
        this._pendingData = null;
    },

    async accept() {
        const data = this._pendingData;
        if (!data) return;
        this.hide();
        try {
            await finalizeRoute(data.routeId);
            MapManager.clearRoute(data.routeId, data.driverId);
            showToast('✅ Ruta finalizada exitosamente.');
            window.addNotification?.('Ruta finalizada',
                `"${data.routeName || data.routeId}" fue finalizada.`,
                'fa-solid fa-circle-check', '#10b981');
        } catch (err) {
            console.error('Error finalizando ruta:', err);
            showToast('Error al finalizar la ruta.', 5000);
        } finally {
            pendingConfirmations.delete(data.routeId);
        }
    },

    decline() {
        const data = this._pendingData;
        this.hide();
        if (!data) return;
        pendingConfirmations.delete(data.routeId);
        showToast('Solicitud de finalización rechazada.');
        window.addNotification?.('Finalización rechazada',
            `Solicitud de "${data.routeName || data.routeId}" fue rechazada.`,
            'fa-solid fa-circle-xmark', '#ef4444');
    },

    bindButtons() {
        document.getElementById('btn-accept-finish')?.addEventListener('click', () => this.accept());
        document.getElementById('btn-decline-finish')?.addEventListener('click', () => this.decline());
    }
};

// ─── Mapa ─────────────────────────────────────────────────────────────────────
const MapManager = {
    async init() {
        const mapEl = document.getElementById('draw-map');
        if (!mapEl) return;

        if (!window.google?.maps) {
            await new Promise(r => setTimeout(r, 1000));
            return this.init();
        }

        map = new window.google.maps.Map(mapEl, {
            center: { lat: 19.7677724, lng: -104.3686507 },
            zoom: 13,
            styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true
        });

        await this.loadBaseMarker();
    },

    async loadBaseMarker() {
        try {
            const coords = await fetchBaseCoords();
            const pos = { lat: parseFloat(coords.lat), lng: parseFloat(coords.lng) };
            map.setCenter(pos);
            map.setZoom(15);
            new window.google.maps.Marker({
                position: pos, map, title: 'Base Operativa',
                icon: {
                    url: '/assets/base.svg',
                    scaledSize: new window.google.maps.Size(42, 42),
                    anchor: new window.google.maps.Point(21, 42)
                },
                zIndex: 1000
            });
        } catch (err) {
            console.warn('Base operativa no cargada:', err.message);
            const modal = document.getElementById('modal-no-base');
            if (modal) modal.style.display = 'flex';
        }
    },

    
    async drawRoutes(routesData) {
        // Limpiar rutas previas
        Object.values(routePolylines).forEach(({ grey, color }) => {
            grey?.setMap(null);
            color?.setMap(null);
        });
        routePolylines = {};
 
        // Usamos encodedPolyline si está disponible, fallback a waypoints
        const activas = routesData.filter(r =>
            ['en curso', 'active'].includes(r.estado || r.status)
        );
        if (!activas.length) return;
 
        const bounds = new window.google.maps.LatLngBounds();
 
        activas.forEach(route => {
            const routeId    = String(route._id || route.id);
            const routeColor = route.color || '#f357a1';
 
            let pathCoords = [];
 
            if (route.trayecto?.encodedPolyline) {
                pathCoords = window.google.maps.geometry.encoding
                    .decodePath(route.trayecto.encodedPolyline)
                    .map(p => ({ lat: p.lat(), lng: p.lng() }));
            } else if (route.waypoints?.length) {
                pathCoords = route.waypoints.map(wp => ({
                    lat: parseFloat(wp.lat),
                    lng: parseFloat(wp.lng)
                }));
            }
 
            if (!pathCoords.length) return;
 
            const greyLine = new window.google.maps.Polyline({
                path:          pathCoords,
                geodesic:      true,
                strokeColor:   routeColor,
                strokeOpacity: 0.6,
                strokeWeight:  4,
                map,
                zIndex:        1,
                clickable:     true
            });
 
            // Click en polilínea → actualiza info panel (desde dashboard.ui.js)
            greyLine.addListener('click', () => {
                activeRouteId = routeId;
                updateInfoPanel(route);
            });
 
            const colorLine = new window.google.maps.Polyline({
                path: [], geodesic: true,
                strokeColor: routeColor, strokeOpacity: 1.0, strokeWeight: 6,
                map, zIndex: 2
            });
 
            // ── Marcadores de origen, destino y paradas ───────────────────────
            // Se guardan en routeStaticMarkers para poder limpiarlos al finalizar la ruta
            const staticMarks = [];
 
            const ico = (color) => ({
                path:         window.google.maps.SymbolPath.CIRCLE,
                scale:        7,
                fillColor:    color,
                fillOpacity:  1,
                strokeWeight: 2,
                strokeColor:  '#FFFFFF'
            });
 
            if (route.trayecto?.origin) {
                staticMarks.push(new window.google.maps.Marker({
                    position: { lat: route.trayecto.origin.lat, lng: route.trayecto.origin.lng },
                    map, icon: ico('#4CAF50'), title: 'Inicio', zIndex: 5
                }));
            }
            if (route.trayecto?.destination) {
                staticMarks.push(new window.google.maps.Marker({
                    position: { lat: route.trayecto.destination.lat, lng: route.trayecto.destination.lng },
                    map, icon: ico('#F44336'), title: 'Destino', zIndex: 5
                }));
            }
            (route.trayecto?.waypoints || []).forEach((wp, i) => {
                staticMarks.push(new window.google.maps.Marker({
                    position: { lat: wp.lat, lng: wp.lng },
                    map,
                    icon: {
                        path:         window.google.maps.SymbolPath.CIRCLE,
                        scale:        5,
                        fillColor:    '#FFC107',
                        fillOpacity:  1,
                        strokeWeight: 1,
                        strokeColor:  '#000000'
                    },
                    title: `Parada ${i + 1}`, zIndex: 4
                }));
            });
 
            // InfoWindow con nombre y chofer
            if (route.trayecto?.origin) {
                const iw = new window.google.maps.InfoWindow({
                    content: `
                        <div class="route-tag" style="--dot-color:${routeColor};">
                            <span class="route-dot"></span>
                            <span class="route-text">
                                <span class="route-name">${route.name || 'Ruta'}</span>
                                <span class="route-driver">(${route.driver?.nombre || 'Sin chofer'})</span>
                            </span>
                        </div>`,
                    position:       { lat: route.trayecto.origin.lat, lng: route.trayecto.origin.lng },
                    disableAutoPan: true,
                    pixelOffset:    new window.google.maps.Size(0, -10)
                });
                iw.open(map);
                staticMarks.push(iw);
            }
 
            // Guardar referencias para limpieza al finalizar
            routeStaticMarkers[routeId] = staticMarks;
 
            routePolylines[routeId] = {
                grey: greyLine, color: colorLine,
                fullPath: pathCoords, routeData: route
            };
            pathCoords.forEach(p => bounds.extend(p));
        });
 
        if (!bounds.isEmpty()) map.fitBounds(bounds);
    },
 
    clearRoute(routeId, driverId) {
        if (routePolylines[routeId]) {
            routePolylines[routeId].grey?.setMap(null);
            routePolylines[routeId].color?.setMap(null);
            delete routePolylines[routeId];
        }
        if (actualPathPolylines[driverId]) {
            actualPathPolylines[driverId].setMap(null);
            delete actualPathPolylines[driverId];
        }
        if (driverMarkers[driverId]) {
            driverMarkers[driverId].setMap(null);
            delete driverMarkers[driverId];
        }
        if (routeStaticMarkers[routeId]) {
            routeStaticMarkers[routeId].forEach(i => { i.setMap?.(null); i.close?.(); });
            delete routeStaticMarkers[routeId];
        }
    }
};
 
// ─── Socket ───────────────────────────────────────────────────────────────────
const SocketManager = {
    init() {
        if (!window.io) { console.warn('Socket.io no cargado'); return; }

        socket = window.io(API_BASE_URL.replace('/api', ''));

        socket.on('finishRouteRequested', (data) => {
            if (pendingConfirmations.has(data.routeId)) return;
            pendingConfirmations.add(data.routeId);
            FinishModal.show(data);
        });

        socket.on('locationUpdate', (data) => {
            if (!data?.lat || !data?.lng || !map) return;

            const pos = { lat: parseFloat(data.lat), lng: parseFloat(data.lng) };

            // Actualizar o crear marcador del vehículo
            if (driverMarkers[data.driverId]) {
                driverMarkers[data.driverId].setPosition(pos);
            } else {
                driverMarkers[data.driverId] = new window.google.maps.Marker({
                    position: pos, map, title: 'Vehículo en movimiento',
                    icon: {
                        url: '/assets/car.svg',
                        scaledSize: new window.google.maps.Size(36, 36),
                        anchor: new window.google.maps.Point(18, 18)
                    },
                    zIndex: 999
                });
            }

            // Trazo de recorrido real (filtro anti-ruido 15m)
            const last = lastKnownLocations[String(data.driverId)];
            let dist = 0;
            if (last) {
                dist = window.google.maps.geometry.spherical.computeDistanceBetween(
                    new window.google.maps.LatLng(last.lat, last.lng),
                    new window.google.maps.LatLng(pos.lat, pos.lng)
                );
            }
            if (!last || dist > 15) {
                actualPathPolylines[data.driverId]
                    ?.getPath()
                    .push(new window.google.maps.LatLng(pos.lat, pos.lng));
                lastKnownLocations[String(data.driverId)] = {
                    lat: pos.lat, lng: pos.lng, timestamp: Date.now()
                };
                // Mantener dashboard.ui.js sincronizado con las ubicaciones
                syncDashboardUIState({ routes, drivers, lastKnownLocations });
            }

            // Si el chofer pertenece a la ruta activa → actualizar coords en panel
            if (activeRouteId) {
                const ar = routes.find(r => String(r._id || r.id) === activeRouteId);
                const aid = ar ? String(ar.driver?._id || ar.driver?.id || ar.driver) : null;
                if (aid && aid === String(data.driverId)) {
                    updateCoordsDisplay(pos.lat, pos.lng);
                }
            }
        });

        socket.on('routeStatusChanged', () => App.updateAll());
        socket.on('driversUpdated', () => App.updateAll());
        socket.on('vehiclesUpdated', () => App.updateAll());
    }
};

// ─── App ──────────────────────────────────────────────────────────────────────
const App = {
    async updateAll() {
        try {
            [drivers, routes, vehicles] = await Promise.all([fetchDrivers(), fetchRoutes(), fetchVehicles()]);

            // Sincronizar estado en dashboard.ui.js
            syncDashboardUIState({ routes, drivers, vehicles, lastKnownLocations });

            // KPIs con dropdowns (dashboard.ui.js)
            KPIManager.update(routes, drivers);

            await MapManager.drawRoutes(routes);

            if (socket) {
                routes
                    .filter(r => ['active', 'en curso'].includes(r.status || r.estado))
                    .forEach(r => socket.emit('joinRoute', { routeId: String(r._id || r.id) }));
            }
        } catch (err) {
            console.error('Error al actualizar datos:', err);
        }
    }
};

// ─── Inicialización ───────────────────────────────────────────────────────────
export async function init() {
    console.log('🗺️ Módulo Dashboard iniciado');
    if (!checkLicense()) return;

    if (typeof window.Auth !== 'undefined' && !window.Auth.isLoggedIn()) {
        window.location.href = '/login.html';
        return;
    }

    showLoader();

    try {
        // Inicializar dashboard.ui.js con estado inicial y callback de highlight
        initDashboardUI({
            routes,
            drivers,
            vehicles,
            lastKnownLocations,
            onRouteSelected: (routeId) => {
                activeRouteId = routeId;
                _highlightRoute(routeId);
            }
        });

        document.getElementById('btn-close-modal')?.addEventListener('click', () => {
            document.getElementById('modal-no-base').style.display = 'none';
        });
        document.getElementById('btn-go-config')?.addEventListener('click', () => {
            document.getElementById('modal-no-base').style.display = 'none';
            window.location.href = '/settings';
        });

        FinishModal.bindButtons();

        await MapManager.init();
        SocketManager.init();
        await App.updateAll();
        await drawActiveRoutesOnMap(map);

    } catch (error) {
        console.error('🔥 Error iniciando Dashboard:', error);
        showToast('Hubo un error al cargar el panel.', 5000);
    } finally {
        hideLoader();
    }
}

// ─── Dibujar rutas activas con trayecto guardado ──────────────────────────────
export async function drawActiveRoutesOnMap(mapInstance) {
    if (!window.google?.maps || !mapInstance) return;

    try {
        const activeRoutes = (await fetchRoutes()).filter(r => r.status === 'active');

        activeRoutes.forEach(route => {
            if (!route.trayecto?.encodedPolyline) return;

            const routeId = String(route._id || route.id);
            const marks = [];

            // Polilínea planeada (gris, clicable)
            const decoded = window.google.maps.geometry.encoding.decodePath(
                route.trayecto.encodedPolyline
            );
            const plannedLine = new window.google.maps.Polyline({
                path: decoded, geodesic: true,
                strokeColor: '#808080', strokeOpacity: 0.7, strokeWeight: 4,
                map: mapInstance, zIndex: 1, clickable: true
            });
            plannedLine.addListener('click', () => {
                activeRouteId = routeId;
                updateInfoPanel(route);
            });
            marks.push(plannedLine);

            // Polilínea de recorrido real (azul)
            const realLine = new window.google.maps.Polyline({
                path: (route.recorridoReal || []).map(p => ({
                    lat: parseFloat(p.lat), lng: parseFloat(p.lng)
                })),
                geodesic: true, strokeColor: '#007BFF', strokeOpacity: 1.0, strokeWeight: 5,
                map: mapInstance, zIndex: 2
            });
            const did = typeof route.driver === 'object'
                ? (route.driver._id || route.driver.id)
                : route.driver;
            if (did) actualPathPolylines[String(did)] = realLine;

            // Marcadores inicio / destino
            const ico = (c) => ({
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 6, fillColor: c, fillOpacity: 1, strokeWeight: 2, strokeColor: '#FFF'
            });
            marks.push(
                new window.google.maps.Marker({ position: { lat: route.trayecto.origin.lat, lng: route.trayecto.origin.lng }, map: mapInstance, icon: ico('#4CAF50'), title: 'Inicio' }),
                new window.google.maps.Marker({ position: { lat: route.trayecto.destination.lat, lng: route.trayecto.destination.lng }, map: mapInstance, icon: ico('#F44336'), title: 'Destino' })
            );

            // Waypoints
            (route.trayecto.waypoints || []).forEach((wp, i) => {
                marks.push(new window.google.maps.Marker({
                    position: { lat: wp.lat, lng: wp.lng }, map: mapInstance,
                    icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 4, fillColor: '#FFC107', fillOpacity: 1, strokeWeight: 1, strokeColor: '#000' },
                    title: `Parada ${i + 1}`
                }));
            });

            // InfoWindow con nombre y chofer
            const iw = new window.google.maps.InfoWindow({
                content: `
                    <div class="route-tag" style="--dot-color:${route.color || '#0056b3'};">
                        <span class="route-dot"></span>
                        <span class="route-text">
                            <span class="route-name">${route.name}</span>
                            <span class="route-driver">(${route.driver?.nombre || 'Sin chofer'})</span>
                        </span>
                    </div>`,
                position: { lat: route.trayecto.origin.lat, lng: route.trayecto.origin.lng },
                disableAutoPan: true,
                pixelOffset: new window.google.maps.Size(0, -10)
            });
            iw.open(mapInstance);
            marks.push(iw);

            routeStaticMarkers[routeId] = marks;
        });

    } catch (error) {
        console.error('No se pudieron dibujar las rutas activas:', error);
    }
}

// ─── Cleanup al salir ─────────────────────────────────────────────────────────
export function cleanup() {
    if (socket) {
        socket.disconnect();
        socket = null;
        console.log('Socket desconectado al salir del Dashboard');
    }
}