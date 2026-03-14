import { api } from '../services/api.js';
import { SignUpUI } from '../ui/signUp.ui.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Sign Up Module Loaded');
    
    // Inicializar listeners de UI (iconos de ojos, etc.)
    SignUpUI.initEvents();

    const form = document.getElementById('register-form');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            // 1. Obtener datos
            const formData = SignUpUI.getFormData();

            // 2. Validar
            if (!SignUpUI.validate(formData)) return;

            try {
                // 3. UI Loading
                SignUpUI.setLoading(true);

                // 4. Llamada a la API
                // Nota: formData tiene 'confirmPassword', pero al backend solo mandamos lo necesario
                const payload = {
                    nombre: formData.nombre,
                    email: formData.email,
                    password: formData.password,
                    empresa: formData.empresa,
                    telefono: formData.telefono
                };

                const response = await api.register(payload);

                // 5. Éxito
                SignUpUI.showSuccess('¡Cuenta creada con éxito! Redirigiendo...');
                
                // Opcional: Auto-login aquí si el register devuelve token, 
                // o redirigir al login para que ingresen manual.
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, 2000);

            } catch (error) {
                // 6. Manejo de Errores
                console.error(error);
                SignUpUI.showError(error.message || 'Error al conectar con el servidor');
            } finally {
                SignUpUI.setLoading(false);
            }
        });
    }
});