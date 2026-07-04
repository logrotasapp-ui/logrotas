/** Marcadores Google Maps — mesma aparência do mapa expandido de entregas. */

import {
  countPacotes,
  getParadaStatus,
  migrateParada,
  pacotesResumo,
  pacotesNumerosLabel,
  resumoPacotesLabel,
} from "./pacotesService.js";

const RENDER_OFFSET_M = 8;

function metersToLatDelta(m) {
  return m / 111320;
}

function metersToLngDelta(m, lat) {
  const cos = Math.cos((lat * Math.PI) / 180);
  return m / (111320 * (cos || 1));
}

function renderLocationKey(lng, lat) {
  return `${Number(lng).toFixed(5)},${Number(lat).toFixed(5)}`;
}

/**
 * V236 — deslocamento visual (lat/lng) só na renderização quando paradas compartilham coordenadas.
 * Não altera coords originais dos dados.
 * @param {Array<{ lng: number, lat: number }>} items
 * @returns {Array<{ lng: number, lat: number, renderLng: number, renderLat: number }>}
 */
export function applyMarkerRenderOffsets(items) {
  const list = (items || []).map((it) => ({
    ...it,
    lng: Number(it.lng),
    lat: Number(it.lat),
  }));
  const buckets = new Map();
  for (const it of list) {
    const key = renderLocationKey(it.lng, it.lat);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(it);
  }
  for (const group of buckets.values()) {
    if (group.length <= 1) {
      const only = group[0];
      only.renderLng = only.lng;
      only.renderLat = only.lat;
      continue;
    }
    const centerLng = group.reduce((s, g) => s + g.lng, 0) / group.length;
    const centerLat = group.reduce((s, g) => s + g.lat, 0) / group.length;
    group.forEach((it, i) => {
      const ang = (i / group.length) * 2 * Math.PI - Math.PI / 2;
      it.renderLng = centerLng + metersToLngDelta(RENDER_OFFSET_M * Math.cos(ang), centerLat);
      it.renderLat = centerLat + metersToLatDelta(RENDER_OFFSET_M * Math.sin(ang));
    });
  }
  return list;
}

/** V229 — cor do agrupamento: pendente sempre azul; verde só se todos entregues. */
export function resolveClusterFillColor(markers) {
  let hasPendente = false;
  let hasNaoEntregue = false;
  let allEntregue = markers?.length > 0;
  for (const m of markers || []) {
    const s = m.__stopStatus || "pendente";
    if (s === "pendente") hasPendente = true;
    if (s === "nao_entregue") hasNaoEntregue = true;
    if (s !== "entregue") allEntregue = false;
  }
  if (hasPendente) return "#3B82F6";
  if (hasNaoEntregue) return "#FCA5A5";
  if (allEntregue) return "#22C55E";
  return "#3B82F6";
}

export function createNumberedStopMarker(lng, lat, order, { entregue = false, naoEntregue = false, isCurrent = false } = {}) {
  let fillColor = "#3B82F6";
  if (naoEntregue) fillColor = "#FCA5A5";
  else if (entregue) fillColor = "#22C55E";
  else if (isCurrent) fillColor = "#2563EB";

  return new window.google.maps.Marker({
    position: { lat, lng },
    icon: {
      path: window.google.maps.SymbolPath.CIRCLE,
      scale: isCurrent ? 18 : 16,
      fillColor,
      fillOpacity: 1,
      strokeColor: isCurrent ? "#F59E0B" : "#ffffff",
      strokeWeight: isCurrent ? 3 : 2,
    },
    label: {
      text: String(order),
      color: "#ffffff",
      fontSize: isCurrent ? "12px" : "11px",
      fontWeight: "700",
    },
    zIndex: isCurrent ? 500 : 100 + order,
  });
}

export function createDriverTriangleMarker(lng, lat) {
  return new window.google.maps.Marker({
    position: { lat, lng },
    title: "Sua localização",
    icon: {
      path: window.google.maps.SymbolPath.CIRCLE,
      scale: 18,
      fillColor: "#F59E0B",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 3,
    },
    label: {
      text: "▲",
      color: "#ffffff",
      fontSize: "12px",
      fontWeight: "700",
    },
    zIndex: Number(window.google.maps.Marker.MAX_ZINDEX) + 1000,
  });
}

/** V256 — soma pacotes das paradas na mesma coordenada. */
export function packageCountAtCoords(paradas, lng, lat) {
  const key = (x, y) => `${Number(x).toFixed(5)},${Number(y).toFixed(5)}`;
  const target = key(lng, lat);
  const total = (paradas || []).reduce((sum, p) => {
    const c = p?.coords;
    if (!c || c.length < 2) return sum;
    if (key(c[0], c[1]) !== target) return sum;
    return sum + countPacotes(migrateParada(p));
  }, 0);
  return total || 1;
}

/** Cores de status padrão V229/V256: azul=pendente, verde=concluída/entregue, vermelho=não entregue. */
export function statusInfo(status, motivo) {
  if (status === "entregue" || status === "concluida") {
    return { label: status === "concluida" ? "Concluída ✅" : "Entregue ✅", color: "#16A34A" };
  }
  if (status === "nao_entregue") {
    return {
      label: motivo ? `Não entregue ❌ — ${motivo}` : "Não entregue ❌",
      color: "#DC2626",
    };
  }
  return { label: "Pendente 🔵", color: "#2563EB" };
}

