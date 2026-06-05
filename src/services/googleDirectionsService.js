/**
 * V164 — Google Directions API (otimização de paradas com optimizeWaypoints).
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
        resolve({
          ok: true,
          waypointOrder: route.waypoint_order || [],
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
 * V164 — Primeira parada fixa; demais reordenadas por waypoint_order do Google.
 * @param {Array<{ parada: object, coord: { lng: number, lat: number } }>} entries
 * @param {number[]} waypointOrder
 */
export function reorderStopsByGoogleWaypointOrder(entries, waypointOrder) {
  if (!entries?.length) return [];

  const toParada = (entry) => ({
    ...entry.parada,
    coords: [entry.coord.lng, entry.coord.lat],
  });

  if (entries.length === 1) return [toParada(entries[0])];

  const first = entries[0];
  const rest = entries.slice(1);

  if (rest.length === 1) {
    return [toParada(first), toParada(rest[0])];
  }

  const order =
    waypointOrder?.length === rest.length
      ? waypointOrder
      : rest.map((_, i) => i);

  const orderedRest = order.map((idx) => rest[idx]).filter(Boolean);
  return [toParada(first), ...orderedRest.map(toParada)];
}
