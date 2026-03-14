export const SignUpUI = {
    // Selectores cacheados
    form: document.getElementById('register-form'),
    btnRegister: document.getElementById('btn-register'),
    errorMsg: document.getElementById('error-msg'),
    pwToggles: document.querySelectorAll('.icon-btn'), // Botones de ojo

    // 1. Obtener y formatear datos del formulario
    getFormData() {
        const nombres = document.getElementById('nombres').value.trim();
        const apellidos = document.getElementById('apellidos').value.trim();
        
        return {
            // Concatenamos para enviar un solo campo "nombre" al backend
            nombre: `${nombres} ${apellidos}`.trim(),
            empresa: document.getElementById('empresa').value.trim(),
            telefono: document.getElementById('telefono').value.trim(),
            email: document.getElementById('email').value.trim(),
            password: document.getElementById('contrasena').value,
            confirmPassword: document.getElementById('confirmar_contrasena').value
        };
    },

    // 2. Validaciones visuales básicas
    validate(data) {
        if (!data.nombre || !data.empresa || !data.email || !data.password) {
            this.showError('Por favor completa todos los campos requeridos.');
            return false;
        }
        if (data.password.length < 8) {
            this.showError('La contraseña debe tener al menos 8 caracteres.');
            return false;
        }
        if (data.password !== data.confirmPassword) {
            this.showError('Las contraseñas no coinciden.');
            return false;
        }
        return true;
    },

    // 3. Manejo de estado de carga
    setLoading(isLoading) {
        if (isLoading) {
            this.btnRegister.disabled = true;
            this.btnRegister.textContent = 'Creando cuenta...';
            this.errorMsg.style.display = 'none';
        } else {
            this.btnRegister.disabled = false;
            this.btnRegister.textContent = 'Crear mi cuenta trial (15 días)';
        }
    },

    // 4. Mostrar mensajes
    showError(msg) {
        this.errorMsg.style.display = 'block';
        this.errorMsg.className = 'error show error-message'; // Asegúrate que tu CSS tenga estas clases
        this.errorMsg.textContent = msg;
    },

    showSuccess(msg) {
        this.errorMsg.style.display = 'block';
        this.errorMsg.className = 'error show success-message'; // Clase verde en tu CSS
        this.errorMsg.textContent = msg;
    },

    // 5. Inicializar eventos de UI (como ver contraseña)
    initEvents() {
        this.pwToggles.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Buscar el input hermano anterior
                const input = e.currentTarget.previousElementSibling;
                const icon = e.currentTarget.querySelector('i');
                
                if (input.type === "password") {
                    input.type = "text";
                    icon.classList.remove('fa-eye-slash');
                    icon.classList.add('fa-eye');
                } else {
                    input.type = "password";
                    icon.classList.remove('fa-eye');
                    icon.classList.add('fa-eye-slash');
                }
            });
        });
    }
};