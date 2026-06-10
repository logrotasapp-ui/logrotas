/**
 * Dados do mapa de entregas — um marcador por parada, popup agrupa por coordenada.
 */

import { geocodeAddressForDisplay } from "./routingService.js";

function resolveParadaStatus(p) {
  if (p?.status) return p.status;
  if (p?.entregue) return "entregue";
  return "pendente";
}

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

function locationKey(lng, lat) {
  return `${lng.toFixed(5)},${lat.toFixed(5)}`;
}

/**
 * @param {Array<{ id?: number, endereco?: string, coords?: number[], ordem?: number, entregue?: boolean }>} paradas
 * @returns {Promise<import("geojson").Feature[]>}
 */
export async function buildDeliveryMapFeatures(paradas) {
  const points = [];

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

    points.push({
      lng,
      lat,
      order,
      status: resolveParadaStatus(p),
      entregue: resolveParadaStatus(p) === "entregue",
    });
  }

  const groups = new Map();
  for (const pt of points) {
    const key = locationKey(pt.lng, pt.lat);
    if (!groups.has(key)) {
      groups.set(key, { orders: [] });
    }
    groups.get(key).orders.push(pt.order);
  }

  for (const g of groups.values()) {
    g.orders.sort((a, b) => a - b);
    g.packageCount = g.orders.length;
  }

  return points.map((pt) => {
    const group = groups.get(locationKey(pt.lng, pt.lat));
    return {
      type: "Feature",
      properties: {
        packageCount: group.packageCount,
        orders: group.orders,
        order: pt.order,
        status: pt.status,
        entregue: pt.entregue,
      },
      geometry: {
        type: "Point",
        coordinates: [pt.lng, pt.lat],
      },
    };
  });
}
