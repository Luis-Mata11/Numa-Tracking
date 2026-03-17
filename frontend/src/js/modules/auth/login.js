// 👇 IMPORTANTE: Usamos llaves { } porque en api.js usamos "export const"
import { api } from '../services/api.js'; 

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Login Module Loaded');

  const token = sessionStorage.getItem('numa_token');
    if (token) {
        // Si hay token de sesión, redirigimos
        window.location.href = 'index.html';
        return;
    }
    const form = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginButton = document.getElementById('btn-login');
    const errorMsg = document.getElementById('error-msg');

    // UI Helpers
    const showMsg = (msg, type = 'error') => {
        if (!errorMsg) return;
        errorMsg.style.display = 'block';
        errorMsg.className = `error show ${type === 'success' ? 'success-message' : 'error-message'}`;
        errorMsg.textContent = msg;
    };

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = emailInput.value.trim();
            const password = passwordInput.value.trim();

            if (!email || !password) return showMsg('Completa todos los campos');

            try {
                loginButton.disabled = true;
                loginButton.textContent = 'Verificando...';

                // Llamada a la API
                const data = await api.login(email, password);

                showMsg('¡Bienvenido!', 'success');

                // Guardar TenantId si existe
                if (data.user?.tenantId) {
                    localStorage.setItem('numa_licencia', data.user.tenantId);
                }

                // 👇 ¡AQUÍ ESTÁ LA LÍNEA MÁGICA QUE FALTA! 👇
                sessionStorage.setItem('numa_token', data.token);

                setTimeout(() => window.location.href = 'index.html', 1000);

            } catch (error) {
                showMsg(error.message || 'Error de conexión');
                loginButton.disabled = false;
                loginButton.textContent = 'Entrar';
            }
        });
    }
});
