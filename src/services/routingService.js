import { API_KEYS, API_ENDPOINTS, ORS_HEADERS, GEMINI_HEADERS } from "./apiConfig.js";
import { fileToImageBlob } from "./fileToImage.js";
import {
  parseRomaneioTextToDestinations,
  buildParadasFromAddresses,
} from "./romaneioRouting.js";
import { cleanAddressLine } from "./romaneioParser.js";

export {
  parseRomaneioTextToDestinations,
  buildParadasFromAddresses,
  cleanAddressLine,
  normalizeAddressesForRouting,
} from "./romaneioRouting.js";

/** Valor estimado por eixo por praça de pedágio (R$). */
export const TOLL_PER_AXLE = 3.2;

const ROMANEIO_PROMPT =
  "Analise esta imagem de um romaneio de entregas. Extraia APENAS os endereços de entrega, um por linha, no formato 'Rua/Av, número - Bairro'. Retorne somente os endereços, sem numeração, sem texto adicional, sem explicações.";

const CONNECTION_ERROR =
  "Erro de conexão. Verifique sua internet e tente novamente.";

/** @type {[number, number] | null} [lng, lat] — viés de proximidade Mapbox */
let cachedGeocodeProximity = null;
let geocodeProximityRequested = false;

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

function mapboxGeocodeSearchParams() {
  const params = new URLSearchParams({
    access_token: API_KEYS.mapbox,
    limit: "6",
    country: "br",
    language: "pt",
    autocomplete: "true",
    types: "address,place,locality,neighborhood,postcode",
  });
  if (cachedGeocodeProximity) {
    params.set("proximity", `${cachedGeocodeProximity[0]},${cachedGeocodeProximity[1]}`);
  }
  return params;
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
export async function resolveManualAddress(rawText) {
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

  for (const query of queries) {
    const res = await searchAddresses(query, { skipNormalize: true });
    if (!res.ok) {
      return {
        ok: false,
        error: res.error || CONNECTION_ERROR,
        normalized,
      };
    }
    if (res.suggestions.length > 0) {
      const best = pickBestAddressSuggestion(normalized, res.suggestions);
      return {
        ok: true,
        endereco: best.label,
        coords: best.coords,
        normalized,
      };
    }
  }

  return {
    ok: false,
    error: `Não localizamos «${normalized}». Confira rua, número e cidade e tente de novo.`,
    normalized,
  };
}

// ── OpenRouteService ─────────────────────────────────────────────────────────

/**
 * Autocomplete de endereços via Mapbox (mesmo provedor da otimização de rotas).
 * @param {string} query — texto já normalizado
 */
async function searchAddressesMapbox(query) {
  warmGeocodeProximity();

  const searchText = encodeURIComponent(query);
  const url = `${API_ENDPOINTS.mapboxGeocoding}/${searchText}.json?${mapboxGeocodeSearchParams()}`;

  const res = await fetchJson(url);

  if (res.networkError) {
    return { ok: false, error: CONNECTION_ERROR, suggestions: [] };
  }

  if (!res.ok) {
    const apiMsg = res.data?.message;
    return {
      ok: false,
      error:
        apiMsg ||
        (res.status === 401
          ? "Token Mapbox inválido. Verifique VITE_MAPBOX_TOKEN."
          : `Busca de endereços indisponível (${res.status || "erro"}).`),
      suggestions: [],
    };
  }

  const suggestions = (res.data?.features || []).map((f) => ({
    label: f.place_name,
    coords: f.center,
  }));

  return { ok: true, suggestions };
}

/**
 * Autocomplete de endereços (Brasil) — Mapbox; ORS só se não houver token Mapbox.
 * @param {string} text
 * @param {{ skipNormalize?: boolean }} [opts]
 * @returns {{ ok: true, suggestions: Array<{label, coords}> } | { ok: false, error: string, suggestions: [] }}
 */
export async function searchAddresses(text, opts = {}) {
  const query = opts.skipNormalize ? String(text || "").trim() : normalizeManualAddressInput(text);

  if (!query || query.length < 3) {
    return { ok: true, suggestions: [] };
  }

  warmGeocodeProximity();

  if (API_KEYS.mapbox) {
    return searchAddressesMapbox(query);
  }

  if (!API_KEYS.ors) {
    return {
      ok: false,
      error: "Busca de endereços indisponível (configure VITE_MAPBOX_TOKEN).",
      suggestions: [],
    };
  }

  const url =
    `${API_ENDPOINTS.orsGeocode}?api_key=${API_KEYS.ors}` +
    `&text=${encodeURIComponent(query)}&boundary.country=BR&lang=pt&size=6`;

  const res = await fetchJson(url);

  if (res.networkError) {
    return { ok: false, error: CONNECTION_ERROR, suggestions: [] };
  }

  const suggestions = (res.data?.features || []).map((f) => ({
    label: f.properties.label,
    coords: f.geometry.coordinates,
  }));

  return { ok: true, suggestions };
}

/**
 * Distância de condução origem → destino (km), perfil HGV.
 * @param {[number, number]} originCoords [lng, lat]
 * @param {[number, number]} destCoords [lng, lat]
 */
export async function fetchDrivingDistanceKm(originCoords, destCoords) {
  if (!originCoords || !destCoords) {
    return { ok: false, error: "Coordenadas de origem e destino são obrigatórias.", distanceKm: null };
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
    return { ok: false, error: CONNECTION_ERROR, distanceKm: null };
  }

  const dist = res.data?.routes?.[0]?.summary?.distance;
  const distanceKm = dist ? Math.round(dist) : null;

  return { ok: true, distanceKm };
}

// ── Mapbox ───────────────────────────────────────────────────────────────────

/** Geocodifica um endereço para exibição no mapa (não usado na otimização). */
export async function geocodeAddressForDisplay(endereco) {
  return geocodeMapboxAddress(endereco);
}

async function geocodeMapboxAddress(endereco) {
  const query = encodeURIComponent(`${endereco}, Brasil`);
  const url =
    `${API_ENDPOINTS.mapboxGeocoding}/${query}.json` +
    `?access_token=${API_KEYS.mapbox}&limit=1&country=br&language=pt`;

  const res = await fetchJson(url);
  if (!res.ok) return null;

  const feat = res.data?.features?.[0];
  if (!feat) return null;

  return { lng: feat.center[0], lat: feat.center[1] };
}

async function fetchMapboxOptimization(coordsList) {
  const coordsStr = coordsList.map((c) => `${c.lng},${c.lat}`).join(";");
  const url =
    `${API_ENDPOINTS.mapboxOptimization}/${coordsStr}` +
    `?access_token=${API_KEYS.mapbox}&roundtrip=false&source=first&destination=last&geometries=geojson`;

  return fetchJson(url);
}

// ── Romaneio: Gemini Vision (Gemini 2.5 Flash Lite) ────────────────────────────

function geminiErrorMessage(res) {
  const apiMsg =
    res?.data?.error?.message ||
    res?.data?.[0]?.error?.message ||
    res?.data?.promptFeedback?.blockReason;
  if (apiMsg) return String(apiMsg);
  if (res?.status === 401 || res?.status === 403) {
    return "Chave Gemini inválida. Verifique VITE_GEMINI_KEY no arquivo .env.";
  }
  if (res?.status === 429) {
    return "Limite da API Gemini atingido. Aguarde um momento e tente de novo.";
  }
  if (res?.status) return `Erro na leitura do romaneio (código ${res.status}).`;
  return "Erro ao processar a imagem. Verifique sua conexão e tente novamente.";
}

/**
 * Envia imagem do romaneio ao Gemini 2.5 Flash Lite e extrai endereços.
 * @param {Blob|File} file
 * @param {{ onProgress?: (pct: number, status: string) => void, signal?: { aborted?: boolean } }} [options]
 */
export async function extractRomaneioAddressesFromImageGemini(file, options = {}) {
  const { onProgress, signal } = options;
  const report = (pct, status) => {
    if (!signal?.aborted) onProgress?.(pct, status);
  };

  if (!API_KEYS.gemini) {
    return {
      ok: false,
      error:
        "Leitura automática indisponível. Configure VITE_GEMINI_KEY no arquivo .env.",
      addresses: [],
      method: "gemini",
    };
  }

  if (signal?.aborted) {
    return { ok: false, error: "Leitura cancelada.", addresses: [], method: "gemini" };
  }

  try {
    report(20, "Preparando imagem…");
    const imgBase64 = await readFileAsBase64(file);
    const mimeType = file.type || "image/jpeg";

    if (signal?.aborted) {
      return { ok: false, error: "Leitura cancelada.", addresses: [], method: "gemini" };
    }

    report(40, "Enviando para leitura inteligente…");
    const url = `${API_ENDPOINTS.geminiGenerate}?key=${API_KEYS.gemini}`;

    const res = await fetchJson(url, {
      method: "POST",
      headers: GEMINI_HEADERS.json,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: ROMANEIO_PROMPT },
              { inline_data: { mime_type: mimeType, data: imgBase64 } },
            ],
          },
        ],
      }),
    });

    if (signal?.aborted) {
      return { ok: false, error: "Leitura cancelada.", addresses: [], method: "gemini" };
    }

    if (res.networkError) {
      return {
        ok: false,
        error: "Sem conexão. Verifique a internet e tente novamente.",
        addresses: [],
        method: "gemini",
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        error: geminiErrorMessage(res),
        addresses: [],
        method: "gemini",
      };
    }

    report(75, "Interpretando endereços…");
    const texto = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const addresses = parseRomaneioTextToDestinations(texto);

    if (addresses.length === 0) {
      return {
        ok: false,
        error:
          "Nenhum endereço encontrado na foto. Tente mais luz, enquadre o romaneio ou use o input manual.",
        addresses: [],
        method: "gemini",
        rawTextPreview: texto.slice(0, 400),
      };
    }

    report(100, "Concluído");
    return {
      ok: true,
      addresses,
      paradas: buildParadasFromAddresses(addresses),
      method: "gemini",
    };
  } catch (err) {
    if (signal?.aborted) {
      return { ok: false, error: "Leitura cancelada.", addresses: [], method: "gemini" };
    }
    return {
      ok: false,
      error:
        err?.message ||
        "Erro ao processar a imagem. Verifique sua conexão e tente novamente.",
      addresses: [],
      method: "gemini",
    };
  }
}

