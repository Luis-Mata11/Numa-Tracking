// public/js/modules/map/map.js
import { state, setRoutes, setDrivers } from '../state.js';
import { updateInfoPanel, showToast } from '../ui/ui.js';
import { checkAuth } from '../services/auth.js';
const API_BASE_URL = import.meta.env.VITE_API_URL || '';
let map;
let directionsService;
let directionsRenderer;

// --- Inicialización Principal ---
export async function initMapModule() {
    console.log("🗺️ Inicializando Módulo de Mapa...");

    if (!checkAuth()) return;

    const drawMapEl = document.getElementById("draw-map");
    if (!drawMapEl) {
        console.error("Elemento #draw-map no encontrado.");
        return;
    }

    // 1. Crear Mapa
    const defaultLocation = { lat: 19.7677724, lng: -104.3686507 };
    map = new google.maps.Map(drawMapEl, {
        center: defaultLocation,
        zoom: 13,
        styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }],
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true
    });

    // 2. Servicios
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        map: map, draggable: true, panel: document.getElementById('right-panel')
    });

    // 3. Cargar Base
    await loadBaseOperativa();

    // 4. Cargar Datos Iniciales
    await refreshMapData();
}

// --- Carga de Datos y Dibujo ---
export async function refreshMapData() {
    await fetchDrivers();
    await fetchAndDrawRoutes();
}

async function loadBaseOperativa() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/config`); if (res.ok) {
            const config = await res.json();
            if (config?.lat && config?.lng) {
                const basePos = { lat: parseFloat(config.lat), lng: parseFloat(config.lng) };
                map.setCenter(basePos);
                map.setZoom(15);
                new google.maps.Marker({
                    position: basePos, map: map, title: "Base Operativa",
                    icon: { url: "https://maps.google.com/mapfiles/ms/icons/red-dot.png", scaledSize: new google.maps.Size(40, 40) }
                });
            }
        }
    } catch (e) { console.warn("Sin base operativa", e); }
}

async function fetchDrivers() {
    try {
        const token = sessionStorage.getItem('numa_token');
        const res = await fetch(`${API_BASE_URL}/api/drivers`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) setDrivers(await res.json());
    } catch (e) { console.error(e); }
}

async function fetchAndDrawRoutes() {
    try {
        // Limpiar rutas viejas
        Object.values(state.routePolylines).forEach(obj => {
            if (obj.grey) obj.grey.setMap(null);
            if (obj.color) obj.color.setMap(null);
            if (obj.markers) obj.markers.forEach(m => m.setMap(null));
        });
        state.routePolylines = {};

        const token = sessionStorage.getItem('numa_token');
        const res = await fetch(`${API_BASE_URL}/api/routes`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) return;

        const allRoutes = await res.json();
        setRoutes(allRoutes);

        const inProgress = allRoutes.filter(r => r.estado === 'en curso' && r.waypoints?.length > 0);
        const bounds = new google.maps.LatLngBounds();

        inProgress.forEach(route => {
            drawSingleRoute(route, bounds);
        });

        if (inProgress.length > 0) map.fitBounds(bounds);

    } catch (err) { console.error("Error dibujando rutas:", err); }
}

function drawSingleRoute(route, bounds) {
    const pathCoords = route.waypoints.map(wp => ({ lat: parseFloat(wp.lat), lng: parseFloat(wp.lng) }));
    const routeColor = (route.status === 'cancelled' || route.estado === 'cancelada') ? '#e74c3c' : (route.color || '#f357a1');

    // Dibujo Básico (simplificado para el ejemplo)
    const greyLine = new google.maps.Polyline({
        path: pathCoords, geodesic: true, strokeColor: '#616142',
        strokeOpacity: 0.6, strokeWeight: 4, map: map, zIndex: 1
    });

    const colorLine = new google.maps.Polyline({
        path: [], geodesic: true, strokeColor: routeColor,
        strokeOpacity: 1.0, strokeWeight: 6, map: map, zIndex: 2
    });

    // Evento Click en Ruta
    greyLine.addListener('click', () => {
        state.activeRouteId = route.id;
        updateInfoPanel(route);
    });

    state.routePolylines[route.id] = {
        grey: greyLine, color: colorLine, fullPath: pathCoords, maxIndex: -1, routeData: route
    };

    pathCoords.forEach(p => bounds.extend(p));
}

// --- Actualización en Tiempo Real (Llamado por Socket) ---
export function updateDriverMarkerOnMap(driverId, pos, routeId) {
    // 1. Marcador
    if (!state.driverMarkers[driverId]) {
        state.driverMarkers[driverId] = new google.maps.Marker({
            position: pos, map: map, title: `Chofer: ${driverId}`,
            icon: {
                path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 6,
                fillColor: "#0000FF", fillOpacity: 1, strokeWeight: 2, rotation: 0
            }
        });
        // Click en marcador
        state.driverMarkers[driverId].addListener('click', () => {
            // Lógica de click en vehículo
            console.log("Vehículo seleccionado", driverId);
        });
    } else {
        state.driverMarkers[driverId].setPosition(pos);
    }

    // 2. Línea de Progreso
    if (routeId && state.routePolylines[routeId]) {
        updateRouteProgress(routeId, pos);
    }
}

function updateRouteProgress(routeId, currentPos) {
    const rLayer = state.routePolylines[routeId];
    if (!rLayer || !rLayer.fullPath) return;

    let closestIndex = -1;
    let minDistance = Infinity;
    const currentLatLng = new google.maps.LatLng(currentPos.lat, currentPos.lng);

    rLayer.fullPath.forEach((pt, index) => {
        const ptLatLng = new google.maps.LatLng(pt.lat, pt.lng);
        const dist = google.maps.geometry.spherical.computeDistanceBetween(currentLatLng, ptLatLng);
        if (dist < 50 && dist < minDistance) { // Tolerancia 50m
            minDistance = dist;
            closestIndex = index;
        }
    });

    if (closestIndex > rLayer.maxIndex) {
        rLayer.maxIndex = closestIndex;
        const traveledPath = rLayer.fullPath.slice(0, closestIndex + 1);
        rLayer.color.setPath(traveledPath);
    }
}