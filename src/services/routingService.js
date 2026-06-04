import { API_KEYS, API_ENDPOINTS, ORS_HEADERS, GEMINI_HEADERS } from "./apiConfig.js";
import { runOcrOnImage } from "./ocrService.js";
import {
  parseRomaneioTextToDestinations,
  buildParadasFromAddresses,
} from "./romaneioRouting.js";

export {
  parseRomaneioTextToDestinations,
  buildParadasFromAddresses,
  cleanAddressLine,
  normalizeAddressesForRouting,
} from "./romaneioRouting.js";

export { cancelOcr, disposeOcrWorker } from "./ocrService.js";

/** Valor estimado por eixo por praça de pedágio (R$). */
export const TOLL_PER_AXLE = 3.2;

const ROMANEIO_PROMPT =
  "Analise esta imagem de um romaneio de entregas. Extraia APENAS os endereços de entrega, um por linha, no formato 'Rua/Av, número - Bairro'. Retorne somente os endereços, sem numeração, sem texto adicional, sem explicações.";

const CONNECTION_ERROR =
  "Erro de conexão. Verifique sua internet e tente novamente.";

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

// ── OpenRouteService ─────────────────────────────────────────────────────────

/**
 * Autocomplete de endereços (Brasil).
 * @returns {{ ok: true, suggestions: Array<{label, coords}> } | { ok: false, error: string, suggestions: [] }}
 */
export async function searchAddresses(text) {
  if (!text || text.length < 3) {
    return { ok: true, suggestions: [] };
  }

  const url =
    `${API_ENDPOINTS.orsGeocode}?api_key=${API_KEYS.ors}` +
    `&text=${encodeURIComponent(text)}&boundary.country=BR&lang=pt&size=6`;

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

// ── Romaneio: OCR (cliente) + Gemini (fallback) ───────────────────────────────

/**
 * OCR no dispositivo (Tesseract) + parser de endereços.
 * @param {Blob|File} fileOrBlob
 * @param {{ onProgress?: (pct: number, status: string) => void, signal?: { aborted?: boolean } }} [options]
 */
export async function extractRomaneioAddressesFromImageOCR(fileOrBlob, options = {}) {
  const ocr = await runOcrOnImage(fileOrBlob, options);
  if (!ocr.ok) {
    return { ok: false, error: ocr.error, addresses: [], method: "ocr" };
  }

  const addresses = parseRomaneioTextToDestinations(ocr.text);
  if (addresses.length === 0) {
    return {
      ok: false,
      error:
        "Texto lido, mas nenhum endereço identificado. Enquadre o romaneio ou tente com mais luz.",
      addresses: [],
      method: "ocr",
      rawTextPreview: ocr.text.slice(0, 400),
    };
  }

  return { ok: true, addresses, paradas: buildParadasFromAddresses(addresses), method: "ocr" };
}

async function extractRomaneioAddressesFromImageGemini(file) {
  if (!API_KEYS.gemini) {
    return {
      ok: false,
      error: "Serviço de IA indisponível (chave não configurada).",
      addresses: [],
      method: "gemini",
    };
  }

  try {
    const imgBase64 = await readFileAsBase64(file);
    const mimeType = file.type || "image/jpeg";
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

    if (res.networkError) {
      return {
        ok: false,
        error: "Erro ao processar a imagem. Verifique sua conexão e tente novamente.",
        addresses: [],
        method: "gemini",
      };
    }

    const texto = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const addresses = parseRomaneioTextToDestinations(texto);

    if (addresses.length === 0) {
      return {
        ok: false,
        error: "Nenhum endereço encontrado. Tente uma foto mais nítida.",
        addresses: [],
        method: "gemini",
      };
    }

    return {
      ok: true,
      addresses,
      paradas: buildParadasFromAddresses(addresses),
      method: "gemini",
    };
  } catch {
    return {
      ok: false,
      error: "Erro ao processar a imagem. Verifique sua conexão e tente novamente.",
      addresses: [],
      method: "gemini",
    };
  }
}

/**
 * Extrai endereços: OCR local primeiro; Gemini só se OCR falhar e houver chave.
 * @param {Blob|File} file
 * @param {{ onProgress?: (pct: number, status: string) => void, signal?: { aborted?: boolean }, preferGemini?: boolean }} [options]
 */
export async function extractRomaneioAddressesFromImage(file, options = {}) {
  if (!file) {
    return { ok: false, error: "Nenhum arquivo selecionado.", addresses: [] };
  }

  if (options.preferGemini && API_KEYS.gemini) {
    const geminiFirst = await extractRomaneioAddressesFromImageGemini(file);
    if (geminiFirst.ok) return geminiFirst;
    const ocrFallback = await extractRomaneioAddressesFromImageOCR(file, options);
    return ocrFallback;
  }

  const ocrResult = await extractRomaneioAddressesFromImageOCR(file, options);
  if (ocrResult.ok) return ocrResult;

  if (API_KEYS.gemini) {
    const geminiResult = await extractRomaneioAddressesFromImageGemini(file);
    if (geminiResult.ok) {
      return {
        ...geminiResult,
        fallbackFrom: "ocr",
        ocrError: ocrResult.error,
      };
    }
    return {
      ok: false,
      error: geminiResult.error || ocrResult.error,
      addresses: [],
    };
  }

  return ocrResult;
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
