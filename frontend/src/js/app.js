import '../css/styles.css'; // <-- VITE HARÁ LA MAGIA CON ESTO

import { initSidebar, updateProfileCard } from './modules/ui/sidebar.js';
import { getCurrentUser, getLicenseData, checkAuth } from './modules/services/auth.js';
import { initMapModule } from './modules/map/map.js';
import { initSocket } from './modules/services/socket.js';
import { updateKPIs } from './modules/ui/ui.js';


// ==========================================
// 1. LÓGICA GLOBAL DEL SHELL (Cáscara)
// Se ejecuta inmediatamente al cargar index.html
// ==========================================
console.log('🚀 NumaTracking Core Inicializado');

if (checkAuth()) {
    initSidebar();
    
    // ¡Esto arregla la licencia! Se ejecuta sin esperar el DOMContentLoaded
    // porque el script es de tipo module y carga diferido de forma nativa.
    const user = getCurrentUser();
    const license = getLicenseData();
    updateProfileCard(user, license);
}

// ==========================================
// 2. LÓGICA DE LA VISTA (Dashboard)
// Es llamado por router.js cuando navegamos a "/"
// ==========================================
export function init() {
    console.log('🗺️ Módulo Dashboard/Mapa iniciado');
    
    if (document.getElementById('draw-map')) {
        const checkGoogle = setInterval(() => {
            if (window.google && window.google.maps) {
                clearInterval(checkGoogle);
                initMapModule(); 
                initSocket();    
                updateKPIs();    
            }
        }, 100);
    }
}