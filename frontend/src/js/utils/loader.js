// src/js/modules/utils/loader.ui.js

// 👇 IMPORTAMOS LA IMAGEN PARA QUE VITE LA EMPAQUETE
// (Ajusta los '../' según dónde esté tu carpeta assets realmente)
import logoPath from 'img/assets/logo.png'; 

export function showLoader() {
    let loader = document.getElementById('global-loader');
    
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'global-loader';
        loader.className = 'global-loader-overlay';
        
        const img = document.createElement('img');
        // 👇 USAMOS LA VARIABLE IMPORTADA EN LUGAR DEL TEXTO FIJO
        img.src = logoPath; 
        img.className = 'pulsing-logo'; 
        img.alt = 'Cargando...';
        
        loader.appendChild(img);
        document.body.appendChild(loader);
    }
    
    loader.classList.remove('hidden');
}

export function hideLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) {
        loader.classList.add('hidden');
        setTimeout(() => loader.remove(), 300);
    }
}
