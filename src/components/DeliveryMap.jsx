import { useCallback, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { API_KEYS } from "../services/apiConfig.js";
import { buildDeliveryMapFeatures } from "../services/mapDisplayService.js";

const SOURCE_ID = "delivery-paradas";
const CLUSTER_LAYER = "delivery-clusters";
const CLUSTER_COUNT_LAYER = "delivery-cluster-count";
const POINT_LAYER = "delivery-point";
const POINT_LABEL_LAYER = "delivery-point-label";

const EMPTY_FC = { type: "FeatureCollection", features: [] };

/**
 * Mapa Mapbox GL com agrupamento (cluster) de entregas.
 * @param {{ paradas: Array<{id, endereco, coords?}>, height?: number }} props
 */
export default function DeliveryMap({ paradas, height = 260 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layersReadyRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [status, setStatus] = useState("idle");
  const [hint, setHint] = useState("");

  const applyParadas = useCallback(async (map, list) => {
    if (!list?.length) {
      const src = map.getSource(SOURCE_ID);
      if (src) src.setData(EMPTY_FC);
      setStatus("empty");
      setHint("");
      return;
    }

    setStatus("loading");
    setHint("Localizando endereços no mapa…");

    try {
      const features = await buildDeliveryMapFeatures(list);
      const src = map.getSource(SOURCE_ID);
      if (!src) return;

      src.setData({ type: "FeatureCollection", features });

      if (features.length === 0) {
        setStatus("empty");
        setHint("Não foi possível posicionar os endereços no mapa.");
        return;
      }

      setStatus("ready");
      setHint(
        features.length < list.length
          ? `${features.length} de ${list.length} endereços no mapa. Toque no agrupamento para ampliar.`
          : "Toque no círculo com número para ver cada entrega."
      );

      const bounds = new mapboxgl.LngLatBounds();
      features.forEach((f) => {
        bounds.extend(f.geometry.coordinates);
      });
      map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 600 });
    } catch {
      setStatus("error");
      setHint("Erro ao carregar marcadores.");
    }
  }, []);

  useEffect(() => {
    if (!API_KEYS.mapbox) {
      setStatus("no-token");
      setHint("Configure VITE_MAPBOX_TOKEN para ver o mapa.");
      return;
    }
    if (!containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = API_KEYS.mapbox;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [-46.6333, -23.5505],
      zoom: 10,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    const onClusterClick = (e) => {
      const feats = map.queryRenderedFeatures(e.point, {
        layers: [CLUSTER_LAYER],
      });
      const clusterId = feats[0]?.properties?.cluster_id;
      const src = map.getSource(SOURCE_ID);
      if (clusterId == null || !src) return;

      src.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        map.easeTo({
          center: feats[0].geometry.coordinates,
          zoom,
          duration: 500,
        });
      });
    };

    const setupLayers = () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: EMPTY_FC,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 55,
      });

      map.addLayer({
        id: CLUSTER_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#22C55E",
            5,
            "#16A34A",
            12,
            "#15803D",
          ],
          "circle-radius": [
            "step",
            ["get", "point_count"],
            20,
            5,
            26,
            12,
            32,
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: "symbol",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
          "text-size": 13,
        },
        paint: { "text-color": "#ffffff" },
      });

      map.addLayer({
        id: POINT_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#3B82F6",
          "circle-radius": 16,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addLayer({
        id: POINT_LABEL_LAYER,
        type: "symbol",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["to-string", ["get", "order"]],
          "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
          "text-size": 11,
        },
        paint: { "text-color": "#ffffff" },
      });

      map.on("click", CLUSTER_LAYER, onClusterClick);
      map.on("mouseenter", CLUSTER_LAYER, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", CLUSTER_LAYER, () => {
        map.getCanvas().style.cursor = "";
      });

      layersReadyRef.current = true;
      setMapReady(true);
    };

    map.once("load", setupLayers);

    return () => {
      layersReadyRef.current = false;
      setMapReady(false);
      map.remove();
      mapRef.current = null;
    };
  }, []);

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
