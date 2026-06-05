/**
 * V166 — Google Directions API (origem GPS do motorista ou fallback 1ª parada).
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

function latLngFromLngLatPair(pair) {
  const [lng, lat] = pair;
  return new window.google.maps.LatLng(lat, lng);
}

/**
 * V171 — Distância driving entre dois pontos (calculadoras Viagem/Frete).
 * @param {[number, number]} originCoords [lng, lat]
 * @param {[number, number]} destCoords [lng, lat]
 */
export async function fetchGoogleDrivingDistanceKm(originCoords, destCoords) {
  if (!API_KEYS.googleMaps) {
    return { ok: false, error: "Google Maps indisponível.", distanceKm: null };
  }
  if (!originCoords || !destCoords) {
    return { ok: false, error: "Coordenadas inválidas.", distanceKm: null };
  }

  try {
    await waitForGoogleMaps();
    const service = new window.google.maps.DirectionsService();

    return new Promise((resolve) => {
      service.route(
        {
          origin: latLngFromLngLatPair(originCoords),
          destination: latLngFromLngLatPair(destCoords),
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (
            status !== window.google.maps.DirectionsStatus.OK ||
            !result?.routes?.[0]?.legs?.length
          ) {
            resolve({
              ok: false,
              error: DIRECTIONS_ERRORS[status] || "Não foi possível calcular a rota.",
              distanceKm: null,
            });
            return;
          }
          const meters = sumLegsMetric(result.routes[0].legs, "distance");
          resolve({ ok: true, distanceKm: Math.round(meters / 1000) });
        }
      );
    });
  } catch (err) {
    return {
      ok: false,
      error: err?.message || "Erro ao calcular distância.",
      distanceKm: null,
    };
  }
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
 * Fallback quando waypoint_order não vem na resposta (ex.: round-trip).
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

function handleDirectionsResult(resolve, route, rest, roundTrip = false) {
  const legs = route.legs || [];
  const metricLegs = roundTrip && legs.length > 1 ? legs.slice(0, -1) : legs;
  resolve({
    ok: true,
    waypointOrder: resolveWaypointOrder(route, rest),
    route,
    legs,
    totalDistanceM: sumLegsMetric(metricLegs, "distance"),
    totalDurationS: sumLegsMetric(metricLegs, "duration"),
  });
}

/**
 * V166 — Origem GPS: todas as paradas são waypoints otimizáveis.
 * Fallback: 1ª parada fixa como origem (comportamento anterior).
 */
function directionsRoute(entries, driverOrigin = null) {
  const service = new window.google.maps.DirectionsService();
  const useGps = Boolean(driverOrigin);

  if (useGps) {
    const origin = latLngFromCoord(driverOrigin);
    const allWaypoints = entries.map((e) => ({
      location: latLngFromCoord(e.coord),
      stopover: true,
    }));

    if (allWaypoints.length === 1) {
      return new Promise((resolve) => {
        service.route(
          {
            origin,
            destination: allWaypoints[0].location,
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
            handleDirectionsResult(resolve, route, entries, false);
          }
        );
      });
    }

    return new Promise((resolve) => {
      service.route(
        {
          origin,
          destination: origin,
          waypoints: allWaypoints,
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
          handleDirectionsResult(resolve, result.routes[0], entries, true);
        }
      );
    });
  }

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
        const rest = entries.slice(1);
        handleDirectionsResult(resolve, route, rest, true);
      }
    );
  });
}

/**
 * @param {Array<{ parada: object, coord: { lng: number, lat: number } }>} entries
 * @param {{ lng: number, lat: number } | null} [driverOrigin]
 */
export async function fetchGoogleOptimizedRoute(entries, driverOrigin = null) {
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
    const usedDriverOrigin = Boolean(driverOrigin);
    const result = await directionsRoute(entries, driverOrigin);
    return { ...result, usedDriverOrigin };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || "Erro na otimização. Tente novamente.",
    };
  }
}

/**
 * V166 — Reordena paradas pelo waypoint_order do Google.
 * @param {Array<{ parada: object, coord: { lng: number, lat: number } }>} entries
 * @param {number[]} waypointOrder
 * @param {google.maps.DirectionsRoute | null} [route]
 * @param {{ allAsWaypoints?: boolean }} [options]
 */
export function reorderStopsByGoogleWaypointOrder(
  entries,
  waypointOrder,
  route = null,
  { allAsWaypoints = false } = {}
) {
  if (!entries?.length) return [];

  const toParada = (entry, ordem) => ({
    ...entry.parada,
    ordem,
    coords: [entry.coord.lng, entry.coord.lat],
  });

  if (allAsWaypoints) {
    const order =
      Array.isArray(waypointOrder) && waypointOrder.length === entries.length
        ? waypointOrder
        : route
          ? inferWaypointOrderFromLegs(route, entries)
          : entries.map((_, i) => i);

    return order.map((idx, i) => toParada(entries[idx], i + 1));
  }

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
