// frontend/src/js/modules/auth/guard.js

/**
 * Este archivo se importa al principio de CUALQUIER página privada (index, choferes, etc).
 * Su único trabajo es verificar si tienes permiso para estar aquí.
 */

(function() {
    const token = sessionStorage.getItem('numa_token');

    if (!token) {
        console.warn('⛔ Acceso denegado: No hay sesión activa.');
        window.location.href = '/login.html';
    } else {
        console.log('✅ Sesión verificada');
        // Opcional: Aquí podrías verificar si el token expiró decodificándolo
    }
})();