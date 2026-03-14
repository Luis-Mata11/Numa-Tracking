// js/utils/helpers.js

export function debounce(fn, wait = 200) {
    let t;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

export function escapeHtml(text) {
    if (!text && text !== 0) return '';
    return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

export function isLikelyOverviewPath(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return false;
    if (arr.length > 10) return true;

    const sample = arr[0];
    const hasLatLng = sample && (sample.lat !== undefined && sample.lng !== undefined);
    const hasLocationField = sample && sample.location;
    const hasStopover = sample && (sample.stopover !== undefined);
    return hasLatLng && !hasLocationField && !hasStopover && arr.length > 3;
}