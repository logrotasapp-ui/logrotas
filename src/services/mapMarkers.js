/** Marcadores Google Maps — mesma aparência do mapa expandido de entregas. */

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

/** V233 — soma os pacotes das paradas na mesma coordenada (parada agrupada conta `pacotes`). */
export function packageCountAtCoords(paradas, lng, lat) {
  const key = (x, y) => `${Number(x).toFixed(5)},${Number(y).toFixed(5)}`;
  const target = key(lng, lat);
  const total = (paradas || []).reduce((sum, p) => {
    const c = p?.coords;
    if (!c || c.length < 2) return sum;
    if (key(c[0], c[1]) !== target) return sum;
    return sum + (Number(p.pacotes) || 1);
  }, 0);
  return total || 1;
}

/** Cores de status padrão V229: azul=pendente, verde=entregue, vermelho=não entregue. */
export function statusInfo(status, motivo) {
  if (status === "entregue") return { label: "Entregue ✅", color: "#16A34A" };
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
 * V233 — Popup padrão ÚNICO dos 3 mapas (otimizador, expandido e navegação):
 * "Parada N" + endereço completo + "X pacotes" + status com cores V229.
 */
export function buildStopInfoHtml({ endereco, paradaNum, pacotes, status, motivo }) {
  const s = statusInfo(status, motivo);
  const n = Number(pacotes) || 1;
  return `<div style="font-family:system-ui,sans-serif;padding:4px 2px;line-height:1.45;max-width:260px">
    <div style="font-weight:800;font-size:13px;color:#1E3A8A;margin-bottom:4px">Parada ${paradaNum}</div>
    <div style="font-size:12px;color:#334155;margin-bottom:6px">${endereco || "—"}</div>
    <div style="font-size:11px;color:#475569;margin-bottom:4px">📦 ${n === 1 ? "1 pacote" : `${n} pacotes`}</div>
    <div style="font-size:11px;font-weight:700;color:${s.color}">${s.label}</div>
  </div>`;
}
