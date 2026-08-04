/**
 * V231 — Motor de otimização híbrido (Etapa 2 — sequenciamento no aparelho).
 * Módulo puro: sem chamadas de API. Trabalha sobre coordenadas {lat, lng}
 * já geocodificadas e devolve a ORDEM das paradas (rota ABERTA: sem retorno
 * à origem e sem destino fixo — a última parada é a que o algoritmo definir).
 *
 * Pipeline: Nearest Neighbor (construção) → 2-opt (refinamento com avaliação
 * por delta nas arestas afetadas, para suportar 100+ paradas com fluidez).
 */

const EARTH_RADIUS_KM = 6371;

/**
 * Distância haversine em km entre dois pontos {lat, lng}.
 * @param {{ lat: number, lng: number }} a
 * @param {{ lat: number, lng: number }} b
 * @returns {number} km
 */
export function haversine(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Custo total (km, haversine) de uma rota ABERTA: origem → p[0] → … → p[n-1].
 * Não fecha o ciclo (sem retorno à origem).
 * @param {{ lat: number, lng: number }} origin
 * @param {Array<{ lat: number, lng: number }>} points — na ordem da rota
 * @returns {number} km
 */
export function openRouteDistanceKm(origin, points) {
  if (!points?.length) return 0;
  let total = haversine(origin, points[0]);
  for (let i = 0; i < points.length - 1; i++) {
    total += haversine(points[i], points[i + 1]);
  }
  return total;
}

/**
 * Nearest Neighbor — constrói a ordem inicial partindo da origem.
 * @param {{ lat: number, lng: number }} origin
 * @param {Array<{ lat: number, lng: number }>} points
 * @returns {number[]} índices de `points` na ordem de visita
 */
export function nearestNeighborOrder(origin, points) {
  const n = points?.length || 0;
  if (n === 0) return [];

  const visited = new Array(n).fill(false);
  const order = [];
  let current = origin;

  for (let step = 0; step < n; step++) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;
      const d = haversine(current, points[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    visited[bestIdx] = true;
    order.push(bestIdx);
    current = points[bestIdx];
  }

  return order;
}

const TWO_OPT_MAX_PASSES = 50;
const TWO_OPT_MIN_GAIN_KM = 0.0001;

/**
 * 2-opt para rota ABERTA — refina a ordem invertendo segmentos [i..j].
 * Avalia apenas o delta nas arestas afetadas pela inversão (as arestas
 * internas do segmento têm o mesmo custo total ao serem invertidas, pois a
 * distância é simétrica), em vez de recalcular a rota inteira.
 * Limite de segurança: máximo de 50 passadas completas.
 * @param {{ lat: number, lng: number }} origin
 * @param {Array<{ lat: number, lng: number }>} points
 * @param {number[]} initialOrder — índices de `points`
 * @returns {number[]} ordem refinada
 */
export function twoOptImprove(origin, points, initialOrder) {
  const n = initialOrder?.length || 0;
  if (n <= 2) return (initialOrder || []).slice();

  const order = initialOrder.slice();
  const pt = (k) => points[order[k]];

  let improved = true;
  let passes = 0;

  while (improved && passes < TWO_OPT_MAX_PASSES) {
    improved = false;
    passes++;

    for (let i = 0; i < n - 1; i++) {
      const prev = i === 0 ? origin : pt(i - 1);
      for (let j = i + 1; j < n; j++) {
        const hasNext = j < n - 1;
        // Arestas afetadas pela inversão de [i..j] em rota aberta:
        // remove (prev → p[i]) e (p[j] → próximo); adiciona (prev → p[j]) e (p[i] → próximo)
        const before =
          haversine(prev, pt(i)) + (hasNext ? haversine(pt(j), pt(j + 1)) : 0);
        const after =
          haversine(prev, pt(j)) + (hasNext ? haversine(pt(i), pt(j + 1)) : 0);

        if (after < before - TWO_OPT_MIN_GAIN_KM) {
          for (let a = i, b = j; a < b; a++, b--) {
            const tmp = order[a];
            order[a] = order[b];
            order[b] = tmp;
          }
          improved = true;
        }
      }
    }
  }

  return order;
}

/**
 * V232 — Centro mediano das coordenadas (mediana de lat e de lng).
 * Robusto contra outliers — usado pelo detector de paradas fora da área.
 * @param {Array<{ lat: number, lng: number }>} points
 * @returns {{ lat: number, lng: number } | null}
 */
export function medianCenter(points) {
  const n = points?.length || 0;
  if (n === 0) return null;
  const med = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  return {
    lat: med(points.map((p) => p.lat)),
    lng: med(points.map((p) => p.lng)),
  };
}

/** V368 — raio para considerar duas paradas o mesmo ponto (~70 m; geocode urbano varia). */
const DUPLICATE_RADIUS_KM = 0.07;

/**
 * Normaliza endereço para dedupe: minúsculas, sem acento, sem pontuação, espaços colapsados.
 */
export function normalizeAddressForDedupe(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addressesTextMatchForDedupe(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  // Mesma rua/número com cidade/UF formatada diferente no Geocoder
  if (shorter.length >= 12 && longer.includes(shorter)) return true;
  return false;
}

/**
 * V232/V368 — Detector de duplicados: texto normalizado (acentos/pontuação) ou coords ~70 m.
 * @param {Array<{ endereco?: string, coords?: number[] }>} paradas
 * @param {{ endereco?: string, coords?: number[] }} nova
 * @returns {number} índice da parada duplicada, ou -1
 */
export function findDuplicateStopIndex(paradas, nova) {
  const novaEnd = normalizeAddressForDedupe(nova?.endereco);
  const novaCoords =
    Array.isArray(nova?.coords) && nova.coords.length >= 2 ? nova.coords : null;

  for (let i = 0; i < (paradas || []).length; i++) {
    const p = paradas[i];
    const pEnd = normalizeAddressForDedupe(p?.endereco);
    const textMatch = addressesTextMatchForDedupe(novaEnd, pEnd);
    const c = Array.isArray(p?.coords) && p.coords.length >= 2 ? p.coords : null;
    let withinRadius = false;
    if (novaCoords && c) {
      const d = haversine(
        { lat: c[1], lng: c[0] },
        { lat: novaCoords[1], lng: novaCoords[0] }
      );
      withinRadius = d < DUPLICATE_RADIUS_KM;
    }

    // Texto igual/contido, ou proximidade geográfica, ou ambos (mesmo local)
    if (textMatch || withinRadius) return i;
  }
  return -1;
}

/**
 * Otimização completa de rota aberta: Nearest Neighbor + 2-opt.
 * Para n <= 2 a ordem é trivial (NN já resolve, 2-opt é pulado).
 * @param {{ lat: number, lng: number }} origin — ponto de partida (não é parada)
 * @param {Array<{ lat: number, lng: number }>} points
 * @returns {number[]} índices de `points` na ordem otimizada
 */
export function optimizeOpenRoute(origin, points) {
  const n = points?.length || 0;
  if (n === 0) return [];
  const nn = nearestNeighborOrder(origin, points);
  if (n <= 2) return nn;
  return twoOptImprove(origin, points, nn);
}
