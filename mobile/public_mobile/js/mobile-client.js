(function () {
    const socket = io();

    // --- Constantes ---
    const DEVIATION_TOLERANCE = 25; // metros
    const MOVEMENT_THRESHOLD  = 10; // metros mínimos para dibujar segmento

    // --- Referencias al DOM ---
    const routeNameEl      = document.getElementById('route-name');
    const driverNameEl     = document.getElementById('driver-name');
    const driverStatusEl   = document.getElementById('driver-status');
    const driverStatusTextEl = document.getElementById('driver-status-text');
    const routeStatusEl    = document.getElementById('route-status');
    const topSubEl         = document.getElementById('top-sub');
    const coordsEl         = document.getElementById('coords');
    const btnCenter        = document.getElementById('btn-center');
    const btnZoom          = document.getElementById('btn-zoom');
    const btnFinishRoute   = document.getElementById('btn-finish-route');
    const fab              = document.getElementById('fab-mypos');
    const toast            = document.getElementById('toast');

    let isAutoPanActive = true;

    // --- Estado de la App ---
    let currentRoute    = null;
    let currentDriver   = null;
    let map             = null;
    let driverMarker    = null;
    let decodedRoutePath = [];
    let progressSegments = [];
    let lastDrawnPosition = null;
    let watchId         = null;
    let routeBounds     = null;

    // ── Helpers ──────────────────────────────────────────────────────────────

    function showToast(text, ms = 2000) {
        if (!toast) return;
        toast.textContent = text;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), ms);
    }

    function showFinalizationOverlay(message) {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
            backgroundColor: 'rgba(26, 32, 44, 0.95)', color: 'white',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            alignItems: 'center', zIndex: '9999', textAlign: 'center',
            fontFamily: 'system-ui, sans-serif'
        });
        overlay.innerHTML = `
            <img src="/img/logo.png" alt="Finalización" style="width:96px;height:96px;margin-bottom:20px;">
            <h2 style="margin:0;padding:0 20px;font-size:24px;">${message}</h2>
            <p style="margin-top:10px;font-size:16px;opacity:.8;">Serás redirigido en unos segundos...</p>`;
        document.body.appendChild(overlay);
    }

    function stopTracking() {
        if (watchId && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
            console.log('🛑 Rastreo GPS detenido.');
        }
    }

    function handleFinalization() {
        stopTracking();
        showFinalizationOverlay('Ruta Finalizada');
        setTimeout(() => {
            sessionStorage.clear();
            window.location.href = 'mobile-login.html';
        }, 3500);
    }

    function updateStatusUI(newStatus) {
        if (!newStatus) return;
        const statusText = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
        if (routeStatusEl) {
            routeStatusEl.textContent = statusText;
            routeStatusEl.className = 'status';
            if (newStatus === 'en curso' || newStatus === 'active')
                routeStatusEl.classList.add('good');
            else if (newStatus === 'pendiente' || newStatus === 'pending')
                routeStatusEl.classList.add('bad');
            else
                routeStatusEl.classList.add('neutral');
        }
        if (topSubEl) topSubEl.textContent = statusText;
        if (btnFinishRoute)
            btnFinishRoute.disabled = !(newStatus === 'en curso' || newStatus === 'active');
    }

    function updateDriverStatus(isOnline) {
        if (!driverStatusEl) return;
        const color = isOnline ? '#2ecc71' : '#e74c3c';
        const text  = isOnline ? 'Chofer en línea, listo para iniciar' : 'Desconectado';
        driverStatusEl.innerHTML = `
            <i class="fa-solid fa-circle" style="color:${color};margin-right:5px;"></i>
            <span id="driver-status-text">${text}</span>`;
    }

    // ── Inicialización de sesión ──────────────────────────────────────────────

    try {
        currentRoute = JSON.parse(sessionStorage.getItem('currentRoute'));
        console.log('🕵️ Datos de sesión:', currentRoute);

        // Normalizar ID
        if (currentRoute && !currentRoute.id && currentRoute._id)
            currentRoute.id = currentRoute._id;

        currentDriver = JSON.parse(sessionStorage.getItem('currentDriver'));
    } catch (e) { /* fallo silencioso */ }

    if (!currentRoute) {
        showToast('No hay ruta en sesión.', 3000);
        setTimeout(() => { window.location.href = 'mobile-login.html'; }, 1200);
        return;
    }

    if (routeNameEl) routeNameEl.textContent = currentRoute.name || '—';
    // 🔧 FIX: el campo en Driver.js es 'nombre', no 'name'
    if (driverNameEl) driverNameEl.textContent = currentDriver?.nombre || currentDriver?.name || '—';
    updateStatusUI(currentRoute.estado || currentRoute.status);

    // ── Mapa ─────────────────────────────────────────────────────────────────

    function initMap() {
        if (!currentRoute) return;

        // Origen desde trayecto (estructura actual del API)
        const trayecto = currentRoute.trayecto || {};
        const initialCenter = trayecto.origin
            ? { lat: trayecto.origin.lat, lng: trayecto.origin.lng }
            : { lat: 19.7677724, lng: -104.3686507 };

        map = new google.maps.Map(document.getElementById('map'), {
            zoom: 16,
            center: initialCenter,
            draggable: true,
            fullscreenControl: false,
            mapTypeControl: false,
            scaleControl: true,
            streetViewControl: false,
            rotateControl: false,
            zoomControl: true
        });

        routeBounds = new google.maps.LatLngBounds();

        if (trayecto.encodedPolyline) {
            // ── Ruta con trazo guardado ──────────────────────────────────────
            decodedRoutePath = google.maps.geometry.encoding.decodePath(trayecto.encodedPolyline);

            new google.maps.Polyline({
                path: decodedRoutePath,
                geodesic: true,
                strokeColor: '#808080',
                strokeOpacity: 0.8,
                strokeWeight: 5,
                map: map
            });

            decodedRoutePath.forEach(c => routeBounds.extend(c));

            if (trayecto.origin) {
                new google.maps.Marker({
                    position: trayecto.origin,
                    map: map,
                    title: 'Inicio',
                    icon: { path: google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: '#4CAF50', fillOpacity: 1, strokeWeight: 2, strokeColor: '#fff' }
                });
            }
            if (trayecto.destination) {
                new google.maps.Marker({
                    position: trayecto.destination,
                    map: map,
                    title: 'Destino',
                    icon: { path: google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: '#F44336', fillOpacity: 1, strokeWeight: 2, strokeColor: '#fff' }
                });
            }

        } else if (currentRoute.isTraceFree && trayecto.origin && trayecto.destination) {
            // ── Ruta sin trazo: solo inicio y fin ────────────────────────────
            const sm = new google.maps.Marker({ position: trayecto.origin,      map, title: 'Inicio', icon: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' });
            const em = new google.maps.Marker({ position: trayecto.destination, map, title: 'Fin',    icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png'   });
            routeBounds.extend(sm.getPosition());
            routeBounds.extend(em.getPosition());
        }

        if (!routeBounds.isEmpty()) map.fitBounds(routeBounds, 50);

        map.addListener('dragstart', () => {
            isAutoPanActive = false;
            if (fab) fab.classList.add('inactive');
            showToast('Auto-enfoque desactivado. Presiona 📍 para reactivar.', 2500);
        });

        // 🔧 FIX: NO llamamos startTracking() aquí.
        //    window.initMap (más abajo) lo llama después de initMap(),
        //    por lo que hacerlo aquí generaba DOBLE TRACKING.
    }

    // ── Sockets ───────────────────────────────────────────────────────────────

    socket.on('connect', () => {
        showToast('Conectado al servidor');
        updateDriverStatus(true);
        socket.emit('joinRoute', {
            routeId:  currentRoute.id,
            // 🔧 FIX: enviar el _id de MongoDB (ObjectId), no el ID de empleado
            driverId: currentDriver?._id || currentDriver?.id || null
        });
    });

    socket.on('disconnect', () => updateDriverStatus(false));

    // Ruta iniciada por el admin
    socket.on('routeStarted', (data) => {
        console.log('🔥 routeStarted recibido:', data);
        if (!data || !currentRoute) return;

        const serverRouteId = String(data.routeId || data.route?._id || data._id || data.id);
        const clientRouteId = String(currentRoute.id || currentRoute._id);

        if (serverRouteId === clientRouteId) {
            currentRoute.estado = 'en curso';
            currentRoute.status = 'active';
            sessionStorage.setItem('currentRoute', JSON.stringify(currentRoute));
            updateStatusUI('en curso');
            showToast(data.message || '🚀 ¡La ruta ha iniciado!', 4000);
        }
    });

    // Cambio de estado genérico
    socket.on('routeStatusChanged', (payload) => {
        if (!payload || !currentRoute) return;

        const serverRouteId = String(
            payload.routeId || payload.id || payload._id ||
            payload.route?.id || payload.route?._id
        );
        const clientRouteId = String(currentRoute.id || currentRoute._id);

        if (serverRouteId !== clientRouteId) return;

        const routeData  = payload.route || payload;
        const nuevoEstado = payload.estado || routeData.estado || payload.status || routeData.status;

        currentRoute = Object.assign({}, currentRoute, routeData);

        if (nuevoEstado) {
            currentRoute.estado = nuevoEstado;
            updateStatusUI(nuevoEstado);
            showToast(`Estado: ${nuevoEstado}`);

            if (nuevoEstado === 'finalizada' || nuevoEstado === 'completed') {
                handleFinalization();
            }
        }
    });

    // Orden directa de finalización
    socket.on('routeFinalized', () => {
        console.log('🏁 routeFinalized recibido del admin');
        handleFinalization();
    });

    // ── Rastreo GPS ───────────────────────────────────────────────────────────

    function startTracking() {
        if (!('geolocation' in navigator)) {
            showToast('GPS no disponible en este dispositivo.', 3000);
            return;
        }

        const trayecto = currentRoute.trayecto || {};

        watchId = navigator.geolocation.watchPosition((pos) => {
            const { latitude: lat, longitude: lng, accuracy, heading } = pos.coords;
            const currentPosition = new google.maps.LatLng(lat, lng);

            if (coordsEl) coordsEl.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)} (±${Math.round(accuracy)} m)`;

            // Marcador del chofer
            if (!driverMarker) {
                driverMarker = new google.maps.Marker({
                    position: currentPosition,
                    map: map,
                    icon: {
                        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                        scale: 5,
                        fillColor: '#4285F4',
                        fillOpacity: 1,
                        strokeWeight: 2,
                        strokeColor: '#FFFFFF',
                        rotation: heading || 0
                    }
                });
            } else {
                driverMarker.setPosition(currentPosition);
                if (heading !== null && !isNaN(heading)) {
                    const icon = driverMarker.getIcon();
                    icon.rotation = heading;
                    driverMarker.setIcon(icon);
                }
            }

            if (isAutoPanActive && map) map.panTo(currentPosition);

            // Calcular desvío usando decodedRoutePath o fallback al origen
            let minDistance = Infinity;
            if (decodedRoutePath.length > 0) {
                decodedRoutePath.forEach(point => {
                    const d = google.maps.geometry.spherical.computeDistanceBetween(currentPosition, point);
                    if (d < minDistance) minDistance = d;
                });
            } else if (trayecto.origin) {
                minDistance = google.maps.geometry.spherical.computeDistanceBetween(
                    currentPosition,
                    new google.maps.LatLng(trayecto.origin.lat, trayecto.origin.lng)
                );
            }
            const isOffRoute = minDistance > DEVIATION_TOLERANCE;

            // 🔧 FIX: driverId usa _id (ObjectId de MongoDB) para que RecorridoReal lo guarde correctamente
            socket.emit('driverLocation', {
                lat, lng, accuracy,
                speed:      pos.coords.speed   || null,
                heading:    heading            || null,
                isOffRoute,
                timestamp:  pos.timestamp      || Date.now(),
                driverId:   currentDriver?._id || currentDriver?.id || null,
                routeId:    currentRoute.id
            });

            // Dibujar segmento de progreso
            if (!lastDrawnPosition) { lastDrawnPosition = currentPosition; return; }

            const distFromLast = google.maps.geometry.spherical.computeDistanceBetween(lastDrawnPosition, currentPosition);
            if (distFromLast < MOVEMENT_THRESHOLD) return;

            const segmentColor = isOffRoute ? '#e74c3c' : (currentRoute.color || '#f357a1');
            progressSegments.push(new google.maps.Polyline({
                path: [lastDrawnPosition, currentPosition],
                strokeColor: segmentColor,
                strokeWeight: 7,
                map: map
            }));
            lastDrawnPosition = currentPosition;

        }, (err) => {
            console.error('GPS error:', err);
            showToast('Error de GPS: ' + err.message, 1800);
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
    }

    // ── Botones ───────────────────────────────────────────────────────────────

    if (btnCenter) btnCenter.addEventListener('click', () => driverMarker && map.panTo(driverMarker.getPosition()));
    if (btnZoom)   btnZoom.addEventListener('click',   () => !routeBounds.isEmpty() && map.fitBounds(routeBounds, 50));

    if (fab) {
        fab.addEventListener('click', () => {
            if (driverMarker) {
                map.panTo(driverMarker.getPosition());
                isAutoPanActive = true;
                fab.classList.remove('inactive');
                showToast('Auto-enfoque reactivado.', 1500);
            }
        });
    }

    if (btnFinishRoute) {
        btnFinishRoute.addEventListener('click', () => {
            if (confirm('¿Seguro que quieres solicitar la finalización de esta ruta?')) {
                socket.emit('requestFinishRoute', {
                    routeId:    currentRoute.id,
                    driverId:   currentDriver?._id || currentDriver?.id || null,
                    routeName:  currentRoute.name
                });
                showToast('Solicitud enviada al administrador.');
                btnFinishRoute.disabled = true; // Evitar doble envío
            }
        });
    }

    // ── window.initMap — callback de Google Maps ──────────────────────────────
    // Google Maps llama a esta función cuando termina de cargar.
    // Aquí es el ÚNICO lugar donde iniciamos tracking para evitar el doble registro.
    window.initMap = function () {
        initMap();
        try { startTracking(); } catch (e) { console.error('Error iniciando tracking:', e); }
    };

})();