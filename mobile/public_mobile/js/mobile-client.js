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
    let currentRoute      = null;
    let currentDriver     = null;
    let map               = null;
    let driverMarker      = null;
    let progressPolylines = [];
    let lastDrawnPosition = null;
    let watchId           = null;
    let isAutoPanActive   = true;
    let routeBounds       = null;
    let decodedRoutePath  = []; // puntos del encodedPolyline para detección de desvíos

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
            <img src="/img/logo.png" alt="Finalización" style="width:96px;height:96px;margin-bottom:20px;">
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

    function handleCancellation() {
        stopTracking();
        showFinalizationOverlay('La ruta ha sido cancelada. Contacta con el administrador.');
        setTimeout(() => {
            sessionStorage.clear();
            window.location.href = 'mobile-login.html';
        }, 4500);
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

    // Haversine local — no depende de Google geometry
    function distMeters(lat1, lng1, lat2, lng2) {
        const R    = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a    = Math.sin(dLat/2)**2 +
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
    if (driverNameEl) driverNameEl.textContent = currentDriver?.nombre || currentDriver?.name || '—';
    updateStatusUI(currentRoute.status || currentRoute.estado);

    // ── Mapa ──────────────────────────────────────────────────────────────────

    function initMap() {
        if (!currentRoute) return;

        const trayecto = currentRoute.trayecto || {};

        const initialCenter = trayecto.origin
            ? { lat: trayecto.origin.lat, lng: trayecto.origin.lng }
            : { lat: 19.7677724, lng: -104.3686507 };

        map = new google.maps.Map(document.getElementById('map'), {
            zoom:              16,
            center:            initialCenter,
            draggable:         true,
            fullscreenControl: false,
            mapTypeControl:    false,
            scaleControl:      true,
            streetViewControl: false,
            rotateControl:     false,
            zoomControl:       true
        });

        routeBounds = new google.maps.LatLngBounds();

        // Helper: ícono de círculo coloreado
        const ico = (fillColor, scale = 7) => ({
            path:         google.maps.SymbolPath.CIRCLE,
            scale,
            fillColor,
            fillOpacity:  1,
            strokeWeight: 2,
            strokeColor:  '#FFFFFF'
        });

        // ── A) encodedPolyline → trazo exacto (línea punteada oscura) ─────
        // SIEMPRE usar encodedPolyline si existe — es el trazo real guardado.
        // Nunca usar DirectionsService aquí para evitar que Google reemplace
        // la ruta planeada por la óptima calculada en tiempo real.
        if (trayecto.encodedPolyline && google.maps.geometry?.encoding) {
            decodedRoutePath = google.maps.geometry.encoding.decodePath(
                trayecto.encodedPolyline
            );

            new google.maps.Polyline({
                path:          decodedRoutePath,
                geodesic:      true,
                strokeColor:   '#0f1724',
                strokeOpacity: 0,
                strokeWeight:  4,
                icons: [{
                    icon: {
                        path:          'M 0,-1 0,1',
                        strokeOpacity: 0.85,
                        strokeWeight:  3,
                        strokeColor:   '#0f1724',
                        scale:         4
                    },
                    offset: '0',
                    repeat: '16px'
                }],
                map
            });

            decodedRoutePath.forEach(c => routeBounds.extend(c));
        }

        // ── B) Marcador INICIO ────────────────────────────────────────────
        if (trayecto.origin) {
            new google.maps.Marker({
                position: { lat: trayecto.origin.lat, lng: trayecto.origin.lng },
                map,
                title:  'Inicio',
                icon:   ico('#4CAF50'),
                zIndex: 5
            });
            routeBounds.extend(
                new google.maps.LatLng(trayecto.origin.lat, trayecto.origin.lng)
            );
        }

        // ── C) Marcador DESTINO ───────────────────────────────────────────
        if (trayecto.destination) {
            new google.maps.Marker({
                position: { lat: trayecto.destination.lat, lng: trayecto.destination.lng },
                map,
                title:  'Destino',
                icon:   ico('#F44336'),
                zIndex: 5
            });
            routeBounds.extend(
                new google.maps.LatLng(trayecto.destination.lat, trayecto.destination.lng)
            );
        }

        // ── D) Marcadores PARADAS (waypoints) ─────────────────────────────
        (trayecto.waypoints || []).forEach((wp, i) => {
            new google.maps.Marker({
                position: { lat: wp.lat, lng: wp.lng },
                map,
                title:  `Parada ${i + 1}`,
                icon:   ico('#FFC107', 5),
                zIndex: 4
            });
            routeBounds.extend(new google.maps.LatLng(wp.lat, wp.lng));
        });

        if (!routeBounds.isEmpty()) map.fitBounds(routeBounds, 50);

        map.addListener('dragstart', () => {
            isAutoPanActive = false;
            if (fab) fab.classList.add('inactive');
            showToast('Auto-enfoque desactivado. Presiona 📍 para reactivar.', 2500);
        });
    }

    // ── Sockets ───────────────────────────────────────────────────────────────

    socket.on('connect', () => {
        showToast('Conectado al servidor');
        socket.emit('joinRoute', {
            routeId:  currentRoute.id,
            driverId: currentDriver?._id || currentDriver?.id || null
        });
    });

    socket.on('disconnect', () => {
        if (routeStatusEl) routeStatusEl.textContent = 'Sin conexión';
    });

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

    socket.on('routeStatusChanged', (payload) => {
        if (!payload || !currentRoute) return;

        const serverRouteId = String(
            payload.routeId || payload.id || payload._id ||
            payload.route?.id || payload.route?._id
        );
        const clientRouteId = String(currentRoute.id || currentRoute._id);
        if (serverRouteId !== clientRouteId) return;

        const routeData   = payload.route || payload;
        const nuevoEstado = payload.estado || routeData.estado || payload.status || routeData.status;

        currentRoute = Object.assign({}, currentRoute, routeData);

        if (nuevoEstado) {
            currentRoute.estado = nuevoEstado;
            updateStatusUI(nuevoEstado);

            if (nuevoEstado === 'finalizada' || nuevoEstado === 'completed') {
                handleFinalization();
            } else if (nuevoEstado === 'cancelada' || nuevoEstado === 'cancelled') {
                handleCancellation();
            } else {
                showToast(`Estado: ${nuevoEstado}`);
            }
        }
    });

    socket.on('routeFinalized', () => handleFinalization());

    // ── Rastreo GPS ───────────────────────────────────────────────────────────

    function startTracking() {
        if (!('geolocation' in navigator)) {
            showToast('GPS no disponible.', 3000);
            return;
        }

        const trayecto  = currentRoute.trayecto || {};
        const waypoints = trayecto.waypoints    || [];

        watchId = navigator.geolocation.watchPosition((pos) => {
            const { latitude: lat, longitude: lng, accuracy, heading } = pos.coords;
            const currentPosition = new google.maps.LatLng(lat, lng);

            if (coordsEl) coordsEl.textContent =
                `${lat.toFixed(6)}, ${lng.toFixed(6)} (±${Math.round(accuracy)} m)`;

            // Marcador del vehículo con flecha direccional
            if (!driverMarker) {
                driverMarker = new google.maps.Marker({
                    position: currentPosition,
                    map,
                    title: 'Tu posición',
                    icon: {
                        path:         google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                        scale:        5,
                        fillColor:    '#4285F4',
                        fillOpacity:  1,
                        strokeWeight: 2,
                        strokeColor:  '#FFFFFF',
                        rotation:     heading || 0
                    },
                    zIndex: 10
                });
            } else {
                driverMarker.setPosition(currentPosition);
                if (heading !== null && !isNaN(heading)) {
                    const icon    = driverMarker.getIcon();
                    icon.rotation = heading;
                    driverMarker.setIcon(icon);
                }
            }

            if (isAutoPanActive && map) map.panTo(currentPosition);

            // Detección de desvío
            // Preferimos decodedRoutePath (denso) sobre waypoints individuales
            let minDistance = Infinity;
            if (decodedRoutePath.length > 0) {
                decodedRoutePath.forEach(point => {
                    const d = distMeters(lat, lng, point.lat(), point.lng());
                    if (d < minDistance) minDistance = d;
                });
            } else if (waypoints.length > 0) {
                waypoints.forEach(wp => {
                    const d = distMeters(lat, lng, wp.lat, wp.lng);
                    if (d < minDistance) minDistance = d;
                });
            } else if (trayecto.origin) {
                minDistance = distMeters(lat, lng, trayecto.origin.lat, trayecto.origin.lng);
            }
            const isOffRoute = minDistance > DEVIATION_TOLERANCE;

            socket.emit('driverLocation', {
                lat, lng, accuracy,
                speed:     pos.coords.speed || null,
                heading:   heading          || null,
                isOffRoute,
                timestamp: pos.timestamp    || Date.now(),
                driverId:  currentDriver?._id || currentDriver?.id || null,
                routeId:   currentRoute.id
            });

            // Dibujar segmento de progreso (azul normal, rojo si desvío)
            if (!lastDrawnPosition) {
                lastDrawnPosition = currentPosition;
                return;
            }

            const distFromLast = distMeters(
                lastDrawnPosition.lat(), lastDrawnPosition.lng(), lat, lng
            );
            if (distFromLast < MOVEMENT_THRESHOLD) return;

            const segmentColor = isOffRoute ? '#e74c3c' : '#1A73E8';
            progressPolylines.push(new google.maps.Polyline({
                path:          [lastDrawnPosition, currentPosition],
                geodesic:      true,
                strokeColor:   segmentColor,
                strokeOpacity: 0.9,
                strokeWeight:  6,
                map
            }));
            lastDrawnPosition = currentPosition;

        }, (err) => {
            console.error('GPS error:', err);
            showToast('Error de GPS: ' + err.message, 1800);
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
    }

    // ── Botones ───────────────────────────────────────────────────────────────

    if (btnCenter) btnCenter.addEventListener('click', () => {
        if (driverMarker && map) map.panTo(driverMarker.getPosition());
    });
    if (btnZoom) btnZoom.addEventListener('click', () => {
        if (map && routeBounds && !routeBounds.isEmpty()) map.fitBounds(routeBounds, 50);
    });

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
        let _finishRequested = false; // evita doble disparo
        btnFinishRoute.addEventListener('click', () => {
            if (_finishRequested) return;

            // Modal de confirmación inline (evita el doble confirm() nativo)
            const confirmed = window.confirm('¿Seguro que quieres solicitar la finalización?');
            if (!confirmed) return;

            _finishRequested = true;
            btnFinishRoute.disabled = true;

            socket.emit('requestFinishRoute', {
                routeId:   currentRoute.id,
                driverId:  currentDriver?._id || currentDriver?.id || null,
                routeName: currentRoute.name
            });
            showToast('Solicitud enviada al administrador.', 3000);
        });
    }

    // ── window.initMap — único punto de arranque ──────────────────────────────
    window.initMap = function () {
        initMap();
        try { startTracking(); } catch (e) { console.error('Error iniciando tracking:', e); }
    };

})();