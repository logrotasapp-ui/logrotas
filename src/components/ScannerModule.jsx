import { useState, useRef, useEffect, useCallback } from "react";
import { extractRomaneioAddressesFromImage } from "../services/routingService.js";

const SCAN_TIMEOUT_MS = 120000;
const SCAN_ERROR =
  "Erro de processamento: tente uma foto com mais iluminação ou use o input manual.";

const C = {
  border: "#E2E8F0",
  muted: "#64748B",
  green: "#22C55E",
  red: "#DC2626",
  navy: "#1E3A8A",
};

const FILE_ACCEPT = "image/*,application/pdf,.pdf";

const btnBase = {
  fontFamily: "'Sora',sans-serif",
  cursor: "pointer",
  borderRadius: 12,
};

/**
 * Scanner de romaneio: câmera ou arquivo (nuvem).
 */
export default function ScannerModule({
  disabled = false,
  maxToAdd = 10,
  onSuccess,
  onError,
  onProcessingChange,
  onCancel,
  accentColor = "#22C55E",
  accentDark = "#16A34A",
  accentLight = "#F0FDF4",
  accentBorder = "#86EFAC",
}) {
  const [step, setStep] = useState("menu");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [pendingBlob, setPendingBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [pendingName, setPendingName] = useState("");

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const abortRef = useRef({ aborted: false });

  const setBusy = useCallback(
    (busy) => {
      setProcessing(busy);
      onProcessingChange?.(busy);
      if (busy) setStep("processing");
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
  }, []);

  const clearPendingPreview = useCallback(() => {
    setPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    setPendingBlob(null);
    setPendingName("");
  }, []);

  const resetToMenu = useCallback(() => {
    stopCamera();
    clearPendingPreview();
    setStep("menu");
    setCameraError("");
  }, [stopCamera, clearPendingPreview]);

  const stageForPreview = useCallback((blob, name = "romaneio.jpg") => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return blob.type?.startsWith("image/")
        ? URL.createObjectURL(blob)
        : null;
    });
    setPendingBlob(blob);
    setPendingName(name);
    setStep("preview");
  }, []);

  const handleFullCancel = useCallback(() => {
    abortRef.current.aborted = true;
    setBusy(false);
    setProgress(0);
    setStatusText("");
    resetToMenu();
    onCancel?.();
  }, [resetToMenu, setBusy, onCancel]);

  useEffect(() => {
    return () => {
      abortRef.current.aborted = true;
      stopCamera();
      clearPendingPreview();
    };
  }, [stopCamera, clearPendingPreview]);

  const processImageBlob = useCallback(
    async (blob) => {
      if (disabled || processing) return;

      abortRef.current.aborted = false;
      const signal = abortRef.current;
      setBusy(true);
      setProgress(0);
      setStatusText("Enviando para leitura…");
      setCameraError("");

      let out;
      try {
        out = await Promise.race([
          extractRomaneioAddressesFromImage(blob, {
            signal,
            onProgress: (pct, status) => {
              setProgress(pct);
              setStatusText(status);
            },
          }),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error(SCAN_ERROR)), SCAN_TIMEOUT_MS);
          }),
        ]);
      } catch (err) {
        abortRef.current.aborted = true;
        onError?.(err?.message || SCAN_ERROR);
        resetToMenu();
        return;
      } finally {
        setBusy(false);
        setProgress(0);
        setStatusText("");
      }

      if (signal.aborted) {
        resetToMenu();
        return;
      }

      if (!out.ok) {
        onError?.(out.error || SCAN_ERROR);
        resetToMenu();
        return;
      }

      const paradas = out.paradas || [];
      const limit = Number.isFinite(maxToAdd) ? maxToAdd : paradas.length;
      const slice = paradas.slice(0, Math.max(0, limit));

      if (slice.length === 0) {
        onError?.("Nenhum endereço disponível (limite de paradas atingido).");
        resetToMenu();
        return;
      }

      resetToMenu();
      onSuccess?.(slice, {
        method: out.method,
        totalFound: paradas.length,
        failedCount: out.failedCount || 0,
      });
    },
    [disabled, processing, maxToAdd, onSuccess, onError, setBusy, resetToMenu]
  );

  const handleCancelProcessing = () => {
    abortRef.current.aborted = true;
    setBusy(false);
    setProgress(0);
    setStatusText("");
    resetToMenu();
  };

  const openFilePicker = () => {
    if (disabled || processing) return;
    setCameraError("");
    fileInputRef.current?.click();
  };

  const startCamera = async () => {
    if (disabled || processing) return;
    setCameraError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Câmera indisponível neste aparelho. Toque em «Arquivos e galeria»."
      );
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
      setStep("camera");
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setCameraError(
        "Permissão da câmera negada. Use «Arquivos e galeria» para enviar uma foto ou PDF."
      );
    }
  };

  const captureFromCamera = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);

    stopCamera();

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Falha na captura"))),
        "image/jpeg",
        0.92
      );
    });

    stageForPreview(blob, "captura.jpg");
  };

  const confirmPreview = async () => {
    if (!pendingBlob || disabled || processing) return;
    await processImageBlob(pendingBlob);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    stageForPreview(file, file.name || "arquivo");
  };

  const cancelBtnStyle = {
    ...btnBase,
    padding: "12px 16px",
    background: "#fff",
    border: `1.5px solid ${C.border}`,
    color: C.muted,
    fontWeight: 600,
    fontSize: 13,
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        marginBottom: 12,
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={FILE_ACCEPT}
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {step === "menu" && !processing && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              type="button"
              disabled={disabled}
              onClick={startCamera}
              style={{
                ...btnBase,
                width: "100%",
                padding: "14px",
                background: disabled
                  ? "#94A3B8"
                  : `linear-gradient(135deg,${accentColor},${accentDark})`,
                border: "none",
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 9,
                boxShadow: disabled ? "none" : `0 4px 20px ${accentColor}44`,
              }}
            >
              <span style={{ fontSize: 18 }}>📷</span>
              Tirar foto do romaneio
            </button>

            <button
              type="button"
              disabled={disabled}
              onClick={openFilePicker}
              style={{
                ...btnBase,
                width: "100%",
                padding: "14px",
                background: disabled ? C.border : "#fff",
                border: `2px solid ${disabled ? C.border : accentColor}`,
                color: disabled ? C.muted : accentColor,
                fontWeight: 800,
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 18 }}>📁</span>
              Arquivos e galeria (foto ou PDF)
            </button>
          </div>

          <p
            style={{
              color: C.muted,
              fontSize: 11,
              lineHeight: 1.45,
              margin: 0,
              textAlign: "center",
            }}
          >
            Fotos JPG/PNG ou PDF (1ª página). Requer internet.
          </p>
        </>
      )}

      {step === "camera" && !processing && (
        <div
          style={{
            borderRadius: 14,
            overflow: "hidden",
            border: `2px solid ${accentColor}`,
            background: "#000",
            marginLeft: -4,
            marginRight: -4,
          }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            style={{
              width: "100%",
              display: "block",
              minHeight: 240,
              maxHeight: "min(65vh, 420px)",
              objectFit: "cover",
            }}
          />
          <div
            style={{
              padding: 10,
              background: accentLight,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={captureFromCamera}
              style={{
                ...btnBase,
                width: "100%",
                padding: "14px",
                background: accentColor,
                border: "none",
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
              }}
            >
              Capturar
            </button>
            <button
              type="button"
              onClick={handleFullCancel}
              style={{
                ...cancelBtnStyle,
                width: "100%",
                color: C.red,
                borderColor: "#FCA5A5",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {step === "preview" && !processing && (
        <div
          style={{
            borderRadius: 14,
            overflow: "hidden",
            border: `2px solid ${accentColor}`,
            background: "#fff",
          }}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Prévia do romaneio"
              style={{
                width: "100%",
                display: "block",
                maxHeight: "min(65vh, 420px)",
                objectFit: "contain",
                background: "#000",
              }}
            />
          ) : (
            <div
              style={{
                padding: "36px 20px",
                textAlign: "center",
                background: "#F8FAFC",
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
              <div
                style={{
                  color: accentColor,
                  fontWeight: 700,
                  fontSize: 14,
                  wordBreak: "break-word",
                }}
              >
                {pendingName || "PDF selecionado"}
              </div>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>
                A 1ª página será lida na confirmação
              </div>
            </div>
          )}
          <div
            style={{
              padding: 10,
              background: accentLight,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={confirmPreview}
              disabled={!pendingBlob || disabled}
              style={{
                ...btnBase,
                width: "100%",
                padding: "14px",
                background: !pendingBlob || disabled ? "#94A3B8" : accentColor,
                border: "none",
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
              }}
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={handleFullCancel}
              style={{
                ...cancelBtnStyle,
                width: "100%",
                color: C.red,
                borderColor: "#FCA5A5",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {processing && (
        <div
          style={{
            background: accentLight,
            border: `1.5px solid ${accentBorder}`,
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
            <span style={{ color: accentColor, fontWeight: 700, fontSize: 13 }}>
              {statusText || "Processando…"}
            </span>
            <span style={{ color: accentDark, fontWeight: 800, fontSize: 12 }}>
              {progress}%
            </span>
          </div>
          <div
            style={{
              background: `${accentLight}`,
              borderRadius: 99,
              height: 8,
              overflow: "hidden",
              marginBottom: 10,
              border: `1px solid ${accentBorder}`,
            }}
          >
            <div
              style={{
                width: `${Math.min(100, progress)}%`,
                height: "100%",
                background: `linear-gradient(90deg,${accentColor},${accentDark})`,
                borderRadius: 99,
                transition: "width 0.2s ease",
              }}
            />
          </div>
          <button
            type="button"
            onClick={handleCancelProcessing}
            style={{
              ...cancelBtnStyle,
              width: "100%",
              color: C.red,
              borderColor: "#FCA5A5",
              fontWeight: 700,
            }}
          >
            Cancelar leitura
          </button>
        </div>
      )}

      {cameraError && step === "menu" && !processing && (
        <div
          style={{
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            borderRadius: 10,
            padding: "10px 12px",
            color: "#92400E",
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          {cameraError}
        </div>
      )}
    </div>
  );
}
