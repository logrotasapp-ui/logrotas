import { useCallback, useEffect, useRef, useState } from "react";
import { API_KEYS } from "../services/apiConfig.js";
import { waitForGoogleMaps } from "../services/googleMapsLoader.js";
import { getDriverGeolocation } from "../services/routingService.js";
import {
  createNumberedStopMarker,
  createDriverTriangleMarker,
  packageCountAtCoords,
  buildStopInfoHtml,
} from "../services/mapMarkers.js";
import GoogleLocationIcon from "./GoogleLocationIcon.jsx";

const DEFAULT_CENTER = { lat: -23.5505, lng: -46.6333 };

function resolveStatus(p) {
  if (p?.status) return p.status;
  if (p?.entregue) return "entregue";
  return "pendente";
}

/**
 * Mapa de navegação — bolinhas numeradas, motorista laranja, rota azul até parada atual.
 */
export default function NavigationMap({
  paradas = [],
  currentStopIndex = 0,
  originCoords = null,
  height = "100%",
  onDriverLocationUpdate,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const rendererRef = useRef(null);
  const stopMarkersRef = useRef([]);
  const driverMarkerRef = useRef(null);
  const infoWindowRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState("Carregando mapa…");
  const [locating, setLocating] = useState(false);
  const driverRef = useRef(originCoords);

  const currentParada = paradas[currentStopIndex] || null;
  const destinationCoords = currentParada?.coords?.length >= 2 ? currentParada.coords : null;

  useEffect(() => {
    driverRef.current = originCoords;
  }, [originCoords]);

  const clearStopMarkers = useCallback(() => {
    stopMarkersRef.current.forEach((m) => m.setMap(null));
    stopMarkersRef.current = [];
  }, []);

  const updateDriverMarker = useCallback((map, coords) => {
    if (driverMarkerRef.current) {
      driverMarkerRef.current.setMap(null);
      driverMarkerRef.current = null;
    }
    if (!map || !coords?.length) return;
    const [lng, lat] = coords;
    driverMarkerRef.current = createDriverTriangleMarker(lng, lat);
    driverMarkerRef.current.setMap(map);
  }, []);

  const renderStopMarkers = useCallback(
    (map) => {
      clearStopMarkers();
      if (!map) return;

      if (!infoWindowRef.current) {
        infoWindowRef.current = new window.google.maps.InfoWindow({ maxWidth: 280 });
      }

      paradas.forEach((p, i) => {
        if (!p?.coords?.length) return;
        const [lng, lat] = p.coords;
        const status = resolveStatus(p);
        const entregue = status === "entregue" || status === "nao_entregue";
        const isCurrent = i === currentStopIndex && status === "pendente";
        const marker = createNumberedStopMarker(lng, lat, i + 1, {
          entregue: status === "entregue",
          isCurrent,
        });

        if (status === "nao_entregue") {
          marker.setIcon({
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 16,
            fillColor: "#FCA5A5",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          });
        }

        marker.addListener("click", () => {
          const pacotes = packageCountAtCoords(paradas, lng, lat);
          infoWindowRef.current.setContent(
            buildStopInfoHtml({
              endereco: p.endereco,
              paradaNum: i + 1,
              pacotes,
              status,
              motivo: p.motivo,
            })
          );
          infoWindowRef.current.open({ anchor: marker, map });
        });

        marker.setMap(map);
        stopMarkersRef.current.push(marker);
      });
    },
    [paradas, currentStopIndex, clearStopMarkers]
  );

  useEffect(() => {
    if (!API_KEYS.googleMaps) {
      setHint("Configure VITE_GOOGLE_MAPS_KEY.");
      return;
    }
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;
    waitForGoogleMaps()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const map = new window.google.maps.Map(containerRef.current, {
          center: DEFAULT_CENTER,
          zoom: 14,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: "greedy",
        });
        mapRef.current = map;
        rendererRef.current = new window.google.maps.DirectionsRenderer({
          map,
          suppressMarkers: true,
          polylineOptions: {
            strokeColor: "#2563EB",
            strokeWeight: 5,
            strokeOpacity: 0.9,
          },
        });
        setReady(true);
        setHint("");
      })
      .catch(() => {
        if (!cancelled) setHint("Google Maps não carregou.");
      });

    return () => {
      cancelled = true;
      clearStopMarkers();
      if (driverMarkerRef.current) {
        driverMarkerRef.current.setMap(null);
        driverMarkerRef.current = null;
      }
      rendererRef.current?.setMap(null);
      rendererRef.current = null;
      mapRef.current = null;
      setReady(false);
    };
  }, [clearStopMarkers]);

  const drawRoute = useCallback(async () => {
    const map = mapRef.current;
    const renderer = rendererRef.current;
    if (!map || !renderer || !ready) return;

    renderStopMarkers(map);

    let origin = driverRef.current;
    if (!origin?.length) {
      setHint("Obtendo sua localização…");
      const fresh = await getDriverGeolocation({ preferFresh: true });
      if (fresh) {
        origin = [fresh.lng, fresh.lat];
        driverRef.current = origin;
        onDriverLocationUpdate?.(origin);
      }
    }

    updateDriverMarker(map, origin);

    if (!destinationCoords?.length) {
      setHint("Parada sem coordenadas no mapa.");
      renderer.setMap(null);
      return;
    }

    if (!origin?.length) {
      map.setCenter({ lat: destinationCoords[1], lng: destinationCoords[0] });
      map.setZoom(15);
      setHint("Ative o GPS para traçar a rota até a parada.");
      return;
    }

    setHint("Calculando rota…");
    const service = new window.google.maps.DirectionsService();
    service.route(
      {
        origin: { lat: origin[1], lng: origin[0] },
        destination: { lat: destinationCoords[1], lng: destinationCoords[0] },
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status !== window.google.maps.DirectionsStatus.OK || !result) {
          setHint("Não foi possível traçar a rota.");
          return;
        }
        renderer.setMap(map);
        renderer.setDirections(result);
        setHint("");
      }
    );
  }, [
    destinationCoords,
    ready,
    onDriverLocationUpdate,
    renderStopMarkers,
    updateDriverMarker,
  ]);

  useEffect(() => {
    drawRoute();
  }, [drawRoute, originCoords, destinationCoords, paradas, currentStopIndex]);

  const handleLocate = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const fresh = await getDriverGeolocation({ preferFresh: true });
      if (fresh) {
        const coords = [fresh.lng, fresh.lat];
        driverRef.current = coords;
        onDriverLocationUpdate?.(coords);
        await drawRoute();
      }
    } finally {
      setLocating(false);
    }
  };

  if (!API_KEYS.googleMaps) {
    return (
      <div
        style={{
          height,
          background: "#F1F5F9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#64748B",
          fontSize: 13,
          padding: 16,
          textAlign: "center",
        }}
      >
        {hint}
      </div>
    );
  }

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 200, height }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {hint && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            right: 12,
            background: "rgba(255,255,255,0.92)",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 600,
            color: "#334155",
            boxShadow: "0 2px 8px #00000015",
          }}
        >
          {hint}
        </div>
      )}
      <button
        type="button"
        onClick={handleLocate}
        disabled={locating}
        aria-label="Minha localização"
        title="Minha localização"
        style={{
          position: "absolute",
          bottom: 96,
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
    </div>
  );
}
