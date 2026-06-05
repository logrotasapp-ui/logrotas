/**
 * V165 — Google Directions API (otimização de paradas com optimizeWaypoints).
 */

import { API_KEYS } from "./apiConfig.js";
import { waitForGoogleMaps } from "./googleMapsLoader.js";

const DIRECTIONS_ERRORS = {
  ZERO_RESULTS: "Não foi possível calcular a rota entre os endereços.",
  OVER_QUERY_LIMIT: "Limite da API Google atingido. Tente novamente em instantes.",
  REQUEST_DENIED:
    "Directions API negada. Verifique VITE_GOOGLE_MAPS_KEY e habilite Directions API no Google Cloud.",
  INVALID_REQUEST: "Pedido de rota inválido. Verifique os endereços das paradas.",
};

function latLngFromCoord(coord) {
  return new window.google.maps.LatLng(coord.lat, coord.lng);
}

function sumLegsMetric(legs, field) {
  return (legs || []).reduce((sum, leg) => sum + (leg?.[field]?.value || 0), 0);
}

function findRestIndexByCoord(rest, lat, lng) {
  return rest.findIndex(
    (e) =>
      Math.abs(e.coord.lat - lat) < 1e-4 && Math.abs(e.coord.lng - lng) < 1e-4
  );
}

/**
 * V165 — Fallback quando waypoint_order não vem na resposta (ex.: round-trip).
 * @param {google.maps.DirectionsRoute} route
 * @param {Array<{ coord: { lng: number, lat: number } }>} rest
 * @returns {number[]}
 */
export function inferWaypointOrderFromLegs(route, rest) {
  const legs = route?.legs;
  if (!legs?.length || !rest?.length) return rest.map((_, i) => i);

  const visitLegs = legs.length > 1 ? legs.slice(0, -1) : legs;
  const order = [];

  for (const leg of visitLegs) {
    const end = leg.end_location;
    const idx = findRestIndexByCoord(rest, end.lat(), end.lng());
    if (idx >= 0 && !order.includes(idx)) order.push(idx);
  }

  if (order.length < rest.length) {
    rest.forEach((_, i) => {
      if (!order.includes(i)) order.push(i);
    });
  }

  return order;
}

function resolveWaypointOrder(route, rest) {
  const wp = route?.waypoint_order;
  if (Array.isArray(wp) && wp.length === rest.length) {
    return wp;
  }
  return inferWaypointOrderFromLegs(route, rest);
}

function directionsRoute(entries) {
  const service = new window.google.maps.DirectionsService();
  const origin = latLngFromCoord(entries[0].coord);
  const last = entries[entries.length - 1].coord;

  if (entries.length === 2) {
    return new Promise((resolve) => {
      service.route(
        {
          origin,
          destination: latLngFromCoord(last),
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status !== window.google.maps.DirectionsStatus.OK || !result?.routes?.[0]) {
            resolve({
              ok: false,
              error: DIRECTIONS_ERRORS[status] || "Erro na otimização. Tente novamente.",
            });
            return;
          }
          const route = result.routes[0];
          resolve({
            ok: true,
            waypointOrder: [],
            route,
            legs: route.legs,
            totalDistanceM: sumLegsMetric(route.legs, "distance"),
            totalDurationS: sumLegsMetric(route.legs, "duration"),
          });
        }
      );
    });
  }

  const waypoints = entries.slice(1).map((e) => ({
    location: latLngFromCoord(e.coord),
    stopover: true,
  }));

  return new Promise((resolve) => {
    service.route(
      {
        origin,
        destination: origin,
        waypoints,
        optimizeWaypoints: true,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status !== window.google.maps.DirectionsStatus.OK || !result?.routes?.[0]) {
          resolve({
            ok: false,
            error: DIRECTIONS_ERRORS[status] || "Erro na otimização. Tente novamente.",
          });
          return;
        }
        const route = result.routes[0];
        const legs = route.legs || [];
        const metricLegs = legs.length > 1 ? legs.slice(0, -1) : legs;
        const rest = entries.slice(1);
        resolve({
          ok: true,
          waypointOrder: resolveWaypointOrder(route, rest),
          route,
          legs,
          totalDistanceM: sumLegsMetric(metricLegs, "distance"),
          totalDurationS: sumLegsMetric(metricLegs, "duration"),
        });
      }
    );
  });
}

/**
 * Otimiza ordem das paradas a partir do primeiro endereço (fixo).
 * @param {Array<{ parada: object, coord: { lng: number, lat: number } }>} entries
 */
export async function fetchGoogleOptimizedRoute(entries) {
  if (!API_KEYS.googleMaps) {
    return {
      ok: false,
      error: "Otimização indisponível (configure VITE_GOOGLE_MAPS_KEY).",
    };
  }
  if (!entries || entries.length < 2) {
    return { ok: false, error: "Adicione pelo menos 2 paradas." };
  }

  try {
    await waitForGoogleMaps();
    return directionsRoute(entries);
  } catch (err) {
    return {
      ok: false,
      error: err?.message || "Erro na otimização. Tente novamente.",
    };
  }
}

/**
 * V165 — Primeira parada fixa; demais reordenadas por waypoint_order (ou legs).
 * @param {Array<{ parada: object, coord: { lng: number, lat: number } }>} entries
 * @param {number[]} waypointOrder
 * @param {google.maps.DirectionsRoute | null} [route]
 */
export function reorderStopsByGoogleWaypointOrder(entries, waypointOrder, route = null) {
  if (!entries?.length) return [];

  const toParada = (entry, ordem) => ({
    ...entry.parada,
    ordem,
    coords: [entry.coord.lng, entry.coord.lat],
  });

  if (entries.length === 1) return [toParada(entries[0], 1)];

  const first = entries[0];
  const rest = entries.slice(1);

  if (rest.length === 1) {
    return [toParada(first, 1), toParada(rest[0], 2)];
  }

  const order =
    Array.isArray(waypointOrder) && waypointOrder.length === rest.length
      ? waypointOrder
      : route
        ? inferWaypointOrderFromLegs(route, rest)
        : rest.map((_, i) => i);

  const orderedRest = order.map((idx) => rest[idx]).filter(Boolean);
  return [toParada(first, 1), ...orderedRest.map((entry, i) => toParada(entry, i + 2))];
}
