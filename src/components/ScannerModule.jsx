import { useState, useRef, useEffect, useCallback } from "react";
import {
  extractRomaneioAddressesFromImage,
  cancelOcr,
  isOcrWorkerReady,
  warmupOcrWorker,
  restartOcrWorker,
} from "../services/routingService.js";

/** Tempo máximo total do fluxo scanner → OCR → endereços */
const SCAN_PROCESS_TIMEOUT_MS = 180000;
/** Sem mudança de % na UI (ex.: travado em 35% no recognize) */
const UI_PROGRESS_STALL_MS = 50000;
/** Fase de reconhecimento Tesseract — tolerância um pouco maior antes de falhar */
const UI_RECOGNIZE_STALL_MS = 70000;
const RECOGNIZE_PHASE_PCT = 33;
const SCAN_FALLBACK_ERROR =
  "Erro de processamento: tente uma foto com mais iluminação ou use o input manual.";
const STALL_ERROR =
  "A leitura parou de avançar. Aguarde o leitor ficar pronto e tente outra foto com mais luz, ou use o input manual.";

/**
 * Envolve a extração com timeout total e detecção de progresso parado.
 * @param {() => Promise<unknown>} run
 * @param {(pct: number, status: string) => void} onProgress
 * @param {{ signal: { aborted: boolean }, onAbort: () => void }} ctx
 */
function runWithProcessingGuards(run, onProgress, ctx) {
  let lastPct = -1;
  let lastChangeAt = Date.now();
  let stallTimer = null;
  /** @type {(reason?: Error) => void} */
  let stallReject = () => {};

  const clearStall = () => {
    if (stallTimer) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
  };

  const scheduleStallCheck = (pct) => {
    clearStall();
    const limit =
      pct >= RECOGNIZE_PHASE_PCT ? UI_RECOGNIZE_STALL_MS : UI_PROGRESS_STALL_MS;
    stallTimer = setTimeout(() => {
      ctx.onAbort();
      stallReject(new Error(STALL_ERROR));
    }, limit);
  };

  const monitoredProgress = (pct, status) => {
    const now = Date.now();
    if (pct !== lastPct || now - lastChangeAt > 8000) {
      lastPct = pct;
      lastChangeAt = now;
      scheduleStallCheck(pct);
    }
    onProgress(pct, status);
  };

  const stallPromise = new Promise((_, reject) => {
    stallReject = reject;
  });

  scheduleStallCheck(0);

  const totalTimeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(SCAN_FALLBACK_ERROR)), SCAN_PROCESS_TIMEOUT_MS);
  });

  return Promise.race([
    run(monitoredProgress).finally(clearStall),
    stallPromise.finally(clearStall),
    totalTimeout,
  ]);
}

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
 * Scanner de romaneio para o motorista: câmera OU arquivos (foto/PDF).
 */
