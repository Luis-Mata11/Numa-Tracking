// public/js/modules/state.js

export const state = {
    routes: [],
    drivers: [],
    vehicles: [],
    driverMarkers: {},    // { driverId: Marker }
    routePolylines: {},   // { routeId: { grey, color, ... } }
    lastKnownLocations: {},
    activeRouteId: null,
    vehiculoSeleccionado: null
};

// Helpers para actualizar datos
export function setRoutes(newRoutes) { state.routes = newRoutes; }
export function setDrivers(newDrivers) { state.drivers = newDrivers; }
export function setVehicles(newVehicles) { state.vehicles = newVehicles; }