/**
 * Dados do mapa de entregas — um marcador por parada.
 */

import { geocodeAddressForDisplay } from "./routingService.js";

function resolveCoords(parada) {
  const c = parada?.coords;
  if (!c) return null;
  if (Array.isArray(c) && c.length >= 2) {
    return [Number(c[0]), Number(c[1])];
  }
  if (typeof c.lng === "number" && typeof c.lat === "number") {
    return [c.lng, c.lat];
  }
  return null;
}

/**
 * @param {Array<{ id?: number, endereco?: string, coords?: number[], ordem?: number, entregue?: boolean }>} paradas
 * @returns {Promise<import("geojson").Feature[]>}
 */
export async function buildDeliveryMapFeatures(paradas) {
  const features = [];

  for (let i = 0; i < (paradas || []).length; i++) {
    const p = paradas[i];
    const order = p.ordem ?? i + 1;
    let lng;
    let lat;

    const coords = resolveCoords(p);
    if (coords) {
      [lng, lat] = coords;
    } else if (p?.endereco) {
      const g = await geocodeAddressForDisplay(p.endereco);
      if (!g) continue;
      lng = g.lng;
      lat = g.lat;
    } else {
      continue;
    }

    features.push({
      type: "Feature",
      properties: {
        packageCount: 1,
        orders: [order],
        order,
        entregue: !!p.entregue,
      },
      geometry: {
        type: "Point",
        coordinates: [lng, lat],
      },
    });
  }

  return features;
}
