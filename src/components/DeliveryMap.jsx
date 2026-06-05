import { useCallback, useEffect, useRef, useState } from "react";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { API_KEYS } from "../services/apiConfig.js";
import { buildDeliveryMapFeatures } from "../services/mapDisplayService.js";
import { waitForGoogleMaps } from "../services/googleMapsLoader.js";

const DEFAULT_CENTER = { lat: -23.5505, lng: -46.6333 };

class DeliveryClusterRenderer {
  render({ count, position }) {
    const color = count < 5 ? "#22C55E" : count < 12 ? "#16A34A" : "#15803D";
    const scale = count < 5 ? 20 : count < 12 ? 26 : 32;
    return new window.google.maps.Marker({
      position,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
      },
      label: {
        text: String(count),
        color: "#ffffff",
        fontSize: "13px",
        fontWeight: "700",
      },
      zIndex: Number(window.google.maps.Marker.MAX_ZINDEX) + count,
    });
  }
}

function createNumberedMarker(lng, lat, order) {
  return new window.google.maps.Marker({
    position: { lat, lng },
    icon: {
      path: window.google.maps.SymbolPath.CIRCLE,
      scale: 16,
      fillColor: "#3B82F6",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 2,
    },
    label: {
      text: String(order),
      color: "#ffffff",
      fontSize: "11px",
      fontWeight: "700",
    },
  });
}

/**
 * V165 — Mapa Google Maps com agrupamento (cluster) e marcadores numerados.
 * @param {{ paradas: Array<{id, endereco, coords?, ordem?}>, height?: number | string }} props
 */
export default function DeliveryMap({ paradas, height = 260 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const clustererRef = useRef(null);
  const markersRef = useRef([]);
  const applyRequestIdRef = useRef(0);
  const [mapReady, setMapReady] = useState(false);
  const [status, setStatus] = useState("idle");
  const [hint, setHint] = useState("");

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    clustererRef.current?.clearMarkers();
    clustererRef.current = null;
  }, []);

  const applyParadas = useCallback(
    async (map, list) => {
      const requestId = ++applyRequestIdRef.current;
      clearMarkers();

      if (!list?.length) {
        if (requestId !== applyRequestIdRef.current) return;
        setStatus("empty");
        setHint("");
        return;
      }

      setStatus("loading");
      setHint("Localizando endereços no mapa…");

      try {
        const features = await buildDeliveryMapFeatures(list);
        if (requestId !== applyRequestIdRef.current) return;

        if (features.length === 0) {
          setStatus("empty");
          setHint("Não foi possível posicionar os endereços no mapa.");
          return;
        }

        const markers = features.map((f) => {
          const [lng, lat] = f.geometry.coordinates;
          return createNumberedMarker(lng, lat, f.properties.order);
        });

        markersRef.current = markers;
        clustererRef.current = new MarkerClusterer({
          map,
          markers,
          renderer: new DeliveryClusterRenderer(),
          onClusterClick: (_, cluster, gmap) => {
            gmap.fitBounds(cluster.bounds);
          },
        });

        const bounds = new window.google.maps.LatLngBounds();
        features.forEach((f) => {
          const [lng, lat] = f.geometry.coordinates;
          bounds.extend({ lat, lng });
        });
        map.fitBounds(bounds, 48);

        setStatus("ready");
        setHint(
          features.length < list.length
            ? `${features.length} de ${list.length} endereços no mapa. Toque no agrupamento para ampliar.`
            : "Toque no círculo com número para ver cada entrega."
        );
      } catch {
        if (requestId !== applyRequestIdRef.current) return;
        setStatus("error");
        setHint("Erro ao carregar marcadores.");
      }
    },
    [clearMarkers]
  );

  useEffect(() => {
    if (!API_KEYS.googleMaps) {
      setStatus("no-token");
      setHint("Configure VITE_GOOGLE_MAPS_KEY para ver o mapa.");
      return;
    }
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;

    waitForGoogleMaps()
      .then(() => {
        if (cancelled || !containerRef.current) return;

        const map = new window.google.maps.Map(containerRef.current, {
          center: DEFAULT_CENTER,
          zoom: 10,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });

        mapRef.current = map;
        setMapReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("no-token");
          setHint("Google Maps não carregou. Verifique VITE_GOOGLE_MAPS_KEY.");
        }
      });

    return () => {
      cancelled = true;
      clearMarkers();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [clearMarkers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    let cancelled = false;
    applyParadas(map, paradas).then(() => {
      if (cancelled) return;
    });

    return () => {
      cancelled = true;
    };
  }, [paradas, mapReady, applyParadas]);

  if (status === "no-token") {
    return (
      <div
        style={{
          height,
          borderRadius: 12,
          background: "#F8FAFC",
          border: "1px dashed #CBD5E1",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          textAlign: "center",
          color: "#64748B",
          fontSize: 12,
        }}
      >
        {hint}
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height,
          borderRadius: 12,
          overflow: "hidden",
          border: "1.5px solid #E2E8F0",
        }}
      />
      {status === "loading" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(255,255,255,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
            color: "#166534",
          }}
        >
          {hint}
        </div>
      )}
      {hint && status !== "loading" && (
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 10,
            color: "#64748B",
            lineHeight: 1.35,
          }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
