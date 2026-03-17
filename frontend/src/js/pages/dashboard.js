// src/js/pages/dashboard.js

import '../../css/dashboard.css';
import '../../css/loader.css';
import { showLoader, hideLoader } from '../utils/loader.js';
import {
    fetchBaseCoords,
    fetchRoutes,
    fetchDrivers,
    finalizeRoute
} from '../api/dashboard.api.js';

// ─── Estado del módulo ────────────────────────────────────────────────────────
let map               = null;
let socket            = null;
let directionsService = null;
let directionsRenderer= null;
let routes            = [];
let drivers           = [];
let routePolylines    = {};      // Líneas de ruta base (gris + color)
let actualPathPolylines = {};    // Líneas de recorrido real (azul) por driverId
let driverMarkers     = {};      // Marcadores de vehículos en movimiento
let routeStaticMarkers= {};      // Pines e InfoWindows estáticos por routeId
let lastKnownLocations= {};      // Última ubicación conocida por driverId
let activeRouteId     = null;
let pendingConfirmations = new Set();

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// ─── UI ───────────────────────────────────────────────────────────────────────
const UI = {
    showToast(message, duration = 3000) {
        document.getElementById('toast-notification')?.remove();

        const toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.textContent = message;
        toast.style.cssText = `
            position:fixed; bottom:20px; right:20px;
            background:#2ecc71; color:#fff;
            padding:12px 20px; border-radius:6px;
            box-shadow:0 4px 12px rgba(0,0,0,.15);
            z-index:9999; font-weight:500;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    },

    // FIX: Verificamos que cada elemento exista antes de asignar textContent
    updateKPIs(routesData) {
        if (!Array.isArray(routesData)) return;

        const set = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        set('kpi-activos',   routesData.filter(r => r.estado === 'pendiente').length);
        set('kpi-rutas',     routesData.filter(r => r.estado === 'en curso').length);
        set('kpi-alertas',   routesData.filter(r => r.estado === 'finalizada').length);
        set('kpi-distancia', drivers.length);
    },

    updateInfoPanel(route) {
        const set = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        set('route-name-display', route.name || 'Sin asignar');
        set('route-id-display',   route.id   || '...');

        let driverName = 'Sin asignar';
        if (route.driver) {
            const d = drivers.find(dr =>
                dr.id === route.driver || dr.id === route.driver?.id
            );
            if (d) driverName = d.name;
        }
        set('chofer-name-display', driverName);

        const lastLoc = route.driver
            ? lastKnownLocations[route.driver?.id || route.driver]
            : null;
        if (lastLoc) {
            set('coords-display', `${lastLoc.lat.toFixed(5)}, ${lastLoc.lng.toFixed(5)}`);
        }
    }
};

// ─── Mapa ─────────────────────────────────────────────────────────────────────
const MapManager = {
    async init() {
        const mapEl = document.getElementById('draw-map');
        if (!mapEl) return;

        // Esperamos a que Google Maps cargue
        if (!window.google?.maps) {
            await new Promise(r => setTimeout(r, 1000));
            return this.init();
        }

        map = new window.google.maps.Map(mapEl, {
            center: { lat: 19.7677724, lng: -104.3686507 },
            zoom: 13,
            styles: [{
                featureType: 'poi',
                elementType: 'labels',
                stylers: [{ visibility: 'off' }]
            }],
            mapTypeControl:    false,
            streetViewControl: false,
            fullscreenControl: true
        });

        directionsService  = new window.google.maps.DirectionsService();
        directionsRenderer = new window.google.maps.DirectionsRenderer({
            map,
            draggable: true
        });

        await this.loadBaseMarker();
    },

    async loadBaseMarker() {
        try {
            const coords = await fetchBaseCoords();
            const pos    = { lat: parseFloat(coords.lat), lng: parseFloat(coords.lng) };

            map.setCenter(pos);
            map.setZoom(15);

            new window.google.maps.Marker({
                position: pos,
                map,
                title: 'Base Operativa',
                icon: {
                    url:        '/assets/base.svg',
                    scaledSize: new window.google.maps.Size(42, 42),
                    anchor:     new window.google.maps.Point(21, 42)
                },
                zIndex: 1000
            });
        } catch (error) {
            console.warn('Base operativa no cargada:', error.message);
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

        const inProgress = routesData.filter(r =>
            r.estado === 'en curso' && r.waypoints?.length > 0
        );
        if (!inProgress.length) return;

        const bounds = new window.google.maps.LatLngBounds();

        inProgress.forEach(route => {
            const pathCoords = route.waypoints.map(wp => ({
                lat: parseFloat(wp.lat),
                lng: parseFloat(wp.lng)
            }));
            const routeColor = route.status === 'cancelled'
                ? '#e74c3c'
                : (route.color || '#f357a1');

            const greyLine = new window.google.maps.Polyline({
                path: pathCoords, geodesic: true,
                strokeColor: '#616142', strokeOpacity: 0.6, strokeWeight: 4,
                map, zIndex: 1
            });
            const colorLine = new window.google.maps.Polyline({
                path: [], geodesic: true,
                strokeColor: routeColor, strokeOpacity: 1.0, strokeWeight: 6,
                map, zIndex: 2
            });

            greyLine.addListener('click', () => {
                activeRouteId = route.id;
                UI.updateInfoPanel(route);
            });

            routePolylines[route.id] = {
                grey, color: colorLine, fullPath: pathCoords, routeData: route
            };
            pathCoords.forEach(p => bounds.extend(p));
        });

        map.fitBounds(bounds);
    },

    clearRoute(routeId, driverId) {
        // Líneas base
        if (routePolylines[routeId]) {
            routePolylines[routeId].grey?.setMap(null);
            routePolylines[routeId].color?.setMap(null);
            delete routePolylines[routeId];
        }
        // Línea azul de progreso
        if (actualPathPolylines[driverId]) {
            actualPathPolylines[driverId].setMap(null);
            delete actualPathPolylines[driverId];
        }
        // Marcador del vehículo
        if (driverMarkers[driverId]) {
            driverMarkers[driverId].setMap(null);
            delete driverMarkers[driverId];
        }
        // Pines e InfoWindows estáticos
        if (routeStaticMarkers[routeId]) {
            routeStaticMarkers[routeId].forEach(item => {
                item.setMap?.(null);
                item.close?.();
            });
            delete routeStaticMarkers[routeId];
        }
    }
};

// ─── Socket ───────────────────────────────────────────────────────────────────
const SocketManager = {
    init() {
        if (!window.io) {
            console.warn('Socket.io no cargado');
            return;
        }

        const SERVER_URL = API_BASE_URL.replace('/api', '');
        socket = window.io(SERVER_URL);

        socket.on('finishRouteRequested', (data) => {
            if (pendingConfirmations.has(data.routeId)) return;
            pendingConfirmations.add(data.routeId);

            const nombreRuta   = data.routeName  || data.routeId;
            const nombreChofer = data.driverName || 'el chofer';

            const aprobada = confirm(
                `🚨 SOLICITUD DE FINALIZACIÓN 🚨\n\n` +
                `El chofer (${nombreChofer}) solicita finalizar:\n"${nombreRuta}"\n\n` +
                `¿Deseas APROBAR y finalizar esta ruta?`
            );

            if (aprobada) {
                finalizeRoute(data.routeId)
                    .then(() => {
                        MapManager.clearRoute(data.routeId, data.driverId);
                        alert('Ruta finalizada exitosamente.');
                    })
                    .catch(err => {
                        console.error('❌ Error finalizando ruta:', err);
                        alert('Error al finalizar la ruta. Revisa la consola.');
                    })
                    .finally(() => pendingConfirmations.delete(data.routeId));
            } else {
                pendingConfirmations.delete(data.routeId);
            }
        });

        socket.on('locationUpdate', (data) => {
            if (!data?.lat || !data?.lng) return;

            // Ignorar ubicaciones de rutas ya finalizadas
            if (data.routeId && !routeStaticMarkers[data.routeId]) {
                console.warn(`Ubicación ignorada — ruta ${data.routeId} ya finalizó.`);
                return;
            }

            const pos = { lat: parseFloat(data.lat), lng: parseFloat(data.lng) };

            if (!map) return;

            // Actualizar o crear marcador del vehículo
            if (driverMarkers[data.driverId]) {
                driverMarkers[data.driverId].setPosition(pos);
            } else {
                driverMarkers[data.driverId] = new window.google.maps.Marker({
                    position: pos,
                    map,
                    title: 'Vehículo en movimiento',
                    icon: {
                        url:        '/assets/car.svg',
                        scaledSize: new window.google.maps.Size(36, 36),
                        anchor:     new window.google.maps.Point(18, 18)
                    },
                    zIndex: 999
                });
            }

            // Trazo azul en tiempo real con filtro anti-nudos (>15m)
            const lastLoc  = lastKnownLocations[data.driverId];
            let   distance = 0;

            if (lastLoc) {
                distance = window.google.maps.geometry.spherical.computeDistanceBetween(
                    new window.google.maps.LatLng(lastLoc.lat, lastLoc.lng),
                    new window.google.maps.LatLng(pos.lat, pos.lng)
                );
            }

            if (!lastLoc || distance > 15) {
                actualPathPolylines[data.driverId]
                    ?.getPath()
                    .push(new window.google.maps.LatLng(pos.lat, pos.lng));

                lastKnownLocations[data.driverId] = {
                    lat: pos.lat, lng: pos.lng, timestamp: Date.now()
                };
            }

            // Actualizar coordenadas en panel lateral
            if (activeRouteId && routePolylines[activeRouteId]?.routeData.driver === data.driverId) {
                const el = document.getElementById('coords-display');
                if (el) el.textContent = `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;
            }
        });

        socket.on('routeStatusChanged', () => App.updateAll());
        socket.on('driversUpdated',     () => App.updateAll());
        socket.on('vehiclesUpdated',    () => App.updateAll());
    }
};