/**
 * Converte foto/PDF em imagem e extrai endereços via Gemini 2.5 Flash Lite.
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
  const { onProgress, signal } = options;

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

  return extractRomaneioAddressesFromImageGemini(imageFile, {
    onProgress,
    signal,
  });
}

/**
 * Geocodifica, otimiza ordem das paradas (Mapbox) e calcula métricas.
 * @param {Array<{id, endereco}>} paradas
 */
export async function optimizeDeliveryRoute(paradas, options = {}) {
  const { consumoKmL = 10, precoCombustivel = 5.89 } = options;

  if (!paradas || paradas.length < 2) {
    return { ok: false, error: "Adicione pelo menos 2 paradas." };
  }

  try {
    const coords = await Promise.all(
      paradas.map((p) => geocodeMapboxAddress(p.endereco))
    );
    const validas = coords.filter(Boolean);

    if (validas.length < 2) {
      return {
        ok: false,
        error: "Não foi possível localizar os endereços. Verifique se estão completos.",
      };
    }

    const optRes = await fetchMapboxOptimization(validas);

    if (optRes.networkError) {
      return { ok: false, error: CONNECTION_ERROR };
    }

    const optData = optRes.data;
    if (optData?.code !== "Ok") {
      return { ok: false, error: "Erro na otimização. Tente novamente." };
    }

    const paradasOtimizadas = reorderStopsByWaypoints(paradas, optData.waypoints || []);
    const resultado = buildOptimizationMetrics({
      trip: optData.trips?.[0],
      fallbackStopCount: validas.length,
      consumoKmL,
      precoCombustivel,
    });

    return { ok: true, paradasOtimizadas, resultado };
  } catch {
    return { ok: false, error: CONNECTION_ERROR };
  }
}

