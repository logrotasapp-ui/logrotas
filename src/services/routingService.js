import {
  API_KEYS,
  API_ENDPOINTS,
  ORS_HEADERS,
  GEMINI_HEADERS,
  SEARCH_COUNTRIES,
} from "./apiConfig.js";
import {
  fetchGooglePlacePredictions,
  resolvePlaceSuggestion,
} from "./googlePlacesService.js";
import {
  fetchGoogleOptimizedRoute,
  reorderStopsByGoogleWaypointOrder,
} from "./googleDirectionsService.js";

export { resolvePlaceSuggestion } from "./googlePlacesService.js";
import { fileToImageBlob } from "./fileToImage.js";
import {
  parseRomaneioTextToDestinations,
  parseGeminiRomaneioResponse,
  buildParadasFromAddresses,
  buildParadasFromGeminiItems,
} from "./romaneioRouting.js";
import { cleanAddressLine } from "./romaneioParser.js";

export {
  parseRomaneioTextToDestinations,
  parseGeminiRomaneioResponse,
  buildParadasFromAddresses,
  buildParadasFromGeminiItems,
  cleanAddressLine,
  normalizeAddressesForRouting,
} from "./romaneioRouting.js";

/** Valor estimado por eixo por praça de pedágio (R$). */
export const TOLL_PER_AXLE = 3.2;

// V170 — prompt Gemini: validação literal palavra a palavra + CEP como fonte da verdade
const ROMANEIO_PROMPT =
  "Analise esta imagem de documento de entrega (romaneio ou etiqueta). REGRAS ABSOLUTAS — violar qualquer uma é erro grave:\n\n" +
  "VALIDAÇÃO LITERAL (obrigatória antes de cada linha de saída):\n" +
  "- Antes de retornar qualquer endereço, verifique se CADA PALAVRA do endereço (rua, número, bairro, cidade, UF) aparece LITERALMENTE na imagem.\n" +
  "- NUNCA complete, corrija ou infira partes do endereço que não estejam visíveis na imagem.\n" +
  "- Se tiver dúvida sobre QUALQUER parte do endereço → retorne WARN com apenas o que estiver visível, NUNCA invente.\n" +
  "- Se não houver destinatário identificável → FAIL| (linha vazia).\n\n" +
  "CEP (fonte da verdade para validação, NÃO para inventar):\n" +
  "- O CEP visível na imagem é OBRIGATÓRIO para confirmar cidade/UF em linhas OK.\n" +
  "- Se o CEP não bater com a cidade escrita na etiqueta, corrija a cidade/UF pelo CEP (o CEP prevalece).\n" +
  "- Use faixas de CEP apenas para VALIDAR, nunca para inferir cidade se o nome da cidade não estiver legível na imagem:\n" +
  "  03xxx/04xxx = São Paulo-SP | 88xxx = Santa Catarina | 60xxx = Ceará | 01xxx/02xxx = região metropolitana SP.\n" +
  "- PROIBIDO retornar cidades como Pacoti-CE ou Siderópolis-SC se esses nomes NÃO aparecerem literalmente na imagem.\n\n" +
  "ETIQUETAS E ROMANEIOS:\n" +
  "- Máximo de 1 endereço por etiqueta física. Se houver mais de 1 candidato, use SOMENTE o do DESTINATÁRIO.\n" +
  "- Ignore COMPLETAMENTE tudo após a palavra REMETENTE.\n" +
  "- Ignore rastreio, corredor, gaiola, hub, ordem, parada, SKU, NF, série.\n" +
  "- ROMANEIO: uma linha por endereço de destino visível. ETIQUETA (qualquer transportadora): uma etiqueta = uma linha.\n\n" +
  "FORMATO DE SAÍDA (prefixo obrigatório, uma linha por etiqueta/endereço):\n" +
  "OK|Rua/Avenida, Número[, Complemento] - Bairro, Cidade - UF\n" +
  "WARN|somente trechos literalmente visíveis e duvidosos\n" +
  "FAIL|\n\n" +
  "OK = todas as palavras literais na imagem + CEP visível confirma cidade/UF.\n" +
  "WARN = qualquer dúvida, CEP ausente, ou endereço incompleto — sem inventar o que falta.\n" +
  "FAIL = destinatário não identificado.\n" +
  "Exemplo: OK|Rua Atucuri, 650 - Chácara Santo Antônio, São Paulo - SP\n" +
  "Se \"Pacotes nesta parada\" estiver visível, inclua ao final: \" · N pacote(s)\".\n" +
  "Sem numeração, sem explicações — somente linhas prefixadas.";

