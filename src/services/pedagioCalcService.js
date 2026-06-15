/**
 * V277 — Pedágio por categoria brasileira (carro 2 eixos como base Routes API DRIVE).
 */
import { parseNumeroBR, plural } from "./formatUtils.js";

export const EIXOS_CATEGORIA_CARRO = 2;

export function isPedagioMoto(vehicleId) {
  return vehicleId === "moto";
}

export function travelModePedagio(vehicleId) {
  return isPedagioMoto(vehicleId) ? "TWO_WHEELER" : "DRIVE";
}

/** Total de eixos para escala de pedágio (carro/caminhão + reboque quando aplicável). */
export function totalEixosPedagio({ vehicleId, vehicleAxles, trailerExtra = 0 }) {
  if (isPedagioMoto(vehicleId)) return EIXOS_CATEGORIA_CARRO;
  if (vehicleId === "caminhao") {
    return Math.max(EIXOS_CATEGORIA_CARRO, parseInt(vehicleAxles, 10) || EIXOS_CATEGORIA_CARRO);
  }
  return EIXOS_CATEGORIA_CARRO + (parseInt(trailerExtra, 10) || 0);
}

/** Multiplicador sobre o valor Routes API (carro 2 eixos / moto direto). */
export function multiplicadorPedagio({ vehicleId, totalEixos }) {
  if (isPedagioMoto(vehicleId)) return 1;
  const eixos = Math.max(EIXOS_CATEGORIA_CARRO, parseInt(totalEixos, 10) || EIXOS_CATEGORIA_CARRO);
  return eixos / EIXOS_CATEGORIA_CARRO;
}

export function custoPedagioEscalado(valorRoutes, { vehicleId, totalEixos }) {
  const base = parseNumeroBR(valorRoutes) || 0;
  if (!base) return 0;
  return base * multiplicadorPedagio({ vehicleId, totalEixos });
}

export function descricaoPedagioResultado({ vehicleId, vehicleLabel, totalEixos }) {
  if (isPedagioMoto(vehicleId)) return "Moto";
  const nome = vehicleLabel || "Veículo";
  const eixos = Math.max(EIXOS_CATEGORIA_CARRO, parseInt(totalEixos, 10) || EIXOS_CATEGORIA_CARRO);
  return `${nome} · ${plural(eixos, "eixo", "eixos")}`;
}

export function eixosFixosPerfil(vehicleId) {
  if (vehicleId === "caminhao") return null;
  return EIXOS_CATEGORIA_CARRO;
}
