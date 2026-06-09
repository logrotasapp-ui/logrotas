import { useCallback, useEffect, useRef, useState } from "react";
import { API_KEYS } from "../services/apiConfig.js";
import { waitForGoogleMaps } from "../services/googleMapsLoader.js";
import { getDriverGeolocation } from "../services/routingService.js";

const DEFAULT_CENTER = { lat: -23.5505, lng: -46.6333 };

/**
 * Mapa embutido com rota Google Directions até a parada atual.
 * @param {{ originCoords?: [number,number]|null, destinationCoords?: [number,number]|null, height?: string|number, onDriverLocationUpdate?: (c:[number,number])=>void }} props
 */
export default function NavigationMap({
  originCoords = null,
  destinationCoords = null,
  height = "100%",
  onDriverLocationUpdate,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const rendererRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState("Carregando mapa…");
  const [locating, setLocating] = useState(false);
  const driverRef = useRef(originCoords);

  useEffect(() => {
    driverRef.current = originCoords;
  }, [originCoords]);

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
          suppressMarkers: false,
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
      rendererRef.current?.setMap(null);
      rendererRef.current = null;
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  const drawRoute = useCallback(async () => {
    const map = mapRef.current;
    const renderer = rendererRef.current;
    if (!map || !renderer || !ready) return;

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
        renderer.setDirections(result);
        setHint("");
      }
    );
  }, [destinationCoords, ready, onDriverLocationUpdate]);

  useEffect(() => {
    drawRoute();
  }, [drawRoute, originCoords, destinationCoords]);

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
        style={{
          position: "absolute",
          bottom: 16,
          right: 12,
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: "none",
          background: "#fff",
          boxShadow: "0 2px 8px #00000033",
          cursor: locating ? "wait" : "pointer",
          fontSize: 18,
        }}
      >
        📍
      </button>
    </div>
  );
}
