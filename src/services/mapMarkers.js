/** Marcadores Google Maps — mesma aparência do mapa expandido de entregas. */

export function createNumberedStopMarker(lng, lat, order, { entregue = false, isCurrent = false } = {}) {
  let fillColor = "#3B82F6";
  if (entregue) fillColor = "#94A3B8";
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

export function packageCountAtCoords(paradas, lng, lat) {
  const key = (x, y) => `${Number(x).toFixed(5)},${Number(y).toFixed(5)}`;
  const target = key(lng, lat);
  return (paradas || []).filter((p) => {
    const c = p?.coords;
    if (!c || c.length < 2) return false;
    return key(c[0], c[1]) === target;
  }).length || 1;
}

export function statusLabel(status, motivo) {
  if (status === "entregue") return "Entregue ✅";
  if (status === "nao_entregue") {
    return motivo ? `Não entregue ❌ — ${motivo}` : "Não entregue ❌";
  }
  return "Pendente 🔵";
}

export function buildStopInfoHtml({ endereco, paradaNum, pacotes, status, motivo }) {
  return `<div style="font-family:system-ui,sans-serif;padding:4px 2px;line-height:1.45;max-width:260px">
    <div style="font-weight:800;font-size:13px;color:#1E3A8A;margin-bottom:4px">Parada ${paradaNum}</div>
    <div style="font-size:12px;color:#334155;margin-bottom:6px">${endereco || "—"}</div>
    <div style="font-size:11px;color:#475569;margin-bottom:4px">📦 ${pacotes === 1 ? "1 pacote" : `${pacotes} pacotes`}</div>
    <div style="font-size:11px;font-weight:700;color:#1E293B">${statusLabel(status, motivo)}</div>
  </div>`;
}
