/**
 * Dados do mapa de entregas (somente visualização — não altera otimização/frete).
 */

import { geocodeAddressForDisplay } from "./routingService.js";

/**
 * @param {Array<{ id?: number, endereco?: string, coords?: number[] | { lng: number, lat: number } }>} paradas
 * @returns {Promise<import("geojson").Feature[]>}
 */
export async function buildDeliveryMapFeatures(paradas) {
  const features = [];

  for (let i = 0; i < (paradas || []).length; i++) {
    const p = paradas[i];
    const coords = resolveCoords(p);
    let lng;
    let lat;

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
        id: p.id ?? i,
        order: i + 1,
        label: p.endereco || `Entrega ${i + 1}`,
      },
      geometry: {
        type: "Point",
        coordinates: [lng, lat],
      },
    });
  }

  return features;
}

/**
 * @param {{ coords?: number[] | { lng: number, lat: number } }} parada
 * @returns {[number, number] | null} [lng, lat]
 */
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