const CONNECTION_ERROR =
  "Erro de conexão. Verifique sua internet e tente novamente.";

/** @type {[number, number] | null} [lng, lat] — viés de proximidade Mapbox */
let cachedGeocodeProximity = null;
let geocodeProximityRequested = false;

/** V159 — fallback de proximity no fluxo romaneio/Gemini (último endereço geocodificado) */
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
  const { preferFresh = false } = options;

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
        timeout: 12000,
        maximumAge: preferFresh ? 0 : 600000,
      }
    );
  });
}

function mapboxGeocodeSearchParams() {
  const params = new URLSearchParams({
    access_token: API_KEYS.mapbox,
    limit: "6",
    country: SEARCH_COUNTRIES, // ALTERADO V159
    language: "pt",
    autocomplete: "true",
    types: "address,place,locality,neighborhood,postcode",
  });
  if (cachedGeocodeProximity) {
    params.set("proximity", `${cachedGeocodeProximity[0]},${cachedGeocodeProximity[1]}`);
  }
  return params;
}

function resolveProximityForRomaneio() {
  return cachedGeocodeProximity || lastRomaneioGeocodeProximity;
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
      const resolved = await resolvePlaceSuggestion(best);
      if (!resolved?.coords) continue;
      return {
        ok: true,
        endereco: resolved.label,
        coords: resolved.coords,
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
 * V163 — Autocomplete via Google Places (country=SEARCH_COUNTRIES).
 * @param {string} query — texto já normalizado
 */
async function searchAddressesGoogle(query) {
  warmGeocodeProximity();

  if (!API_KEYS.googleMaps) {
    return {
      ok: false,
      error: "Busca de endereços indisponível (configure VITE_GOOGLE_MAPS_KEY).",
      suggestions: [],
    };
  }

  try {
    const suggestions = await fetchGooglePlacePredictions(query, cachedGeocodeProximity);
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
 * @param {{ skipNormalize?: boolean }} [opts]
 * @returns {{ ok: true, suggestions: Array<{label, placeId?, coords?}> } | { ok: false, error: string, suggestions: [] }}
 */
export async function searchAddresses(text, opts = {}) {
  const query = opts.skipNormalize ? String(text || "").trim() : normalizeManualAddressInput(text);

  if (!query || query.length < 3) {
    return { ok: true, suggestions: [] };
  }

  return searchAddressesGoogle(query);
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

  if (API_KEYS.mapbox) {
    const path = `${originCoords[0]},${originCoords[1]};${destCoords[0]},${destCoords[1]}`;
    const url =
      `${API_ENDPOINTS.mapboxDirections}/${path}` +
      `?access_token=${API_KEYS.mapbox}&overview=false`;
    const mb = await fetchJson(url);
    if (!mb.networkError && mb.ok) {
      const meters = mb.data?.routes?.[0]?.distance;
      if (meters != null) {
        return { ok: true, distanceKm: Math.round(meters / 1000) };
      }
    }
  }

  if (!API_KEYS.ors) {
    return {
      ok: false,
      error: CONNECTION_ERROR,
      distanceKm: null,
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
    return { ok: false, error: CONNECTION_ERROR, distanceKm: null };
  }

  const dist = res.data?.routes?.[0]?.summary?.distance;
  const distanceKm = dist ? Math.round(dist) : null;

  return { ok: true, distanceKm };
}

/**
 * V159 — Soma distâncias driving (Mapbox) de trechos consecutivos com coordenadas.
 * @param {Array<[number, number] | null>} coordsList [lng,lat] por parada, na ordem da rota
 * @returns {{ ok: true, distanceKm: number, segmentKm: number[] } | { ok: false, error?: string, segmentKm: [] }}
 */
export async function fetchRouteTotalDistanceKm(coordsList) {
  if (!coordsList?.length || coordsList.length < 2) {
    return { ok: false, error: "Rota incompleta.", distanceKm: null, segmentKm: [] };
  }

  const segmentKm = [];
  let total = 0;

  for (let i = 0; i < coordsList.length - 1; i++) {
    const a = coordsList[i];
    const b = coordsList[i + 1];
    if (!a || !b) {
      segmentKm.push(null);
      continue;
    }
    const out = await fetchDrivingDistanceKm(a, b);
    if (!out.ok || out.distanceKm == null) {
      return { ok: false, error: out.error, distanceKm: null, segmentKm: [] };
    }
    segmentKm.push(out.distanceKm);
    total += out.distanceKm;
  }

  const validSegments = segmentKm.filter((km) => km != null);
  if (validSegments.length === 0) {
    return { ok: false, error: "Defina origem e destino no mapa.", distanceKm: null, segmentKm: [] };
  }

  return { ok: true, distanceKm: total, segmentKm };
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
    `?access_token=${API_KEYS.mapbox}&limit=1&country=${SEARCH_COUNTRIES}&language=pt`; // ALTERADO V159

  const res = await fetchJson(url);
  if (!res.ok) return null;

  const feat = res.data?.features?.[0];
  if (!feat) return null;

  return { lng: feat.center[0], lat: feat.center[1] };
}

/**
 * V159 — Geocoding só para endereços extraídos pelo Gemini (romaneio).
 * Proximity: GPS do motorista → último endereço geocodificado com sucesso.
 */
export async function geocodeRomaneioExtractedAddress(endereco) {
  if (!API_KEYS.mapbox || !endereco?.trim()) {
    return { ok: false, endereco: null, coords: null };
  }

  warmGeocodeProximity();
  const proximity = resolveProximityForRomaneio();
  const params = new URLSearchParams({
    access_token: API_KEYS.mapbox,
    limit: "1",
    country: SEARCH_COUNTRIES,
    language: "pt",
  });
  if (proximity) {
    params.set("proximity", `${proximity[0]},${proximity[1]}`);
  }

  const query = encodeURIComponent(String(endereco).trim());
  const url = `${API_ENDPOINTS.mapboxGeocoding}/${query}.json?${params}`;
  const res = await fetchJson(url);

  if (!res.ok || !res.data?.features?.[0]) {
    return { ok: false, endereco: null, coords: null };
  }

  const feat = res.data.features[0];
  const coords = feat.center;
  lastRomaneioGeocodeProximity = coords;

  return {
    ok: true,
    endereco: feat.place_name,
    coords,
  };
}

/** V159 — Geocodifica lista de endereços do romaneio em sequência (proximity em cadeia). */
export async function geocodeRomaneioExtractedAddresses(paradas) {
  warmGeocodeProximity();
  const out = [];
  for (const p of paradas || []) {
    const g = await geocodeRomaneioExtractedAddress(p.endereco);
    if (g.ok) {
      out.push({ ...p, endereco: g.endereco, coords: g.coords });
    } else {
      out.push(p);
    }
  }
  return out;
}

/** Usa coords já geocodificadas na parada; senão geocode Mapbox (otimização). */
async function resolveParadaCoordForOptimization(parada) {
  const c = parada?.coords;
  if (Array.isArray(c) && c.length >= 2) {
    return { lng: Number(c[0]), lat: Number(c[1]) };
  }
  if (c && typeof c.lng === "number" && typeof c.lat === "number") {
    return { lng: c.lng, lat: c.lat };
  }
  return geocodeMapboxAddress(parada.endereco);
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
    const items = parseGeminiRomaneioResponse(texto);
    const failedCount = items.filter((i) => i.confianca === "fail").length;
    const paradas = buildParadasFromGeminiItems(items);
    const addresses = paradas.map((p) => p.endereco);

    if (items.length === 0) {
      return {
        ok: false,
        error:
          "Nenhum endereço encontrado na foto. Tente mais luz, enquadre o romaneio ou use o input manual.",
        addresses: [],
        failedCount: 0,
        method: "gemini",
        rawTextPreview: texto.slice(0, 400),
      };
    }

    if (paradas.length === 0 && failedCount > 0) {
      return {
        ok: false,
        error: "❌ Endereço não identificado — adicione manualmente.",
        addresses: [],
        paradas: [],
        failedCount,
        method: "gemini",
        rawTextPreview: texto.slice(0, 400),
      };
    }

    if (paradas.length === 0) {
      return {
        ok: false,
        error:
          "Nenhum endereço encontrado na foto. Tente mais luz, enquadre o romaneio ou use o input manual.",
        addresses: [],
        failedCount,
        method: "gemini",
        rawTextPreview: texto.slice(0, 400),
      };
    }

    report(100, "Concluído");
    return {
      ok: true,
      addresses,
      paradas,
      failedCount,
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
 * V166 — Geocodifica paradas; origem = GPS do motorista (fallback: 1ª parada).
 * @param {Array<{id, endereco}>} paradas
 */
export async function optimizeDeliveryRoute(paradas, options = {}) {
  const { consumoKmL = 10, precoCombustivel = 5.89 } = options;

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

    const driverPos = await getDriverGeolocation({ preferFresh: true });
    const driverOrigin = driverPos
      ? { lng: driverPos.lng, lat: driverPos.lat }
      : null;

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
