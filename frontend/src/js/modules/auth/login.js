// src/js/modules/auth/login.js
import { api } from '../services/api.js';
import { showLoader, hideLoader } from '../../utils/loader.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Login Module Loaded');

    const token = sessionStorage.getItem('numa_token');
    if (token) {
        window.location.href = 'index.html';
        return;
    }

    const form          = document.getElementById('login-form');
    const emailInput    = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginButton   = document.getElementById('btn-login');
    const errorMsg      = document.getElementById('error-msg');
    const togglePw      = document.getElementById('toggle-pw');

    // ── Toggle de contraseña ──────────────────────────────────────────────────
    if (togglePw && passwordInput) {
        togglePw.addEventListener('click', () => {
            const isHidden = passwordInput.type === 'password';
            passwordInput.type = isHidden ? 'text' : 'password';

            const icon = togglePw.querySelector('i');
            if (icon) icon.className = isHidden ? 'fa fa-eye-slash' : 'fa fa-eye';

            // Clase visual: ojo azul cuando la contraseña está visible
            togglePw.classList.toggle('pw-visible', isHidden);
            togglePw.setAttribute('aria-label', isHidden ? 'Ocultar contraseña' : 'Mostrar contraseña');
        });
    }

    // ── Helpers de UI ─────────────────────────────────────────────────────────
    const showMsg = (msg, type = 'error') => {
        if (!errorMsg) return;
        errorMsg.style.display = 'block';
        errorMsg.className = `error show ${type === 'success' ? 'success-message' : 'error-message'}`;
        errorMsg.textContent = msg;
    };

    const hideMsg = () => {
        if (!errorMsg) return;
        errorMsg.style.display = 'none';
    };

    // ── Submit ────────────────────────────────────────────────────────────────
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideMsg();

            const email    = emailInput.value.trim();
            const password = passwordInput.value.trim();

            if (!email || !password) return showMsg('Completa todos los campos');

            try {
                // Mostrar loader y deshabilitar botón
                loginButton.disabled = true;
                showLoader();

                const data = await api.login(email, password);

                // Guardar sesión
                sessionStorage.setItem('numa_token', data.token);

                if (data.user?.tenantId) {
                    localStorage.setItem('numa_licencia', data.user.tenantId);
                }

                // Guardar licenciaInfo si viene en la respuesta
                if (data.licenciaInfo) {
                    sessionStorage.setItem('numa_licencia_info', JSON.stringify(data.licenciaInfo));
                }

                showMsg('¡Bienvenido!', 'success');

                setTimeout(() => {
                    hideLoader();
                    window.location.href = 'index.html';
                }, 800);

            } catch (error) {
                hideLoader();
                showMsg(error.message || 'Error de conexión');
                loginButton.disabled = false;
            }
        });
    }
});