export function statusLabel(status, motivo) {
  return statusInfo(status, motivo).label;
}

/**
 * V256 — Popup padrão dos mapas: parada + endereço + resumo de pacotes + status.
 */
export function buildStopInfoHtml({
  endereco,
  paradaNum,
  pacotes,
  status,
  motivo,
  parada,
  numerosLabel,
  expandId,
}) {
  const s = statusInfo(status, motivo);
  const n = Number(pacotes) || 1;
  const numeros =
    numerosLabel != null ? numerosLabel : parada != null ? pacotesNumerosLabel(migrateParada(parada)) : "";
  const resumo =
    parada != null ? resumoPacotesLabel(migrateParada(parada)) : n === 1 ? "1 pacote" : `${n} pacotes`;
  const r = parada != null ? pacotesResumo(migrateParada(parada)) : null;
  const resumoStatus =
    r && r.total > 1
      ? [
          r.entregues ? `${r.entregues} entregue${r.entregues !== 1 ? "s" : ""}` : null,
          r.pendentes ? `${r.pendentes} pendente${r.pendentes !== 1 ? "s" : ""}` : null,
          r.naoEntregues
            ? `${r.naoEntregues} não entregue${r.naoEntregues !== 1 ? "s" : ""}`
            : null,
        ]
          .filter(Boolean)
          .join(", ")
      : "";

  const expandBtn =
    expandId && r && r.total > 1
      ? `<button id="${expandId}" type="button" data-ver-pacotes="1" style="margin-top:8px;width:100%;padding:8px 10px;background:#EEF4FF;border:1.5px solid #3B82F6;border-radius:8px;color:#1E3A8A;font-weight:700;font-size:11px;cursor:pointer;font-family:system-ui,sans-serif">📦 Ver pacotes</button>`
      : "";

  return `<div style="font-family:system-ui,sans-serif;padding:4px 2px;line-height:1.45;max-width:260px">
    <div style="font-weight:800;font-size:13px;color:#1E3A8A;margin-bottom:4px">Parada ${paradaNum}</div>
    <div style="font-size:12px;color:#334155;margin-bottom:6px">${endereco || "—"}</div>
    ${numeros ? `<div style="display:inline-block;font-size:11px;font-weight:800;color:#1E3A8A;background:#EEF4FF;border:1px solid #3B82F6;border-radius:6px;padding:2px 7px;margin-bottom:6px">📦 ${numeros}</div>` : ""}
    <div style="font-size:11px;color:#475569;margin-bottom:2px">📦 ${resumo}</div>
    ${resumoStatus ? `<div style="font-size:10px;color:#64748B;margin-bottom:4px">${resumoStatus}</div>` : ""}
    <div style="font-size:11px;font-weight:700;color:${s.color}">${s.label}</div>
    ${expandBtn}
  </div>`;
}

/** HTML da lista de pacotes no popup expandido (navegação). */
export function buildPacotesPopupHtml(parada, paradaNum, { expandId, actionPrefix }) {
  const m = migrateParada(parada);
  const rows = (m.pacotes || [])
    .map((pk, i) => {
      const nome = (pk.nome || "").trim() || `Pacote ${i + 1}`;
      let statusHtml = "";
      if (pk.status === "entregue") {
        statusHtml = `<span style="color:#16A34A;font-weight:700;font-size:11px">✅ Entregue</span>`;
      } else if (pk.status === "nao_entregue") {
        statusHtml = `<span style="color:#DC2626;font-weight:700;font-size:11px">❌ ${pk.motivoNaoEntrega || "Não entregue"}</span>`;
      } else {
        statusHtml = `<div style="display:flex;gap:6px;margin-top:4px">
          <button type="button" data-pkg-action="entregue" data-pkg-id="${pk.id}" data-parada-idx="${paradaNum - 1}" style="flex:1;padding:6px;background:#DCFCE7;border:1.5px solid #22C55E;border-radius:8px;color:#15803D;font-weight:700;font-size:11px;cursor:pointer">✅</button>
          <button type="button" data-pkg-action="nao_entregue" data-pkg-id="${pk.id}" data-parada-idx="${paradaNum - 1}" style="flex:1;padding:6px;background:#FEE2E2;border:1.5px solid #DC2626;border-radius:8px;color:#B91C1C;font-weight:700;font-size:11px;cursor:pointer">❌</button>
        </div>`;
      }
      return `<div style="padding:8px 0;border-bottom:1px solid #E2E8F0">
        <div style="font-weight:700;font-size:12px;color:#334155">${nome}</div>
        ${statusHtml}
      </div>`;
    })
    .join("");

  return `<div style="font-family:system-ui,sans-serif;padding:4px 2px;line-height:1.45;max-width:280px">
    <div style="font-weight:800;font-size:13px;color:#1E3A8A;margin-bottom:4px">Parada ${paradaNum} — Pacotes</div>
    <div style="font-size:11px;color:#64748B;margin-bottom:6px">${m.endereco || "—"}</div>
    ${rows}
    ${expandId ? `<button id="${expandId}" type="button" style="margin-top:6px;width:100%;padding:6px;background:transparent;border:none;color:#64748B;font-size:11px;cursor:pointer">← Voltar</button>` : ""}
  </div>`;
}
