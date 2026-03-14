// public/js/modules/services/auth.js

// 1. Obtener Usuario Actual
export const getCurrentUser = () => {
    const userStr = sessionStorage.getItem('numa_user');
    if (userStr) {
        try {
            return JSON.parse(userStr);
        } catch (e) {
            console.error("Error parsing user", e);
        }
    }
    return { nombre: "Usuario", email: "", tenantId: "N/A" };
};

// 2. Obtener Datos de Licencia (Leemos lo que guardó api.js)
// 2. Obtener Datos de Licencia
export const getLicenseData = () => {
    const infoStr = sessionStorage.getItem('numa_licencia_info');
    const user = getCurrentUser();

    if (infoStr) {
        try {
            const info = JSON.parse(infoStr);
            
            // 👇 LÓGICA ROBUSTA:
            // 1. Intentamos leer el plan.
            // 2. Si no existe, miramos si el estado es 'trial' y asumimos plan TRIAL.
            // 3. Si todo falla, ponemos 'BASIC'.
            let planName = info.plan;
            
            if (!planName || planName === "desconocido") {
                if (info.estado === 'trial') {
                    planName = 'TRIAL';
                } else {
                    planName = 'TRIAL'; // Valor por defecto ante la duda
                }
            }

            return {
                key: user.tenantId || "N/A",
                plan: planName.toUpperCase(), 
                diasRestantes: info.diasRestantes || 0,
                fechaFin: info.fechaFin,
                estado: info.estado // Pasamos también el estado por si acaso
            };
        } catch (e) {
            console.error("Error parsing license info", e);
        }
    }

    // Fallback si no hay info guardada
    return {
        key: user.tenantId || "FREE",
        plan: "TRIAL", // Asumimos Trial si no hay datos
        diasRestantes: 0
    };
};
// 3. Protección de Rutas
export const checkAuth = () => {
    const token = sessionStorage.getItem('numa_token');
    if (!token) {
        window.location.href = '/login.html';
        return false;
    }
    return true;
};

// 4. Cerrar Sesión
export const logout = () => {
    sessionStorage.clear();
    window.location.href = '/login.html';
};