// ── Cálculos puros (sem rede) ────────────────────────────────────────────────

/** Soma distâncias por trecho (km), aplicando ida e volta quando indicado. */
export function sumSegmentDistancesKm(segmentDistances, roundTrip = false) {
  const oneWay = (segmentDistances || [])
    .map((d) => parseFloat(d) || 0)
    .reduce((a, b) => a + b, 0);
  return oneWay * (roundTrip ? 2 : 1);
}

/**
 * Custos da calculadora de Rotas + Frete.
 * @returns {{ ok: true, result: object } | { ok: false, error: string }}
 */
export function calculateRouteCosts(input) {
  const {
    segmentDistances,
    roundTrip,
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
    tollCount,
    totalAxles,
    freight,
  } = input;

  const tot = sumSegmentDistancesKm(segmentDistances, roundTrip);

  if (!hasOrigin) {
    return { ok: false, error: "⚠️ Preencha o campo de Origem." };
  }
  if (!hasDestination) {
    return { ok: false, error: "⚠️ Preencha o campo de Destino." };
  }
  if (!tot) {
    return { ok: false, error: "⚠️ Preencha a distância em km antes de calcular." };
  }
  if (!fuelPrice || parseFloat(fuelPrice) <= 0) {
    return { ok: false, error: "⚠️ Preencha o preço do combustível." };
  }
  if (!input.metaLocal || parseFloat(input.metaLocal) <= 0) {
    return { ok: false, error: "⚠️ Preencha seu valor por km para ver o lucro estimado." };
  }

  let energyCost = 0;
  if (isElec) {
    const kwhPer100 = parseFloat(consumo) || defaultKwhPer100;
    energyCost = (tot / 100) * kwhPer100 * parseFloat(fuelPrice || 0);
  } else {
    energyCost =
      (tot / (parseFloat(consumo) || defaultConsumptionKmL || 1)) *
      parseFloat(fuelPrice || 0);
  }

  const arlaL100 = parseFloat(arlaConsumption) || 3.5;
  const arlaCost = isTruck ? (tot / 100) * arlaL100 * parseFloat(arlaPrice || 0) : 0;

  const numPracas = parseFloat(tollCount) || 0;
  const tollCost = numPracas * totalAxles * TOLL_PER_AXLE * (roundTrip ? 2 : 1);
  const total = energyCost + arlaCost + tollCost;
  const freteVal = parseFloat(freight) || 0;
  const lucro = freteVal - total;

  return {
    ok: true,
    result: {
      tot,
      energyCost,
      arlaCost,
      tollCost,
      total,
      lucro,
      margem: freteVal ? (lucro / freteVal) * 100 : null,
      freteVal,
      totalAxles,
      isElec,
      isTruck,
    },
  };
}

export function calculateFreteQuote(routeResult, { valorPorKm, adicionalFixo }) {
  const vkm = parseFloat(valorPorKm) || 0;
  const adic = parseFloat(adicionalFixo) || 0;
  const freteSug =
    routeResult.tot > 0 && vkm > 0 ? routeResult.tot * vkm + adic : 0;
  const lucroFinal = freteSug > 0 ? freteSug - routeResult.total : 0;
  const ok = lucroFinal > 0;
  return { freteSug, lucroFinal, ok, vkm, adic };
}

export function calculateProfitMeta({ lucroFinal, freteSug, metaLucroPercent }) {
  const meta = parseFloat(metaLucroPercent);
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

export function reorderStopsByWaypoints(paradas, waypoints) {
  const ordemOtimizada = (waypoints || []).map((w) => w.waypoint_index);
  return ordemOtimizada.map((i) => paradas[i]).filter(Boolean);
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
