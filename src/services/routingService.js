import {
  API_KEYS,
  API_ENDPOINTS,
  ORS_HEADERS,
  SEARCH_COUNTRIES,
} from "./apiConfig.js";
import {
  fetchGooglePlacePredictions,
  SAO_PAULO_BOUNDS,
  resolvePlaceSuggestion,
} from "./googlePlacesService.js";
import {
  fetchGoogleOptimizedRoute,
  fetchGoogleDrivingDistanceKm,
  fetchGoogleRouteInBlocks,
  reorderStopsByGoogleWaypointOrder,
} from "./googleDirectionsService.js";
import {
  optimizeOpenRoute,
  openRouteDistanceKm,
  medianCenter,
  haversine,
} from "./routeOptimizer.js";

export { findDuplicateStopIndex } from "./routeOptimizer.js";
import {
  geocodeAddressGoogle,
  isGeocodeTypesTooGeneric,
  GEOCODE_TOO_GENERIC_MSG,
} from "./googleGeocodingService.js";

export { resolvePlaceSuggestion } from "./googlePlacesService.js";
export { GEOCODE_TOO_GENERIC_MSG, isGeocodeTypesTooGeneric } from "./googleGeocodingService.js";
import { fileToImageBlob } from "./fileToImage.js";
import {
  parseRomaneioTextToDestinations,
  buildParadasFromAddresses,
  buildParadasFromEntries,
  parseDeliveryAddressesFromLabelText,
  parseDeliveryEntriesFromLabelText,
  cleanAddressLine,
  assessVisionOcrConfidence,
  parseClaudeDeliveryEntriesResponse,
  entriesMissingDestinatarioNome,
} from "./romaneioRouting.js";

export {
  parseRomaneioTextToDestinations,
  buildParadasFromAddresses,
  buildParadasFromEntries,
  parseDeliveryAddressesFromLabelText,
  parseDeliveryEntriesFromLabelText,
  cleanAddressLine,
  normalizeAddressesForRouting,
} from "./romaneioRouting.js";

export { VISION_ADDRESS_EXTRACTION_INSTRUCTION } from "./romaneioParser.js";

import { devLog } from "../utils/devLog.js";

const CLAUDE_OCR_MODEL = "claude-haiku-4-5";

function logOcr(msg, data) {
  if (typeof console !== "undefined") {
    devLog(`[OCR] ${msg}`, data !== undefined ? data : "");
  }
}

// V235 — entrada numérica tolerante (vírgula ou ponto) nos campos das calculadoras
import { parseNumeroBR } from "./formatUtils.js";
import {
  CALC_FRETE,
  custoPedagioEscalado,
  descricaoPedagioResultado,
  totalEixosPedagio,
} from "./pedagioCalcService.js";

/** Valor estimado por eixo por praça de pedágio (R$). */
export const TOLL_PER_AXLE = 3.2;

// V173 — autocomplete SP reforçado + Waze/Maps waypoints; V172 — GPS origem Maps
const CONNECTION_ERROR =
  "Erro de conexão. Verifique sua internet e tente novamente.";

/** @type {[number, number] | null} [lng, lat] — viés de proximidade (GPS) */
let cachedGeocodeProximity = null;
let geocodeProximityRequested = false;

/** V159 — fallback de proximity no fluxo romaneio/OCR (último endereço geocodificado) */
let lastRomaneioGeocodeProximity = null;

/**
 * Solicita a localização do usuário para priorizar sugestões próximas (não bloqueia).
 * Pode ser chamado cedo (ex.: ao abrir calculadora) para o GPS responder antes da digitação.
 */
export function warmGeocodeProximity() {
  if (geocodeProximityRequested || cachedGeocodeProximity) return;
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  geocodeProximityRequested = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      cachedGeocodeProximity = [pos.coords.longitude, pos.coords.latitude];
    },
    () => {},
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
  );
}

/**
 * V166 — Localização GPS do motorista para otimização de entregas.
 * @param {{ preferFresh?: boolean }} [options]
 * @returns {Promise<{ lng: number, lat: number } | null>}
 */
export function getDriverGeolocation(options = {}) {
  const { preferFresh = false, timeoutMs = 12000 } = options;

  return new Promise((resolve) => {
    if (!preferFresh && cachedGeocodeProximity) {
      resolve({ lng: cachedGeocodeProximity[0], lat: cachedGeocodeProximity[1] });
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(
        cachedGeocodeProximity
          ? { lng: cachedGeocodeProximity[0], lat: cachedGeocodeProximity[1] }
          : null
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        cachedGeocodeProximity = [pos.coords.longitude, pos.coords.latitude];
        geocodeProximityRequested = true;
        resolve({ lng: pos.coords.longitude, lat: pos.coords.latitude });
      },
      () => {
        resolve(
          cachedGeocodeProximity
            ? { lng: cachedGeocodeProximity[0], lat: cachedGeocodeProximity[1] }
            : null
        );
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: preferFresh ? 0 : 600000,
      }
    );
  });
}

function resolveProximityForRomaneio() {
  return cachedGeocodeProximity || lastRomaneioGeocodeProximity;
}

/** Média [lng, lat] de uma lista de coords [lng, lat] (ignora inválidas). */
function meanLngLatFromCoords(coordsList) {
  const valid = (coordsList || []).filter(
    (c) => Array.isArray(c) && c.length >= 2 && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1]))
  );
  if (!valid.length) return null;
  const sum = valid.reduce(
    (acc, c) => [acc[0] + Number(c[0]), acc[1] + Number(c[1])],
    [0, 0]
  );
  return [sum[0] / valid.length, sum[1] / valid.length];
}

/**
 * V232 — Viés de localização para geocodificação de paradas:
 * GPS atual do motorista → média das paradas já geocodificadas → cadeia romaneio.
 * Evita que endereços sem cidade/CEP caiam em cidades homônimas distantes.
 * @param {Array<number[] | null>} [geocodedLngLatList] coords [lng,lat] já conhecidas
 * @returns {[number, number] | null} [lng, lat]
 */