export default function ScannerModule({
  disabled = false,
  maxToAdd = 10,
  onSuccess,
  onError,
  onProcessingChange,
  onCancel,
}) {
  const [step, setStep] = useState("menu");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [ocrReady, setOcrReady] = useState(isOcrWorkerReady);
  const [ocrLoading, setOcrLoading] = useState(!isOcrWorkerReady());

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

  const resetToMenu = useCallback(() => {
    stopCamera();
    setStep("menu");
    setCameraError("");
  }, [stopCamera]);

  const handleFullCancel = useCallback(() => {
    abortRef.current.aborted = true;
    cancelOcr();
    setBusy(false);
    setProgress(0);
    setStatusText("");
    resetToMenu();
    onCancel?.();
  }, [resetToMenu, setBusy, onCancel]);

  useEffect(() => {
    let cancelled = false;
    setOcrLoading(true);
    warmupOcrWorker().then((r) => {
      if (cancelled) return;
      setOcrReady(r.ok);
      if (!r.ok) {
        setCameraError(
          r.error ||
            "Leitor automático indisponível. Use o campo manual para adicionar endereços."
        );
      }
      setOcrLoading(false);
    });
    const id = setInterval(() => setOcrReady(isOcrWorkerReady()), 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
      abortRef.current.aborted = true;
      cancelOcr();
      stopCamera();
    };
  }, [stopCamera]);

  const processImageBlob = useCallback(
    async (blob) => {
      if (disabled || processing) return;

      setOcrLoading(true);
      const warm = await warmupOcrWorker();
      setOcrLoading(false);
      if (!warm.ok) {
        onError?.(warm.error || SCAN_FALLBACK_ERROR);
        return;
      }
      if (!isOcrWorkerReady()) {
        onError?.(
          "Leitor OCR ainda não está pronto. Aguarde alguns segundos e tente de novo."
        );
        return;
      }

      abortRef.current.aborted = false;
      const signal = abortRef.current;
      setBusy(true);
      setProgress(0);
      setStatusText("Preparando leitura…");
      setCameraError("");

      let out;
      try {
        out = await runWithProcessingGuards(
          (onProgress) =>
            extractRomaneioAddressesFromImage(blob, {
              signal,
              onProgress,
            }),
          (pct, status) => {
            setProgress(pct);
            setStatusText(status);
          },
          {
            signal,
            onAbort: () => {
              abortRef.current.aborted = true;
              cancelOcr();
            },
          }
        );
      } catch (err) {
        abortRef.current.aborted = true;
        cancelOcr();
        const msg = err?.message || SCAN_FALLBACK_ERROR;
        if (msg.includes("parou de avançar") || msg === STALL_ERROR) {
          await restartOcrWorker();
        }
        onError?.(msg);
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
        onError?.(out.error || SCAN_FALLBACK_ERROR);
        resetToMenu();
        return;
      }

      const limit = Number.isFinite(maxToAdd) ? maxToAdd : out.addresses.length;
      const slice = out.addresses.slice(0, Math.max(0, limit));

      if (slice.length === 0) {
        onError?.("Nenhum endereço disponível (limite de paradas atingido).");
        resetToMenu();
        return;
      }

      resetToMenu();
      onSuccess?.(slice, {
        method: out.method,
        fallbackFrom: out.fallbackFrom,
        totalFound: out.addresses.length,
      });
    },
    [disabled, processing, maxToAdd, onSuccess, onError, setBusy, resetToMenu]
  );

  const handleCancelProcessing = () => {
    abortRef.current.aborted = true;
    cancelOcr();
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

    await processImageBlob(blob);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    processImageBlob(file);
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
      {/* Sem capture: no mobile abre galeria/arquivos, não a câmera */}
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
              disabled={disabled || ocrLoading}
              onClick={startCamera}
              style={{
                ...btnBase,
                width: "100%",
                padding: "14px",
                background: disabled
                  ? "#94A3B8"
                  : "linear-gradient(135deg,#22C55E,#16A34A)",
                border: "none",
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 9,
                boxShadow: disabled ? "none" : "0 4px 20px #22C55E44",
              }}
            >
              <span style={{ fontSize: 18 }}>📷</span>
              Tirar foto do romaneio
            </button>

            <button
              type="button"
              disabled={disabled || ocrLoading}
              onClick={openFilePicker}
              style={{
                ...btnBase,
                width: "100%",
                padding: "14px",
                background: disabled ? C.border : "#fff",
                border: `2px solid ${disabled ? C.border : C.navy}`,
                color: disabled ? C.muted : C.navy,
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
            Fotos JPG/PNG ou PDF (1ª página). Boa luz ajuda na leitura.
            {ocrLoading && (
              <span style={{ display: "block", marginTop: 4, color: "#B45309" }}>
                Preparando leitor (primeira vez pode levar alguns segundos)…
              </span>
            )}
            {!ocrLoading && ocrReady && (
              <span style={{ display: "block", marginTop: 4, color: "#166534" }}>
                Leitor pronto.
              </span>
            )}
          </p>

          <button
            type="button"
            onClick={handleFullCancel}
            style={{ ...cancelBtnStyle, width: "100%" }}
          >
            Cancelar
          </button>
        </>
      )}

      {step === "camera" && !processing && (
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
            style={{
              width: "100%",
              display: "block",
              maxHeight: 280,
              objectFit: "cover",
            }}
          />
          <div
            style={{
              padding: 10,
              background: "#F0FDF4",
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
                background: C.green,
                border: "none",
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
              }}
            >
              Capturar e ler endereços
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={resetToMenu}
                style={{ ...cancelBtnStyle, flex: 1 }}
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleFullCancel}
                style={{
                  ...cancelBtnStyle,
                  flex: 1,
                  color: C.red,
                  borderColor: "#FCA5A5",
                }}
              >
                Cancelar
              </button>
            </div>
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
            <span style={{ color: "#15803D", fontWeight: 800, fontSize: 12 }}>
              {progress}%
            </span>
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
                width: `${Math.min(100, progress)}%`,
                height: "100%",
                background: "linear-gradient(90deg,#22C55E,#16A34A)",
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
          <p
            style={{
              color: C.muted,
              fontSize: 10,
              marginTop: 8,
              marginBottom: 0,
              lineHeight: 1.35,
            }}
          >
            Problemas? Use o campo de endereço manual abaixo.
          </p>
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
