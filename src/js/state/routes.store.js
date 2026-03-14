// js/state/routes.store.js

let routesData = [];
let currentDetailRoute = null;

export const setRoutes = (routes) => {
    routesData = Array.isArray(routes) ? routes : [];
};

export const getRoutes = () => routesData;

export const setCurrentDetailRoute = (route) => {
    currentDetailRoute = route;
};

export const getCurrentDetailRoute = () => currentDetailRoute;