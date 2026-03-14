// public/js/modules/services/socket.js
import { state } from '../state.js';
import { updateDriverMarkerOnMap, refreshMapData } from '../map/map.js';
import { showToast, updateRouteDriverStatus, updateKPIs } from '../ui/ui.js';
const API_BASE_URL = import.meta.env.VITE_API_URL || '';
let socket;

export function initSocket() {
    socket = io(API_BASE_URL, {
        // Configuraciones recomendadas para evitar problemas de CORS en producción
        transports: ['websocket', 'polling'], 
        withCredentials: true 
    });

    // 1. Ubicación (Latencia crítica)
    socket.on('locationUpdate', (data) => {
        if (!data || !data.lat || !data.lng) return;
        
        const pos = { lat: parseFloat(data.lat), lng: parseFloat(data.lng) };
        const { routeId, driverId } = data;

        // Guardar estado
        state.lastKnownLocations[driverId] = { ...pos, timestamp: Date.now() };

        // Actualizar visualmente
        updateDriverMarkerOnMap(driverId, pos, routeId);
    });

    // 2. Eventos de Ruta
    socket.on('routeReady', (data) => {
        showToast(data.message || 'Ruta lista para iniciar');
        if(data.routeId) updateRouteDriverStatus(data.routeId, 'ready');
        refreshMapData();
        updateKPIs();
    });

    socket.on('routeStarted', (data) => {
        showToast('Ruta iniciada', 2000);
        if(data.routeId) updateRouteDriverStatus(data.routeId, 'started');
        refreshMapData(); // Redibujar líneas
        updateKPIs();
    });

    // 3. Actualizaciones Generales
    socket.on('routeStatusChanged', () => { refreshMapData(); updateKPIs(); });
    socket.on('driversUpdated', () => { refreshMapData(); });
    
    // 4. Alertas
    socket.on('routeDeviationAlert', (data) => {
        showToast('⚠️ Chofer fuera de ruta', 5000);
        // Aquí podrías pintar la línea roja en el mapa si quisieras
    });

    console.log("🔌 Socket.io conectado y escuchando.");
}

export function getSocket() { return socket; }