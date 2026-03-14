/**
 * routes.map.js
 * Maneja de forma exclusiva la lógica de Google Maps para el módulo de Rutas.
 * Separa la vista (mapa) de la lógica de negocio (API/Backend).
 */

class RouteMapManager {
    constructor() {
        // Mapas
        this.mainMap = null; // Mapa del detalle visual
        this.drawMap = null; // Mapa del panel de creación

        // Servicios de Google
        this.directionsService = null;
        this.directionsRendererMain = null;
        this.directionsRendererDraw = null;
        this.autocomplete = null;

        // Estado temporal de la nueva ruta
        this.currentOrigin = null;
        this.currentDestination = null;
        this.waypoints = [];
        this.markers = []; // Para limpiar pines manuales
    }

    // Inicializa ambos mapas (Llamado por el callback de Google API)
    initMaps() {
        // 1. Instanciar Servicios
        this.directionsService = new google.maps.DirectionsService();
        
        this.directionsRendererMain = new google.maps.DirectionsRenderer({
            suppressMarkers: false,
            polylineOptions: { strokeColor: '#6c8cff', strokeWeight: 5 }
        });

        this.directionsRendererDraw = new google.maps.DirectionsRenderer({
            draggable: true, // Permite arrastrar la ruta para modificarla
            suppressMarkers: false,
            polylineOptions: { strokeColor: '#f357a1', strokeWeight: 5 }
        });

        const defaultCenter = { lat: 20.659698, lng: -103.349609 }; // Cambia a tu ciudad (Ej. GDL)

        // 2. Mapa Principal (Detalle)
        const mainMapEl = document.getElementById('main-map');
        if (mainMapEl) {
            this.mainMap = new google.maps.Map(mainMapEl, {
                zoom: 12,
                center: defaultCenter,
                mapTypeControl: false,
                streetViewControl: false,
            });
            this.directionsRendererMain.setMap(this.mainMap);
        }

        // 3. Mapa de Dibujo (Offcanvas)
        const drawMapEl = document.getElementById('draw-map');
        if (drawMapEl) {
            this.drawMap = new google.maps.Map(drawMapEl, {
                zoom: 12,
                center: defaultCenter,
                mapTypeControl: false,
                streetViewControl: false,
            });
            this.directionsRendererDraw.setMap(this.drawMap);
            this.initAutocomplete();
            this.setupDrawListeners();
        }
    }

 
    // Escucha eventos de arrastre en la ruta para actualizar métricas en vivo
    setupDrawListeners() {
        this.directionsRendererDraw.addListener('directions_changed', () => {
            const directions = this.directionsRendererDraw.getDirections();
            if (directions) {
                this.updateLiveMetrics(directions);
            }
        });
    }

    // Calcula y dibuja la ruta en el mapa de Creación
    calculateAndDrawRoute() {
        if (!this.currentOrigin || !this.currentDestination) {
            console.log("Falta origen o destino para trazar la ruta.");
            return;
        }

        const request = {
            origin: this.currentOrigin,
            destination: this.currentDestination,
            waypoints: this.waypoints.map(wp => ({ location: wp, stopover: true })),
            travelMode: google.maps.TravelMode.DRIVING,
            optimizeWaypoints: true // Google ordena las paradas para la mejor ruta
        };

        this.directionsService.route(request, (response, status) => {
            if (status === 'OK') {
                this.directionsRendererDraw.setDirections(response);
                this.updateLiveMetrics(response);
                this.clearManualMarkers(); // Quitamos pines sueltos, la ruta ya tiene los suyos
            } else {
                alert('No se pudo calcular la ruta: ' + status);
            }
        });
    }

    // Actualiza los textos de Distancia y Tiempo en el HTML
    updateLiveMetrics(directions) {
        const route = directions.routes[0];
        if (!route) return;

        let totalDistance = 0;
        let totalDuration = 0;

        route.legs.forEach(leg => {
            totalDistance += leg.distance.value;
            totalDuration += leg.duration.value;
        });

        // Convertir a km y minutos
        document.getElementById('create-distance').innerText = (totalDistance / 1000).toFixed(2) + ' km';
        document.getElementById('create-duration').innerText = Math.round(totalDuration / 60) + ' min';
        
        // Guardar en inputs ocultos para el submit
        document.getElementById('route-origin').value = JSON.stringify(route.legs[0].start_location.toJSON());
        document.getElementById('route-destination').value = JSON.stringify(route.legs[route.legs.length - 1].end_location.toJSON());
    }

    // Limpia el mapa de creación por completo
    clearDrawMap() {
        this.currentOrigin = null;
        this.currentDestination = null;
        this.waypoints = [];
        this.directionsRendererDraw.setDirections({routes: []});
        this.clearManualMarkers();
        
        document.getElementById('create-distance').innerText = '0 km';
        document.getElementById('create-duration').innerText = '0 min';
        document.getElementById('pac-input').value = '';
    }

    clearManualMarkers() {
        this.markers.forEach(marker => marker.setMap(null));
        this.markers = [];
    }

    // --- Métodos para el Mapa Principal (Lectura) ---
    // Recibe la data del backend y la pinta en el mapa grande
    renderRouteOnMainMap(originStr, destinationStr, waypointsArray = []) {
        try {
            const origin = JSON.parse(originStr);
            const destination = JSON.parse(destinationStr);
            const waypoints = waypointsArray.map(wp => ({
                location: JSON.parse(wp),
                stopover: true
            }));

            const request = {
                origin: origin,
                destination: destination,
                waypoints: waypoints,
                travelMode: google.maps.TravelMode.DRIVING
            };

            this.directionsService.route(request, (response, status) => {
                if (status === 'OK') {
                    this.directionsRendererMain.setDirections(response);
                } else {
                    console.error("Error al pintar ruta en mapa principal:", status);
                }
            });
        } catch (error) {
            console.error("Error parseando las coordenadas de la ruta:", error);
        }
    }
}

// Exponemos la instancia globalmente PARA QUE EL CALLBACK DE GOOGLE LA ENCUENTRE
window.mapManager = new RouteMapManager();

// Esta es la función que Google Maps llama cuando termina de cargar su script
window.initRouteMaps = function() {
    window.mapManager.initMaps();
};