// ─── App ──────────────────────────────────────────────────────────────────────
const App = {
    async updateAll() {
        try {
            [drivers, routes] = await Promise.all([fetchDrivers(), fetchRoutes()]);

            UI.updateKPIs(routes);
            await MapManager.drawRoutes(routes);

            // Suscribir a salas de rutas activas
            if (socket) {
                routes
                    .filter(r => r.status === 'active' || r.estado === 'en curso')
                    .forEach(route => {
                        const routeId = String(route.id || route._id);
                        socket.emit('joinRoute', { routeId });
                        console.log(`📡 Suscrito a sala de ruta: ${routeId}`);
                    });
            }
        } catch (err) {
            console.error('Error al actualizar datos:', err);
        }
    }
};

// ─── Inicialización ───────────────────────────────────────────────────────────
export async function init() {
    console.log('🗺️ Módulo Dashboard iniciado');

    if (typeof window.Auth !== 'undefined' && !window.Auth.isLoggedIn()) {
        window.location.href = '/login.html';
        return;
    }

    showLoader();

    try {
        // Modales de configuración
        document.getElementById('btn-close-modal')?.addEventListener('click', () => {
            document.getElementById('modal-no-base').style.display = 'none';
        });
        document.getElementById('btn-go-config')?.addEventListener('click', () => {
            document.getElementById('modal-no-base').style.display = 'none';
            window.location.href = '/settings';
        });

        await MapManager.init();
        SocketManager.init();
        await App.updateAll();
        await drawActiveRoutesOnMap(map);

    } catch (error) {
        console.error('🔥 Error iniciando Dashboard:', error);
        UI.showToast('Hubo un error al cargar el panel.', 5000);
    } finally {
        hideLoader();
    }
}

