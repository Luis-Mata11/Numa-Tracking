// js/ui/list.ui.js
import { escapeHtml } from '../utils/helpers.js';
import { showRouteDetailUI } from './detail.ui.js';

const normalizeRoute = (route) => route;

export function renderRoutes(routes) {
    const routeItemsContainer = document.getElementById('route-items');
    if (!routeItemsContainer) return;
    routeItemsContainer.innerHTML = '';
    
    // 1. Mensaje de estado vacío mejorado para los filtros
    if (!Array.isArray(routes) || routes.length === 0) {
        routeItemsContainer.innerHTML = `
            <li class="empty" style="padding: 30px 15px; text-align: center; color: #888;">
                <i class="fa-solid fa-route" style="font-size: 2rem; margin-bottom: 10px; opacity: 0.5;"></i>
                <br>No se encontraron rutas con estos filtros
            </li>`;
        return;
    }

    routes.forEach(raw => {
        const r = normalizeRoute(raw);
        const li = document.createElement('li');
        li.className = 'route-item';
        
        // Usamos _id (Mongo) o id por si acaso
        li.dataset.id = r._id || r.id; 

        // Extraemos los valores de los objetos
        const driverName = r.driver ? (r.driver.nombre || r.driver) : 'Sin chofer';
        const vehicleName = r.vehicle ? (r.vehicle.alias || r.vehicle.placa || r.vehicle) : 'Sin vehículo';
        
        // 2. Extraemos y normalizamos a minúsculas
        let rawStatus = (r.estado || r.status || 'pendiente').toLowerCase().trim();
        
        // 🔥 NUEVO: Traducción / Normalización de estados en inglés a español
        if (rawStatus === 'pending') rawStatus = 'pendiente';
        else if (rawStatus === 'active') rawStatus = 'activa';
        else if (rawStatus === 'completed' || rawStatus === 'finished') rawStatus = 'finalizada';
        else if (rawStatus === 'cancelled' || rawStatus === 'canceled') rawStatus = 'cancelada';
        
        // 3. Le damos color a la etiqueta según el estado normalizado
        let badgeBg = '#e0e0e0'; 
        let badgeColor = '#333';
        
        if (rawStatus === 'activa') { 
            badgeBg = '#dcfce7'; badgeColor = '#166534'; // Verde
        } else if (rawStatus === 'pendiente') { 
            badgeBg = '#dbdbdb'; badgeColor = '#000000'; // Amarillo
        } else if (rawStatus === 'finalizada') { 
            badgeBg = '#e0e8f9'; badgeColor = '#1e40af'; // Azul
        } else if (rawStatus === 'cancelada') { 
            badgeBg = '#fee2e2'; badgeColor = '#991b1b'; // Rojo
        }

        // Capitalizamos la primera letra para que se vea bonito en UI (Ej: "Pendiente")
        const displayStatus = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);

        // 4. Inyectamos los datos reales en el HTML
        li.innerHTML = `
            <div class="route-bullet" style="background-color: ${escapeHtml(r.color || '#ccc')};">
                <i class="fa-solid fa-route"></i>
            </div>
            <div class="route-meta">
                <h3>${escapeHtml(r.name || 'Ruta sin nombre')}</h3>
                <small>${escapeHtml(driverName)} • ${escapeHtml(vehicleName)}</small>
                <div style="margin-top: 6px;">
                    <span class="status-badge" style="font-size: 0.75rem; background: ${badgeBg}; padding: 3px 8px; border-radius: 12px; color: ${badgeColor}; font-weight: 600;">
                        ${escapeHtml(displayStatus)}
                    </span>
                </div>
            </div>
        `;

        li.addEventListener('click', () => {
            document.querySelectorAll('.route-item').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            
            const newRoutePanel = document.getElementById('new-route-panel');
            if (newRoutePanel) newRoutePanel.classList.remove('open');

            showRouteDetailUI(raw);
        });

        routeItemsContainer.appendChild(li);
    });
}