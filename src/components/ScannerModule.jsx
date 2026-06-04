import { useState, useRef, useEffect, useCallback } from "react";
import {
  extractRomaneioAddressesFromImage,
  cancelOcr,
  disposeOcrWorker,
} from "../services/routingService.js";

const C = {
  border: "#E2E8F0",
  muted: "#64748B",
  text: "#0F172A",
  green: "#22C55E",
  red: "#DC2626",
  navy: "#1E3A8A",
};

/**
 * Scanner de romaneio: câmera ou galeria → OCR (routingService) → endereços.
 *
 * @param {object} props
 * @param {boolean} [props.disabled]
 * @param {number} [props.maxToAdd] Máximo de endereços a retornar nesta captura
 * @param {(addresses: string[], meta: object) => void} props.onSuccess
 * @param {(message: string) => void} [props.onError]
 * @param {() => void} [props.onProcessingChange]
 */
export default function ScannerModule({
  disabled = false,
  maxToAdd = 10,
  onSuccess,
  onError,
  onProcessingChange,
}) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [cameraError, setCameraError] = useState("");

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const abortRef = useRef({ aborted: false });

  const setBusy = useCallback(
    (busy) => {
      setProcessing(busy);
      onProcessingChange?.(busy);
    },
    [onProcessingChange]
  );

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current.aborted = true;
      cancelOcr();
      stopCamera();
      disposeOcrWorker();
    };
  }, [stopCamera]);

  const processImageBlob = useCallback(
    async (blob) => {
      if (disabled || processing) return;

      abortRef.current.aborted = false;
      const signal = abortRef.current;
      setBusy(true);
      setProgress(0);
      setStatusText("Preparando leitura…");
      setCameraError("");

      const out = await extractRomaneioAddressesFromImage(blob, {
        signal,
        onProgress: (pct, status) => {
          setProgress(pct);
          setStatusText(status);
        },
      });

      setBusy(false);
      setProgress(0);
      setStatusText("");

      if (signal.aborted) return;

      if (!out.ok) {
        onError?.(out.error);
        return;
      }

      const limit = Number.isFinite(maxToAdd) ? maxToAdd : out.addresses.length;
      const slice = out.addresses.slice(0, Math.max(0, limit));

      if (slice.length === 0) {
        onError?.("Nenhum endereço disponível (limite de paradas atingido).");
        return;
      }

      onSuccess?.(slice, {
        method: out.method,
        fallbackFrom: out.fallbackFrom,
        totalFound: out.addresses.length,
      });
    },
    [disabled, processing, maxToAdd, onSuccess, onError, setBusy]
  );

  const handleCancel = () => {
    abortRef.current.aborted = true;
    cancelOcr();
    setBusy(false);
    setProgress(0);
    setStatusText("");
    stopCamera();
  };

  const startCamera = async () => {
    if (disabled || processing) return;
    setCameraError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Câmera não disponível neste dispositivo. Use a galeria.");
      fileInputRef.current?.click();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setCameraError("Permissão de câmera negada. Use a galeria.");
    }
  };

  const captureFromCamera = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    stopCamera();

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Falha na captura"))),
        "image/jpeg",
        0.92
      );
    });

    await processImageBlob(blob);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) processImageBlob(file);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {!cameraOpen && !processing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            disabled={disabled}
            onClick={startCamera}
            style={{
              width: "100%",
              padding: "14px",
              background: disabled
                ? "#94A3B8"
                : "linear-gradient(135deg,#22C55E,#16A34A)",
              border: "none",
              borderRadius: 14,
              cursor: disabled ? "not-allowed" : "pointer",
              color: "#fff",
              fontWeight: 800,
              fontSize: 15,
              fontFamily: "'Sora',sans-serif",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 9,
              boxShadow: disabled ? "none" : "0 4px 20px #22C55E44",
            }}
          >
            <span style={{ fontSize: 18 }}>📷</span> Escanear Romaneio (Câmera)
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={() => !disabled && fileInputRef.current?.click()}
            style={{
              width: "100%",
              padding: "12px",
              background: "#fff",
              border: `1.5px solid ${C.border}`,
              borderRadius: 12,
              cursor: disabled ? "not-allowed" : "pointer",
              color: C.navy,
              fontWeight: 700,
              fontSize: 13,
              fontFamily: "'Sora',sans-serif",
            }}
          >
            🖼️ Escolher foto da galeria
          </button>
        </div>
      )}

      {cameraOpen && !processing && (
        <div
          style={{
            borderRadius: 14,
            overflow: "hidden",
            border: `2px solid ${C.green}`,
            background: "#000",
          }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            style={{ width: "100%", display: "block", maxHeight: 280, objectFit: "cover" }}
          />
          <div
            style={{
              padding: 10,
              background: "#F0FDF4",
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={captureFromCamera}
              style={{
                flex: 1,
                minWidth: 120,
                padding: "12px",
                background: C.green,
                border: "none",
                borderRadius: 10,
                color: "#fff",
                fontWeight: 800,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Capturar
            </button>
            <button
              type="button"
              onClick={stopCamera}
              style={{
                padding: "12px 16px",
                background: "#fff",
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                color: C.muted,
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
          </div>
          <div style={{ padding: "0 12px 10px", color: C.muted, fontSize: 11, lineHeight: 1.4 }}>
            Dica: mantenha o romaneio reto, com boa luz e texto legível.
          </div>
        </div>
      )}

      {processing && (
        <div
          style={{
            background: "#F0FDF4",
            border: "1.5px solid #86EFAC",
            borderRadius: 12,
            padding: "14px 16px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <span style={{ color: "#166534", fontWeight: 700, fontSize: 13 }}>
              {statusText || "Processando…"}
            </span>
            <span style={{ color: "#15803D", fontWeight: 800, fontSize: 12 }}>{progress}%</span>
          </div>
          <div
            style={{
              background: "#DCFCE7",
              borderRadius: 99,
              height: 8,
              overflow: "hidden",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: "100%",
                background: "linear-gradient(90deg,#22C55E,#16A34A)",
                borderRadius: 99,
                transition: "width 0.2s ease",
              }}
            />
          </div>
          <button
            type="button"
            onClick={handleCancel}
            style={{
              width: "100%",
              padding: "8px",
              background: "#fff",
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              color: C.red,
              fontWeight: 600,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Cancelar leitura
          </button>
          <div style={{ color: C.muted, fontSize: 10, marginTop: 8, lineHeight: 1.35 }}>
            OCR roda em segundo plano (worker). A interface continua responsiva.
          </div>
        </div>
      )}

      {cameraError && (
        <div
          style={{
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            borderRadius: 10,
            padding: "10px 12px",
            color: "#92400E",
            fontSize: 12,
          }}
        >
          {cameraError}
        </div>
      )}
    </div>
  );
}
