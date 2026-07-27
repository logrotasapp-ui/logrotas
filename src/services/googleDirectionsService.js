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
    return { ok: false, error: "Google Maps indisponível.", distanceKm: null, durationSeconds: null };
  }
  if (!originCoords || !destCoords) {
    return { ok: false, error: "Coordenadas inválidas.", distanceKm: null, durationSeconds: null };
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
              durationSeconds: null,
            });
            return;
          }
          const legs = result.routes[0].legs;
          const meters = sumLegsMetric(legs, "distance");
          const durationSeconds = sumLegsMetric(legs, "duration");
          resolve({
            ok: true,
            distanceKm: Math.round(meters / 1000),
            durationSeconds: durationSeconds > 0 ? durationSeconds : null,
          });
        }
      );
    });
  } catch (err) {
    return {
      ok: false,
      error: err?.message || "Erro ao calcular distância.",
      distanceKm: null,
      durationSeconds: null,
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

// ── V231 — Directions em blocos (motor híbrido, Etapa 3) ────────────────────
// A ordem das paradas já vem definida pelo otimizador no aparelho (NN + 2-opt).
// Aqui a Directions API é usada SEM optimizeWaypoints, apenas para desenhar o
// trajeto real e somar distância/duração — em blocos de até 25 pontos.

const BLOCK_MAX_POINTS = 25;

function routeChunkPlain(service, chunk, chunkLabels) {
  return new Promise((resolve) => {
    service.route(
      {
        origin: latLngFromCoord(chunk[0]),
        destination: latLngFromCoord(chunk[chunk.length - 1]),
        waypoints: chunk.slice(1, -1).map((c) => ({
          location: latLngFromCoord(c),
          stopover: true,
        })),
        optimizeWaypoints: false,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (
          status === window.google.maps.DirectionsStatus.OK &&
          result?.routes?.[0]?.legs?.length
        ) {
          resolve(result.routes[0]);
        } else {
          // V233 — diagnóstico: status exato da Directions + endereços do trecho
          console.warn("[LogRotas Directions] falha no trecho", {
            status: String(status),
            enderecos: chunkLabels?.length ? chunkLabels : chunk,
          });
          resolve(null);
        }
      }
    );
  });
}

const RETRY_DELAY_MS = 1000;

async function routeChunkWithRetry(service, chunk, chunkLabels) {
  const first = await routeChunkPlain(service, chunk, chunkLabels);
  if (first) return first;
  // V233 — 1 retry após 1 segundo antes de desistir do trecho
  await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  const second = await routeChunkPlain(service, chunk, chunkLabels);
  if (!second) {
    console.warn("[LogRotas Directions] trecho sem desenho após retry", {
      enderecos: chunkLabels?.length ? chunkLabels : chunk,
    });
  }
  return second;
}

/**
 * V231 — Calcula a rota real (distância, duração e polyline) em blocos de até
 * 25 pontos, encadeando: o último ponto de cada bloco é a origem do próximo.
 * Se um bloco falhar (após 1 retry), os demais seguem normalmente — a ORDEM
 * das paradas não depende desta etapa.
 * @param {Array<{ lat: number, lng: number }>} points — [origem, ...paradas] na ordem final
 * @param {string[]} [labels] — endereços alinhados a `points` (para diagnóstico)
 * @returns {Promise<{ ok: boolean, totalDistanceM: number, totalDurationS: number, overviewPath: Array<{lat:number,lng:number}>, blocksOk: number, blocksTotal: number }>}
 */
export async function fetchGoogleRouteInBlocks(points, labels = []) {
  const empty = {
    ok: false,
    totalDistanceM: 0,
    totalDurationS: 0,
    legDurationsS: [],
    overviewPath: [],
    blocksOk: 0,
    blocksTotal: 0,
  };
  if (!API_KEYS.googleMaps || !points || points.length < 2) return empty;

  try {
    await waitForGoogleMaps();
  } catch {
    return empty;
  }

  const service = new window.google.maps.DirectionsService();
  let totalDistanceM = 0;
  let totalDurationS = 0;
  const legDurationsS = [];
  const overviewPath = [];
  let blocksOk = 0;
  let blocksTotal = 0;

  let start = 0;
  while (start < points.length - 1) {
    const end = Math.min(start + BLOCK_MAX_POINTS - 1, points.length - 1);
    const chunk = points.slice(start, end + 1);
    const chunkLabels = labels.slice(start, end + 1);
    blocksTotal++;

    const route = await routeChunkWithRetry(service, chunk, chunkLabels);
    if (route) {
      blocksOk++;
      totalDistanceM += sumLegsMetric(route.legs, "distance");
      totalDurationS += sumLegsMetric(route.legs, "duration");
      for (const leg of route.legs || []) {
        const d = leg?.duration?.value;
        legDurationsS.push(Number.isFinite(d) && d > 0 ? d : null);
      }
      if (route.overview_path?.length) {
        overviewPath.push(
          ...route.overview_path.map((ll) => ({ lat: ll.lat(), lng: ll.lng() }))
        );
      }
    }

    start = end;
  }

  return {
    ok: blocksOk > 0,
    totalDistanceM,
    totalDurationS,
    legDurationsS,
    overviewPath,
    blocksOk,
    blocksTotal,
  };
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
