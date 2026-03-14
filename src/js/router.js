const navigateTo = url => {
    history.pushState(null, null, url);
    router();
};

const router = async () => {
    // 👇 CAMBIO CLAVE: Usamos import() dinámico. 
    // El ?raw le dice a Vite "tráeme este HTML como texto puro".
    const routes = [
        { 
            path: "/", 
            view: () => import("/src/views/dashboard.html?raw"), 
            module: () => import("/src/js/pages/dashboard.js") 
        },
        { 
            path: "/rutas", 
            view: () => import("/src/views/routes.html?raw"), 
            module: () => import("/src/js/pages/routesView.js") 
        },
        { 
            path: "/choferes", 
            view: () => import("/src/views/drivers.html?raw"), 
            module: () => import("/src/js/pages/drivers.js") 
        },
        { 
            path: "/vehiculos", 
            view: () => import("/src/views/vehicles.html?raw"), 
            module: () => import("/src/js/pages/vehicles.js") 
        },
        { 
            path: "/reportes", 
            view: () => import("/src/views/reports.html?raw"), 
            module: () => import("/src/js/pages/reports.js") 
        },
        { 
            path: "/settings", 
            view: () => import("/src/views/settings.html?raw"), 
            module: () => import("/src/js/pages/settings.js") 
        }
    ];

    const potentialMatches = routes.map(route => {
        return {
            route: route,
            isMatch: location.pathname === route.path
        };
    });

    let match = potentialMatches.find(potentialMatch => potentialMatch.isMatch);

    if (!match) {
        match = { route: routes[0], isMatch: true };
    }

    document.querySelectorAll('#sidebar .sidebar-menu a').forEach(link => {
        // Quitamos la clase active de todos
        link.classList.remove('active');
        
        // Si el href del link coincide con la ruta actual, le ponemos la clase active
        if (link.getAttribute('href') === match.route.path) {
            link.classList.add('active');
        }
    });

    try {
        // 👇 CAMBIO CLAVE: Ejecutamos la función import() para obtener la vista
        const viewModule = await match.route.view();
        document.getElementById("app-content").innerHTML = viewModule.default;

        // 👇 CAMBIO CLAVE: Ejecutamos el import() para obtener el módulo JS
        if (match.route.module) {
            const pageModule = await match.route.module();
            if (pageModule.init) {
                pageModule.init(); 
            }
        }
    } catch (error) {
        console.error("Error cargando la vista o el módulo JS:", error);
    }
};

// Escuchar para navegar hacia atrás/adelante en el navegador
window.addEventListener("popstate", router);

// Interceptar todos los clics en el menú (que tengan data-link)
document.addEventListener("DOMContentLoaded", () => {
    document.body.addEventListener("click", e => {
        if (e.target.matches("[data-link]") || e.target.closest("[data-link]")) {
            e.preventDefault();
            const link = e.target.matches("[data-link]") ? e.target : e.target.closest("[data-link]");
            navigateTo(link.href);
        }
    });
    router(); // Cargar la vista inicial
});