(function () {
  const form = document.getElementById('login-form');
  const emailEl = document.getElementById('email');
  const passEl = document.getElementById('route-pass');
  const btn = document.getElementById('btn-login');
  const err = document.getElementById('error-msg');
  const toast = document.getElementById('toast');
  const togglePw = document.getElementById('toggle-pw');
  const remember = document.getElementById('remember');

  function showToast(text, ms = 2200) {
    toast.textContent = text;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), ms);
  }

  togglePw.addEventListener('click', () => {
    const isPwd = passEl.type === 'password';
    passEl.type = isPwd ? 'text' : 'password';
    togglePw.setAttribute('aria-pressed', String(isPwd));
    togglePw.setAttribute('aria-label', isPwd ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.textContent = '';
    const email = (emailEl.value || '').trim();
    const accessCode = (passEl.value || '').trim();

    if (!email) return err.textContent = 'Ingresa tu correo.';
    if (!accessCode) return err.textContent = 'Ingresa el código de acceso de la ruta.';

    btn.disabled = true;
    btn.textContent = 'Conectando…';
    showToast('Intentando ingresar');

    try {
      const res = await fetch('/api/auth/driver/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: accessCode })
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Mensaje claro hacia el usuario
        err.textContent = body && body.msg ? body.msg : 'Error en el inicio de sesión';
        showToast('Error');
        btn.disabled = false;
        btn.textContent = 'Entrar';
        return;
      }

      // OK: guarda en sessionStorage para que mobile.html lo utilice
      try {
        sessionStorage.setItem('currentRoute', JSON.stringify(body.route || {}));
        sessionStorage.setItem('currentDriver', JSON.stringify(body.chofer || {}));
        sessionStorage.setItem('driverToken', body.token || '');
        // si marcar "remember", también lo guardamos en localStorage (opcional)
        if (remember.checked) {
          localStorage.setItem('savedEmail', email);
        } else {
          localStorage.removeItem('savedEmail');
        }
      } catch (e) { /* ignore storage errors */ }

      showToast('Acceso correcto — Abriendo ruta', 1400);

      // Redirigir a mobile.html (asegúrate de que exista)
      setTimeout(() => {
        window.location.href = '/mobile.html';
      }, 600);

    } catch (e) {
      console.error(e);
      err.textContent = 'Error de red. Revisa tu conexión.';
      showToast('Conexión fallida', 1400);
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });

  // Rellenar email si estaba guardado
  const saved = localStorage.getItem('savedEmail');
  if (saved) emailEl.value = saved;
})();