// ─── Dibujar rutas activas con trayecto guardado ──────────────────────────────
export async function drawActiveRoutesOnMap(mapInstance) {
    if (!window.google?.maps || !mapInstance) return;

    try {
        const allRoutes   = await fetchRoutes();
        const activeRoutes = allRoutes.filter(r => r.status === 'active');

        activeRoutes.forEach(route => {
            if (!route.trayecto?.encodedPolyline) return;

            const routeId          = route.id || route._id;
            const markersForRoute  = [];

            // A) Polilínea de ruta planeada (gris)
            const decodedPath = window.google.maps.geometry.encoding.decodePath(
                route.trayecto.encodedPolyline
            );
            const polyline = new window.google.maps.Polyline({
                path: decodedPath, geodesic: true,
                strokeColor: '#808080', strokeOpacity: 0.7, strokeWeight: 4,
                map: mapInstance, zIndex: 1
            });
            markersForRoute.push(polyline);

            // B) Polilínea de recorrido real (azul)
            const realPath = (route.recorridoReal || []).map(p => ({
                lat: parseFloat(p.lat), lng: parseFloat(p.lng)
            }));
            const actualPolyline = new window.google.maps.Polyline({
                path: realPath, geodesic: true,
                strokeColor: '#007BFF', strokeOpacity: 1.0, strokeWeight: 5,
                map: mapInstance, zIndex: 2
            });

            const driverId = typeof route.driver === 'object'
                ? (route.driver._id || route.driver.id)
                : route.driver;
            if (driverId) actualPathPolylines[driverId] = actualPolyline;

            // C) Marcadores de origen y destino
            const markerConfig = (color, title) => ({
                path:         window.google.maps.SymbolPath.CIRCLE,
                scale:        6,
                fillColor:    color,
                fillOpacity:  1,
                strokeWeight: 2,
                strokeColor:  '#FFFFFF'
            });

            const startMarker = new window.google.maps.Marker({
                position: { lat: route.trayecto.origin.lat, lng: route.trayecto.origin.lng },
                map: mapInstance,
                icon:  markerConfig('#4CAF50'),
                title: 'Inicio'
            });
            const endMarker = new window.google.maps.Marker({
                position: { lat: route.trayecto.destination.lat, lng: route.trayecto.destination.lng },
                map: mapInstance,
                icon:  markerConfig('#F44336'),
                title: 'Destino'
            });
            markersForRoute.push(startMarker, endMarker);

            // D) Waypoints
            (route.trayecto.waypoints || []).forEach((wp, i) => {
                const wpMarker = new window.google.maps.Marker({
                    position: { lat: wp.lat, lng: wp.lng },
                    map: mapInstance,
                    icon: {
                        path:         window.google.maps.SymbolPath.CIRCLE,
                        scale:        4,
                        fillColor:    '#FFC107',
                        fillOpacity:  1,
                        strokeWeight: 1,
                        strokeColor:  '#000000'
                    },
                    title: `Parada ${i + 1}`
                });
                markersForRoute.push(wpMarker);
            });

            // E) InfoWindow de etiqueta
            const driverName  = route.driver?.nombre || 'Sin chofer';
            const routeColor  = route.color || '#0056b3';
            const infoWindow  = new window.google.maps.InfoWindow({
                content: `
                    <div class="route-tag" style="--dot-color:${routeColor};">
                        <span class="route-dot"></span>
                        <span class="route-text">
                            <span class="route-name">${route.name}</span>
                            <span class="route-driver">(${driverName})</span>
                        </span>
                    </div>`,
                position:       { lat: route.trayecto.origin.lat, lng: route.trayecto.origin.lng },
                disableAutoPan: true,
                pixelOffset:    new window.google.maps.Size(0, -10)
            });
            infoWindow.open(mapInstance);
            markersForRoute.push(infoWindow);

            routeStaticMarkers[routeId] = markersForRoute;
        });

    } catch (error) {
        console.error('No se pudieron dibujar las rutas activas:', error);
    }
}

// ─── Cleanup al salir de la vista ─────────────────────────────────────────────
export function cleanup() {
    if (socket) {
        socket.disconnect();
        socket = null;
        console.log('Socket desconectado al salir del Dashboard');
    }
}