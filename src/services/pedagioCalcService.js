/**
 * V278 — Pedágio por categoria brasileira (Arteris / CCR ViaOeste).
 * Routes API DRIVE = carro passeio (2 eixos). valorEixoLeve = valorRoutes ÷ 2.
 */
import { parseNumeroBR, plural } from "./formatUtils.js";

export const EIXOS_CATEGORIA_CARRO = 2;
export const CALC_VIAGEM = "viagem";
export const CALC_FRETE = "frete";

export function isPedagioMoto(vehicleId) {
  return vehicleId === "moto";
}

export function travelModePedagio(vehicleId) {
  return isPedagioMoto(vehicleId) ? "TWO_WHEELER" : "DRIVE";
}

export function valorEixoLeve(valorRoutes) {
  const base = parseNumeroBR(valorRoutes) || 0;
  return base / EIXOS_CATEGORIA_CARRO;
}

/** Total de eixos para escala de pedágio (carro/caminhão + reboque quando aplicável). */
export function totalEixosPedagio({ vehicleId, vehicleAxles, trailerExtra = 0 }) {
  if (isPedagioMoto(vehicleId)) return EIXOS_CATEGORIA_CARRO;
  if (vehicleId === "caminhao") {
    return Math.max(EIXOS_CATEGORIA_CARRO, parseInt(vehicleAxles, 10) || EIXOS_CATEGORIA_CARRO);
  }
  return EIXOS_CATEGORIA_CARRO + (parseInt(trailerExtra, 10) || 0);
}

/**
 * Escala o valor Routes API (carro DRIVE ou moto TWO_WHEELER) para a categoria.
 * @param {string|number} valorRoutes — valor retornado pela API (campo editável pelo motorista)
 * @param {{ vehicleId: string, vehicleAxles?: number|string, trailerExtra?: number, context?: 'viagem'|'frete' }} opts
 */
export function custoPedagioEscalado(valorRoutes, opts = {}) {
  const { vehicleId, vehicleAxles, trailerExtra = 0, context = CALC_VIAGEM } = opts;
  const valorCarro = parseNumeroBR(valorRoutes) || 0;
  if (!valorCarro) return 0;

  if (isPedagioMoto(vehicleId)) return valorCarro;

  if (context === CALC_FRETE && vehicleId === "caminhao") {
    const eixos = Math.max(
      EIXOS_CATEGORIA_CARRO,
      parseInt(vehicleAxles, 10) || EIXOS_CATEGORIA_CARRO
    );
    return valorCarro * (eixos - 1);
  }

  if (context === CALC_FRETE) {
    return valorCarro;
  }

  const valorEixoLeve = valorCarro / EIXOS_CATEGORIA_CARRO;
  const totalEixos = totalEixosPedagio({ vehicleId, vehicleAxles, trailerExtra });
  return valorEixoLeve * totalEixos;
}

export function descricaoPedagioResultado({ vehicleId, vehicleLabel, totalEixos, trailerExtra = 0 }) {
  if (isPedagioMoto(vehicleId)) return "Moto";

  const eixos = Math.max(
    EIXOS_CATEGORIA_CARRO,
    parseInt(totalEixos, 10) || EIXOS_CATEGORIA_CARRO
  );
  const extra = parseInt(trailerExtra, 10) || 0;
  const nome = vehicleLabel || (vehicleId === "caminhao" ? "Caminhão" : "Carro");

  if (vehicleId === "caminhao") {
    return `${nome} · ${plural(eixos, "eixo", "eixos")}`;
  }
  if (extra > 0) {
    return `${nome} + reboque · ${plural(eixos, "eixo", "eixos")}`;
  }
  return `${nome} · ${plural(eixos, "eixo", "eixos")}`;
}

export function eixosFixosPerfil(vehicleId) {
  if (vehicleId === "caminhao") return null;
  return EIXOS_CATEGORIA_CARRO;
}

