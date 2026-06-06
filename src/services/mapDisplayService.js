/**
 * Dados do mapa de entregas — agrupa paradas no mesmo ponto.
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

function locationKey(lng, lat) {
  return `${lng.toFixed(5)},${lat.toFixed(5)}`;
}

/**
 * @param {Array<{ id?: number, endereco?: string, coords?: number[], ordem?: number }>} paradas
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

    points.push({ lng, lat, order, id: p.id ?? i });
  }

  const groups = new Map();
  for (const pt of points) {
    const key = locationKey(pt.lng, pt.lat);
    if (!groups.has(key)) {
      groups.set(key, { lng: pt.lng, lat: pt.lat, orders: [] });
    }
    groups.get(key).orders.push(pt.order);
  }

  return Array.from(groups.values()).map((g) => {
    const orders = [...g.orders].sort((a, b) => a - b);
    const packageCount = orders.length;
    return {
      type: "Feature",
      properties: {
        packageCount,
        orders,
        order: orders[0],
      },
      geometry: {
        type: "Point",
        coordinates: [g.lng, g.lat],
      },
    };
  });
}

/** Conta entregas por endereço normalizado (lista de paradas). */
export function countParadasPorEndereco(paradas) {
  const counts = {};
  for (const p of paradas || []) {
    const key = String(p?.endereco || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export function enderecoKey(endereco) {
  return String(endereco || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