export function resolveStopGeocodeBias(geocodedLngLatList = []) {
  if (cachedGeocodeProximity) return cachedGeocodeProximity;
  const mean = meanLngLatFromCoords(geocodedLngLatList);
  if (mean) return mean;
  return lastRomaneioGeocodeProximity;
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

async function fetchJson(url, options = {}) {
  try {
    const res = await fetch(url, options);
    let data = {};
    try {
      data = await res.json();
    } catch {
      /* resposta não-JSON */
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null, networkError: true };
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Endereço manual (normalização + busca aproximada) ────────────────────────

const MANUAL_STRIP_CHARS = /[^\p{L}\p{M}\p{N}\s,.\-ºª°/]/gu;

/**
 * Limpa texto digitado pelo motorista (remove especiais, espaços extras, OCR-style).
 * @param {string} text
 * @returns {string}
 */
export function normalizeManualAddressInput(text) {
  if (text == null) return "";
  let s = cleanAddressLine(String(text));
  s = s.replace(MANUAL_STRIP_CHARS, " ").replace(/\s+/g, " ").trim();
  return s;
}

function tokenizeForMatch(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function scoreAddressMatch(query, label) {
  const qTokens = tokenizeForMatch(query);
  if (qTokens.length === 0) return 0;
  const labelNorm = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  let hits = 0;
  for (const t of qTokens) {
    if (labelNorm.includes(t)) hits += 1;
  }
  return hits / qTokens.length;
}

function pickBestAddressSuggestion(query, suggestions) {
  if (!suggestions?.length) return null;
  if (suggestions.length === 1) return suggestions[0];
  return suggestions.reduce((best, cur) =>
    scoreAddressMatch(query, cur.label) >= scoreAddressMatch(query, best.label)
      ? cur
      : best
  );
}

/**
 * Normaliza o texto, busca correspondência no mapa (ORS) e devolve endereço canônico.
 * @param {string} rawText
 * @returns {Promise<{ ok: true, endereco: string, coords: number[], normalized: string } | { ok: false, error: string, normalized: string }>}
 */
export async function resolveManualAddress(rawText, opts = {}) {
  const normalized = normalizeManualAddressInput(rawText);

  if (normalized.length < 3) {
    return {
      ok: false,
      error: "Endereço muito curto. Ex.: Rua das Flores, 100 - Centro, São Paulo",
      normalized,
    };
  }

  const queries = [normalized];
  const withoutNumber = normalized
    .replace(/,?\s*n[°º]?\s*\d+[\w/-]*/gi, "")
    .replace(/,?\s+\d+[\w/-]*\s*$/i, "")
    .trim();
  if (withoutNumber.length >= 3 && withoutNumber !== normalized) {
    queries.push(withoutNumber);
  }

  // V232 — viés de proximidade (GPS / média das paradas) p/ evitar homônimos distantes
  const searchBias = opts.proximityLngLat?.length >= 2
    ? { proximityLngLat: opts.proximityLngLat }
    : {};

  let sawGenericOnly = false;

  for (const query of queries) {
    const res = await searchAddresses(query, { skipNormalize: true, ...searchBias });
    if (!res.ok) {
      return {
        ok: false,
        error: res.error || CONNECTION_ERROR,
        normalized,
      };
    }
    if (res.suggestions.length > 0) {
      const best = pickBestAddressSuggestion(normalized, res.suggestions);
      const resolved = await resolvePlaceSuggestion(best);
      if (!resolved?.coords) continue;
      if (isGeocodeTypesTooGeneric(resolved.types)) {
        sawGenericOnly = true;
        continue;
      }
      return {
        ok: true,
        endereco: resolved.label,
        coords: resolved.coords,
        normalized,
      };
    }
  }

  if (sawGenericOnly) {
    return {
      ok: false,
      error: GEOCODE_TOO_GENERIC_MSG,
      normalized,
    };
  }

  return {
    ok: false,
    error: `Não localizamos «${normalized}». Confira rua, número e cidade e tente de novo.`,
    normalized,
  };
}

// ── OpenRouteService ─────────────────────────────────────────────────────────

/**
 * V163 — Autocomplete via Google Places (country=SEARCH_COUNTRIES).
 * @param {string} query — texto já normalizado
 */
/** Origem da rota indica endereço de São Paulo (texto ou coordenadas). */
export function isSaoPauloOrigin(label, coords) {
  if (label) {
    const norm = String(label)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (
      norm.includes("sao paulo") ||
      /,\s*sp\b/.test(norm) ||
      /-\s*sp\b/.test(norm)
    ) {
      return true;
    }
  }
  if (coords?.length >= 2) {
    const [lng, lat] = coords;
    return (
      lat >= SAO_PAULO_BOUNDS.south &&
      lat <= SAO_PAULO_BOUNDS.north &&
      lng >= SAO_PAULO_BOUNDS.west &&
      lng <= SAO_PAULO_BOUNDS.east
    );
  }
  return false;
}

/** Viés de busca para paradas/destino quando a origem é de SP. */
export function buildCalculatorStopSearchBias(originLabel, originCoords) {
  const bias = {};
  if (originCoords?.length >= 2) {
    bias.proximityLngLat = originCoords;
  }
  if (isSaoPauloOrigin(originLabel, originCoords)) {
    bias.bounds = SAO_PAULO_BOUNDS;
    if (!bias.proximityLngLat) {
      bias.proximityLngLat = [-46.6333, -23.5505];
    }
  }
  return bias;
}

async function searchAddressesGoogle(query, searchOpts = {}) {
  warmGeocodeProximity();

  if (!API_KEYS.googleMaps) {
    return {
      ok: false,
      error: "Busca de endereços indisponível (configure VITE_GOOGLE_MAPS_KEY).",
      suggestions: [],
    };
  }

  try {
    const bounds = searchOpts.bounds ?? null;
    const proximityLngLat = bounds
      ? searchOpts.proximityLngLat ?? [-46.6333, -23.5505]
      : searchOpts.proximityLngLat ?? cachedGeocodeProximity;
    const queryForApi = query;
    const suggestions = await fetchGooglePlacePredictions(queryForApi, {
      proximityLngLat,
      bounds,
    });
    return { ok: true, suggestions };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || CONNECTION_ERROR,
      suggestions: [],
    };
  }
}

/**
 * Autocomplete de endereços (Brasil) — Google Places Autocomplete API.
 * @param {string} text
 * @param {{ skipNormalize?: boolean, proximityLngLat?: [number, number], bounds?: object }} [opts]
 * @returns {{ ok: true, suggestions: Array<{label, placeId?, coords?}> } | { ok: false, error: string, suggestions: [] }}
 */
export async function searchAddresses(text, opts = {}) {
  const query = opts.skipNormalize ? String(text || "").trim() : normalizeManualAddressInput(text);

  if (!query || query.length < 3) {
    return { ok: true, suggestions: [] };
  }

  const { skipNormalize: _sn, ...searchBias } = opts;
  return searchAddressesGoogle(query, searchBias);
}

function extractRouteAddresses(stops) {
  return (stops || [])
    .map((s) => String(s?.v || s?.endereco || "").trim())
    .filter(Boolean);
}

/** Plano de navegação compartilhado (Google Maps + Waze). */
function buildRouteNavigationPlan(stops) {
  return { addresses: extractRouteAddresses(stops) };
}

/**
 * Google Maps: origem = 1º endereço digitado + waypoints em sequência.
 * @param {Array<{ v?: string, endereco?: string }>} stops
 */
export async function openGoogleMapsDirections(stops) {
  const { addresses } = buildRouteNavigationPlan(stops);
  if (!addresses.length) return;

  const params = new URLSearchParams({ api: "1" });
  const destination = addresses[addresses.length - 1];
  params.set("destination", destination);

  if (addresses.length >= 2) {
    params.set("origin", addresses[0]);
    if (addresses.length > 2) {
      params.set("waypoints", addresses.slice(1, -1).join("|"));
    }
  }

  window.open(`https://www.google.com/maps/dir/?${params.toString()}`, "_blank");
}

/**
 * Google Maps — navegação por voz até uma parada (Otimizador / navegação embutida).
 * @param {{ endereco?: string, v?: string, coords?: number[] }} stop
 */
export function openGoogleMapsNavigationToStop(stop) {
  const addr = String(stop?.endereco || stop?.v || "").trim();
  if (!addr) return;

  const params = new URLSearchParams({
    api: "1",
    destination: addr,
    travelmode: "driving",
  });

  window.open(`https://www.google.com/maps/dir/?${params.toString()}`, "_blank");
}

/** Paradas com endereço preenchido (calculadoras / entregas). */
export function filterNavigationStops(stops) {
  return (stops || []).filter((s) => String(s?.v || s?.endereco || "").trim());
}

async function resolveStopLatLng(stop) {
  if (stop?.coords?.length >= 2) {
    return { lat: stop.coords[1], lng: stop.coords[0] };
  }
  const addr = String(stop?.v || stop?.endereco || "").trim();
  if (!addr) return null;
  warmGeocodeProximity();
  const g = await geocodeAddressGoogle(addr, {
    biasLngLat: cachedGeocodeProximity,
  });
  if (g?.tooGeneric) return null;
  if (g?.lat != null && g?.lng != null) {
    return { lat: g.lat, lng: g.lng };
  }
  return null;
}

/**
 * Waze deep link parada a parada (calculadoras Viagem/Frete).
 * @returns {Promise<boolean>}
 */
export async function openWazeStopDeepLink(stop) {
  const pos = await resolveStopLatLng(stop);
  if (!pos) return false;

  const { lat, lng } = pos;
  const deep = `waze://ul?ll=${lat},${lng}&navigate=yes`;
  const fallback = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;

  window.location.href = deep;
  setTimeout(() => {
    window.open(fallback, "_blank");
  }, 700);

  return true;
}

/**
 * Waze: mesma sequência de paradas que o Google Maps (Otimizar Entregas).
 * @param {Array<{ v?: string, endereco?: string }>} stops
 */
export async function openWazeDirections(stops) {
  const { addresses } = buildRouteNavigationPlan(stops);
  if (!addresses.length) return;

  const destination = addresses[addresses.length - 1];

  if (addresses.length === 1) {
    window.open(
      `https://waze.com/ul?q=${encodeURIComponent(destination)}&navigate=yes`,
      "_blank"
    );
    return;
  }

  const params = new URLSearchParams({ navigate: "yes", to: destination });
  params.set("from", addresses[0]);
  addresses.slice(1, -1).forEach((addr) => params.append("via", addr));

  window.open(`https://www.waze.com/live-map/directions?${params.toString()}`, "_blank");
}

/**
 * V171 — Distância driving origem → destino (Google Directions; fallback ORS).
 * @param {[number, number]} originCoords [lng, lat]
 * @param {[number, number]} destCoords [lng, lat]
 */
export async function fetchDrivingDistanceKm(originCoords, destCoords) {
  if (!originCoords || !destCoords) {
    return {
      ok: false,
      error: "Coordenadas de origem e destino são obrigatórias.",
      distanceKm: null,
      durationSeconds: null,
    };
  }

  if (API_KEYS.googleMaps) {
    const google = await fetchGoogleDrivingDistanceKm(originCoords, destCoords);
    if (google.ok && google.distanceKm != null) return google;
  }

  if (!API_KEYS.ors) {
    return {
      ok: false,
      error: CONNECTION_ERROR,
      distanceKm: null,
      durationSeconds: null,
    };
  }

  const res = await fetchJson(API_ENDPOINTS.orsDirections, {
    method: "POST",
    headers: { ...ORS_HEADERS.json, ...ORS_HEADERS.auth() },
    body: JSON.stringify({
      coordinates: [originCoords, destCoords],
      units: "km",
    }),
  });

  if (res.networkError) {
    return { ok: false, error: CONNECTION_ERROR, distanceKm: null, durationSeconds: null };
  }

  const dist = res.data?.routes?.[0]?.summary?.distance;
  const distanceKm = dist ? Math.round(dist) : null;
  const dur = res.data?.routes?.[0]?.summary?.duration;
  const durationSeconds =
    Number.isFinite(dur) && dur > 0 ? Math.round(dur) : null;

  return { ok: true, distanceKm, durationSeconds };
}

/**
 * Geocodifica paradas da calculadora que têm texto mas ainda não têm coords.
 * @param {Array<{ v?: string, coords?: number[] | null }>} stops
 */
export async function resolveCalculatorStopsCoords(stops) {
  warmGeocodeProximity();
  const bias = cachedGeocodeProximity;
  const out = [];

  for (const stop of stops || []) {
    if (stop?.coords?.length >= 2) {
      out.push({ ...stop, coords: stop.coords });
      continue;
    }
    const addr = String(stop?.v || "").trim();
    if (!addr) {
      out.push({ ...stop, coords: null });
      continue;
    }
    const g = await geocodeAddressGoogle(addr, { biasLngLat: bias });
    if (g && !g.tooGeneric) {
      out.push({ ...stop, coords: [g.lng, g.lat] });
    } else {
      out.push({ ...stop, coords: null });
    }
  }

  return out;
}

/**
 * V171 — Soma distâncias driving (Google Directions) de trechos consecutivos com coordenadas.
 * @param {Array<[number, number] | null>} coordsList [lng,lat] por parada, na ordem da rota
 * @returns {{ ok: true, distanceKm: number, segmentKm: number[] } | { ok: false, error?: string, segmentKm: [] }}
 */
export async function fetchRouteTotalDistanceKm(coordsList) {
  if (!coordsList?.length || coordsList.length < 2) {
    return {
      ok: false,
      error: "Rota incompleta.",
      distanceKm: null,
      durationSeconds: null,
      segmentKm: [],
    };
  }

  const segmentKm = [];
  let total = 0;
  let totalDuration = 0;
  let hasDuration = true;

  for (let i = 0; i < coordsList.length - 1; i++) {
    const a = coordsList[i];
    const b = coordsList[i + 1];
    if (!a || !b) {
      segmentKm.push(null);
      continue;
    }
    const out = await fetchDrivingDistanceKm(a, b);
    if (!out.ok || out.distanceKm == null) {
      return {
        ok: false,
        error: out.error,
        distanceKm: null,
        durationSeconds: null,
        segmentKm: [],
      };
    }
    segmentKm.push(out.distanceKm);
    total += out.distanceKm;
    if (Number.isFinite(out.durationSeconds) && out.durationSeconds > 0) {
      totalDuration += out.durationSeconds;
    } else {
      hasDuration = false;
    }
  }

  const validSegments = segmentKm.filter((km) => km != null);
  if (validSegments.length === 0) {
    return {
      ok: false,
      error: "Defina origem e destino no mapa.",
      distanceKm: null,
      durationSeconds: null,
      segmentKm: [],
    };
  }

  return {
    ok: true,
    distanceKm: total,
    durationSeconds: hasDuration && totalDuration > 0 ? totalDuration : null,
    segmentKm,
  };
}

// ── Google Geocoding ─────────────────────────────────────────────────────────

/** Geocodifica um endereço para exibição no mapa. */
export async function geocodeAddressForDisplay(endereco) {
  warmGeocodeProximity();
  const g = await geocodeAddressGoogle(endereco, {
    biasLngLat: cachedGeocodeProximity,
  });
  if (!g || g.tooGeneric) return null;
  return { lng: g.lng, lat: g.lat };
}

/**
 * Geocoding de endereços extraídos por OCR (romaneio).
 * Proximity: GPS do motorista → último endereço geocodificado com sucesso.
 */
export async function geocodeRomaneioExtractedAddress(endereco, biasLngLat = null) {
  if (!API_KEYS.googleMaps || !endereco?.trim()) {
    return { ok: false, endereco: null, coords: null, error: "Endereço vazio." };
  }

  warmGeocodeProximity();
  const proximity = biasLngLat?.length >= 2 ? biasLngLat : resolveProximityForRomaneio();
  const g = await geocodeAddressGoogle(endereco, { biasLngLat: proximity });

  if (!g) {
    return {
      ok: false,
      endereco: null,
      coords: null,
      error: "Não foi possível localizar o endereço.",
    };
  }

  if (g.tooGeneric) {
    return {
      ok: false,
      endereco: null,
      coords: null,
      error: GEOCODE_TOO_GENERIC_MSG,
      tooGeneric: true,
    };
  }

  const coords = [g.lng, g.lat];
  lastRomaneioGeocodeProximity = coords;

  return {
    ok: true,
    endereco: g.formattedAddress || endereco,
    coords,
  };
}

/**
 * V159 — Geocodifica lista de endereços do romaneio em sequência.
 * V232 — viés por chamada: GPS do motorista → média das já geocodificadas.
 * Endereços genéricos demais (país/UF/cidade) são marcados e não entram com coords.
 */
export async function geocodeRomaneioExtractedAddresses(paradas, onProgress) {
  warmGeocodeProximity();
  const out = [];
  const lista = paradas || [];
  const total = lista.length;
  const resolvedCoords = lista
    .map((p) => (Array.isArray(p?.coords) && p.coords.length >= 2 ? p.coords : null))
    .filter(Boolean);
  for (const p of lista) {
    const bias = resolveStopGeocodeBias(resolvedCoords);
    const g = await geocodeRomaneioExtractedAddress(p.endereco, bias);
    if (g.ok) {
      resolvedCoords.push(g.coords);
      out.push({ ...p, endereco: g.endereco, coords: g.coords });
    } else {
      out.push({
        ...p,
        coords: null,
        geocodeRejected: true,
        geocodeError: g.error || GEOCODE_TOO_GENERIC_MSG,
        tooGeneric: !!g.tooGeneric,
      });
    }
    // V235 — progresso real ("X de Y") para o overlay de importação
    try { onProgress?.(out.length, total); } catch { /* ignore */ }
  }
  return out;
}

/**
 * Usa coords já geocodificadas na parada; senão Google Geocoding (otimização).
 * V232 — aceita viés explícito (GPS / média das paradas já geocodificadas).
 */
async function resolveParadaCoordForOptimization(parada, biasLngLat = null) {
  const c = parada?.coords;
  if (Array.isArray(c) && c.length >= 2) {
    return { lng: Number(c[0]), lat: Number(c[1]) };
  }
  if (c && typeof c.lng === "number" && typeof c.lat === "number") {
    return { lng: c.lng, lat: c.lat };
  }
  warmGeocodeProximity();
  const proximity = biasLngLat?.length >= 2 ? biasLngLat : resolveProximityForRomaneio();
  const g = await geocodeAddressGoogle(parada.endereco, { biasLngLat: proximity });
  if (!g || g.tooGeneric) return null;
  return { lng: g.lng, lat: g.lat };
}

// ── Romaneio: Google Cloud Vision (TEXT_DETECTION) ───────────────────────────
// Instrução de extração (Vision não aceita prompt nativo — aplicada no pós-processamento OCR):
// VISION_ADDRESS_EXTRACTION_INSTRUCTION em romaneioParser.js

function visionErrorMessage(res) {
  const apiMsg =
    res?.data?.error?.message ||
    res?.data?.responses?.[0]?.error?.message;
  if (apiMsg) return String(apiMsg);
  if (res?.status === 401 || res?.status === 403) {
    return "Chave Google Vision inválida. Verifique VITE_GOOGLE_VISION_API_KEY no arquivo .env.";
  }
  if (res?.status === 429) {
    return "Limite da API Google Vision atingido. Aguarde um momento e tente de novo.";
  }
  if (res?.status) return `Erro na leitura do romaneio (código ${res.status}).`;
  return "Erro ao processar a imagem. Verifique sua conexão e tente novamente.";
}

function extractVisionOcrText(data) {
  const response = data?.responses?.[0];
  if (!response) return "";
  if (response.fullTextAnnotation?.text) return response.fullTextAnnotation.text;
  if (response.textAnnotations?.[0]?.description) {
    return response.textAnnotations[0].description;
  }
  return "";
}

/**
 * V260 — fallback Pro: Claude Haiku interpreta texto OCR bruto do Vision.
 * @param {string} rawText
 * @param {{ signal?: { aborted?: boolean } }} [options]
 * @returns {Promise<Array<{ nome: string, endereco: string, complemento?: string }>|null>}
 */
async function extractDeliveryEntriesViaClaude(rawText, options = {}) {
  const { signal } = options;
  const key = API_KEYS.anthropic;
  if (!key || !String(rawText || "").trim()) return null;
  if (signal?.aborted) return null;

  const prompt = `Você recebe texto OCR bruto de etiquetas de entrega brasileiras.
Extraia cada etiqueta/destinatário como um objeto JSON com exatamente as chaves "nome", "endereco" e "complemento".
- "nome": nome do destinatário (string vazia se não houver)
- "endereco": endereço de entrega SEM complemento de unidade (rua, número, bairro, cidade, estado, CEP quando possível)
- "complemento": apto, bloco, casa, fundos, sala etc. quando aparecer na etiqueta (ex.: "Apto 22", "Bloco B"); string vazia se não houver
Ignore códigos de rastreio, remetente, peso, dimensões e outros dados que não sejam destinatário/endereço/complemento.
Responda APENAS com um array JSON válido, sem markdown, sem texto extra, sem comentários.
Exemplo: [{"nome":"João Silva","endereco":"Rua das Flores, 120, Centro, São Paulo - SP, 01310-100","complemento":"Apto 22"}]

Texto OCR:
${String(rawText).trim()}`;

  try {
    const res = await fetch(API_ENDPOINTS.anthropicMessages, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: CLAUDE_OCR_MODEL,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (signal?.aborted) return null;

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Claude HTTP ${res.status}${errBody ? `: ${errBody.slice(0, 120)}` : ""}`);
    }

    const data = await res.json();
    const textBlock = (data.content || []).find((c) => c.type === "text");
    const responseText = textBlock?.text || "";
    const entries = parseClaudeDeliveryEntriesResponse(responseText);
    return entries.length ? entries : null;
  } catch (err) {
    logOcr("Claude fallback falhou", err?.message || "erro desconhecido");
    return null;
  }
}

/**
 * V260/V368 — Claude quando Vision tem baixa confiança OU (Pro) faltam nomes.
 */
async function maybeClaudeOcrFallback(rawText, visionEntries, options = {}) {
  const { isPro, signal, onProgress } = options;
  const visionSnapshot = Array.isArray(visionEntries) ? [...visionEntries] : [];
  const confidence = assessVisionOcrConfidence(rawText, visionSnapshot);
  const missingNome = entriesMissingDestinatarioNome(visionSnapshot);
  const shouldFallback = confidence.low || (isPro && missingNome);

  if (!isPro || !API_KEYS.anthropic || !shouldFallback) {
    return { entries: visionSnapshot, method: "vision", confidence };
  }

  logOcr(
    confidence.low
      ? "Vision confianca baixa -> fallback Claude"
      : "Nomes ausentes (Pro) -> fallback Claude",
    {
      score: confidence.score,
      reasons: confidence.reasons,
      missingNome,
    }
  );

  onProgress?.(82, "Interpretando com IA…");

  const claudeEntries = await extractDeliveryEntriesViaClaude(rawText, { signal });
  if (signal?.aborted) {
    return { entries: visionSnapshot, method: "vision", confidence };
  }

  if (claudeEntries?.length) {
    logOcr("Claude extraiu:", claudeEntries);
    if (confidence.low) {
      return { entries: claudeEntries, method: "vision+claude", confidence };
    }
    // Só faltava nome: preserva endereços do Vision e preenche nomes do Claude
    const merged = visionSnapshot.map((v, i) => {
      if (String(v?.nome || "").trim()) return v;
      const nome = String(claudeEntries[i]?.nome || "").trim();
      return nome ? { ...v, nome } : v;
    });
    return { entries: merged, method: "vision+claude-nome", confidence };
  }

  return { entries: visionSnapshot, method: "vision", confidence };
}

/**
 * Envia imagem do romaneio ao Google Cloud Vision e extrai endereços via OCR.
 * @param {Blob|File} file
 * @param {{ onProgress?: (pct: number, status: string) => void, signal?: { aborted?: boolean } }} [options]
 */
export async function extractRomaneioAddressesFromImageVision(file, options = {}) {
  const { onProgress, signal, isPro = false } = options;
  const report = (pct, status) => {
    if (!signal?.aborted) onProgress?.(pct, status);
  };

  if (!API_KEYS.googleVision) {
    return {
      ok: false,
      error:
        "Leitura automática indisponível. Configure VITE_GOOGLE_VISION_API_KEY no arquivo .env.",
      addresses: [],
      method: "vision",
    };
  }

  if (signal?.aborted) {
    return { ok: false, error: "Leitura cancelada.", addresses: [], method: "vision" };
  }

  try {
    report(20, "Preparando imagem…");
    const imgBase64 = await readFileAsBase64(file);

    if (signal?.aborted) {
      return { ok: false, error: "Leitura cancelada.", addresses: [], method: "vision" };
    }

    report(40, "Enviando para leitura OCR…");
    const url = `${API_ENDPOINTS.googleVisionAnnotate}?key=${API_KEYS.googleVision}`;

    const res = await fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: imgBase64 },
            features: [{ type: "TEXT_DETECTION" }],
            imageContext: {
              languageHints: ["pt", "pt-BR"],
            },
          },
        ],
      }),
    });

    if (signal?.aborted) {
      return { ok: false, error: "Leitura cancelada.", addresses: [], method: "vision" };
    }

    if (res.networkError) {
      return {
        ok: false,
        error: "Sem conexão. Verifique a internet e tente novamente.",
        addresses: [],
        method: "vision",
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        error: visionErrorMessage(res),
        addresses: [],
        method: "vision",
      };
    }

    report(75, "Interpretando endereços…");
    const texto = extractVisionOcrText(res.data);
    const visionEntries = parseDeliveryEntriesFromLabelText(texto);
    const fallback = await maybeClaudeOcrFallback(texto, visionEntries, {
      isPro,
      signal,
      onProgress: report,
    });
    const entries = fallback.entries;
    const ocrMethod = fallback.method;
    const addresses = entries.map((e) => e.endereco);
    const paradas = buildParadasFromEntries(entries);

    if (!texto.trim()) {
      return {
        ok: false,
        error:
          "Nenhum texto encontrado na foto. Tente mais luz, enquadre o romaneio ou use o input manual.",
        addresses: [],
        failedCount: 0,
        method: "vision",
        rawTextPreview: "",
      };
    }

    if (paradas.length === 0) {
      return {
        ok: false,
        error:
          "Nenhum endereço encontrado na foto. Tente mais luz, enquadre o romaneio ou use o input manual.",
        addresses: [],
        failedCount: 0,
        method: "vision",
        rawTextPreview: texto.slice(0, 400),
      };
    }

    report(100, "Concluído");
    return {
      ok: true,
      addresses,
      paradas,
      failedCount: 0,
      method: ocrMethod,
    };
  } catch (err) {
    if (signal?.aborted) {
      return { ok: false, error: "Leitura cancelada.", addresses: [], method: "vision" };
    }
    return {
      ok: false,
      error:
        err?.message ||
        "Erro ao processar a imagem. Verifique sua conexão e tente novamente.",
      addresses: [],
      method: "vision",
    };
  }
}

/**
 * Converte foto/PDF em imagem e extrai endereços via Google Cloud Vision OCR.
 * @param {Blob|File} file
 * @param {{ onProgress?: (pct: number, status: string) => void, signal?: { aborted?: boolean } }} [options]
 */
async function resolveRomaneioImageFile(file) {
  try {
    const blob = await fileToImageBlob(file);
    if (blob instanceof File) return blob;
    const name = (file.name || "romaneio").replace(/\.pdf$/i, ".jpg");
    return new File([blob], name, { type: blob.type || "image/jpeg" });
  } catch (err) {
    throw new Error(
      err?.message ||
        "Não foi possível abrir o arquivo. Use foto (JPG/PNG) ou PDF com a 1ª página legível."
    );
  }
}

export async function extractRomaneioAddressesFromImage(file, options = {}) {
  const { onProgress, signal, isPro = false } = options;

  if (!file) {
    return { ok: false, error: "Nenhum arquivo selecionado.", addresses: [] };
  }

  if (signal?.aborted) {
    return { ok: false, error: "Leitura cancelada.", addresses: [] };
  }

  onProgress?.(8, "Preparando arquivo…");

  let imageFile;
  try {
    imageFile = await resolveRomaneioImageFile(file);
  } catch (err) {
    return { ok: false, error: err.message, addresses: [] };
  }

  return extractRomaneioAddressesFromImageVision(imageFile, {
    onProgress,
    signal,
    isPro,
  });
}

/**
 * V166 — Geocodifica paradas; origem = GPS do motorista (fallback: 1ª parada).
 * @param {Array<{id, endereco}>} paradas
 */
export async function optimizeDeliveryRoute(paradas, options = {}) {
  const {
    consumoKmL = 10,
    precoCombustivel = 5.89,
    driverOriginCoords = null,
  } = options;

  if (!paradas || paradas.length < 2) {
    return { ok: false, error: "Adicione pelo menos 2 paradas." };
  }

  try {
    const entries = [];
    for (const parada of paradas) {
      const coord = await resolveParadaCoordForOptimization(parada);
      if (coord) entries.push({ parada, coord });
    }

    if (entries.length < 2) {
      return {
        ok: false,
        error: "Não foi possível localizar os endereços. Verifique se estão completos.",
      };
    }

    let driverOrigin = null;
    if (driverOriginCoords?.length >= 2) {
      driverOrigin = { lng: driverOriginCoords[0], lat: driverOriginCoords[1] };
    } else {
      const driverPos = await getDriverGeolocation({ preferFresh: true });
      driverOrigin = driverPos
        ? { lng: driverPos.lng, lat: driverPos.lat }
        : null;
    }

    const optRes = await fetchGoogleOptimizedRoute(entries, driverOrigin);

    if (!optRes.ok) {
      return { ok: false, error: optRes.error || "Erro na otimização. Tente novamente." };
    }

    const paradasOtimizadas = reorderStopsByGoogleWaypointOrder(
      entries,
      optRes.waypointOrder,
      optRes.route,
      { allAsWaypoints: optRes.usedDriverOrigin }
    );
    const resultado = buildOptimizationMetrics({
      trip: {
        distance: optRes.totalDistanceM,
        duration: optRes.totalDurationS,
      },
      fallbackStopCount: entries.length,
      consumoKmL,
      precoCombustivel,
    });

    return {
      ok: true,
      paradasOtimizadas,
      resultado,
      motoristaCoords: driverOrigin ? [driverOrigin.lng, driverOrigin.lat] : null,
      usedDriverOrigin: optRes.usedDriverOrigin,
    };
  } catch {
    return { ok: false, error: CONNECTION_ERROR };
  }
}

// ── V231 — Motor de otimização híbrido ───────────────────────────────────────

/**
 * Etapa 1 — posição GPS FRESCA do motorista (nunca cache).
 * Falha/negado → null (o chamador usa a 1ª parada como origem, sem travar).
 * @returns {Promise<{ lng: number, lat: number } | null>}
 */
function getFreshDriverPosition() {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        cachedGeocodeProximity = [pos.coords.longitude, pos.coords.latitude];
        geocodeProximityRequested = true;
        resolve({ lng: pos.coords.longitude, lat: pos.coords.latitude });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

/** V232 — distância máxima (km) ao centro mediano antes de sinalizar outlier. */
const OUTLIER_RADIUS_KM = 20;

/**
 * V231 — Otimização híbrida em 3 etapas:
 *  1. Origem = GPS atual (fresco). Falha → 1ª parada vira origem (gpsFalhou).
 *  2. Sequenciamento no aparelho (Nearest Neighbor + 2-opt, rota aberta) —
 *     sem limite de 25 paradas, suporta 100+.
 *  3. Directions API SEM optimizeWaypoints, em blocos de até 25 pontos, apenas
 *     para distância/duração reais e polyline do trajeto.
 *
 * Economia ("Você economizou") = custo haversine da ordem original − ordem
 * otimizada (mesma métrica, comparação justa).
 *
 * Paradas sem coordenadas e com geocodificação falha NÃO entram na otimização:
 * retorna { ok:false, paradasInvalidas:[ids] } para a UI sinalizar.
 * @param {Array<{ id, endereco, coords? }>} paradas
 */
export async function optimizeDeliveryRouteHybrid(paradas, options = {}) {
  const {
    consumoKmL = 10,
    precoCombustivel = 5.89,
    driverOriginCoords = null,
    onStage = null, // V235 — callback de etapa p/ overlay: geocodificando|otimizando|desenhando
  } = options;
  const stage = (s) => { try { onStage?.(s); } catch { /* ignore */ } };

  if (!paradas || paradas.length < 2) {
    return { ok: false, error: "Adicione pelo menos 2 paradas." };
  }

  try {
    // Validação: geocodifica o que falta; falhas são sinalizadas (não entram silenciosamente)
    // V232 — viés por chamada: GPS do motorista → média das paradas já geocodificadas
    stage("geocodificando");
    const entries = [];
    const paradasInvalidas = [];
    const resolvedCoords = paradas
      .map((p) => (Array.isArray(p?.coords) && p.coords.length >= 2 ? p.coords : null))
      .filter(Boolean);
    for (const parada of paradas) {
      const bias = resolveStopGeocodeBias(resolvedCoords);
      const coord = await resolveParadaCoordForOptimization(parada, bias);
      if (coord && Number.isFinite(coord.lat) && Number.isFinite(coord.lng)) {
        const { geocodeFalhou: _gf, outlier: _ol, ...rest } = parada;
        entries.push({ parada: rest, coord: { lat: coord.lat, lng: coord.lng } });
        resolvedCoords.push([coord.lng, coord.lat]);
      } else {
        paradasInvalidas.push(parada.id);
      }
    }

    if (paradasInvalidas.length > 0) {
      return {
        ok: false,
        error:
          paradasInvalidas.length === 1
            ? "1 endereço não foi localizado no mapa. Confirme este endereço antes de otimizar."
            : `${paradasInvalidas.length} endereços não foram localizados no mapa. Confirme estes endereços antes de otimizar.`,
        paradasInvalidas,
      };
    }

    if (entries.length < 2) {
      return {
        ok: false,
        error: "Não foi possível localizar os endereços. Verifique se estão completos.",
      };
    }

    // V232 — detector de outlier (rede de segurança): paradas a mais de 20 km do
    // centro mediano são sinalizadas e a otimização só prossegue após o usuário
    // confirmar (outlierConfirmado), corrigir ou remover. Nunca entram silenciosamente.
    const center = medianCenter(entries.map((e) => e.coord));
    const paradasForaDaArea = center
      ? entries
          .filter(
            (e) =>
              !e.parada.outlierConfirmado &&
              haversine(center, e.coord) > OUTLIER_RADIUS_KM
          )
          .map((e) => e.parada.id)
      : [];

    if (paradasForaDaArea.length > 0) {
      return {
        ok: false,
        error:
          paradasForaDaArea.length === 1
            ? "1 endereço está muito distante das demais paradas. Confirme a cidade antes de otimizar."
            : `${paradasForaDaArea.length} endereços estão muito distantes das demais paradas. Confirme a cidade antes de otimizar.`,
        paradasForaDaArea,
      };
    }

    // Etapa 1 — origem = GPS atual (fresco); falha → 1ª parada
    let origin = null;
    let gpsFalhou = false;
    if (driverOriginCoords?.length >= 2) {
      origin = { lng: driverOriginCoords[0], lat: driverOriginCoords[1] };
    } else {
      origin = await getFreshDriverPosition();
      if (!origin) gpsFalhou = true;
    }

    let fixedFirst = null;
    let toOptimize = entries;
    if (!origin) {
      fixedFirst = entries[0];
      origin = fixedFirst.coord;
      toOptimize = entries.slice(1);
    }

    // Etapa 2 — sequenciamento no aparelho (NN + 2-opt, rota aberta)
    stage("otimizando");
    const orderIdx = optimizeOpenRoute(
      origin,
      toOptimize.map((e) => e.coord)
    );
    let orderedEntries = [
      ...(fixedFirst ? [fixedFirst] : []),
      ...orderIdx.map((i) => toOptimize[i]),
    ];

    // V233 — sanidade pós-otimização: a Parada 1 DEVE ser a mais próxima da origem.
    // Se não for, loga erro com as coordenadas e corrige ancorando a mais próxima
    // como 1ª (re-otimiza o restante a partir dela, sem tocar no algoritmo).
    if (!fixedFirst && orderedEntries.length > 1) {
      let nearestIdx = 0;
      let nearestDist = Infinity;
      orderedEntries.forEach((e, i) => {
        const d = haversine(origin, e.coord);
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = i;
        }
      });
      if (nearestIdx !== 0) {
        console.error("[LogRotas otimizador] Parada 1 não é a mais próxima da origem — corrigindo", {
          origem: origin,
          parada1: {
            endereco: orderedEntries[0].parada?.endereco,
            coord: orderedEntries[0].coord,
            distKm: haversine(origin, orderedEntries[0].coord).toFixed(2),
          },
          maisProxima: {
            endereco: orderedEntries[nearestIdx].parada?.endereco,
            coord: orderedEntries[nearestIdx].coord,
            distKm: nearestDist.toFixed(2),
          },
        });
        const anchor = orderedEntries[nearestIdx];
        const rest = orderedEntries.filter((_, i) => i !== nearestIdx);
        const restOrder = optimizeOpenRoute(anchor.coord, rest.map((e) => e.coord));
        orderedEntries = [anchor, ...restOrder.map((i) => rest[i])];
      }
    }

    // V233 — diagnóstico da origem usada na otimização
    const primeira = orderedEntries[0];
    devLog("[LogRotas otimizador] diagnóstico", {
      origem: { lat: origin.lat, lng: origin.lng },
      fonte: gpsFalhou ? "fallback (1ª parada)" : driverOriginCoords?.length >= 2 ? "gps (informado)" : "gps (fresco)",
      parada1: primeira?.parada?.endereco,
      distanciaAteParada1Km: primeira ? haversine(origin, primeira.coord).toFixed(2) : null,
    });

    const paradasOtimizadas = orderedEntries.map((entry, i) => ({
      ...entry.parada,
      ordem: i + 1,
      coords: [entry.coord.lng, entry.coord.lat],
    }));

    // Economia honesta: haversine da ordem original vs otimizada (mesma métrica)
    const kmOriginalHav = openRouteDistanceKm(
      origin,
      entries.map((e) => e.coord)
    );
    const kmOtimizadoHav = openRouteDistanceKm(
      origin,
      orderedEntries.map((e) => e.coord)
    );

    // Etapa 3 — Directions em blocos (distância/duração reais + polyline)
    stage("desenhando");
    const blocks = await fetchGoogleRouteInBlocks(
      [origin, ...orderedEntries.map((e) => e.coord)],
      ["(origem)", ...orderedEntries.map((e) => e.parada?.endereco || "")]
    );

    const cons = parseFloat(consumoKmL) || 10;
    const preco = parseFloat(precoCombustivel) || 5.89;

    const kmOtimizado =
      blocks.ok && blocks.blocksOk === blocks.blocksTotal
        ? parseFloat((blocks.totalDistanceM / 1000).toFixed(1))
        : parseFloat(kmOtimizadoHav.toFixed(1));
    const economiaKmRaw = kmOriginalHav - kmOtimizadoHav;
    // V233 — economia ≤ 0,1 km conta como "rota já ideal" (card nunca fica mudo)
    const rotaJaIdeal = !Number.isFinite(economiaKmRaw) || economiaKmRaw <= 0.1;
    const economiaKm = rotaJaIdeal ? 0 : parseFloat(economiaKmRaw.toFixed(1));
    const economiaCusto = parseFloat(((economiaKm / cons) * preco).toFixed(2));
    const tempoEstimado =
      blocks.ok && blocks.totalDurationS > 0
        ? Math.round(blocks.totalDurationS / 60)
        : Math.round(kmOtimizado * 2.5);
    const tempoEstimadoSeg =
      blocks.ok && blocks.totalDurationS > 0 ? blocks.totalDurationS : null;
    const legDurationsS = Array.isArray(blocks.legDurationsS)
      ? blocks.legDurationsS
      : [];
    const custoTotal = parseFloat(((kmOtimizado / cons) * preco).toFixed(2));

    return {
      ok: true,
      paradasOtimizadas,
      resultado: {
        kmOriginal: parseFloat((kmOtimizado + economiaKm).toFixed(1)),
        kmOtimizado,
        economiaKm,
        economiaCusto,
        tempoEstimado,
        tempoEstimadoSeg,
        legDurationsS,
        custoTotal,
        rotaJaIdeal,
      },
      motoristaCoords: gpsFalhou || fixedFirst ? null : [origin.lng, origin.lat],
      usedDriverOrigin: !gpsFalhou && !fixedFirst,
      gpsFalhou,
      routePath: blocks.overviewPath,
      // V233 — algum bloco da Directions falhou após retry (a ORDEM não é afetada)
      trajetoParcial: blocks.blocksTotal > 0 && blocks.blocksOk < blocks.blocksTotal,
    };
  } catch {
    return { ok: false, error: CONNECTION_ERROR };
  }
}

/**
 * V233 — Trecho da rota para mapas densos (>10 paradas): posição atual →
 * próximas 2-3 paradas pendentes. Devolve a polyline ou null.
 * @param {[number, number] | null} originLngLat
 * @param {Array<{ endereco?: string, coords?: number[] }>} stops
 */
export async function fetchRouteSegmentPath(originLngLat, stops) {
  const pts = [];
  const labels = [];
  if (originLngLat?.length >= 2) {
    pts.push({ lat: originLngLat[1], lng: originLngLat[0] });
    labels.push("(posição atual)");
  }
  for (const s of stops || []) {
    if (s?.coords?.length >= 2) {
      pts.push({ lat: s.coords[1], lng: s.coords[0] });
      labels.push(s.endereco || "");
    }
  }
  if (pts.length < 2) return null;
  const out = await fetchGoogleRouteInBlocks(pts, labels);
  return out.ok && out.overviewPath?.length >= 2 ? out.overviewPath : null;
}

/**
 * Reotimiza paradas pendentes + nova parada, preservando as já concluídas.
 * Usa a posição atual do motorista como origem quando informada.
 * `useHybrid: true` roteia pelo motor V231 (NN + 2-opt no aparelho).
 */
export async function reoptimizeRemainingDeliveryRoute(
  concluidas,
  pendentes,
  novaParada,
  options = {}
) {
  const { useHybrid = false, ...rest } = options;
  const lista = [...(pendentes || []), novaParada];
  if (lista.length < 2) {
    return {
      ok: true,
      paradas: [...(concluidas || []), ...lista],
      paradasOtimizadas: lista,
      resultado: null,
      motoristaCoords: rest.driverOriginCoords || null,
    };
  }

  const out = useHybrid
    ? await optimizeDeliveryRouteHybrid(lista, rest)
    : await optimizeDeliveryRoute(lista, rest);
  if (!out.ok) return out;

  return {
    ...out,
    paradas: [...(concluidas || []), ...out.paradasOtimizadas],
  };
}

// ── Cálculos puros (sem rede) ────────────────────────────────────────────────

/** Soma distâncias por trecho (km). */
export function sumSegmentDistancesKm(segmentDistances) {
  return (segmentDistances || [])
    .map((d) => parseNumeroBR(d) || 0)
    .reduce((a, b) => a + b, 0);
}

/**
 * Custos da calculadora de Rotas + Frete.
 * @returns {{ ok: true, result: object } | { ok: false, error: string }}
 */
export function calculateRouteCosts(input) {
  const {
    segmentDistances,
    hasOrigin,
    hasDestination,
    isElec,
    isTruck,
    fuelPrice,
    consumo,
    defaultKwhPer100 = 0.2,
    defaultConsumptionKmL = 1,
    arlaConsumption,
    arlaPrice,
    tollTotalReais,
    vehicleId,
    vehicleLabel,
    vehicleAxles,
    trailerExtra = 0,
    freight,
  } = input;

  const tot = sumSegmentDistancesKm(segmentDistances);

  if (!hasOrigin) {
    return { ok: false, error: "⚠️ Preencha o campo de Origem." };
  }
  if (!hasDestination) {
    return { ok: false, error: "⚠️ Preencha o campo de Destino." };
  }
  if (!tot) {
    return { ok: false, error: "⚠️ Preencha a distância em km antes de calcular." };
  }
  if (!fuelPrice || parseNumeroBR(fuelPrice) <= 0) {
    return { ok: false, error: "⚠️ Preencha o preço do combustível." };
  }
  if (!input.metaLocal || parseNumeroBR(input.metaLocal) <= 0) {
    return { ok: false, error: "⚠️ Preencha seu valor por km para ver o lucro estimado." };
  }

  let energyCost = 0;
  if (isElec) {
    const kwhPer100 = parseNumeroBR(consumo) || defaultKwhPer100;
    energyCost = (tot / 100) * kwhPer100 * (parseNumeroBR(fuelPrice) || 0);
  } else {
    energyCost =
      (tot / (parseNumeroBR(consumo) || defaultConsumptionKmL || 1)) *
      (parseNumeroBR(fuelPrice) || 0);
  }

  const arlaL100 = parseNumeroBR(arlaConsumption) || 3.5;
  const arlaCost = isTruck ? (tot / 100) * arlaL100 * (parseNumeroBR(arlaPrice) || 0) : 0;

  const eixosPedagio = totalEixosPedagio({
    vehicleId,
    vehicleAxles,
    trailerExtra,
  });
  const tollCost = custoPedagioEscalado(tollTotalReais, {
    vehicleId,
    vehicleAxles,
    trailerExtra,
    context: CALC_FRETE,
  });
  const custoKmRaw = Number(input.custoKmVeiculo);
  const custoKmVeiculo =
    Number.isFinite(custoKmRaw) && custoKmRaw > 0 ? custoKmRaw : 0;
  const custoVeiculo =
    custoKmVeiculo > 0 && tot > 0 ? custoKmVeiculo * tot : 0;
  const total = energyCost + arlaCost + tollCost + custoVeiculo;
  const freteVal = parseNumeroBR(freight) || 0;
  const lucro = freteVal - total;
  const tempoRaw = Number(input.tempoEstimadoSeg);
  const tempoEstimadoSeg =
    Number.isFinite(tempoRaw) && tempoRaw > 0 ? tempoRaw : null;

  return {
    ok: true,
    result: {
      tot,
      energyCost,
      arlaCost,
      tollCost,
      custoVeiculo,
      custoKmVeiculo,
      total,
      lucro,
      margem: freteVal ? (lucro / freteVal) * 100 : null,
      freteVal,
      totalAxles: eixosPedagio,
      pedagioDescricao: descricaoPedagioResultado({
        vehicleId,
        vehicleLabel,
        totalEixos: eixosPedagio,
        trailerExtra,
      }),
      isElec,
      isTruck,
      tempoEstimadoSeg,
    },
  };
}

export function calculateFreteQuote(
  routeResult,
  { valorPorKm, adicionalFixo, valorMinimoSaida, kmInclusosMinimo }
) {
  const vkm = parseNumeroBR(valorPorKm) || 0;
  const adic = parseNumeroBR(adicionalFixo) || 0;
  const kmTotal = routeResult.tot || 0;
  const minVal = parseNumeroBR(valorMinimoSaida);
  const kmInclusos = parseNumeroBR(kmInclusosMinimo);
  const useMinimum = minVal > 0 && kmInclusos > 0 && kmTotal > 0;

  let freteSug = 0;
  let kmExcedente = 0;

  if (useMinimum) {
    if (kmTotal <= kmInclusos) {
      freteSug = minVal + adic;
    } else {
      kmExcedente = kmTotal - kmInclusos;
      freteSug = minVal + kmExcedente * vkm + adic;
    }
  } else if (kmTotal > 0 && vkm > 0) {
    freteSug = kmTotal * vkm + adic;
  }

  const lucroFinal = freteSug > 0 ? freteSug - routeResult.total : 0;
  const ok = lucroFinal > 0;
  return {
    freteSug,
    lucroFinal,
    ok,
    vkm,
    adic,
    usedMinimum: useMinimum,
    kmExcedente,
  };
}

export function calculateProfitMeta({ lucroFinal, freteSug, metaLucroPercent }) {
  const meta = parseNumeroBR(metaLucroPercent);
  if (!meta || meta <= 0 || freteSug <= 0) return null;

  const margemReal = (lucroFinal / freteSug) * 100;
  const pct = Math.min((margemReal / meta) * 100, 100);
  const atingiu = margemReal >= meta;
  const quase = !atingiu && pct >= 80;

  return {
    margemReal,
    pct,
    atingiu,
    quase,
    cor: atingiu ? "#15803D" : quase ? "#D97706" : "#DC2626",
    bg: atingiu ? "#F0FDF4" : quase ? "#FFFBEB" : "#FFF5F5",
    borda: atingiu ? "#BBF7D0" : quase ? "#FDE68A" : "#FCA5A5",
    barCor: atingiu ? "#22C55E" : quase ? "#F59E0B" : "#EF4444",
    emoji: atingiu ? "🎯" : quase ? "⚡" : "📉",
    msg: atingiu
      ? `Meta atingida! ${margemReal.toFixed(1)}% de margem`
      : `${margemReal.toFixed(1)}% de ${meta}% da sua meta`,
  };
}

/**
 * V162 — Reordena paradas pela resposta da Optimization API.
 * `waypoints` vem na ordem das coordenadas enviadas; `waypoint_index` é a posição na rota otimizada.
 * @param {Array<{ parada: object, coord: { lng, lat } }>} entries
 */
export function reorderStopsByWaypoints(entries, waypoints) {
  if (!entries?.length || !waypoints?.length) return [];

  return [...waypoints]
    .map((w, inputIdx) => ({
      inputIdx,
      visitIdx: typeof w.waypoint_index === "number" ? w.waypoint_index : inputIdx,
    }))
    .sort((a, b) => a.visitIdx - b.visitIdx)
    .map(({ inputIdx }) => {
      const entry = entries[inputIdx];
      if (!entry) return null;
      const { lng, lat } = entry.coord;
      return {
        ...entry.parada,
        coords: [lng, lat],
      };
    })
    .filter(Boolean);
}

export function buildOptimizationMetrics({
  trip,
  fallbackStopCount,
  consumoKmL = 10,
  precoCombustivel = 5.89,
  originalRouteMultiplier = 1.35,
}) {
  const kmOtimizado = trip
    ? parseFloat((trip.distance / 1000).toFixed(1))
    : fallbackStopCount * 2.8;
  const kmOriginal = parseFloat((kmOtimizado * originalRouteMultiplier).toFixed(1));
  const economiaKm = parseFloat((kmOriginal - kmOtimizado).toFixed(1));
  const cons = parseFloat(consumoKmL) || 10;
  const preco = parseFloat(precoCombustivel) || 5.89;
  const economiaCusto = parseFloat(((economiaKm / cons) * preco).toFixed(2));
  const tempoEstimado = trip
    ? Math.round(trip.duration / 60)
    : Math.round(kmOtimizado * 2.5);
  const custoTotal = parseFloat(((kmOtimizado / cons) * preco).toFixed(2));

  return {
    kmOriginal,
    kmOtimizado,
    economiaKm,
    economiaCusto,
    tempoEstimado,
    custoTotal,
  };
}
