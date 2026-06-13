import { useCallback, useEffect, useRef, useState } from "react";
import { API_KEYS } from "../services/apiConfig.js";
import { waitForGoogleMaps } from "../services/googleMapsLoader.js";
import { getDriverGeolocation } from "../services/routingService.js";
import { getParadaStatus, migrateParada } from "../services/pacotesService.js";
import {
  applyMarkerRenderOffsets,
  createNumberedStopMarker,
  createDriverTriangleMarker,
  packageCountAtCoords,
  buildStopInfoHtml,
  buildPacotesPopupHtml,
} from "../services/mapMarkers.js";
import GoogleLocationIcon from "./GoogleLocationIcon.jsx";

const DEFAULT_CENTER = { lat: -23.5505, lng: -46.6333 };

/**
 * Mapa de navegação — bolinhas numeradas, motorista laranja, rota azul até parada atual.
 */
export default function NavigationMap({
  paradas = [],
  currentStopIndex = 0,
  originCoords = null,
  height = "100%",
  onDriverLocationUpdate,
  onMarkPacote,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const rendererRef = useRef(null);
  const stopMarkersRef = useRef([]);
  const driverMarkerRef = useRef(null);
  const infoWindowRef = useRef(null);
  const popupExpandedRef = useRef(new Set());
  const onMarkPacoteRef = useRef(onMarkPacote);
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState("Carregando mapa…");
  const [locating, setLocating] = useState(false);
  const driverRef = useRef(originCoords);

  const currentParada = paradas[currentStopIndex] || null;
  const destinationCoords = currentParada?.coords?.length >= 2 ? currentParada.coords : null;

  useEffect(() => {
    driverRef.current = originCoords;
  }, [originCoords]);

  useEffect(() => {
    onMarkPacoteRef.current = onMarkPacote;
  }, [onMarkPacote]);

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

  const bindPacotePopupActions = useCallback((paradaIndex, parada, paradaNum, expandId) => {
    const doc = document;
    const expandEl = doc.getElementById(expandId);
    if (expandEl && !popupExpandedRef.current.has(parada.id)) {
      expandEl.onclick = () => {
        popupExpandedRef.current.add(parada.id);
        infoWindowRef.current.setContent(
          buildPacotesPopupHtml(parada, paradaNum, { expandId, actionPrefix: `nav-${paradaIndex}` })
        );
        window.google.maps.event.addListenerOnce(infoWindowRef.current, "domready", () => {
          bindPacotePopupActions(paradaIndex, parada, paradaNum, expandId);
        });
      };
    }
    doc.querySelectorAll("[data-pkg-action][data-pkg-id]").forEach((btn) => {
      btn.onclick = () => {
        const action = btn.getAttribute("data-pkg-action");
        const pacoteId = btn.getAttribute("data-pkg-id");
        const idx = Number(btn.getAttribute("data-parada-idx"));
        if (!pacoteId || Number.isNaN(idx)) return;
        if (action === "entregue") onMarkPacoteRef.current?.(idx, pacoteId, "entregue");
        else if (action === "nao_entregue") onMarkPacoteRef.current?.(idx, pacoteId, "nao_entregue");
      };
    });
    if (expandEl && popupExpandedRef.current.has(parada.id)) {
      expandEl.onclick = () => {
        popupExpandedRef.current.delete(parada.id);
        const status = getParadaStatus(parada);
        infoWindowRef.current.setContent(
          buildStopInfoHtml({
            endereco: parada.endereco,
            paradaNum,
            pacotes: packageCountAtCoords(paradas, parada.coords?.[0], parada.coords?.[1]),
            status,
            motivo: parada.motivo,
            parada,
            expandId,
          })
        );
        window.google.maps.event.addListenerOnce(infoWindowRef.current, "domready", () => {
          bindPacotePopupActions(paradaIndex, parada, paradaNum, expandId);
        });
      };
    }
  }, [paradas]);

  const renderStopMarkers = useCallback(
    (map) => {
      clearStopMarkers();
      if (!map) return;

      if (!infoWindowRef.current) {
        infoWindowRef.current = new window.google.maps.InfoWindow({ maxWidth: 300 });
      }

      const positioned = applyMarkerRenderOffsets(
        paradas
          .map((p, i) => {
            if (!p?.coords?.length) return null;
            const [lng, lat] = p.coords;
            return { lng, lat, parada: p, index: i };
          })
          .filter(Boolean)
      );

      positioned.forEach(({ lng, lat, renderLng, renderLat, parada: p, index: i }) => {
        const status = getParadaStatus(p);
        const isCurrent = i === currentStopIndex && status === "pendente";
        const marker = createNumberedStopMarker(renderLng, renderLat, i + 1, {
          entregue: status === "entregue" || status === "concluida",
          naoEntregue: status === "nao_entregue",
          isCurrent,
        });

        marker.addListener("click", () => {
          const expandId = `expand-pkg-${p.id}`;
          const pacoteCount = packageCountAtCoords(paradas, lng, lat);
          const migrated = migrateParada(p);
          const showExpanded = popupExpandedRef.current.has(p.id) && migrated.pacotes.length > 1;
          const prefix = `nav-${i}`;

          infoWindowRef.current.setContent(
            showExpanded
              ? buildPacotesPopupHtml(migrated, i + 1, { expandId, actionPrefix: prefix })
              : buildStopInfoHtml({
                  endereco: p.endereco,
                  paradaNum: i + 1,
                  pacotes: pacoteCount,
                  status,
                  motivo: p.motivo,
                  parada: migrated,
                  expandId: migrated.pacotes.length > 1 ? expandId : null,
                })
          );
          infoWindowRef.current.open({ anchor: marker, map });

          window.google.maps.event.addListenerOnce(infoWindowRef.current, "domready", () => {
            const doc = document;
            const expandEl = doc.getElementById(expandId);
            if (expandEl && !showExpanded) {
              expandEl.onclick = () => {
                popupExpandedRef.current.add(p.id);
                infoWindowRef.current.setContent(
                  buildPacotesPopupHtml(migrateParada(p), i + 1, { expandId, actionPrefix: prefix })
                );
                window.google.maps.event.addListenerOnce(infoWindowRef.current, "domready", () => {
                  bindPacotePopupActions(i, migrateParada(p), i + 1, expandId);
                });
              };
            }
            bindPacotePopupActions(i, migrateParada(p), i + 1, expandId);
          });
        });

        marker.setMap(map);
        stopMarkersRef.current.push(marker);
      });
    },
    [paradas, currentStopIndex, clearStopMarkers, bindPacotePopupActions]
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
    const request = {
      origin: { lat: origin[1], lng: origin[0] },
      destination: { lat: destinationCoords[1], lng: destinationCoords[0] },
      travelMode: window.google.maps.TravelMode.DRIVING,
    };
    const tryRoute = () =>
      new Promise((resolve) => {
        service.route(request, (result, status) => {
          if (status === window.google.maps.DirectionsStatus.OK && result) {
            resolve(result);
          } else {
            console.warn("[LogRotas Directions] falha no trecho da navegação", {
              status: String(status),
              destino: currentParada?.endereco,
            });
            resolve(null);
          }
        });
      });

    let result = await tryRoute();
    if (!result) {
      await new Promise((r) => setTimeout(r, 1000));
      result = await tryRoute();
    }
    if (!result) {
      setHint("Trajeto parcial no mapa — a ordem das paradas está correta");
      return;
    }
    renderer.setMap(map);
    renderer.setDirections(result);
    setHint("");
  }, [
    destinationCoords,
    ready,
    onDriverLocationUpdate,
    renderStopMarkers,
    updateDriverMarker,
    currentParada?.endereco,
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
