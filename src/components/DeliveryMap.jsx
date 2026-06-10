import { useCallback, useEffect, useRef, useState } from "react";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { API_KEYS } from "../services/apiConfig.js";
import { buildDeliveryMapFeatures } from "../services/mapDisplayService.js";
import { waitForGoogleMaps } from "../services/googleMapsLoader.js";
import { getDriverGeolocation } from "../services/routingService.js";
import GoogleLocationIcon from "./GoogleLocationIcon.jsx";

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

function createNumberedMarker(lng, lat, order, status = "pendente") {
  const fillColor =
    status === "entregue" ? "#22C55E" :
    status === "nao_entregue" ? "#FCA5A5" :
    "#3B82F6";
  return new window.google.maps.Marker({
    position: { lat, lng },
    icon: {
      path: window.google.maps.SymbolPath.CIRCLE,
      scale: 16,
      fillColor,
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

function buildDeliveryPopupHtml(packageCount, orders) {
  const pacoteLabel =
    packageCount === 1 ? "1 pacote" : `${packageCount} pacotes`;
  const paradas = [...orders].sort((a, b) => a - b).join(", ");
  return `<div style="font-family:system-ui,sans-serif;padding:2px 4px;line-height:1.3;text-align:center">
    <div style="font-weight:700;font-size:12px">📦 ${pacoteLabel}</div>
    <div style="font-size:11px;color:#475569;font-weight:500;margin-top:2px">Paradas: ${paradas}</div>
  </div>`;
}

function aggregateClusterDeliveryData(markers) {
  let packageCount = 0;
  const orders = [];
  for (const m of markers || []) {
    const d = m.__deliveryData;
    if (!d) continue;
    packageCount += d.packageCount || 0;
    orders.push(...(d.orders || []));
  }
  return { packageCount, orders };
}

function createDriverMarker(lng, lat) {
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

/**
 * V172 — Mapa Google Maps + botão flutuante “Minha localização”.
 * @param {{ paradas: Array<{id, endereco, coords?, ordem?, entregue?}>, height?: number | string, motoristaCoords?: [number, number] | null, showLocateButton?: boolean, expandedMap?: boolean, gestureHandling?: string, onDriverLocationUpdate?: (coords: [number, number]) => void }} props
 */
export default function DeliveryMap({
  paradas,
  height = 260,
  motoristaCoords = null,
  showLocateButton = false,
  expandedMap = false,
  gestureHandling = "cooperative",
  onDriverLocationUpdate,
  routePath = null,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const clustererRef = useRef(null);
  const markersRef = useRef([]);
  const routePolylineRef = useRef(null);
  const driverMarkerRef = useRef(null);
  const infoWindowRef = useRef(null);
  const applyRequestIdRef = useRef(0);
  const [mapReady, setMapReady] = useState(false);
  const [status, setStatus] = useState("idle");
  const [hint, setHint] = useState("");
  const [locating, setLocating] = useState(false);
  const driverCoordsRef = useRef(motoristaCoords);

  useEffect(() => {
    driverCoordsRef.current = motoristaCoords;
  }, [motoristaCoords]);

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    clustererRef.current?.clearMarkers();
    clustererRef.current = null;
  }, []);

  const updateDriverMarker = useCallback((map, coords) => {
    if (driverMarkerRef.current) {
      driverMarkerRef.current.setMap(null);
      driverMarkerRef.current = null;
    }
    if (!map || !coords || coords.length < 2) return;

    const [lng, lat] = coords;
    driverMarkerRef.current = createDriverMarker(lng, lat);
    driverMarkerRef.current.setMap(map);
  }, []);

  const handleLocateMe = useCallback(async () => {
    const map = mapRef.current;
    if (!map || locating) return;

    setLocating(true);
    try {
      let coords = driverCoordsRef.current;
      const fresh = await getDriverGeolocation({ preferFresh: true });
      if (fresh) {
        coords = [fresh.lng, fresh.lat];
        driverCoordsRef.current = coords;
        onDriverLocationUpdate?.(coords);
      }
      if (!coords || coords.length < 2) return;

      const [lng, lat] = coords;
      updateDriverMarker(map, coords);
      map.setCenter({ lat, lng });
      map.setZoom(15);
    } finally {
      setLocating(false);
    }
  }, [locating, onDriverLocationUpdate, updateDriverMarker]);

  const applyParadas = useCallback(
    async (map, list, driverCoords) => {
      const requestId = ++applyRequestIdRef.current;
      clearMarkers();
      updateDriverMarker(map, driverCoords);

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
          const { packageCount, orders, status } = f.properties;
          const marker = createNumberedMarker(lng, lat, f.properties.order, status || "pendente");
          marker.__deliveryData = { packageCount, orders };
          marker.addListener("click", () => {
            if (!infoWindowRef.current) {
              infoWindowRef.current = new window.google.maps.InfoWindow({
                maxWidth: 160,
              });
            }
            infoWindowRef.current.setContent(
              buildDeliveryPopupHtml(packageCount, orders)
            );
            infoWindowRef.current.open({ anchor: marker, map });
          });
          return marker;
        });

        markersRef.current = markers;
        clustererRef.current = new MarkerClusterer({
          map,
          markers,
          renderer: new DeliveryClusterRenderer(),
          onClusterClick: (_, cluster, gmap) => {
            const { packageCount, orders } = aggregateClusterDeliveryData(
              cluster.markers
            );
            if (packageCount > 0 && cluster.marker) {
              if (!infoWindowRef.current) {
                infoWindowRef.current = new window.google.maps.InfoWindow({
                  maxWidth: 160,
                });
              }
              infoWindowRef.current.setContent(
                buildDeliveryPopupHtml(packageCount, orders)
              );
              infoWindowRef.current.open({ anchor: cluster.marker, map: gmap });
            }
            gmap.fitBounds(cluster.bounds);
          },
        });

        const bounds = new window.google.maps.LatLngBounds();
        features.forEach((f) => {
          const [lng, lat] = f.geometry.coordinates;
          bounds.extend({ lat, lng });
        });
        if (driverCoords?.length >= 2) {
          bounds.extend({ lat: driverCoords[1], lng: driverCoords[0] });
        }
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
    [clearMarkers, updateDriverMarker]
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
          gestureHandling,
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
      if (driverMarkerRef.current) {
        driverMarkerRef.current.setMap(null);
        driverMarkerRef.current = null;
      }
      clearMarkers();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [clearMarkers, gestureHandling]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setOptions({ gestureHandling });
  }, [gestureHandling, mapReady]);

  // V231 — trajeto completo da rota otimizada (polylines concatenadas dos blocos Directions)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }
    if (routePath?.length >= 2) {
      routePolylineRef.current = new window.google.maps.Polyline({
        map,
        path: routePath,
        strokeColor: "#2563EB",
        strokeWeight: 5,
        strokeOpacity: 0.9,
      });
    }

    return () => {
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
        routePolylineRef.current = null;
      }
    };
  }, [routePath, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    let cancelled = false;
    applyParadas(map, paradas, motoristaCoords).then(() => {
      if (cancelled) return;
    });

    return () => {
      cancelled = true;
    };
  }, [paradas, motoristaCoords, mapReady, applyParadas]);

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
      {showLocateButton && status !== "no-token" && (
        <button
          type="button"
          onClick={handleLocateMe}
          disabled={locating}
          aria-label="Minha localização"
          title="Minha localização"
          style={{
            position: "absolute",
            bottom: expandedMap ? 96 : 120,
            right: 10,
            zIndex: 10,
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "none",
            background: locating ? "#F1F3F4" : "#fff",
            boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
            cursor: locating ? "wait" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
          }}
        >
          <GoogleLocationIcon />
        </button>
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
          {motoristaCoords && (
            <>
              {" "}
              <span style={{ color: "#D97706", fontWeight: 600 }}>▲ laranja = você</span>
            </>
          )}
        </p>
      )}
    </div>
  );
}
