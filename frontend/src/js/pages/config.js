document.addEventListener('DOMContentLoaded', () => {
    // --- Variables Globales ---
    let map;
    let marker;
    // Coordenadas por defecto (fallback)
    const defaultCoords = [19.7677724, -104.3686507]; 
    
    // --- Referencias al DOM ---
    const latInput = document.getElementById('base-lat');
    const lngInput = document.getElementById('base-lng');
    const addressInput = document.getElementById('base-address');
    const nameInput = document.getElementById('base-name');
    const form = document.getElementById('form-base-config');
    const btnGeo = document.getElementById('btn-detect-location');
    const btnSave = document.getElementById('btn-save-base');

    // --- 1. Función Principal: Inicializar Mapa y Datos ---
    async function initConfigMap() {
        let startCoords = defaultCoords;
        
        // A. Obtener configuración actual del servidor
        try {
            const res = await fetch('/api/admin/config');
            if (res.ok) {
                const config = await res.json();
                
                // Si el servidor devuelve lat/lng válidos, los usamos
                if (config && config.lat && config.lng) {
                    startCoords = [config.lat, config.lng];
                    
                    // Llenar el formulario visualmente
                    latInput.value = config.lat;
                    lngInput.value = config.lng;
                    nameInput.value = config.name || '';
                    addressInput.value = config.address || '';
                }
            }
        } catch (err) {
            console.warn("No se pudo cargar la configuración remota. Usando valores por defecto.", err);
        }


        const logoutButton = document.querySelector('a[href="#sing-out"]');

    if (logoutButton) {
        // 2. Agrega un "escuchador" de clics
        logoutButton.addEventListener('click', async (event) => {
            // Previene que el navegador salte al hash #sing-out
            event.preventDefault();

            // --- INICIO DEL CAMBIO ---
            // 3. Muestra la confirmación nativa
            const wantsToLogout = window.confirm("¿Estás seguro de que deseas cerrar la sesión?");

            // 4. Solo continúa si el usuario hizo clic en "Aceptar"
            if (wantsToLogout) {
                try {
                    // 5. Envía la petición POST a tu API
                    const response = await fetch(`${API_URL}/admin/logout`, {
                        method: 'POST'
                    });

                    if (response.ok) {
                        // 6. Si el servidor dice OK, redirige al login
                        console.log('Sesión cerrada exitosamente.');
                        window.location.href = 'login.html';
                    } else {
                        // Maneja un posible error del servidor
                        alert('Error al intentar cerrar la sesión.');
                    }
                } catch (error) {
                    // Maneja errores de red
                    console.error('Error de red:', error);
                    alert('Error de red al intentar cerrar la sesión.');
                }
            }
            // Si el usuario presiona "Cancelar", no se hace nada.
            // --- FIN DEL CAMBIO ---
        });
    }
        // B. Renderizar el Mapa (Leaflet)
        map = L.map('base-map').setView(startCoords, 15);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        // C. Configurar Marcador (Icono Rojo)
        const redIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });

        marker = L.marker(startCoords, {
            draggable: true,
            icon: redIcon
        }).addTo(map);

        // D. Eventos del Mapa
        // Al arrastrar el marcador
        marker.on('dragend', function (e) {
            const pos = marker.getLatLng();
            updateInputs(pos.lat, pos.lng);
        });

        // Al hacer click en cualquier parte del mapa
        map.on('click', function (e) {
            marker.setLatLng(e.latlng);
            updateInputs(e.latlng.lat, e.latlng.lng);
        });
        
        // Asegurar que los inputs tengan valor inicial
        if (!latInput.value) updateInputs(startCoords[0], startCoords[1]);
    }

    // Función auxiliar para actualizar los inputs de texto
    function updateInputs(lat, lng) {
        latInput.value = lat.toFixed(7);
        lngInput.value = lng.toFixed(7);
    }

    // --- 2. Botón: "Usar mi ubicación actual" ---
    if (btnGeo) {
        btnGeo.addEventListener('click', () => {
            if ('geolocation' in navigator) {
                document.body.style.cursor = 'wait'; // Feedback visual
                
                navigator.geolocation.getCurrentPosition((pos) => {
                    const { latitude, longitude } = pos.coords;
                    const newLatLng = new L.LatLng(latitude, longitude);
                    
                    marker.setLatLng(newLatLng);
                    map.setView(newLatLng, 16);
                    updateInputs(latitude, longitude);
                    
                    document.body.style.cursor = 'default';
                }, (err) => {
                    console.error(err);
                    document.body.style.cursor = 'default';
                    alert('No se pudo obtener tu ubicación. Verifica los permisos del navegador.');
                });
            } else {
                alert('Tu navegador no soporta geolocalización.');
            }
        });
    }

    // --- 3. Guardar Configuración (PUT al Servidor) ---
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const payload = {
                name: nameInput.value,
                address: addressInput.value,
                lat: parseFloat(latInput.value),
                lng: parseFloat(lngInput.value)
            };

            if (isNaN(payload.lat) || isNaN(payload.lng)) {
                alert('Por favor selecciona una ubicación válida en el mapa.');
                return;
            }

            // Feedback de carga en el botón
            const originalText = btnSave.innerHTML;
            btnSave.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Guardando...';
            btnSave.disabled = true;

            try {
                const res = await fetch('/api/admin/config', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    // Guardar también en localStorage por si acaso queremos acceso ultra rápido offline
                    localStorage.setItem('numa_base_config', JSON.stringify(payload));
                    alert('✅ Base operativa guardada correctamente.');
                } else {
                    const errorData = await res.json();
                    alert('Error al guardar: ' + (errorData.error || 'Error desconocido'));
                }
            } catch (err) {
                console.error(err);
                alert('Error de conexión con el servidor.');
            } finally {
                btnSave.innerHTML = originalText;
                btnSave.disabled = false;
            }
        });
    }

    // --- 4. Lógica de Pestañas (Tabs) ---
    const menuItems = document.querySelectorAll('.settings-item');
    const views = document.querySelectorAll('.settings-view');

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            // 1. Quitar clase active de todos
            menuItems.forEach(i => i.classList.remove('active'));
            views.forEach(v => {
                v.classList.remove('active');
                v.classList.add('hidden');
            });

            // 2. Activar el seleccionado
            item.classList.add('active');
            const targetId = item.getAttribute('data-target'); // 'base' o 'servicios'
            const targetView = document.getElementById(`view-${targetId}`);
            
            if (targetView) {
                targetView.classList.remove('hidden');
                targetView.classList.add('active');
                
                // Hack para Leaflet: Si el mapa estaba oculto, necesita recalcular su tamaño
                if (targetId === 'base' && map) {
                    setTimeout(() => map.invalidateSize(), 200);
                }
            }
        });
    });

    // Iniciar todo
    initConfigMap();
});