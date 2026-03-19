(function () {
    const socket = io();

    // --- Constantes ---
    const DEVIATION_TOLERANCE = 80;
    const MOVEMENT_THRESHOLD  = 10;

    // --- Referencias al DOM ---
    const routeNameEl    = document.getElementById('route-name');
    const driverNameEl   = document.getElementById('driver-name');
    const routeStatusEl  = document.getElementById('route-status');
    const topSubEl       = document.getElementById('top-sub');
    const coordsEl       = document.getElementById('coords');
    const btnCenter      = document.getElementById('btn-center');
    const btnZoom        = document.getElementById('btn-zoom');
    const btnFinishRoute = document.getElementById('btn-finish-route');
    const fab            = document.getElementById('fab-mypos');
    const toast          = document.getElementById('toast');

    // --- Estado ---
    let currentRoute     = null;
    let currentDriver    = null;
    let map              = null;
    let driverMarker     = null;
    let progressPolylines = [];
    let lastDrawnPosition = null;
    let watchId          = null;
    let isAutoPanActive  = true;
    let routeBounds      = null;

    // ── Helpers ───────────────────────────────────────────────────────────────

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
            <img src="./img/logo.png" alt="Finalización" style="width:96px;height:96px;margin-bottom:20px;">
            <h2 style="margin:0;padding:0 20px;font-size:24px;">${message}</h2>
            <p style="margin-top:10px;font-size:16px;opacity:.8;">Serás redirigido en unos segundos...</p>`;
        document.body.appendChild(overlay);
    }

    function stopTracking() {
        if (watchId && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
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

    // Haversine local (este archivo no usa la librería Google geometry)
    function distMeters(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 +
                  Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
                  Math.sin(dLng/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // ── Inicialización de sesión ──────────────────────────────────────────────

    try {
        currentRoute = JSON.parse(sessionStorage.getItem('currentRoute'));
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
    // 🔧 FIX: Driver.js usa 'nombre', no 'name'
    if (driverNameEl) driverNameEl.textContent = currentDriver?.nombre || currentDriver?.name || '—';
    updateStatusUI(currentRoute.status || currentRoute.estado);

    // ── Mapa ─────────────────────────────────────────────────────────────────

    function initMap() {
        if (!currentRoute) return;

        // 🔧 FIX: los datos de ubicación están en currentRoute.trayecto,
        //    NO en currentRoute.origin / currentRoute.waypoints directamente
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

        if (currentRoute.isTraceFree && trayecto.origin && trayecto.destination) {
            // ── Sin trazo: solo inicio y fin ────────────────────────────────
            const sm = new google.maps.Marker({ position: trayecto.origin,      map, title: 'Inicio', icon: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' });
            const em = new google.maps.Marker({ position: trayecto.destination, map, title: 'Fin',    icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png'   });
            routeBounds.extend(sm.getPosition());
            routeBounds.extend(em.getPosition());

        } else if (trayecto.waypoints && trayecto.waypoints.length > 0) {
            // ── Con trayecto: dibujar línea gris ────────────────────────────
            // 🔧 FIX: waypoints están en trayecto.waypoints
            const pathCoords = trayecto.waypoints.map(wp => new google.maps.LatLng(wp.lat, wp.lng));

            new google.maps.Polyline({
                path: pathCoords,
                geodesic: true,
                strokeColor: '#808080',
                strokeOpacity: 0.8,
                strokeWeight: 5,
                map: map
            });

            pathCoords.forEach(c => routeBounds.extend(c));

            if (pathCoords.length > 0) {
                new google.maps.Marker({ position: pathCoords[0],                   map, title: 'Inicio', icon: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' });
                new google.maps.Marker({ position: pathCoords[pathCoords.length-1], map, title: 'Fin',    icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png'   });
            }
        }

        if (!routeBounds.isEmpty()) map.fitBounds(routeBounds, 50);

        map.addListener('dragstart', () => {
            isAutoPanActive = false;
            if (fab) fab.classList.add('inactive');
            showToast('Auto-enfoque desactivado. Presiona 📍 para reactivar.', 2500);
        });

        // 🔧 FIX: NO llamamos startTracking() aquí para evitar doble registro.
        //    window.initMap (abajo) es el único punto de arranque.
    }

    // ── Sockets ───────────────────────────────────────────────────────────────

    socket.on('connect', () => {
        showToast('Conectado al servidor');
        socket.emit('joinRoute', {
            routeId:  currentRoute.id,
            // 🔧 FIX: _id de MongoDB, no el ID de empleado
            driverId: currentDriver?._id || currentDriver?.id || null
        });
    });

    // 🆕 Ruta iniciada por el admin
    socket.on('routeStarted', (data) => {
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

        const serverRouteId = String(payload.id || payload._id || payload.route?.id || payload.route?._id);
        const clientRouteId = String(currentRoute.id || currentRoute._id);

        if (serverRouteId !== clientRouteId) return;

        const routeData   = payload.route || payload;
        const nuevoEstado = payload.estado || routeData.estado || payload.status || routeData.status;

        currentRoute = Object.assign({}, currentRoute, routeData);

        if (nuevoEstado) {
            currentRoute.estado = nuevoEstado;
            updateStatusUI(nuevoEstado);
            showToast(`Estado: ${nuevoEstado}`);
            if (nuevoEstado === 'finalizada' || nuevoEstado === 'completed')
                handleFinalization();
        }
    });

    // 🆕 Orden directa de finalización
    socket.on('routeFinalized', () => {
        console.log('🏁 routeFinalized recibido del admin');
        handleFinalization();
    });

    // ── Rastreo GPS ───────────────────────────────────────────────────────────

    function startTracking() {
        if (!('geolocation' in navigator)) {
            showToast('GPS no disponible.', 3000);
            return;
        }

        // 🔧 FIX: leer waypoints desde trayecto para la detección de desvíos
        const trayecto = currentRoute.trayecto || {};
        const waypoints = trayecto.waypoints || [];

        watchId = navigator.geolocation.watchPosition((pos) => {
            const { latitude: lat, longitude: lng, accuracy } = pos.coords;
            const currentPosition = new google.maps.LatLng(lat, lng);

            if (coordsEl) coordsEl.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)} (±${Math.round(accuracy)} m)`;

            if (!driverMarker) {
                driverMarker = new google.maps.Marker({
                    position: currentPosition,
                    map: map,
                    title: 'Tu posición',
                    icon: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png'
                });
            } else {
                driverMarker.setPosition(currentPosition);
            }

            if (isAutoPanActive && map) map.panTo(currentPosition);

            // Detección de desvío usando waypoints del trayecto
            let minDistance = Infinity;
            if (waypoints.length > 0) {
                waypoints.forEach(wp => {
                    const d = distMeters(lat, lng, wp.lat, wp.lng);
                    if (d < minDistance) minDistance = d;
                });
            } else if (trayecto.origin && trayecto.destination) {
                minDistance = Math.min(
                    distMeters(lat, lng, trayecto.origin.lat,      trayecto.origin.lng),
                    distMeters(lat, lng, trayecto.destination.lat, trayecto.destination.lng)
                );
            }
            const isOffRoute = minDistance > DEVIATION_TOLERANCE;

            // 🔧 FIX: driverId con _id de MongoDB
            socket.emit('driverLocation', {
                lat, lng, accuracy, isOffRoute,
                timestamp: pos.timestamp || Date.now(),
                driverId:  currentDriver?._id || currentDriver?.id || null,
                routeId:   currentRoute.id
            });

            // Dibujar segmento de progreso
            if (!lastDrawnPosition) { lastDrawnPosition = currentPosition; return; }

            const distFromLast = distMeters(
                lastDrawnPosition.lat(), lastDrawnPosition.lng(), lat, lng
            );
            if (distFromLast < MOVEMENT_THRESHOLD) return;

            const segmentColor = isOffRoute ? '#e74c3c' : (currentRoute.color || '#f357a1');
            progressPolylines.push(new google.maps.Polyline({
                path: [lastDrawnPosition, currentPosition],
                geodesic: true,
                strokeColor: segmentColor,
                strokeOpacity: 0.9,
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
    if (btnZoom)   btnZoom.addEventListener('click',   () => map && !routeBounds.isEmpty() && map.fitBounds(routeBounds, 50));

    if (fab) {
        fab.addEventListener('click', () => {
            if (driverMarker && map) {
                map.panTo(driverMarker.getPosition());
                isAutoPanActive = true;
                fab.classList.remove('inactive');
                showToast('Auto-enfoque reactivado.', 1500);
            }
        });
    }

    if (btnFinishRoute) {
        btnFinishRoute.addEventListener('click', () => {
            if (confirm('¿Seguro que quieres solicitar la finalización?')) {
                socket.emit('requestFinishRoute', {
                    routeId:   currentRoute.id,
                    driverId:  currentDriver?._id || currentDriver?.id || null,
                    routeName: currentRoute.name
                });
                showToast('Solicitud enviada al administrador.');
                btnFinishRoute.disabled = true;
            }
        });
    }

    // ── window.initMap ────────────────────────────────────────────────────────
    window.initMap = function () {
        initMap();
        try { startTracking(); } catch (e) { console.error('Error iniciando tracking:', e); }
    };

})();