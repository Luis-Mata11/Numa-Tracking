// Archivo: src/js/modules/utils/ui.utils.js

export function showNotification(message, type = 'success', targetSelector) {
  let container = null;
  if (targetSelector) container = document.querySelector(targetSelector);
  if (!container) {
    container = document.getElementById('vehiculo-detail') ||
      document.getElementById('route-detail') ||
      document.getElementById('detail-container');
  }

  const iconClass = type === 'success' ? 'fa-check-circle' :
    (type === 'warning' ? 'fa-exclamation-circle' : 'fa-times-circle');
  const color = type === 'success' ? 'green' :
    (type === 'warning' ? '#f39c12' : 'red');

  const html = `<div style="color:${color}; padding:16px; text-align:center; border-radius:6px;"><i class="fa ${iconClass}" style="margin-right:8px"></i>${message}</div>`;

  if (container) {
    const prev = container.querySelector('.js-inline-notification');
    if (prev) prev.remove();
    const wrapper = document.createElement('div');
    wrapper.className = 'js-inline-notification';
    wrapper.innerHTML = html;
    container.insertAdjacentElement('afterbegin', wrapper);
    setTimeout(() => { try { wrapper.remove(); } catch (e) { } }, 4000);
    return;
  }
  // Crear banner fijo si no hay contenedor
  let floating = document.getElementById('global-notification');
  if (!floating) {
    floating = document.createElement('div');
    // ... (resto de tu código)
    document.body.appendChild(floating);
  }
  floating.innerHTML = html;
  setTimeout(() => { if (floating) floating.innerHTML = ''; }, 4000);
}