// src/js/modules/services/maps.service.js

// Variables globales del mapa de dibujo
let mapDraw = null;
let mapMain = null;
let directionsService = null;
let renderers = [];
let selectedRouteData = null;
let mainDirectionsRenderer = null;

// 🆕 Variables para el sistema multi-ruta
let alternativePolylines = [];   // Polilíneas grises de rutas alternas
let currentDirectionsResult = null; // Resultado completo de Google
let currentRouteIndex = 0;          // Índice de la ruta seleccionada actualmente

let detailDirectionsRenderer = null;
let currentDrawMode = null;
let routeMarkers = {
    start: null,
    waypoints: [],
    end: null
};
let baseOperativaCoords = { lat: 19.76356192684407, lng: -104.37156006746108 };
let baseMarkerDraw = null;


export function setBaseOperativaCoords(lat, lng) {
    baseOperativaCoords = { lat, lng };
    console.log("📍 Coordenadas de Base actualizadas en Maps Service:", baseOperativaCoords);

    if (mapMain) mapMain.setCenter(baseOperativaCoords);
    if (mapDraw) {
        mapDraw.setCenter(baseOperativaCoords);
        dibujarPinBase(mapDraw, baseOperativaCoords);
    }
}

function dibujarPinBase(mapInstance, coords) {
    if (baseMarkerDraw) baseMarkerDraw.setMap(null);
    baseMarkerDraw = new window.google.maps.Marker({
        position: coords,
        map: mapInstance,
        title: "Base Principal",
        icon: {
            url: "/assets/base.svg",
            scaledSize: new window.google.maps.Size(42, 42),
            anchor: new window.google.maps.Point(21, 42)
        },
        zIndex: 999
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAPA PRINCIPAL (detalles de ruta)
// ─────────────────────────────────────────────────────────────────────────────

export function initOrResizeMainMap(mapEl) {
    if (!mapEl) return;

    // 🔑 FIX: Si mapMain existe pero su div ya NO está en el DOM (fue destruido y
    // recreado), lo tratamos como si no existiera y lo re-creamos sobre el nuevo nodo.
    const mapDivStillInDOM = mapMain && document.body.contains(mapMain.getDiv());

    if (!mapMain || !mapDivStillInDOM) {
        // El div cambió: recreamos el mapa desde cero
        mapMain = new window.google.maps.Map(mapEl, {
            center: baseOperativaCoords,
            zoom: 12,
            disableDefaultUI: false
        });
        // También invalidamos el renderer anterior, que apuntaba al mapa viejo
        detailDirectionsRenderer = null;
        console.log("🗺️ mapMain creado/recreado sobre el nuevo nodo del DOM.");
    } else {
        // El div es el mismo: solo centramos y disparamos resize para que Google
        // repinte correctamente dentro de su contenedor (evita el "tile vacío").
        mapMain.setCenter(baseOperativaCoords);
        window.google.maps.event.trigger(mapMain, 'resize');
        console.log("📍 mapMain ya existe, se centró y se forzó resize.");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAPA DE DIBUJO
// ─────────────────────────────────────────────────────────────────────────────

export function initOrResizeDrawMap() {
    const mapEl = document.getElementById('draw-map');
    if (!mapEl) return;

    // 🔥 LA SOLUCIÓN: Verificamos si mapDraw existe Y si su div sigue en el documento actual
    const mapDivStillInDOM = mapDraw && document.body.contains(mapDraw.getDiv());

    if (!mapDraw || !mapDivStillInDOM) {
        console.log("🗺️ mapDraw creado/recreado porque el DOM cambió.");
        
        // Inicializamos los servicios
        directionsService = new window.google.maps.DirectionsService();
        
        // Recreamos el mapa amarrado al NUEVO elemento del DOM
        mapDraw = new window.google.maps.Map(mapEl, {
            center: baseOperativaCoords,
            zoom: 12,
            disableDefaultUI: false
        });

        // Volvemos a escuchar los clics
        mapDraw.addListener('click', (e) => handleMapClick(e.latLng));
        
        // Reinicializamos el buscador de direcciones
        initAutocomplete();
    } else {
        console.log("📍 mapDraw ya existe, se centró y forzó resize.");
    }

    // Centramos, ponemos el pin de la base y repintamos para evitar el "mapa gris"
    mapDraw.setCenter(baseOperativaCoords);
    dibujarPinBase(mapDraw, baseOperativaCoords);
    window.google.maps.event.trigger(mapDraw, 'resize');
}
// ─────────────────────────────────────────────────────────────────────────────
// API PÚBLICA PARA LA VISTA
// ─────────────────────────────────────────────────────────────────────────────

export function setDrawMode(mode) {
    console.log("🔄 Modo de dibujo:", mode);
    currentDrawMode = mode;
}

export function drawStartFromBase(lat, lng) {
    const startLat = lat || baseOperativaCoords.lat;
    const startLng = lng || baseOperativaCoords.lng;
    setStartPoint(startLat, startLng, 'Base Operativa');
    currentDrawMode = null;
}

export function getRouteDataForDB() {
    return selectedRouteData;
}

export function clearDrawMap() {
    // Limpiamos el renderer principal
    if (mainDirectionsRenderer) {
        mainDirectionsRenderer.setMap(null);
        mainDirectionsRenderer = null;
    }

    // 🆕 Limpiamos las polilíneas alternas
    alternativePolylines.forEach(p => p.setMap(null));
    alternativePolylines = [];
    currentDirectionsResult = null;
    currentRouteIndex = 0;

    // Limpiamos marcadores
    if (routeMarkers.start) routeMarkers.start.setMap(null);
    if (routeMarkers.end) routeMarkers.end.setMap(null);
    routeMarkers.waypoints.forEach(w => w.marker.setMap(null));

    routeMarkers = { start: null, waypoints: [], end: null };
    selectedRouteData = null;
    currentDrawMode = null;

    renderers.forEach(r => r.setMap(null));
    renderers = [];
}

// ─────────────────────────────────────────────────────────────────────────────
// LÓGICA INTERNA DE DIBUJO
// ─────────────────────────────────────────────────────────────────────────────

function handleMapClick(latLng) {
    console.log(`🗺️ Clic en mapa: ${latLng.lat()}, ${latLng.lng()} | Modo: ${currentDrawMode}`);

    if (currentDrawMode === 'START_MANUAL') {
        setStartPoint(latLng.lat(), latLng.lng(), 'Punto de Inicio');
        currentDrawMode = null;
        document.dispatchEvent(new CustomEvent('mapStartSet'));
    } else if (currentDrawMode === 'WAYPOINTS') {
        addWaypoint(latLng.lat(), latLng.lng());
    } else if (currentDrawMode === 'END') {
        setEndPoint(latLng.lat(), latLng.lng());
        currentDrawMode = null;
        document.dispatchEvent(new CustomEvent('mapEndSet'));
        calculateAndDrawRoute();
    } else {
        console.log("⚠️ Clic ignorado: sin modo activo.");
    }
}

function setStartPoint(lat, lng, title) {
    if (routeMarkers.start) routeMarkers.start.setMap(null);
    routeMarkers.start = new google.maps.Marker({
        position: { lat, lng },
        map: mapDraw,
        title,
        icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#4CAF50',
            fillOpacity: 1,
            strokeWeight: 2,
            strokeColor: '#FFFFFF'
        },
        zIndex: 20
    });
}

function addWaypoint(lat, lng) {
    const stopNumber = routeMarkers.waypoints.length + 1;
    const marker = new google.maps.Marker({
        position: { lat, lng },
        map: mapDraw,
        icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: '#FFC107',
            fillOpacity: 1,
            strokeWeight: 2,
            strokeColor: '#FFFFFF'
        },
        label: { text: stopNumber.toString(), color: '#fff', fontSize: '11px', fontWeight: 'bold' },
        title: `Parada ${stopNumber}`,
        zIndex: 20
    });
    routeMarkers.waypoints.push({ location: new google.maps.LatLng(lat, lng), stopover: true, marker });
}

function setEndPoint(lat, lng) {
    if (routeMarkers.end) routeMarkers.end.setMap(null);
    routeMarkers.end = new google.maps.Marker({
        position: { lat, lng },
        map: mapDraw,
        icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#F44336',
            fillOpacity: 1,
            strokeWeight: 2,
            strokeColor: '#FFFFFF'
        },
        title: 'Destino',
        zIndex: 20
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// CÁLCULO Y DIBUJADO MULTI-RUTA
// ─────────────────────────────────────────────────────────────────────────────

export function calculateAndDrawRoute() {
    if (!routeMarkers.start || !routeMarkers.end) return;

    const request = {
        origin: routeMarkers.start.getPosition(),
        destination: routeMarkers.end.getPosition(),
        waypoints: routeMarkers.waypoints.map(wp => ({
            location: wp.location,
            stopover: true
        })),
        travelMode: google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: true
    };

    directionsService.route(request, (result, status) => {
        if (status === 'OK') {
            currentDirectionsResult = result;
            renderAllRoutes(result, 0); // Siempre comenzamos con la ruta óptima (índice 0)
        } else {
            console.error("Error al calcular la ruta:", status);
            alert("No se pudo calcular una ruta entre estos puntos.");
        }
    });
}

/**
 * 🆕 Dibuja TODAS las rutas devueltas por Google:
 *   - La ruta `selectedIndex` se pinta con DirectionsRenderer en AZUL
 *   - Las demás se pinta como polilíneas GRISES clicables
 */
function renderAllRoutes(result, selectedIndex) {
    // 1. Limpiar renderizado anterior
    if (mainDirectionsRenderer) {
        mainDirectionsRenderer.setMap(null);
        mainDirectionsRenderer = null;
    }
    alternativePolylines.forEach(p => p.setMap(null));
    alternativePolylines = [];

    currentRouteIndex = selectedIndex;

    // 2. Dibujar las rutas NO seleccionadas como polilíneas grises clicables
    result.routes.forEach((route, idx) => {
        if (idx === selectedIndex) return; // La seleccionada va con el renderer

        const polyline = new google.maps.Polyline({
            path: route.overview_path,
            strokeColor: '#9E9E9E',
            strokeOpacity: 0.7,
            strokeWeight: 5,
            map: mapDraw,
            zIndex: 1,
            clickable: true
        });

        // Al hacer clic en una alterna, pasa a ser la seleccionada
        polyline.addListener('click', () => {
            console.log(`🔄 Ruta alterna ${idx} seleccionada.`);
            renderAllRoutes(result, idx);
        });

        alternativePolylines.push(polyline);
    });

    // 3. Dibujar la ruta seleccionada en AZUL con el DirectionsRenderer oficial
    mainDirectionsRenderer = new google.maps.DirectionsRenderer({
        map: mapDraw,
        directions: result,
        routeIndex: selectedIndex,
        suppressMarkers: true,          // Usamos nuestros propios marcadores
        suppressPolylines: false,
        polylineOptions: {
            strokeColor: '#2196F3',
            strokeOpacity: 0.9,
            strokeWeight: 6,
            zIndex: 10
        }
    });

    // 4. Actualizar métricas y guardar data de la ruta seleccionada
    updateRouteMetricsAndData(result, selectedIndex);
}

/**
 * Actualiza los chips de distancia/tiempo y guarda los datos para la DB.
 */
function updateRouteMetricsAndData(directionsResult, routeIndex) {
    const route = directionsResult.routes[routeIndex];
    if (!route) return;

    let totalDistanceMeters = 0;
    let totalDurationSeconds = 0;

    route.legs.forEach(leg => {
        totalDistanceMeters += leg.distance.value;
        totalDurationSeconds += leg.duration.value;
    });

    const distanceKm   = (totalDistanceMeters / 1000).toFixed(1);
    const durationMin  = Math.round(totalDurationSeconds / 60);

    const elDistance = document.getElementById('create-distance');
    const elDuration = document.getElementById('create-duration');
    if (elDistance) elDistance.innerText = `${distanceKm} km`;
    if (elDuration) elDuration.innerText = `${durationMin} min`;

    selectedRouteData = {
        origin: {
            lat: route.legs[0].start_location.lat(),
            lng: route.legs[0].start_location.lng(),
            address: route.legs[0].start_address
        },
        destination: {
            lat: route.legs[route.legs.length - 1].end_location.lat(),
            lng: route.legs[route.legs.length - 1].end_location.lng(),
            address: route.legs[route.legs.length - 1].end_address
        },
        waypoints: routeMarkers.waypoints.map(w => ({
            lat: w.location.lat(),
            lng: w.location.lng(),
            stopover: true
        })),
        encodedPolyline: route.overview_polyline,
        distancia_metros: totalDistanceMeters,
        tiempo_estimado_segundos: totalDurationSeconds
    };

    console.log(`✅ Ruta [${routeIndex}] guardada: ${distanceKm} km / ${durationMin} min`);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAPA DE DETALLE (panel de vista de ruta existente)
// ─────────────────────────────────────────────────────────────────────────────

export function drawRouteOnDetailMap(route) {
    // Auto-inicialización defensiva del servicio
    if (!directionsService && window.google && window.google.maps) {
        directionsService = new google.maps.DirectionsService();
    }
    if (!directionsService) {
        console.error("❌ directionsService no está listo.");
        return;
    }

    // 🔑 FIX: Verificar que mapMain sigue apuntando a un nodo real del DOM.
    // Si el panel fue destruido y recreado, el nodo anterior ya no existe.
    if (!mapMain || !document.body.contains(mapMain.getDiv())) {
        const mapEl = document.getElementById('route-detail-map');
        if (!mapEl) {
            console.error("❌ No se encontró #route-detail-map en el DOM.");
            return;
        }
        mapMain = new window.google.maps.Map(mapEl, {
            center: baseOperativaCoords,
            zoom: 12,
            disableDefaultUI: false
        });
        detailDirectionsRenderer = null; // Invalidar renderer anterior
        console.log("🗺️ mapMain recreado dentro de drawRouteOnDetailMap.");
    }

    // Limpiar renderer previo
    if (detailDirectionsRenderer) {
        detailDirectionsRenderer.setMap(null);
        detailDirectionsRenderer = null;
    }

    // Validar datos de la ruta
    if (!route?.trayecto?.origin || !route?.trayecto?.destination) {
        const notice = document.getElementById('route-detail-map-notice');
        if (notice) notice.innerHTML = "⚠️ Esta ruta no tiene un trayecto guardado en el mapa.";
        return;
    }

    const notice = document.getElementById('route-detail-map-notice');
    if (notice) notice.innerHTML = "";

    detailDirectionsRenderer = new google.maps.DirectionsRenderer({
        map: mapMain,
        suppressMarkers: false
    });

    const formattedWaypoints = (route.trayecto.waypoints || []).map(wp => ({
        location: { lat: wp.lat, lng: wp.lng },
        stopover: true
    }));

    const request = {
        origin: { lat: route.trayecto.origin.lat, lng: route.trayecto.origin.lng },
        destination: { lat: route.trayecto.destination.lat, lng: route.trayecto.destination.lng },
        waypoints: formattedWaypoints,
        travelMode: google.maps.TravelMode.DRIVING
    };

    directionsService.route(request, (response, status) => {
        if (status === 'OK') {
            // Re-verificar que el renderer sigue apuntando al mapa correcto
            // (el usuario puede haber cerrado el panel mientras calculaba)
            if (detailDirectionsRenderer && mapMain && document.body.contains(mapMain.getDiv())) {
                detailDirectionsRenderer.setDirections(response);

                // Forzar resize por si el contenedor cambió de tamaño al abrirse
                window.google.maps.event.trigger(mapMain, 'resize');
                mapMain.setCenter({
                    lat: route.trayecto.origin.lat,
                    lng: route.trayecto.origin.lng
                });

                const leg = response.routes[0].legs[0];
                const spanDist = document.getElementById('route-detail-distance');
                const spanDur  = document.getElementById('route-detail-duration');
                if (spanDist) spanDist.textContent = leg.distance.text;
                if (spanDur)  spanDur.textContent  = leg.duration.text;

                console.log("✅ Trayecto dibujado en el mapa de detalles.");
            } else {
                console.warn("⚠️ El panel de detalles fue cerrado antes de que la ruta llegara.");
            }
        } else {
            console.error("❌ Error al trazar la ruta en detalles:", status);
        }
    });
}

export function clearDetailMap() {
    if (detailDirectionsRenderer) {
        detailDirectionsRenderer.setMap(null);
        detailDirectionsRenderer = null;
    }
    // 🔑 FIX: Invalidamos mapMain para que la próxima apertura lo recree limpio
    mapMain = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTOCOMPLETE
// ─────────────────────────────────────────────────────────────────────────────

export function initAutocomplete() {
    const input = document.getElementById('pac-input');
    if (!input) return;

    const autocomplete = new google.maps.places.Autocomplete(input);
    if (mapDraw) autocomplete.bindTo('bounds', mapDraw);

    autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place.geometry?.location) {
            console.warn("No hay detalles de geometría para esta dirección.");
            return;
        }

        mapDraw.setCenter(place.geometry.location);
        mapDraw.setZoom(16);
        handleMapClick(place.geometry.location);

        input.value = '';
        input.blur();
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// RESTAURAR RUTA EN MAPA DE DIBUJO (modo edición)
// ─────────────────────────────────────────────────────────────────────────────

export function restoreRouteOnDrawMap(trayectoData) {
    if (!trayectoData?.origin || !trayectoData?.destination) {
        console.warn("⚠️ Datos insuficientes para restaurar la ruta.");
        return;
    }
    if (!directionsService) {
        console.error("❌ directionsService no inicializado.");
        return;
    }

    if (mainDirectionsRenderer) {
        mainDirectionsRenderer.setMap(null);
        mainDirectionsRenderer = null;
    }

    mainDirectionsRenderer = new google.maps.DirectionsRenderer({
        map: mapDraw,
        suppressMarkers: false,
        polylineOptions: {
            strokeColor: '#2196F3',
            strokeOpacity: 0.9,
            strokeWeight: 6
        }
    });

    const formattedWaypoints = (trayectoData.waypoints || []).map(wp => ({
        location: { lat: wp.lat, lng: wp.lng },
        stopover: true
    }));

    const request = {
        origin: { lat: trayectoData.origin.lat, lng: trayectoData.origin.lng },
        destination: { lat: trayectoData.destination.lat, lng: trayectoData.destination.lng },
        waypoints: formattedWaypoints,
        travelMode: google.maps.TravelMode.DRIVING
    };

    directionsService.route(request, (response, status) => {
        if (status === 'OK') {
            mainDirectionsRenderer.setDirections(response);
            selectedRouteData = trayectoData;
            console.log("✅ Ruta restaurada en el mini-mapa.");
        } else {
            console.error("❌ Error al restaurar la ruta:", status);
        }
    });
}

// Stub para compatibilidad con imports existentes
export function loadRouteOnDrawMap(trayecto) {
    console.warn("loadRouteOnDrawMap: usa restoreRouteOnDrawMap en su lugar.");
}