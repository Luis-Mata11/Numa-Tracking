document.addEventListener('DOMContentLoaded', () => {
    const bell = document.getElementById('notification-bell');
    const dropdown = document.getElementById('notification-dropdown');
    const badge = document.getElementById('notif-badge');
    const markReadBtn = document.getElementById('mark-read-btn');
    const notifList = document.getElementById('notif-list');

    // 1. Mostrar/Ocultar el menú al hacer clic en la campana
    bell.addEventListener('click', (e) => {
        e.stopPropagation(); // Evita que el clic cierre el menú inmediatamente
        dropdown.classList.toggle('show');
    });

    // 2. Cerrar el menú si se hace clic en cualquier lugar fuera de él
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !bell.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });

    // 3. Marcar todas como leídas
    markReadBtn.addEventListener('click', () => {
        const unreadItems = notifList.querySelectorAll('.unread');
        unreadItems.forEach(item => {
            item.classList.remove('unread');
        });
        updateBadgeCount();
    });

    // 4. Función para actualizar el contador de la burbuja roja
    function updateBadgeCount() {
        const unreadCount = notifList.querySelectorAll('.unread').length;
        if (unreadCount > 0) {
            badge.textContent = unreadCount;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }

    // Inicializar el contador con el HTML estático que pusimos
    updateBadgeCount();

    // --------------------------------------------------------
    // UTILIDAD: Usa esta función en tu código de Socket.io 
    // para inyectar nuevas alertas en tiempo real.
    // --------------------------------------------------------
    window.addNotification = function(title, message, iconClass = "fa-solid fa-bell", color = "#3b82f6") {
        const newItem = document.createElement('div');
        newItem.classList.add('notif-item', 'unread');
        
        newItem.innerHTML = `
            <i class="${iconClass}" style="color: ${color};"></i>
            <div class="notif-content">
                <p><strong>${title}:</strong> ${message}</p>
                <small>Ahora mismo</small>
            </div>
        `;

        // Insertar al principio de la lista
        notifList.prepend(newItem);
        updateBadgeCount();
    };
});