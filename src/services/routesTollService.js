/**
 * V275 — Estimativa de pedágio via Google Routes API (computeRoutes + TOLLS).
 */
import { API_KEYS, API_ENDPOINTS } from "./apiConfig.js";
import { resolveCalculatorStopsCoords } from "./routingService.js";
import { formatDecimal } from "./formatUtils.js";

const ROUTES_FIELD_MASK =
  "routes.travelAdvisory.tollInfo,routes.legs.travelAdvisory.tollInfo,routes.distanceMeters";
const ROUTES_TIMEOUT_MS = 15000;
const EIXOS_PADRAO_GOOGLE = 2;

function moneyToReais(money) {
  if (!money || typeof money !== "object") return null;
  const units = Number(money.units ?? 0);
  const nanos = Number(money.nanos ?? 0);
  if (!Number.isFinite(units) || !Number.isFinite(nanos)) return null;
  const total = units + nanos / 1e9;
  return Number.isFinite(total) && total >= 0 ? total : null;
}

function pickBrlEstimatedPrice(estimatedPrice) {
  if (!estimatedPrice) return null;
  const lista = Array.isArray(estimatedPrice) ? estimatedPrice : [estimatedPrice];
  const brl = lista.find((p) => p?.currencyCode === "BRL");
  return brl ? moneyToReais(brl) : null;
}

function extractRouteTollReais(route) {
  if (!route) return null;

  const routeToll = pickBrlEstimatedPrice(route?.travelAdvisory?.tollInfo?.estimatedPrice);
  if (routeToll != null) return routeToll;

  const legs = route?.legs;
  if (!Array.isArray(legs) || !legs.length) return null;

  let soma = 0;
  let encontrou = false;
  for (const leg of legs) {
    const legToll = pickBrlEstimatedPrice(leg?.travelAdvisory?.tollInfo?.estimatedPrice);
    if (legToll != null) {
      soma += legToll;
      encontrou = true;
    }
  }
  return encontrou ? soma : null;
}

function waypointFromStop(stop) {
  const [lng, lat] = stop.coords;
  return {
    location: {
      latLng: {
        latitude: lat,
        longitude: lng,
      },
    },
  };
}

/**
 * Busca pedágio estimado e retorna tarifa base por 1 eixo (valor Google ÷ 2).
 * @param {Array<{ v?: string, coords?: number[] | null }>} stops
 * @returns {Promise<{ ok: true, tarifaBasePorEixo: number, formatado: string } | { ok: false, error?: string }>}
 */
export async function buscarPedagioRoutes(stops) {
  if (!API_KEYS.googleMaps) {
    return { ok: false, error: "api_key_ausente" };
  }

  try {
    const resolvidos = await resolveCalculatorStopsCoords(stops || []);
    const validos = resolvidos.filter(
      (s) => String(s?.v || "").trim() && Array.isArray(s.coords) && s.coords.length >= 2
    );
    if (validos.length < 2) {
      return { ok: false, error: "rota_incompleta" };
    }

    const origin = validos[0];
    const destination = validos[validos.length - 1];
    const intermediates = validos.slice(1, -1);

    const body = {
      origin: waypointFromStop(origin),
      destination: waypointFromStop(destination),
      travelMode: "DRIVE",
      extraComputations: ["TOLLS"],
      routeModifiers: {
        vehicleInfo: { emissionType: "GASOLINE" },
      },
    };
    if (intermediates.length) {
      body.intermediates = intermediates.map(waypointFromStop);
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), ROUTES_TIMEOUT_MS)
      : null;

    let res;
    try {
      res = await fetch(API_ENDPOINTS.googleRoutesCompute, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": API_KEYS.googleMaps,
          "X-Goog-FieldMask": ROUTES_FIELD_MASK,
        },
        body: JSON.stringify(body),
        signal: controller?.signal,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }

    let data = {};
    try {
      data = await res.json();
    } catch {
      /* resposta não-JSON */
    }

    if (!res.ok) {
      console.error("[LogRotas] Routes API pedágio — HTTP", res.status, data);
      return { ok: false, error: `http_${res.status}` };
    }

    const route = data?.routes?.[0];
    if (!route) {
      console.error("[LogRotas] Routes API pedágio — sem rota", data);
      return { ok: false, error: "sem_rota" };
    }

    const pedagioTotalBrl = extractRouteTollReais(route);
    if (pedagioTotalBrl == null) {
      return { ok: false, error: "sem_pedagio_brl" };
    }

    const tarifaBasePorEixo = pedagioTotalBrl / EIXOS_PADRAO_GOOGLE;
    return {
      ok: true,
      tarifaBasePorEixo,
      formatado: formatDecimal(tarifaBasePorEixo, 2),
    };
  } catch (err) {
    console.error("[LogRotas] Routes API pedágio — falha:", err);
    return { ok: false, error: "exception" };
  }
}
