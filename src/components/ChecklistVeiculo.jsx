import { useState, useCallback, useRef, useEffect, Component } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftIcon, XIcon, CameraIcon, RefreshCwIcon, CheckCircle2Icon } from "lucide-react";
import {
  coletaCompleta,
  entregaCompleta,
  coletaCompletaLocal,
  entregaCompletaLocal,
  CHECKLIST_TIPOS_SERVICO,
  CHECKLIST_MOTIVOS,
  CHECKLIST_ESTADOS_ACESSORIO,
  CHECKLIST_ESTADOS_PNEU,
  CHECKLIST_NIVEIS_COMBUSTIVEL,
  CHECKLIST_FOTO_SLOTS,
  CHECKLIST_ENTREGA_FOTO_SLOTS,
  CHECKLIST_PERGUNTAS_PADRAO,
  CHECKLIST_PERGUNTAS_MOTO,
  CHECKLIST_ACESSORIOS_PADRAO,
  CHECKLIST_ACESSORIOS_MOTO,
  resolveTipoVeiculo,
  normalizeColetaData,
  normalizeEntregaData,
  coletaChecklistTravada,
  entregaChecklistTravada,
  derivarDivergenciasEntrega,
  getEstadoEntregaItem,
  inicializarEstadosEntrega,
  proximoEstadoAcessorio,
  aplicarLimiteAvulsosSalvos,
} from "../services/checklistService.js";
import { clearChecklistSession } from "../services/checklistSessionService.js";
import { saveChecklist as saveChecklistToRepository, loadChecklist, captureChecklistMedia, isNavigatorOnline } from "../services/checklistRepository.js";
import {
  subscribeChecklistUploadProgress,
  scheduleChecklistMediaUpload,
} from "../services/checklistMediaUploadQueue.js";
import { resolveChecklistImagePreview } from "../services/checklistImageResolver.js";
import {
  getChecklistSyncBadge,
  getChecklistPendingMediaLabel,
  getChecklistPendingMediaBreakdown,
} from "../services/checklistSyncStatus.js";
import { countPendingChecklistMedia } from "../services/checklistOfflineStore.js";
import { incrementUsageCounter, USAGE_COUNTERS } from "../services/usageStatsService.js";
import {
  stampAndCompressImage,
  compressImageToJpegBlob,
  formatStampDataHora,
  buildPhotoStampText,
  migrateChecklistColetaMedia,
  migrateChecklistEntregaMedia,
  isChecklistDownloadUrl,
} from "../services/storageService.js";
import { getDriverGeolocation } from "../services/routingService.js";
import { ref, getBlob } from "firebase/storage";
import { storage } from "../firebase.js";
import SignaturePad from "./SignaturePad.jsx";
import {
  generateChecklistColetaPdf,
  generateChecklistCompletoPdf,
  generateChecklistEntregaPdf,
  shareChecklistColetaWhatsApp,
  shareChecklistCompletoWhatsApp,
  shareChecklistEntregaWhatsApp,
} from "../services/checklistColetaPdf.js";
import { sharePdfFileViaSystem } from "../services/deliveryReportPdf.js";
import { logChecklist } from "../services/checklistLogSanitizer.js";

/** Cache em memória de objectURLs por storagePath — evita re-fetch a cada render. */
const storageBlobUrlCache = new Map();

async function getCachedStorageBlobUrl(urlOrPath) {
  if (!urlOrPath) return "";
  if (urlOrPath.startsWith("blob:") || isChecklistDownloadUrl(urlOrPath)) return urlOrPath;
  if (storageBlobUrlCache.has(urlOrPath)) return storageBlobUrlCache.get(urlOrPath);
  const blob = await getBlob(ref(storage, urlOrPath));
  const objUrl = URL.createObjectURL(blob);
  storageBlobUrlCache.set(urlOrPath, objUrl);
  return objUrl;
}

const CHECKLIST_GEO_TIMEOUT_MS = 3000;

async function getChecklistGeolocation() {
  return getDriverGeolocation({ preferFresh: true, timeoutMs: CHECKLIST_GEO_TIMEOUT_MS });
}

const C = {
  bg: "#F4F6FA",
  surface: "#FFFFFF",
  border: "#E4E9F0",
  navy: "#1E3A8A",
  navyLight: "#EEF4FF",
  orange: "#E85D04",
  orangeLight: "#FFF0E8",
  green: "#0A7C50",
  greenLight: "#E6F7F1",
  red: "#C0392B",
  redLight: "#FDECEA",
  text: "#1A2B42",
  text2: "#4A607A",
  muted: "#8EA3BC",
  subtle: "#F0F4FA",
};

const ETAPAS = [
  { id: 1, label: "Dados" },
  { id: 2, label: "Vistoria" },
  { id: 3, label: "Fotos" },
  { id: 4, label: "Assinaturas" },
  { id: 5, label: "PDF" },
  { id: 6, label: "Entrega", requerColeta: true },
];

const ACESSORIO_CORES = {
  bom: { bg: "#E6F7F1", border: "#0A7C50", text: "#0A7C50", label: "Bom" },
  ausente: { bg: "#FFF0E8", border: "#E85D04", text: "#C47800", label: "Ausente" },
  quebrado: { bg: "#FDECEA", border: "#FCA5A5", text: "#C0392B", label: "Quebrado" },
  na: { bg: "#F3F4F6", border: "#D1D5DB", text: "#6B7280", label: "N/A" },
};

const PNEU_CORES = { bom: C.green, regular: C.orange, ruim: C.red };

function assinaturaVazia() {
  return { nome: "", documento: "", imagemUrl: "", dataHora: "", lat: null, lng: null };
}

function normalizeChecklist(cl) {
  return {
    ...cl,
    coleta: normalizeColetaData(cl?.coleta, cl),
    entrega: normalizeEntregaData(cl?.entrega),
  };
}

/** Impede gravar assinaturas como base64 no Firestore (limite 1MB). */
function stripBase64AssinaturasColeta(coleta) {
  if (!coleta?.assinaturas) return coleta;
  let changed = false;
  const assinaturas = { ...coleta.assinaturas };
  ["responsavel", "prestador"].forEach((bloco) => {
    const a = assinaturas[bloco];
    if (a?.imagemUrl && String(a.imagemUrl).startsWith("data:")) {
      logChecklist("warn", "[Checklist] imagemUrl base64 removida antes de gravar coleta", { bloco });
      assinaturas[bloco] = { ...a, imagemUrl: "" };
      changed = true;
    }
  });
  return changed ? { ...coleta, assinaturas } : coleta;
}

/** Impede gravar assinaturas de entrega como base64 no Firestore. */
function stripBase64AssinaturasEntrega(entrega) {
  if (!entrega?.assinaturas) return entrega;
  let changed = false;
  const assinaturas = { ...entrega.assinaturas };
  ["recebedor", "prestador"].forEach((bloco) => {
    const a = assinaturas[bloco];
    if (a?.imagemUrl && String(a.imagemUrl).startsWith("data:")) {
      logChecklist("warn", "[Checklist] imagemUrl base64 removida antes de gravar entrega", { bloco });
      assinaturas[bloco] = { ...a, imagemUrl: "" };
      changed = true;
    }
  });
  return changed ? { ...entrega, assinaturas } : entrega;
}

/** Atualiza lista de fotos de coleta/entrega sem depender do callback assíncrono do setState. */
function atualizarFotosLista(fotosAtuais, slotAtivo, foto, previewUrlRef = null) {
  let fotos = [...(fotosAtuais || [])];
  if (slotAtivo === "avarias") {
    const idx = previewUrlRef
      ? fotos.findIndex((f) => f.previewUrl === previewUrlRef || f.localId === previewUrlRef)
      : -1;
    if (idx >= 0) fotos[idx] = foto;
    else fotos.push(foto);
  } else {
    fotos = fotos.filter((f) => f.tipo !== slotAtivo);
    fotos.push(foto);
  }
  return fotos;
}

function atualizarFotoPorLocalId(fotosAtuais, localId, patch) {
  return (fotosAtuais || []).map((f) => (f.localId === localId ? { ...f, ...patch } : f));
}

/** Remove campos só de UI antes de gravar — mantém mediaId/syncStatus no doc local. */
function sanitizeFotosForFirestore(fotos) {
  return (fotos || []).map((f) => {
    const { previewUrl, uploadStatus, localId, ...rest } = f;
    return rest;
  });
}

/** Mantém pré-visualizações locais após salvar enquanto o upload ainda não terminou. */
function preserveLocalFotoPreviews(localFotos, savedFotos) {
  const saved = [...(savedFotos || [])];
  const usados = new Set();
  const merged = saved.map((sf) => {
    const local = (localFotos || []).find((lf) => {
      if (lf.mediaId && sf.mediaId && lf.mediaId === sf.mediaId) return true;
      if (!lf.previewUrl || lf.url || usados.has(lf.localId)) return false;
      if (lf.tipo !== sf.tipo) return false;
      if (sf.url) return false;
      if (lf.tipo === "avarias") {
        return lf.dataHora === sf.dataHora && lf.lat === sf.lat && lf.lng === sf.lng;
      }
      return true;
    });
    if (!local) return sf;
    usados.add(local.localId);
    return {
      ...sf,
      previewUrl: local.previewUrl,
      uploadStatus: local.uploadStatus,
      syncStatus: local.syncStatus ?? sf.syncStatus,
      localId: local.localId,
    };
  });
  const extras = (localFotos || []).filter(
    (lf) => lf.previewUrl && !lf.url && lf.localId && !usados.has(lf.localId)
  );
  return [...merged, ...extras];
}

function fotosUploadFalharam(checklist) {
  const coleta = checklist?.coleta?.fotos || [];
  const entrega = checklist?.entrega?.fotos || [];
  return [...coleta, ...entrega].filter((f) => f.uploadStatus === "failed");
}

function AvisoEtapaTravada() {
  return (
    <div
      style={{
        background: "#F8FAFC",
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "10px 14px",
        color: C.muted,
        fontSize: 13,
        fontWeight: 600,
        textAlign: "center",
        marginBottom: 4,
      }}
    >
      🔒 Etapa finalizada — somente leitura
    </div>
  );
}

function Field({ label, value, onChange, placeholder, autoComplete, readOnly = false, inputMode, pattern }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && (
        <label style={{ color: C.text2, fontSize: 14, fontWeight: 700, letterSpacing: 0.4 }}>{label}</label>
      )}
      <input
        type="text"
        value={value}
        readOnly={readOnly}
        onChange={readOnly ? undefined : (e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        pattern={pattern}
        style={{
          background: readOnly ? "#F8FAFC" : C.subtle,
          border: `1.5px solid ${C.border}`,
          borderRadius: 10,
          color: readOnly ? C.muted : C.text,
          padding: "10px 12px",
          fontSize: 14,
          outline: "none",
        }}
      />
    </div>
  );
}

function BtnSelecao({ label, ativo, onClick, cor = C.navy, gridCell = false, disabled = false }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        flex: gridCell ? undefined : 1,
        width: gridCell ? "100%" : undefined,
        minWidth: 0,
        background: ativo ? `${cor}18` : "#fff",
        border: `2px solid ${ativo ? cor : C.border}`,
        borderRadius: 11,
        padding: gridCell ? "10px 8px" : "9px 8px",
        cursor: disabled ? "default" : "pointer",
        color: ativo ? cor : C.text,
        fontWeight: 700,
        fontSize: gridCell ? 13 : 12,
        lineHeight: 1.3,
        whiteSpace: gridCell ? "normal" : "nowrap",
        textAlign: "center",
        transition: "all .15s",
        opacity: disabled ? 0.65 : 1,
      }}
    >
      {label}
    </button>
  );
}

function FotoPreviewImg({ urlOrPath, alt, style }) {
  const [src, setSrc] = useState(() => {
    if (!urlOrPath) return "";
    if (urlOrPath.startsWith("blob:") || isChecklistDownloadUrl(urlOrPath)) return urlOrPath;
    return storageBlobUrlCache.get(urlOrPath) || "";
  });
  const fallbackTriedRef = useRef(false);

  useEffect(() => {
    fallbackTriedRef.current = false;
    if (!urlOrPath) {
      setSrc("");
      return;
    }
    if (urlOrPath.startsWith("blob:") || isChecklistDownloadUrl(urlOrPath)) {
      setSrc(urlOrPath);
      return;
    }
    if (storageBlobUrlCache.has(urlOrPath)) {
      setSrc(storageBlobUrlCache.get(urlOrPath));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const objUrl = await getCachedStorageBlobUrl(urlOrPath);
        if (!cancelled) setSrc(objUrl);
      } catch (err) {
        logChecklist("error", "[Checklist] Falha preview foto:", urlOrPath, err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [urlOrPath]);

  const handleError = async () => {
    if (!urlOrPath || fallbackTriedRef.current) return;
    fallbackTriedRef.current = true;
    try {
      const objUrl = await getCachedStorageBlobUrl(urlOrPath);
      setSrc(objUrl);
    } catch (err) {
      logChecklist("error", "[Checklist] Falha fallback foto:", urlOrPath, err);
    }
  };

  if (!src) return null;

  return <img src={src} alt={alt} onError={handleError} style={style} />;
}

function FotoViewerModal({ previewUrl, storageUrl, label, onClose }) {
  const [src, setSrc] = useState(previewUrl || "");
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef(null);
  const imgRef = useRef(null);
  const baseSizeRef = useRef({ w: 0, h: 0 });
  const gestureRef = useRef({ mode: null, dist: 0, baseScale: 1, startX: 0, startY: 0, baseOffsetX: 0, baseOffsetY: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (previewUrl) {
        setSrc(previewUrl);
        return;
      }
      if (!storageUrl) return;
      try {
        const objUrl = await getCachedStorageBlobUrl(storageUrl);
        if (!cancelled) setSrc(objUrl);
      } catch (err) {
        logChecklist("error", "[Checklist] Falha visualizador foto:", storageUrl, err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewUrl, storageUrl]);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    gestureRef.current = { mode: null, dist: 0, baseScale: 1, startX: 0, startY: 0, baseOffsetX: 0, baseOffsetY: 0 };
    baseSizeRef.current = { w: 0, h: 0 };
  }, [previewUrl, storageUrl]);

  const clampScale = (v) => Math.min(5, Math.max(0.5, v));

  const measureBaseSize = useCallback(() => {
    const img = imgRef.current;
    const vp = viewportRef.current;
    if (!img || !vp || !img.naturalWidth) return;
    const maxW = vp.clientWidth;
    const maxH = vp.clientHeight;
    const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
    baseSizeRef.current = {
      w: img.naturalWidth * ratio,
      h: img.naturalHeight * ratio,
    };
  }, []);

  const clampOffset = useCallback((x, y, currentScale) => {
    const vp = viewportRef.current;
    const base = baseSizeRef.current;
    if (!vp || !base.w) return { x: 0, y: 0 };
    const sw = base.w * currentScale;
    const sh = base.h * currentScale;
    const maxX = Math.max(0, (sw - vp.clientWidth) / 2);
    const maxY = Math.max(0, (sh - vp.clientHeight) / 2);
    if (currentScale <= 1) return { x: 0, y: 0 };
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  }, []);

  const applyScale = useCallback(
    (nextScale) => {
      const clamped = clampScale(nextScale);
      setScale(clamped);
      setOffset((prev) => clampOffset(prev.x, prev.y, clamped));
    },
    [clampOffset]
  );

  const handleImgLoad = () => {
    measureBaseSize();
    setOffset({ x: 0, y: 0 });
  };

  const handleWheel = (e) => {
    e.preventDefault();
    applyScale(scale + (e.deltaY < 0 ? 0.12 : -0.12));
  };

  const startPan = (clientX, clientY) => {
    if (scale <= 1) return;
    gestureRef.current = {
      ...gestureRef.current,
      mode: "pan",
      startX: clientX,
      startY: clientY,
      baseOffsetX: offset.x,
      baseOffsetY: offset.y,
    };
    setDragging(true);
  };

  const movePan = (clientX, clientY) => {
    if (gestureRef.current.mode !== "pan") return;
    const dx = clientX - gestureRef.current.startX;
    const dy = clientY - gestureRef.current.startY;
    setOffset(clampOffset(gestureRef.current.baseOffsetX + dx, gestureRef.current.baseOffsetY + dy, scale));
  };

  const endGesture = () => {
    gestureRef.current.mode = null;
    setDragging(false);
  };

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      gestureRef.current = {
        mode: "pinch",
        dist: Math.hypot(dx, dy),
        baseScale: scale,
        startX: 0,
        startY: 0,
        baseOffsetX: offset.x,
        baseOffsetY: offset.y,
      };
      setDragging(true);
      return;
    }
    if (e.touches.length === 1) {
      startPan(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e) => {
    if (gestureRef.current.mode === "pinch" && e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / (gestureRef.current.dist || 1);
      applyScale(gestureRef.current.baseScale * ratio);
      return;
    }
    if (gestureRef.current.mode === "pan" && e.touches.length === 1) {
      e.preventDefault();
      movePan(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handlePointerDown = (e) => {
    if (e.pointerType === "touch") return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    startPan(e.clientX, e.clientY);
  };

  const handlePointerMove = (e) => {
    if (gestureRef.current.mode !== "pan" || e.pointerType === "touch") return;
    movePan(e.clientX, e.clientY);
  };

  if (!src) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "rgba(0,0,0,0.92)",
        display: "flex",
        flexDirection: "column",
      }}
      onClick={onClose}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          color: "#fff",
          flexShrink: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 700, fontSize: 14 }}>{label || "Foto"}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          style={{
            background: "rgba(255,255,255,0.15)",
            border: "none",
            borderRadius: 10,
            width: 40,
            height: 40,
            cursor: "pointer",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <XIcon size={22} />
        </button>
      </div>
      <div
        ref={viewportRef}
        style={{
          flex: 1,
          overflow: "hidden",
          position: "relative",
          touchAction: "none",
          cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "default",
        }}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={endGesture}
        onTouchCancel={endGesture}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
            transition: dragging ? "none" : "transform 0.12s ease-out",
            willChange: "transform",
          }}
        >
          <img
            ref={imgRef}
            src={src}
            alt={label || "Foto ampliada"}
            onLoad={handleImgLoad}
            style={{
              display: "block",
              maxWidth: "100vw",
              maxHeight: "calc(100vh - 120px)",
              width: "auto",
              height: "auto",
              userSelect: "none",
              pointerEvents: "none",
            }}
            draggable={false}
          />
        </div>
      </div>
      <div
        style={{
          textAlign: "center",
          color: "rgba(255,255,255,0.65)",
          fontSize: 11,
          padding: "8px 16px 16px",
          flexShrink: 0,
        }}
      >
        Pinça ou scroll para zoom · arraste para mover
      </div>
    </div>,
    document.body
  );
}

class AssinaturaErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    logChecklist("error", "[Checklist] Erro no bloco de assinatura:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            background: C.redLight,
            border: `1px solid ${C.red}33`,
            borderRadius: 14,
            padding: "14px 16px",
            color: C.text2,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          Não foi possível exibir este bloco de assinatura. Recarregue o checklist ou tente novamente.
        </div>
      );
    }
    return this.props.children;
  }
}

function AssinaturaPreviewImg({ imagemUrl, imagemMediaId, bloco }) {
  const [src, setSrc] = useState("");
  const objectUrlRef = useRef(null);
  const fallbackTriedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fallbackTriedRef.current = false;

    (async () => {
      const preview = await resolveChecklistImagePreview({ imagemUrl, imagemMediaId });
      if (!cancelled) setSrc(preview || "");
    })();

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [imagemUrl, imagemMediaId]);

  const handleError = async () => {
    if ((!imagemUrl && !imagemMediaId) || fallbackTriedRef.current) return;
    fallbackTriedRef.current = true;
    if (imagemMediaId) {
      try {
        const preview = await resolveChecklistImagePreview({ imagemMediaId });
        if (preview) {
          setSrc(preview);
          return;
        }
      } catch (err) {
        logChecklist("error", "[Checklist] Falha preview assinatura (mediaId):", bloco, err);
      }
    }
    if (!imagemUrl) return;
    try {
      const blob = await getBlob(ref(storage, imagemUrl));
      const objUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objUrl;
      setSrc(objUrl);
    } catch (err) {
      logChecklist("error", "[Checklist] Falha preview assinatura:", bloco, err);
    }
  };

  return (
    <img
      src={src}
      alt={`Assinatura ${bloco}`}
      onError={handleError}
      style={{
        width: "100%",
        minHeight: 80,
        maxHeight: 140,
        objectFit: "contain",
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        background: "#fff",
        display: "block",
      }}
    />
  );
}

function AvisoIncompleto({ validacao, tentouFinalizarColeta, titulo = "Checklist incompleto" }) {
  if (!tentouFinalizarColeta || validacao.completa) return null;
  return (
    <div
      style={{
        background: C.orangeLight,
        border: `1px solid ${C.orange}44`,
        borderRadius: 14,
        padding: "14px 16px",
      }}
    >
      <div style={{ color: C.orange, fontWeight: 800, fontSize: 14, fontFamily: "'Sora',sans-serif", marginBottom: 8 }}>
        ⚠️ {titulo}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, color: C.text2, fontSize: 13, lineHeight: 1.6 }}>
        {validacao.faltando.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ToastAviso({ mensagem }) {
  if (!mensagem) return null;
  return createPortal(
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 500,
        background: C.navy,
        color: "#fff",
        padding: "12px 18px",
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 600,
        maxWidth: 320,
        textAlign: "center",
        boxShadow: "0 8px 24px #1E3A8A44",
        lineHeight: 1.45,
      }}
    >
      {mensagem}
    </div>,
    document.body
  );
}

function perfilPrestadorCompleto(perfil) {
  return !!(perfil?.nome?.trim() && perfil?.documento?.trim());
}

function resolvePrestadorCampos(perfil, assinAtual) {
  if (perfilPrestadorCompleto(perfil)) {
    return { nome: perfil.nome.trim(), documento: perfil.documento.trim() };
  }
  return {
    nome: (assinAtual?.nome || "").trim(),
    documento: (assinAtual?.documento || "").trim(),
  };
}

function BlocoAssinatura({
  titulo,
  assin,
  bloco,
  padRef,
  substituindo,
  onSubstituir,
  onCampoChange,
  onSalvarAssinatura,
  salvandoAssinatura,
  modoPrestador = false,
  prestadorPerfilCompleto = false,
  prestadorLabel = "",
  telefoneExtra = null,
  somenteLeitura = false,
}) {
  const assinSafe = { ...assinaturaVazia(), ...(assin && typeof assin === "object" ? assin : {}) };
  const temAssinaturaSalva =
    !!assinSafe.imagemMediaId ||
    (!!assinSafe.imagemUrl?.trim() && !String(assinSafe.imagemUrl).startsWith("data:"));
  const mostrarPad = !somenteLeitura && (!temAssinaturaSalva || substituindo);

  const handleCampo = (campo, valor) => {
    try {
      onCampoChange?.(campo, typeof valor === "string" ? valor : "");
    } catch (err) {
      logChecklist("error", "[Checklist] Erro ao atualizar campo de assinatura:", bloco, campo, err);
    }
  };

  const handleSubstituir = () => {
    try {
      onSubstituir?.();
      padRef?.current?.clear?.();
    } catch (err) {
      logChecklist("error", "[Checklist] Erro ao substituir assinatura:", bloco, err);
    }
  };

  return (
    <AssinaturaErrorBoundary>
      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: "16px 18px",
        }}
      >
        <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 14 }}>
          {titulo}
        </div>
        {modoPrestador && prestadorPerfilCompleto ? (
          <div
            style={{
              color: C.text2,
              fontSize: 14,
              fontWeight: 600,
              lineHeight: 1.5,
              marginBottom: 14,
              padding: "10px 12px",
              background: C.navyLight,
              borderRadius: 10,
              border: `1px solid ${C.navy}18`,
            }}
          >
            Prestador: {prestadorLabel}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
            <Field
              label="Nome completo"
              value={assinSafe.nome ?? ""}
              onChange={(v) => handleCampo("nome", v)}
              placeholder="Nome de quem assina"
              readOnly={somenteLeitura}
            />
            <Field
              label="Documento (CPF/RG/CNH)"
              value={assinSafe.documento ?? ""}
              onChange={(v) => handleCampo("documento", v)}
              placeholder="000.000.000-00"
              readOnly={somenteLeitura}
              inputMode="numeric"
              pattern="[0-9]*"
            />
            {telefoneExtra && (
              <Field
                label="Telefone"
                value={telefoneExtra.value ?? ""}
                onChange={(v) => telefoneExtra.onChange?.(v)}
                placeholder="(11) 99999-9999"
                readOnly={somenteLeitura}
                inputMode="numeric"
                pattern="[0-9]*"
              />
            )}
          </div>
        )}
        {temAssinaturaSalva && !substituindo && (
          <div
            style={{
              marginBottom: 14,
              padding: 12,
              background: C.navyLight,
              border: `1px solid ${C.navy}22`,
              borderRadius: 12,
            }}
          >
            <AssinaturaPreviewImg
              imagemUrl={assinSafe.imagemUrl}
              imagemMediaId={assinSafe.imagemMediaId}
              bloco={bloco}
            />
            {!somenteLeitura && (
            <button
              type="button"
              onClick={handleSubstituir}
              style={{
                marginTop: 10,
                width: "100%",
                padding: "10px 0",
                background: C.navy,
                border: "none",
                borderRadius: 10,
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Substituir assinatura
            </button>
            )}
            <div style={{ color: C.muted, fontSize: 11, marginTop: 8 }}>
              Salva em {assinSafe.dataHora || "—"}
              {assinSafe.lat != null && assinSafe.lng != null
                ? ` · ${Number(assinSafe.lat).toFixed(4)}, ${Number(assinSafe.lng).toFixed(4)}`
                : ""}
            </div>
          </div>
        )}
        {mostrarPad && (
          <>
            <SignaturePad ref={padRef} hideClear={temAssinaturaSalva && substituindo} />
            <button
              type="button"
              onClick={() => void onSalvarAssinatura?.()}
              disabled={salvandoAssinatura}
              style={{
                marginTop: 12,
                width: "100%",
                padding: "12px 0",
                background: C.orange,
                border: "none",
                borderRadius: 11,
                color: "#fff",
                fontWeight: 800,
                fontSize: 14,
                cursor: salvandoAssinatura ? "wait" : "pointer",
                fontFamily: "'Sora',sans-serif",
                opacity: salvandoAssinatura ? 0.75 : 1,
                boxShadow: `0 3px 10px ${C.orange}44`,
              }}
            >
              {salvandoAssinatura ? "Salvando assinatura…" : "Salvar assinatura"}
            </button>
          </>
        )}
      </div>
    </AssinaturaErrorBoundary>
  );
}

function EtapaPdfColeta({
  checklist,
  frete,
  perfil,
  gerandoPdf,
  onGerarPdf,
  coletaOk,
}) {
  const pdfBusy = gerandoPdf;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {coletaOk ? (
        <div
          style={{
            background: C.greenLight,
            border: `1px solid ${C.green}33`,
            borderRadius: 16,
            padding: "20px 18px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
          <div style={{ color: C.green, fontWeight: 800, fontSize: 16, fontFamily: "'Sora',sans-serif" }}>
            Coleta concluída
          </div>
          <div style={{ color: C.text2, fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
            Gere o laudo em PDF da coleta do checklist {checklist?.numero || ""}.
          </div>
        </div>
      ) : (
        <div
          style={{
            background: C.orangeLight,
            border: `1px solid ${C.orange}44`,
            borderRadius: 16,
            padding: "16px 18px",
            textAlign: "center",
          }}
        >
          <div style={{ color: C.navy, fontWeight: 800, fontSize: 14, fontFamily: "'Sora',sans-serif" }}>
            Coleta em andamento
          </div>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
            Você já pode gerar o PDF da coleta com os dados preenchidos até aqui.
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={onGerarPdf}
        disabled={pdfBusy}
        style={{
          width: "100%",
          padding: "14px 0",
          background: C.navy,
          border: "none",
          borderRadius: 12,
          color: "#fff",
          fontWeight: 800,
          fontSize: 15,
          cursor: pdfBusy ? "wait" : "pointer",
          fontFamily: "'Sora',sans-serif",
          opacity: pdfBusy ? 0.7 : 1,
        }}
      >
        {gerandoPdf ? (
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <RefreshCwIcon size={16} style={{ animation: "lr-btn-spin 1s linear infinite" }} />
            Gerando PDF...
          </span>
        ) : (
          "📄 PDF da Coleta"
        )}
      </button>
      <div style={{ color: C.muted, fontSize: 11, textAlign: "center", lineHeight: 1.5 }}>
        Origem: {checklist?.origem?.endereco || frete?.origin || "—"}
        <br />
        Destino: {checklist?.destino?.endereco || frete?.dest || "—"}
        <br />
        Prestador: {perfil?.nome || "—"}
      </div>
    </div>
  );
}

function EtapaPdfEntrega({
  gerandoPdfEntrega,
  gerandoPdfCompleto,
  onGerarPdfEntrega,
  onGerarPdfCompleto,
}) {
  const pdfBusy = gerandoPdfEntrega || gerandoPdfCompleto;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <button
        type="button"
        onClick={onGerarPdfEntrega}
        disabled={pdfBusy}
        style={{
          width: "100%",
          padding: "14px 0",
          background: C.navy,
          border: "none",
          borderRadius: 12,
          color: "#fff",
          fontWeight: 800,
          fontSize: 15,
          cursor: pdfBusy ? "wait" : "pointer",
          fontFamily: "'Sora',sans-serif",
          opacity: gerandoPdfEntrega ? 0.7 : 1,
        }}
      >
        {gerandoPdfEntrega ? (
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <RefreshCwIcon size={16} style={{ animation: "lr-btn-spin 1s linear infinite" }} />
            Gerando PDF...
          </span>
        ) : (
          "📄 PDF da Entrega"
        )}
      </button>
      <button
        type="button"
        onClick={onGerarPdfCompleto}
        disabled={pdfBusy}
        style={{
          width: "100%",
          padding: "14px 0",
          background: C.green,
          border: "none",
          borderRadius: 12,
          color: "#fff",
          fontWeight: 800,
          fontSize: 15,
          cursor: pdfBusy ? "wait" : "pointer",
          fontFamily: "'Sora',sans-serif",
          opacity: gerandoPdfCompleto ? 0.7 : 1,
        }}
      >
        {gerandoPdfCompleto ? (
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <RefreshCwIcon size={16} style={{ animation: "lr-btn-spin 1s linear infinite" }} />
            Gerando PDF...
          </span>
        ) : (
          "📋 PDF Completo"
        )}
      </button>
    </div>
  );
}

function PhotoSlot({
  slot,
  foto,
  processing = false,
  onCapture,
  onView,
  onRetry,
  onRemove,
  somenteLeitura = false,
}) {
  const displayUrl = foto?.previewUrl || foto?.url;
  const temFoto = !!displayUrl;
  const uploading = foto?.uploadStatus === "uploading";
  const failed = foto?.uploadStatus === "failed";
  const pendingLocal = foto?.syncStatus === "pending" && !foto?.url;
  const synced = temFoto && (foto?.url || foto?.mediaId) && !uploading && !failed;
  const handleAreaClick = () => {
    if (processing) return;
    if (somenteLeitura) {
      if (temFoto) onView?.(foto, slot.label);
      return;
    }
    if (temFoto) onView?.(foto, slot.label);
    else onCapture();
  };
  return (
    <div
      style={{
        background: C.surface,
        border: `2px solid ${temFoto ? C.green : slot.obrigatoria ? C.orange + "66" : C.border}`,
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={handleAreaClick}
        disabled={processing}
        style={{
          width: "100%",
          border: "none",
          background: temFoto ? "#000" : C.subtle,
          cursor: processing ? "wait" : "pointer",
          padding: 0,
          position: "relative",
          minHeight: temFoto ? undefined : 120,
          height: temFoto ? 140 : undefined,
          overflow: "hidden",
          display: "block",
        }}
      >
        {processing && !temFoto ? (
          <div
            style={{
              color: C.navy,
              fontWeight: 700,
              fontSize: 13,
              padding: 20,
              minHeight: 120,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ⏳ Processando…
          </div>
        ) : temFoto ? (
          foto?.previewUrl ? (
            <img
              src={foto.previewUrl}
              alt={slot.label}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center",
                display: "block",
              }}
            />
          ) : (
            <FotoPreviewImg
              urlOrPath={foto.url}
              alt={slot.label}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center",
                display: "block",
              }}
            />
          )
        ) : (
          <div style={{ padding: 20, textAlign: "center" }}>
            {somenteLeitura ? (
              <div style={{ color: C.muted, fontWeight: 600, fontSize: 13 }}>Sem foto</div>
            ) : (
              <>
                <CameraIcon size={28} color={C.muted} style={{ margin: "0 auto 8px" }} />
                <div style={{ color: C.text2, fontWeight: 700, fontSize: 13 }}>Toque para fotografar</div>
              </>
            )}
          </div>
        )}
        {uploading && temFoto && (
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              background: "rgba(30,58,138,0.92)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              padding: "4px 8px",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <RefreshCwIcon size={11} style={{ animation: "lr-btn-spin 1s linear infinite" }} />
            Enviando…
          </div>
        )}
        {pendingLocal && !uploading && (
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              background: "rgba(232,93,4,0.92)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              padding: "4px 8px",
              borderRadius: 8,
            }}
          >
            📱 Local
          </div>
        )}
        {synced && (
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              background: "rgba(22,163,74,0.92)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              padding: "4px 8px",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <CheckCircle2Icon size={11} />
            Enviada
          </div>
        )}
        {failed && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: 12,
            }}
          >
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 12, textAlign: "center" }}>
              Falha no envio
            </div>
            {!somenteLeitura && onRetry && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry(foto);
                }}
                style={{
                  background: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "6px 12px",
                  color: C.navy,
                  fontWeight: 700,
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Tentar novamente
              </button>
            )}
          </div>
        )}
        {temFoto && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              background: "rgba(0,0,0,0.55)",
              color: "#fff",
              fontSize: 10,
              padding: "5px 8px",
              textAlign: "left",
            }}
          >
            {foto.dataHora || ""}
            {foto.lat != null && foto.lng != null ? ` · ${foto.lat.toFixed(4)}, ${foto.lng.toFixed(4)}` : ""}
          </div>
        )}
      </button>
      <div
        style={{
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div>
          <div style={{ color: C.navy, fontWeight: 800, fontSize: 13, fontFamily: "'Sora',sans-serif" }}>
            {slot.emoji} {slot.label}
            {slot.obrigatoria && <span style={{ color: C.orange, fontSize: 11 }}> *</span>}
          </div>
          {!slot.obrigatoria && (
            <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>Opcional · múltiplas fotos</div>
          )}
        </div>
        {temFoto && !somenteLeitura && !uploading && (
          <button
            type="button"
            onClick={onCapture}
            disabled={processing}
            style={{
              background: C.navyLight,
              border: `1px solid ${C.navy}33`,
              borderRadius: 8,
              padding: "6px 10px",
              cursor: "pointer",
              color: C.navy,
              fontSize: 11,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <RefreshCwIcon size={12} /> {slot.multipla ? "Nova" : "Re-tirar"}
          </button>
        )}
        {slot.multipla && temFoto && onRemove && !somenteLeitura && (
          <button
            type="button"
            onClick={onRemove}
            style={{
              background: C.redLight,
              border: `1px solid ${C.red}33`,
              borderRadius: 8,
              padding: "6px 8px",
              cursor: "pointer",
              color: C.red,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

export default function ChecklistVeiculo({
  checklist: initial,
  frete,
  uid,
  perfil,
  onClose,
  onSaved,
  onAvulsoFinalizado,
  initialEtapa,
  onEtapaChange,
}) {
  const [checklist, setChecklist] = useState(() => normalizeChecklist(initial));
  const [etapa, setEtapa] = useState(() => {
    if (initialEtapa >= 1 && initialEtapa <= 6) return initialEtapa;
    if (initial?.status === "aguardando_entrega") return 5;
    if (initial?.status === "concluido") return 6;
    return 1;
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [tentouFinalizarColeta, setTentouFinalizarColeta] = useState(false);
  const [processingSlot, setProcessingSlot] = useState(null);
  const [slotAtivo, setSlotAtivo] = useState(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [gerandoPdfEntrega, setGerandoPdfEntrega] = useState(false);
  const [gerandoPdfCompleto, setGerandoPdfCompleto] = useState(false);
  const [showPdfShare, setShowPdfShare] = useState(false);
  const [pdfBlobCache, setPdfBlobCache] = useState(null);
  const [pdfFilenameCache, setPdfFilenameCache] = useState("");
  const [pdfModalTipo, setPdfModalTipo] = useState("coleta");
  const [tentouFinalizarEntrega, setTentouFinalizarEntrega] = useState(false);
  const [processingEntregaSlot, setProcessingEntregaSlot] = useState(null);
  const [fotoContexto, setFotoContexto] = useState("coleta");
  const [mostrarDivergencias, setMostrarDivergencias] = useState(false);
  const [modalConfirmarDivergencia, setModalConfirmarDivergencia] = useState(false);
  const [fotoViewer, setFotoViewer] = useState(null);
  const [toastMsg, setToastMsg] = useState("");
  const [substituirColeta, setSubstituirColeta] = useState({ responsavel: false, prestador: false });
  const [salvandoAssinaturaBloco, setSalvandoAssinaturaBloco] = useState({
    responsavel: false,
    prestador: false,
  });
  const [salvandoAssinaturaEntregaBloco, setSalvandoAssinaturaEntregaBloco] = useState({
    recebedor: false,
    prestador: false,
  });
  const [substituirEntrega, setSubstituirEntrega] = useState({ recebedor: false, prestador: false });
  const [uploadSyncProgress, setUploadSyncProgress] = useState(null);
  const fileInputRef = useRef(null);
  const capturaContextoRef = useRef(null);
  const fotoFilaRef = useRef(Promise.resolve());
  const responsavelPadRef = useRef(null);
  const prestadorPadRef = useRef(null);
  const recebedorEntregaPadRef = useRef(null);
  const prestadorEntregaPadRef = useRef(null);
  const checklistRef = useRef(checklist);
  const etapaRef = useRef(etapa);
  const migrationRanRef = useRef(null);
  const gerarPdfCompletoRef = useRef(null);
  const etapaBootstrappedIdRef = useRef(null);
  const etapaReportedRef = useRef(null);
  const onEtapaChangeRef = useRef(onEtapaChange);
  onEtapaChangeRef.current = onEtapaChange;
  checklistRef.current = checklist;
  etapaRef.current = etapa;

  const pendingMediaBreakdown = getChecklistPendingMediaBreakdown(checklist);
  const pendingMediaLabel = getChecklistPendingMediaLabel(checklist);
  const syncBadgeAtivo = getChecklistSyncBadge(checklist);
  const validacao = coletaCompletaLocal(checklist, perfil);
  const validacaoEntrega = entregaCompletaLocal(checklist, perfil);
  const prestadorPerfilOk = perfilPrestadorCompleto(perfil);
  const coletaOk =
    checklist?.status === "aguardando_entrega" ||
    checklist?.status === "concluido" ||
    validacao.completa;
  const entregaHabilitada = checklist?.status === "aguardando_entrega" || checklist?.status === "concluido";
  const travarEtapasColeta = coletaChecklistTravada(checklist);
  const entregaConcluida = entregaChecklistTravada(checklist);
  const travarEntrega = entregaConcluida;
  const pdfParams = { checklist, frete, perfil };

  useEffect(() => {
    if (!initial?.id || checklist?.id) return;
    logChecklist("warn", "[Checklist] State sem id — sincronizando da prop", { propId: initial.id });
    setChecklist((c) => ({ ...c, id: initial.id }));
  }, [initial?.id, checklist?.id]);

  // Restaura etapa só ao abrir/retomar outro checklist — não a cada onSaved do pai
  useEffect(() => {
    if (!initial?.id || etapaBootstrappedIdRef.current === initial.id) return;
    etapaBootstrappedIdRef.current = initial.id;

    let etapaInicial = 1;
    if (initial?.status === "concluido") etapaInicial = 6;
    else if (initial?.status === "aguardando_entrega") etapaInicial = 5;
    else if (initialEtapa >= 1 && initialEtapa <= 6) etapaInicial = initialEtapa;

    setEtapa(etapaInicial);
    etapaReportedRef.current = etapaInicial;
  }, [initial?.id, initialEtapa, initial?.status]);

  // Reidrata previewUrl a partir do IndexedDB após kill do app / retomar sessão
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const base = checklistRef.current;
      if (!base?.id) return;

      const hydrateFotos = async (fotos) => {
        const list = [...(fotos || [])];
        let changed = false;
        for (let i = 0; i < list.length; i++) {
          const f = list[i];
          if (!f?.mediaId || f.previewUrl) continue;
          const preview = await resolveChecklistImagePreview({ mediaId: f.mediaId });
          if (preview && !cancelled) {
            list[i] = { ...f, previewUrl: preview };
            changed = true;
          }
        }
        return changed ? list : null;
      };

      const coletaFotos = await hydrateFotos(base.coleta?.fotos);
      const entregaFotos = await hydrateFotos(base.entrega?.fotos);
      if (cancelled || (!coletaFotos && !entregaFotos)) return;

      const next = { ...base };
      if (coletaFotos) {
        next.coleta = { ...normalizeColetaData(next.coleta, next), fotos: coletaFotos };
      }
      if (entregaFotos) {
        next.entrega = { ...normalizeEntregaData(next.entrega), fotos: entregaFotos };
      }
      checklistRef.current = next;
      setChecklist(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [initial?.id]);

  useEffect(() => {
    if (etapaReportedRef.current === etapa) return;
    etapaReportedRef.current = etapa;
    onEtapaChangeRef.current?.(etapa);
  }, [etapa]);

  // Re-sincroniza do Firestore ao voltar do app externo (WhatsApp / share sheet)
  useEffect(() => {
    if (!uid || !checklist?.id) return;

    let cancelled = false;
    const resync = async () => {
      try {
        const fresh = await loadChecklist(uid, checklist.id);
        if (cancelled || !fresh?.id) return;
        const normalized = normalizeChecklist(fresh);
        setChecklist(normalized);
        checklistRef.current = normalized;
        onSaved?.(normalized);
        if (fresh.status === "concluido") {
          clearChecklistSession();
          return;
        }
        if (fresh.status === "aguardando_entrega" && etapaRef.current < 5) {
          setEtapa(5);
        }
      } catch (err) {
        logChecklist("warn", "[Checklist] Falha ao re-sincronizar ao voltar:", err);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") resync();
    };
    const onPageShow = (e) => {
      if (e.persisted) resync();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [uid, checklist?.id, onSaved]);

  useEffect(() => {
    if (!uid || !initial?.id) return;
    if (migrationRanRef.current === initial.id) return;
    migrationRanRef.current = initial.id;

    let cancelled = false;
    (async () => {
      const atual = checklistRef.current;
      const { coleta, changed: coletaChanged } = await migrateChecklistColetaMedia(atual?.coleta);
      const { entrega, changed: entregaChanged } = await migrateChecklistEntregaMedia(atual?.entrega);
      if (cancelled || (!coletaChanged && !entregaChanged)) return;
      try {
        const payload = {};
        if (coletaChanged) payload.coleta = coleta;
        if (entregaChanged) payload.entrega = entrega;
        const atualizado = await saveChecklistToRepository({
          uid,
          checklistId: initial.id,
          patch: payload,
          baseChecklist: checklistRef.current,
        });
        if (cancelled || !atualizado.savedLocally) return;
        const saved = atualizado.checklist || checklistRef.current;
        const merged = {
          ...saved,
          ...(coletaChanged ? { coleta: normalizeColetaData(saved.coleta || coleta, saved) } : {}),
          ...(entregaChanged ? { entrega: normalizeEntregaData(saved.entrega || entrega) } : {}),
          id: initial.id,
        };
        setChecklist(merged);
        onSaved?.(merged);
      } catch (err) {
        logChecklist("warn", "[Checklist] Falha ao persistir migracao de URLs:", err);
        if (!cancelled) {
          const merged = {
            ...checklistRef.current,
            ...(coletaChanged ? { coleta: normalizeColetaData(coleta, checklistRef.current) } : {}),
            ...(entregaChanged ? { entrega: normalizeEntregaData(entrega) } : {}),
            id: initial.id,
          };
          setChecklist(merged);
          onSaved?.(merged);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, initial?.id]);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(""), 4500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Fase 2c/2d — escuta progresso da fila UPLOAD_MEDIA e atualiza checklist na UI
  useEffect(() => {
    if (!checklist?.id) return undefined;
    return subscribeChecklistUploadProgress((evt) => {
      if (evt.checklistId !== checklist.id) return;
      if (evt.phase === "uploading") {
        setUploadSyncProgress({ current: evt.current, total: evt.total });
      } else if (evt.phase === "progress" && evt.checklist) {
        setUploadSyncProgress({
          current: evt.current,
          total: evt.total,
          pending: evt.pending,
        });
        setChecklist(evt.checklist);
        checklistRef.current = evt.checklist;
        onSaved?.(evt.checklist);
      } else if (evt.phase === "done") {
        setUploadSyncProgress(null);
        if (evt.checklist) {
          setChecklist(evt.checklist);
          checklistRef.current = evt.checklist;
          onSaved?.(evt.checklist);
        }
      }
    });
  }, [checklist?.id, onSaved]);

  // Fase 2c — dispara fila ao abrir checklist com mídia pendente (se online)
  useEffect(() => {
    if (!uid || !checklist?.id) return;
    const pending = countPendingChecklistMedia(checklist);
    if (pending > 0 && isNavigatorOnline()) {
      scheduleChecklistMediaUpload({ uid, checklistId: checklist.id });
    }
  }, [uid, checklist?.id]);

  useEffect(() => {
    if (checklist.entrega?.conferencia?.conforme === false) {
      setMostrarDivergencias(true);
    }
  }, [checklist.entrega?.conferencia?.conforme]);

  useEffect(() => {
    if (etapa !== 4) return;
    setChecklist((c) => {
      const cliente = c.cliente || {};
      const coleta = normalizeColetaData(c.coleta, c);
      const assin = coleta.assinaturas || {};
      const resp = assin.responsavel || assinaturaVazia();
      const prest = assin.prestador || assinaturaVazia();
      let changed = false;
      const nextResp = { ...resp };
      const nextPrest = { ...prest };

      if (!resp.nome?.trim() && cliente.nome?.trim()) {
        nextResp.nome = cliente.nome;
        changed = true;
      }
      if (!resp.documento?.trim() && cliente.documento?.trim()) {
        nextResp.documento = cliente.documento;
        changed = true;
      }
      if (!prestadorPerfilOk) {
        if (!prest.nome?.trim() && perfil?.nome?.trim()) {
          nextPrest.nome = perfil.nome;
          changed = true;
        }
        if (!prest.documento?.trim() && perfil?.documento?.trim()) {
          nextPrest.documento = perfil.documento;
          changed = true;
        }
      }

      if (!changed) return c;
      const next = {
        ...c,
        coleta: {
          ...coleta,
          assinaturas: {
            ...assin,
            responsavel: nextResp,
            prestador: nextPrest,
          },
        },
      };
      checklistRef.current = next;
      return next;
    });
  }, [etapa, perfil?.nome, perfil?.documento, prestadorPerfilOk]);

  useEffect(() => {
    if (etapa !== 6 || prestadorPerfilOk) return;
    setChecklist((c) => {
      const entrega = normalizeEntregaData(c.entrega);
      const prest = entrega.assinaturas?.prestador || assinaturaVazia();
      let changed = false;
      const nextPrest = { ...prest };
      if (!prest.nome?.trim() && perfil?.nome?.trim()) {
        nextPrest.nome = perfil.nome;
        changed = true;
      }
      if (!prest.documento?.trim() && perfil?.documento?.trim()) {
        nextPrest.documento = perfil.documento;
        changed = true;
      }
      if (!changed) return c;
      const next = {
        ...c,
        entrega: {
          ...entrega,
          assinaturas: {
            ...entrega.assinaturas,
            prestador: nextPrest,
          },
        },
      };
      checklistRef.current = next;
      return next;
    });
  }, [etapa, perfil?.nome, perfil?.documento, prestadorPerfilOk]);

  useEffect(() => {
    if (etapa !== 6) return;
    const atual = checklistRef.current || checklist;
    const coleta = normalizeColetaData(atual.coleta, atual);
    const entrega = normalizeEntregaData(atual.entrega);
    const confInicial = inicializarEstadosEntrega(coleta.acessorios, entrega.conferencia);
    const conforme =
      confInicial.conforme === true || confInicial.conforme === false ? confInicial.conforme : true;
    const nextConf = { ...confInicial, conforme, observacao: confInicial.observacao || "" };
    const prevJson = JSON.stringify(entrega.conferencia || null);
    const nextJson = JSON.stringify(nextConf);
    if (prevJson === nextJson) return;
    const nextEntrega = { ...entrega, conferencia: nextConf };
    setChecklist((c) => {
      const next = { ...c, entrega: nextEntrega };
      checklistRef.current = next;
      return next;
    });
  }, [etapa, checklist?.id]);

  const abrirVisualizadorFoto = useCallback((foto, label) => {
    if (!foto?.previewUrl && !foto?.url) return;
    setFotoViewer({
      previewUrl: foto.previewUrl || null,
      storageUrl: foto.url || null,
      label: label || "Foto",
    });
  }, []);

  const notificarErroSalvar = useCallback((mensagem, err) => {
    logChecklist("error", "[Checklist] Falha ao salvar:", mensagem, err || "");
    setErro(mensagem);
    setToastMsg(mensagem);
  }, []);

  const salvar = useCallback(
    async (dados) => {
      const checklistId = checklist?.id || initial?.id;
      logChecklist("log", "[Checklist] salvar() iniciado", { checklistId, uid: !!uid });
      if (!uid || !checklistId) {
        const mensagem = !uid
          ? "Usuário não autenticado. Faça login novamente."
          : "Checklist sem identificador. Feche e abra o checklist novamente.";
        logChecklist("warn", "[Checklist] salvar() retorno antecipado: sem uid ou checklistId", {
          uid: !!uid,
          checklistId,
          stateId: checklist?.id,
          propId: initial?.id,
        });
        notificarErroSalvar(mensagem, { uid: !!uid, checklistId });
        return null;
      }
      const { status, ...rest } = dados;
      const payload = {};
      if (status !== undefined) payload.status = status;
      Object.entries(rest).forEach(([key, val]) => {
        if (val !== null && val !== undefined) payload[key] = val;
      });
      const base = checklistRef.current || checklist;
      if (payload.coleta) {
        const normalized = normalizeColetaData(payload.coleta, base);
        if (normalized.fotos) normalized.fotos = sanitizeFotosForFirestore(normalized.fotos);
        payload.coleta = stripBase64AssinaturasColeta(normalized);
      }
      if (payload.entrega) {
        const normalized = normalizeEntregaData(payload.entrega);
        if (normalized.fotos) normalized.fotos = sanitizeFotosForFirestore(normalized.fotos);
        payload.entrega = stripBase64AssinaturasEntrega(normalized);
      }
      setSalvando(true);
      setErro("");
      try {
        const result = await saveChecklistToRepository({
          uid,
          checklistId,
          patch: payload,
          baseChecklist: base,
        });
        if (!result.savedLocally || !result.checklist) {
          logChecklist("warn", "[Checklist] Retorno antecipado: falha ao gravar local", { checklistId });
          notificarErroSalvar("Não foi possível salvar. Tente novamente.");
          return null;
        }
        const merged = { ...result.checklist, id: checklistId };
        if (merged.coleta) merged.coleta = normalizeColetaData(merged.coleta, merged);
        if (merged.entrega) merged.entrega = normalizeEntregaData(merged.entrega);
        const localBase = checklistRef.current || checklist;
        if (merged.coleta?.fotos) {
          merged.coleta = {
            ...merged.coleta,
            fotos: preserveLocalFotoPreviews(localBase.coleta?.fotos, merged.coleta.fotos),
          };
        }
        if (merged.entrega?.fotos) {
          merged.entrega = {
            ...merged.entrega,
            fotos: preserveLocalFotoPreviews(localBase.entrega?.fotos, merged.entrega.fotos),
          };
        }
        setChecklist(merged);
        checklistRef.current = merged;
        onSaved?.(merged);
        logChecklist("log", "[Checklist] salvar() concluído", {
          checklistId,
          savedRemote: result.savedRemote,
        });
        return merged;
      } catch (err) {
        const codigo = err?.code ? ` (${err.code})` : "";
        const detalhe = err?.message ? `: ${err.message}` : "";
        logChecklist("warn", "[Checklist] Retorno antecipado: exceção em salvar", {
          checklistId,
          code: err?.code,
          message: err?.message,
        });
        notificarErroSalvar(
          `Não foi possível salvar${codigo}${detalhe}. Verifique sua conexão.`,
          err
        );
        return null;
      } finally {
        setSalvando(false);
      }
    },
    [uid, checklist, initial?.id, onSaved, notificarErroSalvar]
  );

  const handleGerarPdf = async () => {
    let atual = checklistRef.current || checklist;
    const okColeta =
      atual?.status === "aguardando_entrega" ||
      atual?.status === "concluido" ||
      coletaCompleta(atual, perfil).completa;
    logChecklist("log", "[Checklist] Gerar PDF clicado", {
      coletaOk: okColeta,
      gerandoPdf,
      gerandoPdfCompleto,
      status: atual?.status,
      temAssinResp: !!atual?.coleta?.assinaturas?.responsavel?.imagemUrl,
      temAssinPrest: !!atual?.coleta?.assinaturas?.prestador?.imagemUrl,
    });
    if (gerandoPdf || gerandoPdfEntrega || gerandoPdfCompleto) {
      logChecklist("warn", "[Checklist] Gerar PDF retorno antecipado: geração em andamento");
      return;
    }
    if (!okColeta) {
      const val = coletaCompleta(atual, perfil);
      const msg = val.faltando.length
        ? `Complete a coleta para gerar o PDF: ${val.faltando.slice(0, 3).join(", ")}${val.faltando.length > 3 ? "…" : ""}`
        : "Finalize a coleta antes de gerar o PDF.";
      logChecklist("warn", "[Checklist] Gerar PDF bloqueado — pré-condições", { faltando: val.faltando });
      setErro(msg);
      setToastMsg(msg);
      return;
    }
    if (fotosUploadFalharam(atual).length) {
      const msg = "Algumas fotos falharam no envio. Toque em Tentar novamente antes de gerar o PDF.";
      setErro(msg);
      setToastMsg(msg);
      return;
    }
    if (pdfBlobCache && pdfModalTipo === "coleta") {
      logChecklist("log", "[Checklist] Gerar PDF: reutilizando cache");
      setPdfModalTipo("coleta");
      setShowPdfShare(true);
      return;
    }
    setGerandoPdf(true);
    setErro("");
    try {
      const params = { checklist: atual, frete, perfil };
      logChecklist("log", "[Checklist] Gerar PDF: iniciando generateChecklistColetaPdf");
      const { blob, filename } = await generateChecklistColetaPdf(params);
      logChecklist("log", "[Checklist] Gerar PDF concluído", { filename, bytes: blob?.size });
      setPdfBlobCache(blob);
      setPdfFilenameCache(filename);
      setPdfModalTipo("coleta");
      setShowPdfShare(true);
      if (!atual?.coleta?.pdfGeradoEm) {
        const coletaComPdf = {
          ...normalizeColetaData(atual.coleta, atual),
          pdfGeradoEm: new Date().toISOString(),
        };
        await salvar({ coleta: coletaComPdf });
      }
    } catch (err) {
      logChecklist("error", "[Checklist] Gerar PDF falhou:", err);
      setErro("Não foi possível gerar o PDF. Verifique sua conexão e tente novamente.");
      setToastMsg("Não foi possível gerar o PDF.");
    } finally {
      setGerandoPdf(false);
    }
  };

  const handleGerarPdfEntrega = async () => {
    let atual = checklistRef.current || checklist;
    logChecklist("log", "[Checklist] Gerar PDF entrega clicado", {
      status: atual?.status,
      gerandoPdfEntrega,
      gerandoPdfCompleto,
    });
    if (gerandoPdf || gerandoPdfEntrega || gerandoPdfCompleto) {
      return;
    }
    if (atual?.status !== "concluido") {
      const msg = "Finalize a entrega antes de gerar o PDF da entrega.";
      setErro(msg);
      setToastMsg(msg);
      return;
    }
    if (fotosUploadFalharam(atual).length) {
      const msg = "Algumas fotos falharam no envio. Toque em Tentar novamente antes de gerar o PDF.";
      setErro(msg);
      setToastMsg(msg);
      return;
    }
    if (pdfBlobCache && pdfModalTipo === "entrega") {
      setShowPdfShare(true);
      if (etapaRef.current === 6) setEtapa(6);
      return;
    }
    const manterEtapa6 = etapaRef.current === 6;
    setGerandoPdfEntrega(true);
    setErro("");
    try {
      const params = { checklist: atual, frete, perfil };
      const { blob, filename } = await generateChecklistEntregaPdf(params);
      logChecklist("log", "[Checklist] Gerar PDF entrega concluído", { filename, bytes: blob?.size });
      setPdfBlobCache(blob);
      setPdfFilenameCache(filename);
      setPdfModalTipo("entrega");
      setShowPdfShare(true);
    } catch (err) {
      logChecklist("error", "[Checklist] Gerar PDF entrega falhou:", err);
      setErro("Não foi possível gerar o PDF da entrega.");
      setToastMsg("Não foi possível gerar o PDF da entrega.");
    } finally {
      setGerandoPdfEntrega(false);
      if (manterEtapa6) setEtapa(6);
    }
  };

  const handleGerarPdfCompleto = async () => {
    let atual = checklistRef.current || checklist;
    logChecklist("log", "[Checklist] Gerar PDF completo clicado", {
      entregaConcluida: atual?.status === "concluido",
      gerandoPdf,
      gerandoPdfEntrega,
      gerandoPdfCompleto,
    });
    if (gerandoPdf || gerandoPdfEntrega || gerandoPdfCompleto) {
      logChecklist("warn", "[Checklist] Gerar PDF completo retorno antecipado: geração em andamento");
      return;
    }
    if (atual?.status !== "concluido") {
      const msg = "Finalize a entrega antes de gerar o PDF completo.";
      logChecklist("warn", "[Checklist] Gerar PDF completo bloqueado", { status: atual?.status });
      setErro(msg);
      setToastMsg(msg);
      return;
    }
    if (fotosUploadFalharam(atual).length) {
      const msg = "Algumas fotos falharam no envio. Toque em Tentar novamente antes de gerar o PDF.";
      setErro(msg);
      setToastMsg(msg);
      return;
    }
    if (pdfBlobCache && pdfModalTipo === "completo") {
      setShowPdfShare(true);
      if (etapaRef.current === 6) setEtapa(6);
      return;
    }
    const manterEtapa6 = etapaRef.current === 6;
    setGerandoPdfCompleto(true);
    setErro("");
    try {
      const params = { checklist: atual, frete, perfil };
      const { blob, filename } = await generateChecklistCompletoPdf(params);
      logChecklist("log", "[Checklist] Gerar PDF completo concluído", { filename, bytes: blob?.size });
      setPdfBlobCache(blob);
      setPdfFilenameCache(filename);
      setPdfModalTipo("completo");
      setShowPdfShare(true);
    } catch (err) {
      logChecklist("error", "[Checklist] Gerar PDF completo falhou:", err);
      setErro("Não foi possível gerar o PDF completo.");
      setToastMsg("Não foi possível gerar o PDF completo.");
    } finally {
      setGerandoPdfCompleto(false);
      if (manterEtapa6) setEtapa(6);
    }
  };
  gerarPdfCompletoRef.current = handleGerarPdfCompleto;

  const assinaturaSalvaValida = (assin) => {
    if (!assin) return false;
    if (assin.imagemMediaId) return true;
    return !!assin.imagemUrl?.trim() && !String(assin.imagemUrl).startsWith("data:");
  };

  const salvarAssinaturaBloco = useCallback(
    async (bloco) => {
      const padRef = bloco === "responsavel" ? responsavelPadRef : prestadorPadRef;
      const atual = checklistRef.current || checklist;
      const checklistId = atual?.id;

      logChecklist("log", "[Checklist] Salvar assinatura clicado", { bloco, checklistId });

      if (!uid || !checklistId) {
        setErro("Checklist indisponível. Feche e abra novamente.");
        return;
      }
      if (padRef.current?.isEmpty?.()) {
        setErro("Desenhe a assinatura no quadro antes de salvar.");
        setToastMsg("Desenhe a assinatura antes de salvar.");
        return;
      }

      const assinAtual = atual.coleta?.assinaturas?.[bloco] || assinaturaVazia();
      const ident =
        bloco === "prestador" ? resolvePrestadorCampos(perfil, assinAtual) : null;
      setSalvandoAssinaturaBloco((s) => ({ ...s, [bloco]: true }));
      setErro("");
      try {
        const gps = await getChecklistGeolocation();
        const blob = await padRef.current.toBlob();
        const jpeg = await compressImageToJpegBlob(blob);
        const nomeArquivo = `assinatura_${bloco}_${Date.now()}`;
        logChecklist("log", "[Checklist] Gravando assinatura local (IndexedDB)", { bloco, nomeArquivo });
        const { mediaId } = await captureChecklistMedia({
          uid,
          checklistId,
          contexto: "coleta",
          tipo: "assinatura",
          slot: `assinatura_${bloco}`,
          blob: jpeg,
          storageFileName: nomeArquivo,
        });

        const dataHora = formatStampDataHora();
        const base = checklistRef.current || checklist;
        const assinFresh = base.coleta?.assinaturas?.[bloco] || assinaturaVazia();
        const assinaturas = {
          ...(base.coleta?.assinaturas || {}),
          [bloco]: {
            ...assinFresh,
            nome: ident ? ident.nome : (assinFresh.nome || assinAtual.nome || "").trim(),
            documento: ident ? ident.documento : (assinFresh.documento || assinAtual.documento || "").trim(),
            imagemMediaId: mediaId,
            imagemUrl: "",
            dataHora,
            lat: gps?.lat ?? null,
            lng: gps?.lng ?? null,
          },
        };
        const coletaAtualizada = { ...base.coleta, assinaturas };
        const ok = await salvar({ coleta: coletaAtualizada });
        if (ok) {
          padRef.current?.clear?.();
          setSubstituirColeta((s) => ({ ...s, [bloco]: false }));
          logChecklist("log", "[Checklist] Assinatura persistida no Firestore", { bloco });
        } else {
          setErro("Não foi possível gravar a assinatura. Tente novamente.");
        }
      } catch (err) {
        logChecklist("error", "[Checklist] Falha salvar assinatura:", bloco, err);
        setErro("Não foi possível salvar a assinatura. Tente novamente.");
        setToastMsg("Falha ao salvar assinatura.");
      } finally {
        setSalvandoAssinaturaBloco((s) => ({ ...s, [bloco]: false }));
      }
    },
    [uid, checklist, salvar, perfil]
  );

  const salvarAssinaturaEntregaBloco = useCallback(
    async (bloco) => {
      const padRef = bloco === "recebedor" ? recebedorEntregaPadRef : prestadorEntregaPadRef;
      const atual = checklistRef.current || checklist;
      const checklistId = atual?.id;

      logChecklist("log", "[Checklist] Salvar assinatura entrega clicado", { bloco, checklistId });

      if (!uid || !checklistId) {
        setErro("Checklist indisponível. Feche e abra novamente.");
        return;
      }
      if (padRef.current?.isEmpty?.()) {
        setErro("Desenhe a assinatura no quadro antes de salvar.");
        setToastMsg("Desenhe a assinatura antes de salvar.");
        return;
      }

      const entregaNorm = normalizeEntregaData(atual.entrega);
      const assinAtual = entregaNorm.assinaturas?.[bloco] || assinaturaVazia();
      const ident =
        bloco === "prestador" ? resolvePrestadorCampos(perfil, assinAtual) : null;
      setSalvandoAssinaturaEntregaBloco((s) => ({ ...s, [bloco]: true }));
      setErro("");
      try {
        const gps = await getChecklistGeolocation();
        const blob = await padRef.current.toBlob();
        const jpeg = await compressImageToJpegBlob(blob);
        const nomeArquivo = `assinatura_entrega_${bloco}_${Date.now()}`;
        logChecklist("log", "[Checklist] Gravando assinatura entrega local (IndexedDB)", { bloco, nomeArquivo });
        const { mediaId } = await captureChecklistMedia({
          uid,
          checklistId,
          contexto: "entrega",
          tipo: "assinatura",
          slot: `assinatura_entrega_${bloco}`,
          blob: jpeg,
          storageFileName: nomeArquivo,
        });

        const dataHora = formatStampDataHora();
        const base = checklistRef.current || checklist;
        const entregaFresh = normalizeEntregaData(base.entrega);
        const assinFresh = entregaFresh.assinaturas?.[bloco] || assinaturaVazia();
        const assinaturas = {
          ...entregaFresh.assinaturas,
          [bloco]: {
            ...assinFresh,
            nome: ident ? ident.nome : (assinFresh.nome || assinAtual.nome || "").trim(),
            documento: ident ? ident.documento : (assinFresh.documento || assinAtual.documento || "").trim(),
            imagemMediaId: mediaId,
            imagemUrl: "",
            dataHora,
            lat: gps?.lat ?? null,
            lng: gps?.lng ?? null,
          },
        };
        const entregaSalvar = { ...entregaFresh, assinaturas };
        const ok = await salvar({ entrega: entregaSalvar });
        if (ok) {
          padRef.current?.clear?.();
          setSubstituirEntrega((s) => ({ ...s, [bloco]: false }));
          logChecklist("log", "[Checklist] Assinatura entrega persistida", { bloco });
        } else {
          setErro("Não foi possível gravar a assinatura. Tente novamente.");
        }
      } catch (err) {
        logChecklist("error", "[Checklist] Falha salvar assinatura entrega:", bloco, err);
        setErro("Não foi possível salvar a assinatura. Tente novamente.");
        setToastMsg("Falha ao salvar assinatura.");
      } finally {
        setSalvandoAssinaturaEntregaBloco((s) => ({ ...s, [bloco]: false }));
      }
    },
    [uid, salvar, perfil]
  );

  const capturarAssinaturaPad = useCallback(
    async ({
      padRef,
      assinAtual,
      bloco,
      contexto,
      checklistId,
      ident,
      gps,
      dataHora,
    }) => {
      if (padRef?.current && !padRef.current.isEmpty?.()) {
        const jpeg = await compressImageToJpegBlob(await padRef.current.toBlob());
        const nomeArquivo =
          contexto === "entrega"
            ? `assinatura_entrega_${bloco}_${Date.now()}`
            : `assinatura_${bloco}_${Date.now()}`;
        const { mediaId } = await captureChecklistMedia({
          uid,
          checklistId,
          contexto,
          tipo: "assinatura",
          slot: contexto === "entrega" ? `assinatura_entrega_${bloco}` : `assinatura_${bloco}`,
          blob: jpeg,
          storageFileName: nomeArquivo,
        });
        return {
          ...assinAtual,
          nome: ident ? ident.nome : (assinAtual.nome || "").trim(),
          documento: ident ? ident.documento : (assinAtual.documento || "").trim(),
          imagemMediaId: mediaId,
          imagemUrl: "",
          dataHora,
          lat: gps?.lat ?? null,
          lng: gps?.lng ?? null,
        };
      }
      if (
        assinAtual?.imagemMediaId ||
        (assinAtual?.imagemUrl && isChecklistDownloadUrl(assinAtual.imagemUrl))
      ) {
        return {
          ...assinAtual,
          nome: ident ? ident.nome : (assinAtual.nome || "").trim(),
          documento: ident ? ident.documento : (assinAtual.documento || "").trim(),
        };
      }
      return {
        ...assinAtual,
        nome: ident ? ident.nome : (assinAtual.nome || "").trim(),
        documento: ident ? ident.documento : (assinAtual.documento || "").trim(),
        imagemUrl: assinAtual?.imagemUrl || "",
      };
    },
    [uid]
  );

  const persistirAssinaturasColeta = useCallback(
    async ({ finalizar = false } = {}) => {
      const atual = checklistRef.current || checklist;
      const checklistId = atual?.id;
      if (!uid || !checklistId) {
        logChecklist("warn", "[Checklist] persistirAssinaturas retorno antecipado: sem uid/id");
        return null;
      }

      const resp = atual.coleta?.assinaturas?.responsavel || {};
      const prest = atual.coleta?.assinaturas?.prestador || {};

      const prestId = resolvePrestadorCampos(perfil, prest);

      if (finalizar) {
        if (!resp.nome?.trim() || !resp.documento?.trim()) {
          setErro("Preencha nome e documento do responsável no local.");
          return null;
        }
        if (!prestId.nome || !prestId.documento) {
          setErro("Preencha nome e documento do prestador.");
          return null;
        }
        if (!assinaturaSalvaValida(resp)) {
          setErro('Salve a assinatura do responsável no local (botão "Salvar assinatura").');
          return null;
        }
        if (!assinaturaSalvaValida(prest)) {
          setErro('Salve a assinatura do prestador (botão "Salvar assinatura").');
          return null;
        }
      }

      setSalvando(true);
      setErro("");
      try {
        const respPadNovo = !responsavelPadRef.current?.isEmpty?.();
        const prestPadNovo = !prestadorPadRef.current?.isEmpty?.();
        const precisaGps = finalizar || respPadNovo || prestPadNovo;
        const gps = precisaGps ? await getChecklistGeolocation() : null;
        const lat = gps?.lat ?? null;
        const lng = gps?.lng ?? null;
        const dataHora = formatStampDataHora();

        logChecklist("log", "[Checklist] persistirAssinaturas iniciado", {
          finalizar,
          respPadNovo,
          prestPadNovo,
          checklistId,
        });

        const respAssin = await capturarAssinaturaPad({
          padRef: responsavelPadRef,
          assinAtual: resp,
          bloco: "responsavel",
          contexto: "coleta",
          checklistId,
          ident: null,
          gps: { lat, lng },
          dataHora: respPadNovo || !resp.dataHora ? dataHora : resp.dataHora,
        });
        const prestAssin = await capturarAssinaturaPad({
          padRef: prestadorPadRef,
          assinAtual: prest,
          bloco: "prestador",
          contexto: "coleta",
          checklistId,
          ident: prestId,
          gps: { lat, lng },
          dataHora: prestPadNovo || !prest.dataHora ? dataHora : prest.dataHora,
        });

        const assinaturas = {
          responsavel: {
            ...respAssin,
            dataHora: respPadNovo || !resp.dataHora ? dataHora : resp.dataHora,
            lat: respPadNovo ? lat : resp.lat ?? lat,
            lng: respPadNovo ? lng : resp.lng ?? lng,
          },
          prestador: {
            ...prestAssin,
            dataHora: prestPadNovo || !prest.dataHora ? dataHora : prest.dataHora,
            lat: prestPadNovo ? lat : prest.lat ?? lat,
            lng: prestPadNovo ? lng : prest.lng ?? lng,
          },
        };

        const coletaAtualizada = { ...atual.coleta, assinaturas };
        const payload = { coleta: coletaAtualizada };

        if (finalizar) {
          const checklistAtualizado = { ...atual, coleta: coletaAtualizada };
          const val = coletaCompletaLocal(checklistAtualizado, perfil);
          if (val.completa) {
            coletaAtualizada.finalizadaEm = new Date().toISOString();
            payload.status = "aguardando_entrega";
          }
        }

        const payloadBytes = JSON.stringify(payload).length;
        logChecklist("log", "[Checklist] persistirAssinaturas payload", {
          bytes: payloadBytes,
          finalizar,
          temAssinResp: !!(assinaturas.responsavel.imagemUrl || assinaturas.responsavel.imagemMediaId),
          temAssinPrest: !!(assinaturas.prestador.imagemUrl || assinaturas.prestador.imagemMediaId),
        });
        if (payloadBytes > 900000) {
          logChecklist("error", "[Checklist] Payload próximo do limite Firestore (1MB)", { payloadBytes });
          setErro("Dados muito grandes para salvar. As assinaturas devem ser enviadas como imagem, não texto.");
          return null;
        }

        const ok = await salvar(payload);
        if (ok) {
          if (respPadNovo) responsavelPadRef.current?.clear?.();
          if (prestPadNovo) prestadorPadRef.current?.clear?.();
          setSubstituirColeta({ responsavel: false, prestador: false });
          if (finalizar) {
            setToastMsg("Coleta salva no aparelho. Sincroniza quando houver internet.");
          }
        }
        return ok;
      } catch (err) {
        logChecklist("error", "[Checklist] Falha persistirAssinaturas:", err);
        setErro("Falha ao salvar assinaturas. Tente novamente.");
        return null;
      } finally {
        setSalvando(false);
      }
    },
    [uid, checklist, salvar, capturarAssinaturaPad, perfil]
  );

  const irParaEtapa = (id) => {
    const etapaInfo = ETAPAS.find((e) => e.id === id);
    if (etapaInfo?.requerColeta && !entregaHabilitada) {
      const val = coletaCompletaLocal(checklist, perfil);
      const msg = val.faltando.length
        ? `Complete a coleta primeiro: ${val.faltando.slice(0, 3).join(", ")}${val.faltando.length > 3 ? "…" : ""}`
        : "Finalize a coleta antes de registrar a entrega.";
      setToastMsg(msg);
      return;
    }
    if (id === etapa) return;
    void (async () => {
      const atual = checklistRef.current;
      if (etapa === 2 && id !== 2 && atual?.coleta) {
        logChecklist("log", "[Checklist] Auto-save vistoria ao trocar aba", { de: etapa, para: id });
        await salvar({ coleta: atual.coleta });
      }
      if (etapa === 3 && id !== 3 && atual?.coleta) {
        logChecklist("log", "[Checklist] Auto-save fotos ao trocar aba", { de: etapa, para: id });
        await salvar({ coleta: atual.coleta });
      }
      if (etapa === 4 && id !== 4) {
        logChecklist("log", "[Checklist] Auto-save assinaturas ao trocar aba", { de: etapa, para: id });
        await persistirAssinaturasColeta({ finalizar: false });
      }
      if (etapa === 6 && id !== 6 && atual?.entrega) {
        logChecklist("log", "[Checklist] Auto-save entrega ao trocar aba", { de: etapa, para: id });
        await salvar({ entrega: normalizeEntregaData(atual.entrega) });
      }
      setEtapa(id);
    })();
  };

  const avancarEtapa1 = async () => {
    const checklistId = checklist?.id || initial?.id;
    logChecklist("log", "[Checklist] Salvar clicado", { etapa, checklistId, uid: !!uid, salvando });
    if (salvando) {
      logChecklist("warn", "[Checklist] Retorno antecipado: salvando em andamento");
      return;
    }
    if (!uid) {
      logChecklist("warn", "[Checklist] Retorno antecipado: uid ausente");
      notificarErroSalvar("Usuário não autenticado. Faça login novamente.");
      return;
    }
    if (!checklistId) {
      logChecklist("warn", "[Checklist] Retorno antecipado: checklist sem id", {
        stateId: checklist?.id,
        propId: initial?.id,
      });
      notificarErroSalvar("Checklist sem identificador. Feche e abra o checklist novamente.");
      return;
    }
    try {
      const ok = await salvar({
        cliente: checklist.cliente,
        veiculo: checklist.veiculo,
        servico: checklist.servico,
        origem: checklist.origem,
        destino: checklist.destino,
      });
      logChecklist("log", "[Checklist] Salvar etapa 1 concluído", { ok: !!ok });
      if (ok) setEtapa(2);
    } catch (err) {
      logChecklist("error", "[Checklist] Erro não tratado em avancarEtapa1:", err);
      notificarErroSalvar("Falha inesperada ao salvar. Tente novamente.", err);
    }
  };

  const avancarEtapa2 = async () => {
    const ok = await salvar({ coleta: checklist.coleta });
    if (ok) setEtapa(3);
  };

  const avancarEtapa3 = async () => {
    const ok = await salvar({ coleta: checklist.coleta });
    if (ok) setEtapa(4);
  };

  const abrirCaptura = (slotId, contexto = "coleta") => {
    capturaContextoRef.current = { slotId, contexto };
    setFotoContexto(contexto);
    setSlotAtivo(slotId);
    fileInputRef.current?.click();
  };

  const aplicarFotosNoChecklist = useCallback(
    (isEntrega, fotos) => {
      const base = checklistRef.current || checklist;
      if (isEntrega) {
        const entrega = { ...normalizeEntregaData(base.entrega), fotos };
        const next = { ...base, entrega };
        checklistRef.current = next;
        setChecklist(next);
        return next;
      }
      const coleta = { ...base.coleta, fotos };
      const next = { ...base, coleta };
      checklistRef.current = next;
      setChecklist(next);
      return next;
    },
    [checklist]
  );


  const retryUploadFoto = useCallback(
    (foto, contexto = "coleta") => {
      if (!foto?.mediaId && !foto?.localId) return;
      if (foto?.mediaId && !foto?.url) {
        setToastMsg("Foto salva no aparelho. Sincronização na próxima etapa.");
        return;
      }
      setToastMsg("Não foi possível recuperar a foto. Capture novamente.");
    },
    []
  );

  const processarArquivoFoto = async (file, ctx) => {
    const { slotId: slotCaptura, contexto } = ctx;
    const isEntrega = contexto === "entrega";
    const baseChecklist = checklistRef.current || checklist;
    const checklistId = baseChecklist?.id;

    if (!uid || !checklistId) {
      logChecklist("warn", "[Checklist] Foto ignorada: uid/id ausente", {
        uid: !!uid,
        checklistId,
      });
      return;
    }

    logChecklist("log", "[Checklist] Foto capturada", { slot: slotCaptura, contexto, checklistId });

    if (isEntrega) setProcessingEntregaSlot(slotCaptura);
    else setProcessingSlot(slotCaptura);
    setErro("");

    let previewUrl = null;
    let localId = null;
    try {
      const gps = await getChecklistGeolocation();
      const lat = gps?.lat ?? null;
      const lng = gps?.lng ?? null;
      const now = new Date();
      const dataHora = formatStampDataHora(now);
      const stamp = buildPhotoStampText(lat, lng, now);
      const blob = await stampAndCompressImage(file, stamp);
      previewUrl = URL.createObjectURL(blob);
      localId = `${slotCaptura}_${Date.now()}`;
      logChecklist("log", "[Checklist] Foto comprimida, gravando local", { slot: slotCaptura });

      const nomeArquivo =
        slotCaptura === "avarias"
          ? `avarias_${Date.now()}`
          : isEntrega
            ? `entrega_${slotCaptura}`
            : slotCaptura;

      const { mediaId } = await captureChecklistMedia({
        uid,
        checklistId,
        contexto: isEntrega ? "entrega" : "coleta",
        tipo: "foto",
        slot: slotCaptura,
        blob,
        storageFileName: nomeArquivo,
      });

      const slots = isEntrega ? CHECKLIST_ENTREGA_FOTO_SLOTS : CHECKLIST_FOTO_SLOTS;
      const slotInfo = slots.find((s) => s.id === slotCaptura);
      const novaFoto = {
        tipo: slotCaptura,
        label: slotInfo?.label || slotCaptura,
        url: "",
        mediaId,
        previewUrl,
        localId,
        syncStatus: "pending",
        dataHora,
        lat,
        lng,
      };

      const base = checklistRef.current || checklist;
      const fotosExistentes = isEntrega ? base.entrega?.fotos : base.coleta?.fotos;
      if (slotCaptura !== "avarias") {
        const anterior = (fotosExistentes || []).find((f) => f.tipo === slotCaptura);
        if (anterior?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(anterior.previewUrl);
      }

      const fotos = atualizarFotosLista(fotosExistentes, slotCaptura, novaFoto);
      const next = aplicarFotosNoChecklist(isEntrega, fotos);
      await salvar(isEntrega ? { entrega: next.entrega } : { coleta: next.coleta });
      setToastMsg("Foto salva no aparelho.");
    } catch (err) {
      logChecklist("error", "[Checklist] Falha no processamento local da foto:", err);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setErro("Falha ao processar a foto. Tente novamente.");
      setToastMsg("Falha ao processar a foto.");
    } finally {
      if (isEntrega) setProcessingEntregaSlot(null);
      else setProcessingSlot(null);
      setSlotAtivo(null);
    }
  };

  const handleArquivoFoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const ctx = capturaContextoRef.current;
    capturaContextoRef.current = null;

    if (!file || !ctx?.slotId) {
      logChecklist("warn", "[Checklist] Foto ignorada: arquivo/slot ausente", {
        temArquivo: !!file,
        slotId: ctx?.slotId,
      });
      return;
    }

    fotoFilaRef.current = fotoFilaRef.current
      .then(() => processarArquivoFoto(file, ctx))
      .catch((err) => {
        logChecklist("error", "[Checklist] Erro na fila de captura de foto:", err);
      });
  };

  const removerFotoAvaria = async (idx, contexto = "coleta") => {
    const atual = checklistRef.current || checklist;
    if (contexto === "entrega") {
      const fotos = (atual.entrega?.fotos || []).filter((_, i) => i !== idx);
      const entrega = { ...normalizeEntregaData(atual.entrega), fotos };
      setChecklist((c) => {
        const next = { ...c, entrega };
        checklistRef.current = next;
        return next;
      });
      await salvar({ entrega });
      return;
    }
    const fotos = (atual.coleta?.fotos || []).filter((_, i) => i !== idx);
    const coleta = { ...atual.coleta, fotos };
    setChecklist((c) => {
      const next = { ...c, coleta };
      checklistRef.current = next;
      return next;
    });
    await salvar({ coleta });
  };

  const updateAssinaturaCampo = (bloco, campo, valor) =>
    setChecklist((c) => {
      const coleta = normalizeColetaData(c.coleta, c);
      const assinAtual = coleta.assinaturas?.[bloco] || assinaturaVazia();
      const next = {
        ...c,
        coleta: {
          ...coleta,
          assinaturas: {
            ...coleta.assinaturas,
            [bloco]: { ...assinAtual, [campo]: valor },
          },
        },
      };
      checklistRef.current = next;
      return next;
    });

  const avancarEtapa4 = async () => {
    setTentouFinalizarColeta(true);
    logChecklist("log", "[Checklist] Finalizar coleta clicado");
    const ok = await persistirAssinaturasColeta({ finalizar: true });
    if (ok) {
      const val = coletaCompletaLocal(checklistRef.current, perfil);
      logChecklist("log", "[Checklist] Finalizar coleta concluído", { completa: val.completa });
      if (val.completa || checklistRef.current?.status === "aguardando_entrega") setEtapa(5);
    }
  };

  const updateCliente = (campo, valor) =>
    setChecklist((c) => ({ ...c, cliente: { ...c.cliente, [campo]: valor } }));
  const updateVeiculo = (campo, valor) =>
    setChecklist((c) => ({ ...c, veiculo: { ...c.veiculo, [campo]: valor } }));

  const setTipoVeiculo = (tipo) => {
    setChecklist((c) => {
      const tipoNovo = tipo === "moto" ? "moto" : "carro";
      if (resolveTipoVeiculo(c.veiculo) === tipoNovo) return c;
      const coletaAnt = normalizeColetaData(c.coleta, c);
      const perguntasAntMap = new Map((coletaAnt.perguntas || []).map((p) => [p.texto, p.resposta]));
      const acessoriosAntMap = new Map((coletaAnt.acessorios || []).map((a) => [a.item, a.estado]));
      const perguntasLista = tipoNovo === "moto" ? CHECKLIST_PERGUNTAS_MOTO : CHECKLIST_PERGUNTAS_PADRAO;
      const acessoriosLista = tipoNovo === "moto" ? CHECKLIST_ACESSORIOS_MOTO : CHECKLIST_ACESSORIOS_PADRAO;
      const perguntas = perguntasLista.map((p) => ({
        texto: p.texto,
        resposta: perguntasAntMap.get(p.texto) ?? null,
      }));
      const acessorios = acessoriosLista.map((item) => ({
        item,
        estado: acessoriosAntMap.get(item) ?? null,
      }));
      const next = {
        ...c,
        veiculo: { ...c.veiculo, tipoVeiculo: tipoNovo },
        coleta: { ...coletaAnt, perguntas, acessorios },
      };
      checklistRef.current = next;
      return next;
    });
  };
  const updateServico = (campo, valor) =>
    setChecklist((c) => ({ ...c, servico: { ...c.servico, [campo]: valor } }));
  const updateEndereco = (campo, valor) =>
    setChecklist((c) => ({ ...c, [campo]: { endereco: valor } }));
  const updatePergunta = (idx, resposta) =>
    setChecklist((c) => {
      const coleta = normalizeColetaData(c.coleta, c);
      const perguntas = [...coleta.perguntas];
      perguntas[idx] = { ...perguntas[idx], resposta };
      return { ...c, coleta: { ...coleta, perguntas } };
    });
  const updateAcessorio = (idx) =>
    setChecklist((c) => {
      const coleta = normalizeColetaData(c.coleta, c);
      const acessorios = [...coleta.acessorios];
      const atual = acessorios[idx]?.estado;
      acessorios[idx] = { ...acessorios[idx], estado: proximoEstadoAcessorio(atual) };
      return { ...c, coleta: { ...coleta, acessorios } };
    });
  const updatePneu = (campo, valor) =>
    setChecklist((c) => ({
      ...c,
      coleta: { ...c.coleta, pneus: { ...c.coleta.pneus, [campo]: valor } },
    }));
  const updateCombustivel = (valor) =>
    setChecklist((c) => ({ ...c, coleta: { ...c.coleta, combustivel: valor } }));
  const updateObservacoes = (valor) =>
    setChecklist((c) => ({ ...c, coleta: { ...c.coleta, observacoes: valor } }));

  const updateRecebedor = (campo, valor) =>
    setChecklist((c) => {
      const next = {
        ...c,
        entrega: {
          ...c.entrega,
          recebedor: { ...c.entrega?.recebedor, [campo]: valor },
        },
      };
      checklistRef.current = next;
      return next;
    });

  const usarMesmaPessoaColeta = async () => {
    const atual = checklistRef.current || checklist;
    const resp = atual.coleta?.assinaturas?.responsavel || {};
    const entregaNorm = normalizeEntregaData(atual.entrega);
    const assinRec = entregaNorm.assinaturas?.recebedor || assinaturaVazia();
    const entrega = {
      ...entregaNorm,
      recebedor: {
        nome: resp.nome || "",
        documento: resp.documento || "",
        mesmaPessoaColeta: true,
      },
      assinaturas: {
        ...entregaNorm.assinaturas,
        recebedor: {
          ...assinRec,
          nome: resp.nome || assinRec.nome || "",
          documento: resp.documento || assinRec.documento || "",
        },
      },
    };
    setChecklist((c) => {
      const next = { ...c, entrega };
      checklistRef.current = next;
      return next;
    });
    await salvar({ entrega });
  };

  const usarOutraPessoa = async () => {
    const atual = checklistRef.current || checklist;
    const entrega = {
      ...normalizeEntregaData(atual.entrega),
      recebedor: { nome: "", documento: "", mesmaPessoaColeta: false },
    };
    setChecklist((c) => {
      const next = { ...c, entrega };
      checklistRef.current = next;
      return next;
    });
    await salvar({ entrega });
  };

  const marcarConforme = async () => {
    const atual = checklistRef.current || checklist;
    const coleta = normalizeColetaData(atual.coleta, atual);
    const entrega = {
      ...normalizeEntregaData(atual.entrega),
      conferencia: {
        conforme: true,
        observacao: "",
        estadosEntrega: (coleta.acessorios || []).map((a) => ({
          item: a.item,
          estado: a.estado,
        })),
      },
    };
    setMostrarDivergencias(false);
    setChecklist((c) => {
      const next = { ...c, entrega };
      checklistRef.current = next;
      return next;
    });
    await salvar({ entrega });
  };

  const confirmarDivergencia = async () => {
    setModalConfirmarDivergencia(false);
    const atual = checklistRef.current || checklist;
    const coleta = normalizeColetaData(atual.coleta, atual);
    const entregaNorm = normalizeEntregaData(atual.entrega);
    const conf = inicializarEstadosEntrega(coleta.acessorios, entregaNorm.conferencia);
    const entrega = {
      ...entregaNorm,
      conferencia: {
        ...conf,
        conforme: false,
        observacao: conf.observacao || "",
      },
    };
    setMostrarDivergencias(true);
    setChecklist((c) => {
      const next = { ...c, entrega };
      checklistRef.current = next;
      return next;
    });
    await salvar({ entrega });
  };

  const voltarParaConforme = async () => {
    const atual = checklistRef.current || checklist;
    const coleta = normalizeColetaData(atual.coleta, atual);
    const entrega = {
      ...normalizeEntregaData(atual.entrega),
      conferencia: {
        conforme: true,
        observacao: "",
        estadosEntrega: (coleta.acessorios || []).map((a) => ({
          item: a.item,
          estado: a.estado,
        })),
      },
    };
    setMostrarDivergencias(false);
    setChecklist((c) => {
      const next = { ...c, entrega };
      checklistRef.current = next;
      return next;
    });
    await salvar({ entrega });
  };

  const ciclarEstadoEntregaItem = (item) => {
    if (travarEntrega) return;
    const atual = checklistRef.current || checklist;
    const coleta = normalizeColetaData(atual.coleta, atual);
    const aColeta = coleta.acessorios?.find((x) => x.item === item);
    const estadoColeta = aColeta?.estado ?? null;
    const entrega = normalizeEntregaData(atual.entrega);
    const conf = entrega.conferencia || { conforme: false, observacao: "", estadosEntrega: [] };
    const estadosEntrega = [...(conf.estadosEntrega || [])];
    const idx = estadosEntrega.findIndex((e) => e.item === item);
    const atualEntrega =
      idx >= 0 ? estadosEntrega[idx].estado : getEstadoEntregaItem(conf, item, estadoColeta);
    const nextEstado = proximoEstadoAcessorio(atualEntrega);
    if (idx >= 0) {
      estadosEntrega[idx] = { item, estado: nextEstado };
    } else {
      estadosEntrega.push({ item, estado: nextEstado });
    }
    const next = {
      ...atual,
      entrega: {
        ...entrega,
        conferencia: {
          ...conf,
          conforme: false,
          estadosEntrega,
        },
      },
    };
    checklistRef.current = next;
    setChecklist(next);
  };

  const resetarEstadoEntregaItem = (item, evt) => {
    evt?.stopPropagation();
    if (travarEntrega) return;
    const atual = checklistRef.current || checklist;
    const coleta = normalizeColetaData(atual.coleta, atual);
    const aColeta = coleta.acessorios?.find((x) => x.item === item);
    const estadoColeta = aColeta?.estado ?? null;
    const entrega = normalizeEntregaData(atual.entrega);
    const conf = entrega.conferencia || { conforme: false, observacao: "", estadosEntrega: [] };
    const estadosEntrega = [...(conf.estadosEntrega || [])];
    const idx = estadosEntrega.findIndex((e) => e.item === item);
    if (idx >= 0) {
      estadosEntrega[idx] = { item, estado: estadoColeta };
    } else {
      estadosEntrega.push({ item, estado: estadoColeta });
    }
    const next = {
      ...atual,
      entrega: {
        ...entrega,
        conferencia: {
          ...conf,
          conforme: false,
          estadosEntrega,
        },
      },
    };
    checklistRef.current = next;
    setChecklist(next);
  };

  const updateObservacaoDivergencia = (valor) => {
    const atual = checklistRef.current || checklist;
    const conf = atual.entrega?.conferencia || { conforme: false, estadosEntrega: [], observacao: "" };
    setChecklist((c) => {
      const next = {
        ...c,
        entrega: {
          ...c.entrega,
          conferencia: { ...conf, conforme: false, observacao: valor },
        },
      };
      checklistRef.current = next;
      return next;
    });
  };

  const updateAssinaturaEntregaCampo = (bloco, campo, valor) =>
    setChecklist((c) => {
      const entrega = normalizeEntregaData(c.entrega);
      const assinAtual = entrega.assinaturas?.[bloco] || assinaturaVazia();
      const next = {
        ...c,
        entrega: {
          ...entrega,
          assinaturas: {
            ...entrega.assinaturas,
            [bloco]: { ...assinAtual, [campo]: valor },
          },
        },
      };
      checklistRef.current = next;
      return next;
    });

  const finalizarEntrega = async () => {
    setTentouFinalizarEntrega(true);
    const atual = checklistRef.current || checklist;
    const entregaNorm = normalizeEntregaData(atual.entrega);
    const recebedor = entregaNorm.recebedor || {};
    const rec = entregaNorm.assinaturas?.recebedor || {};
    const prest = entregaNorm.assinaturas?.prestador || {};

    if (!recebedor.nome?.trim() || !recebedor.documento?.trim()) {
      setErro("Preencha quem recebeu o veículo.");
      return;
    }
    if (!rec.nome?.trim() || !rec.documento?.trim()) {
      setErro("Preencha nome e documento do recebedor (assinatura).");
      return;
    }
    const prestId = resolvePrestadorCampos(perfil, prest);
    if (!prestId.nome || !prestId.documento) {
      setErro("Preencha nome e documento do prestador (entrega).");
      return;
    }
    if (!assinaturaSalvaValida(rec)) {
      setErro('Salve a assinatura do recebedor (botão "Salvar assinatura").');
      return;
    }
    if (!assinaturaSalvaValida(prest)) {
      setErro('Salve a assinatura do prestador (botão "Salvar assinatura").');
      return;
    }

    const conf = entregaNorm.conferencia;
    if (conf?.conforme !== true && conf?.conforme !== false) {
      setErro('Indique se o veículo está conforme ou há divergência.');
      return;
    }
    if (conf?.conforme === false) {
      const acessorios = normalizeColetaData(atual.coleta, atual).acessorios || [];
      if (!derivarDivergenciasEntrega(acessorios, conf).length) {
        setErro("Marque ao menos um item divergente na conferência.");
        return;
      }
    }

    const val = entregaCompletaLocal({ ...atual, entrega: entregaNorm }, perfil);
    if (!val.completa) {
      setErro(`Complete a entrega: ${val.faltando.slice(0, 3).join(", ")}${val.faltando.length > 3 ? "…" : ""}`);
      return;
    }

    setSalvando(true);
    setErro("");
    try {
      const entregaAtualizada = {
        ...entregaNorm,
        finalizadaEm: new Date().toISOString(),
      };
      const ok = await salvar({ entrega: entregaAtualizada, status: "concluido" });
      if (ok) {
        clearChecklistSession();
        setToastMsg("Entrega salva no aparelho. Sincroniza quando houver internet.");
        const atualizado = checklistRef.current || checklist;
        if (uid) {
          if (atualizado?.avulso) {
            void incrementUsageCounter(uid, USAGE_COUNTERS.checklistsAvulsos);
          } else if (atualizado?.freteId) {
            void incrementUsageCounter(uid, USAGE_COUNTERS.checklistsFrete);
          }
        }
        recebedorEntregaPadRef.current?.clear?.();
        prestadorEntregaPadRef.current?.clear?.();
        setSubstituirEntrega({ recebedor: false, prestador: false });
        if (atualizado?.avulso && uid) {
          try {
            await aplicarLimiteAvulsosSalvos(uid);
            onAvulsoFinalizado?.();
          } catch (err) {
            logChecklist("error", "[Checklist] Falha ao limitar avulsos salvos:", err);
          }
        }
      }
    } catch (err) {
      logChecklist("error", "[Checklist] Falha finalizar entrega:", err);
      setErro("Falha ao finalizar entrega. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  };

  const fotos = checklist.coleta?.fotos || [];
  const fotoPorSlot = (slotId) => fotos.find((f) => f.tipo === slotId);
  const fotosAvarias = fotos.filter((f) => f.tipo === "avarias");
  const fotosEntrega = checklist.entrega?.fotos || [];
  const fotoEntregaPorSlot = (slotId) => fotosEntrega.find((f) => f.tipo === slotId);
  const fotosAvariasEntrega = fotosEntrega.filter((f) => f.tipo === "avarias");
  const coletaProcessandoFoto = !!processingSlot;
  const entregaProcessandoFoto = !!processingEntregaSlot;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 950,
        background: C.bg,
        overflowY: "auto",
        overscrollBehaviorY: "contain",
        fontFamily: "'DM Sans',sans-serif",
      }}
    >
      <style>{`@keyframes lr-btn-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handleArquivoFoto}
      />

      <link
        href="https://fonts.googleapis.com/css2?family=Sora:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
          padding: "12px 16px",
          boxShadow: "0 1px 8px #1E3A8A08",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: C.subtle,
              border: `1px solid ${C.border}`,
              borderRadius: 9,
              padding: 8,
              cursor: "pointer",
              display: "flex",
            }}
          >
            <ArrowLeftIcon size={16} color={C.navy} />
          </button>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ color: C.navy, fontWeight: 900, fontSize: 16, fontFamily: "'Sora',sans-serif" }}>
              📋 Checklist de Veículo
            </div>
            <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
              {checklist?.numero || "—"}
              {syncBadgeAtivo && (
                <span style={{ color: C.orange, fontWeight: 700 }}>
                  {" · "}
                  {uploadSyncProgress
                    ? `⏳ Enviando ${uploadSyncProgress.current}/${uploadSyncProgress.total}…`
                    : pendingMediaLabel
                      ? `⏳ ${pendingMediaLabel} pendente${pendingMediaBreakdown.total > 1 ? "s" : ""} de sync`
                      : "⏳ Sync pendente"}
                </span>
              )}
              {checklist?.status === "aguardando_entrega" && " · ✅ Coleta concluída"}
              {checklist?.status === "concluido" && " · ✅ Entrega concluída"}
              {checklist?.avulso
                ? " · Checklist avulso"
                : frete
                  ? ` · ${frete.origin || ""} → ${frete.dest || ""}`
                  : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: C.subtle,
              border: `1px solid ${C.border}`,
              borderRadius: 9,
              padding: 8,
              cursor: "pointer",
              display: "flex",
            }}
          >
            <XIcon size={16} color={C.muted} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 4, marginTop: 12, overflowX: "auto", scrollbarWidth: "none" }}>
          {ETAPAS.map((e) => {
            const ativo = etapa === e.id;
            const bloqueada = e.requerColeta && !entregaHabilitada;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => irParaEtapa(e.id)}
                style={{
                  flex: "1 0 auto",
                  minWidth: 56,
                  padding: "7px 6px",
                  border: "none",
                  borderRadius: 10,
                  cursor: bloqueada ? "not-allowed" : "pointer",
                  background: ativo ? C.navy : bloqueada ? "#E8ECF2" : C.subtle,
                  color: ativo ? "#fff" : bloqueada ? C.muted : C.text2,
                  fontWeight: 700,
                  fontSize: 11,
                  fontFamily: "'Sora',sans-serif",
                  opacity: bloqueada ? 0.65 : 1,
                }}
              >
                {e.id}·{e.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 14px 100px" }}>
        {erro && (
          <div
            style={{
              background: C.redLight,
              border: `1px solid ${C.red}33`,
              borderRadius: 10,
              padding: "10px 14px",
              color: C.red,
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 14,
            }}
          >
            {erro}
          </div>
        )}

        {etapa === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {travarEtapasColeta && <AvisoEtapaTravada />}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "20px 22px" }}>
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 14 }}>👤 Cliente</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Field label="Nome" value={checklist.cliente?.nome || ""} onChange={(v) => updateCliente("nome", v)} placeholder="Nome do cliente" readOnly={travarEtapasColeta} />
                <Field label="Telefone" value={checklist.cliente?.telefone || ""} onChange={(v) => updateCliente("telefone", v)} placeholder="(11) 99999-9999" readOnly={travarEtapasColeta} inputMode="numeric" pattern="[0-9]*" />
                <Field label="Documento (CPF/RG/CNH)" value={checklist.cliente?.documento || ""} onChange={(v) => updateCliente("documento", v)} placeholder="Ex: 000.000.000-00 ou RG" readOnly={travarEtapasColeta} inputMode="numeric" pattern="[0-9]*" />
              </div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "20px 22px" }}>
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 10 }}>
                {resolveTipoVeiculo(checklist.veiculo) === "moto" ? "🏍️" : "🚗"} Veículo rebocado
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <BtnSelecao
                  label="🚗 Carro"
                  ativo={resolveTipoVeiculo(checklist.veiculo) === "carro"}
                  onClick={() => setTipoVeiculo("carro")}
                  disabled={travarEtapasColeta}
                />
                <BtnSelecao
                  label="🏍️ Moto"
                  ativo={resolveTipoVeiculo(checklist.veiculo) === "moto"}
                  onClick={() => setTipoVeiculo("moto")}
                  disabled={travarEtapasColeta}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Field label="Placa" value={checklist.veiculo?.placa || ""} onChange={(v) => updateVeiculo("placa", v)} placeholder="ABC-1D23" readOnly={travarEtapasColeta} />
                <Field label="Cor" value={checklist.veiculo?.cor || ""} onChange={(v) => updateVeiculo("cor", v)} autoComplete="off" readOnly={travarEtapasColeta} />
                <Field label="Marca" value={checklist.veiculo?.marca || ""} onChange={(v) => updateVeiculo("marca", v)} autoComplete="off" readOnly={travarEtapasColeta} />
                <Field label="Modelo" value={checklist.veiculo?.modelo || ""} onChange={(v) => updateVeiculo("modelo", v)} autoComplete="off" readOnly={travarEtapasColeta} />
              </div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "20px 22px" }}>
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 14 }}>🪝 Serviço</div>
              <div style={{ color: C.text2, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Tipo de serviço</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                {CHECKLIST_TIPOS_SERVICO.map((t) => (
                  <BtnSelecao
                    key={t.id}
                    label={t.label}
                    ativo={checklist.servico?.tipo === t.id}
                    onClick={() => updateServico("tipo", t.id)}
                    gridCell
                    disabled={travarEtapasColeta}
                  />
                ))}
              </div>
              <div style={{ color: C.text2, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Motivo</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {CHECKLIST_MOTIVOS.map((m) => (
                  <BtnSelecao
                    key={m.id}
                    label={m.label}
                    ativo={checklist.servico?.motivo === m.id}
                    onClick={() => updateServico("motivo", m.id)}
                    gridCell
                    disabled={travarEtapasColeta}
                  />
                ))}
              </div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "20px 22px" }}>
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 14 }}>📍 Origem e destino</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Field label="Origem (coleta)" value={checklist.origem?.endereco || ""} onChange={(v) => updateEndereco("origem", v)} placeholder="Endereço de coleta" readOnly={travarEtapasColeta} />
                <Field label="Destino (entrega)" value={checklist.destino?.endereco || ""} onChange={(v) => updateEndereco("destino", v)} placeholder="Endereço de entrega" readOnly={travarEtapasColeta} />
              </div>
            </div>
            <button
              type="button"
              onClick={() => void avancarEtapa1()}
              disabled={salvando || travarEtapasColeta}
              style={{
                width: "100%",
                padding: "14px 0",
                background: C.navy,
                border: "none",
                borderRadius: 12,
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
                cursor: salvando ? "wait" : "pointer",
                fontFamily: "'Sora',sans-serif",
                boxShadow: `0 3px 10px ${C.navy}44`,
                opacity: salvando ? 0.7 : 1,
              }}
            >
              {salvando ? "Salvando…" : "Salvar e ir para Vistoria →"}
            </button>
          </div>
        )}

        {etapa === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {travarEtapasColeta && <AvisoEtapaTravada />}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px" }}>
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 14 }}>❓ Perguntas de vistoria</div>
              {(checklist.coleta?.perguntas || []).map((p, i, arr) => (
                <div key={p.texto || i} style={{ marginBottom: i < arr.length - 1 ? 16 : 0 }}>
                  <div style={{ color: C.text, fontSize: 14, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>
                    {i + 1}. {p.texto}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <BtnSelecao label="✅ Sim" ativo={p.resposta === "sim"} onClick={() => updatePergunta(i, "sim")} cor={C.green} disabled={travarEtapasColeta} />
                    <BtnSelecao label="❌ Não" ativo={p.resposta === "nao"} onClick={() => updatePergunta(i, "nao")} cor={C.red} disabled={travarEtapasColeta} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px" }}>
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 6 }}>🔧 Acessórios</div>
              <div style={{ color: C.muted, fontSize: 11, marginBottom: 12 }}>Toque para alternar: Bom → Ausente → Quebrado → N/A</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {(checklist.coleta?.acessorios || []).map((a, i) => {
                  const est = a.estado;
                  const cores = est ? ACESSORIO_CORES[est] : { bg: "#fff", border: C.border, text: C.muted, label: "Toque" };
                  return (
                    <button
                      key={a.item}
                      type="button"
                      onClick={() => !travarEtapasColeta && updateAcessorio(i)}
                      disabled={travarEtapasColeta}
                      style={{
                        background: travarEtapasColeta ? "#F8FAFC" : cores.bg,
                        border: `2px solid ${travarEtapasColeta ? C.border : cores.border}`,
                        borderRadius: 11,
                        padding: "10px 8px",
                        cursor: travarEtapasColeta ? "default" : "pointer",
                        textAlign: "left",
                        opacity: travarEtapasColeta ? 0.85 : 1,
                      }}
                    >
                      <div style={{ color: C.text, fontWeight: 700, fontSize: 12, lineHeight: 1.3 }}>{a.item}</div>
                      <div style={{ color: cores.text, fontSize: 11, fontWeight: 700, marginTop: 4 }}>{cores.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px" }}>
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 14 }}>🛞 Pneus</div>
              {(resolveTipoVeiculo(checklist.veiculo) === "moto"
                ? [
                    { campo: "dianteiro", label: "Dianteiro" },
                    { campo: "traseiro", label: "Traseiro" },
                  ]
                : [
                    { campo: "dianteiro", label: "Dianteiro" },
                    { campo: "traseiro", label: "Traseiro" },
                    { campo: "estepe", label: "Estepe" },
                  ]
              ).map(({ campo, label }) => (
                <div key={campo} style={{ marginBottom: 12 }}>
                  <div style={{ color: C.text2, fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{label}</div>
                  <div style={{ display: "flex", gap: 7 }}>
                    {CHECKLIST_ESTADOS_PNEU.map((est) => (
                      <BtnSelecao
                        key={est}
                        label={est.charAt(0).toUpperCase() + est.slice(1)}
                        ativo={checklist.coleta?.pneus?.[campo] === est}
                        onClick={() => updatePneu(campo, est)}
                        cor={PNEU_CORES[est]}
                        disabled={travarEtapasColeta}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px" }}>
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 14 }}>⛽ Combustível</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {CHECKLIST_NIVEIS_COMBUSTIVEL.map((nivel) => (
                  <BtnSelecao
                    key={nivel}
                    label={nivel === "vazio" ? "Vazio" : nivel}
                    ativo={checklist.coleta?.combustivel === nivel}
                    onClick={() => updateCombustivel(nivel)}
                    disabled={travarEtapasColeta}
                  />
                ))}
              </div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px" }}>
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 14 }}>📝 Observações de avarias</div>
              <textarea
                value={checklist.coleta?.observacoes || ""}
                onChange={travarEtapasColeta ? undefined : (e) => updateObservacoes(e.target.value)}
                readOnly={travarEtapasColeta}
                placeholder="Descreva avarias, riscos, amassados…"
                rows={4}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: C.subtle,
                  border: `1.5px solid ${C.border}`,
                  borderRadius: 10,
                  color: C.text,
                  padding: "10px 12px",
                  fontSize: 14,
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </div>
            <button
              type="button"
              onClick={avancarEtapa2}
              disabled={salvando || travarEtapasColeta}
              style={{
                width: "100%",
                padding: "14px 0",
                background: C.navy,
                border: "none",
                borderRadius: 12,
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
                cursor: salvando || travarEtapasColeta ? "default" : "pointer",
                fontFamily: "'Sora',sans-serif",
                opacity: salvando || travarEtapasColeta ? 0.7 : 1,
              }}
            >
              {salvando ? "Salvando…" : "Salvar vistoria →"}
            </button>
          </div>
        )}

        {etapa === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {travarEtapasColeta && <AvisoEtapaTravada />}
            <div style={{ color: C.text2, fontSize: 13, lineHeight: 1.5 }}>
              📸 Tire as fotos guiadas da vistoria. Cada imagem recebe carimbo com data/hora e GPS antes do envio.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {CHECKLIST_FOTO_SLOTS.filter((s) => !s.multipla).map((slot) => (
                <PhotoSlot
                  key={slot.id}
                  slot={slot}
                  foto={fotoPorSlot(slot.id)}
                  processing={processingSlot === slot.id && !fotoPorSlot(slot.id)?.previewUrl}
                  onCapture={() => abrirCaptura(slot.id)}
                  onView={abrirVisualizadorFoto}
                  onRetry={(f) => retryUploadFoto(f, "coleta")}
                  somenteLeitura={travarEtapasColeta}
                />
              ))}
            </div>
            <div style={{ color: C.navy, fontWeight: 800, fontSize: 14, fontFamily: "'Sora',sans-serif", marginTop: 4 }}>
              💥 Avarias (opcional)
            </div>
            {fotosAvarias.map((foto, idx) => {
              const globalIdx = fotos.indexOf(foto);
              return (
                <PhotoSlot
                  key={`avarias-${globalIdx}`}
                  slot={CHECKLIST_FOTO_SLOTS.find((s) => s.id === "avarias")}
                  foto={foto}
                  processing={false}
                  onCapture={() => abrirCaptura("avarias")}
                  onView={abrirVisualizadorFoto}
                  onRetry={(f) => retryUploadFoto(f, "coleta")}
                  onRemove={() => removerFotoAvaria(globalIdx)}
                  somenteLeitura={travarEtapasColeta}
                />
              );
            })}
            {!travarEtapasColeta && (
            <button
              type="button"
              onClick={() => abrirCaptura("avarias")}
              disabled={coletaProcessandoFoto}
              style={{
                width: "100%",
                padding: "12px 0",
                background: C.subtle,
                border: `2px dashed ${C.border}`,
                borderRadius: 12,
                color: C.text2,
                fontWeight: 700,
                fontSize: 14,
                cursor: coletaProcessandoFoto ? "wait" : "pointer",
              }}
            >
              {processingSlot === "avarias" ? "⏳ Processando…" : "+ Adicionar foto de avaria"}
            </button>
            )}
            <button
              type="button"
              onClick={avancarEtapa3}
              disabled={salvando || coletaProcessandoFoto || travarEtapasColeta}
              style={{
                width: "100%",
                padding: "14px 0",
                background: C.navy,
                border: "none",
                borderRadius: 12,
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
                cursor: salvando || coletaProcessandoFoto ? "wait" : "pointer",
                fontFamily: "'Sora',sans-serif",
                opacity: salvando || coletaProcessandoFoto ? 0.7 : 1,
              }}
            >
              {salvando ? "Salvando…" : "Ir para Assinaturas →"}
            </button>
          </div>
        )}

        {etapa === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {travarEtapasColeta && <AvisoEtapaTravada />}
            <AvisoIncompleto validacao={validacao} tentouFinalizarColeta={tentouFinalizarColeta} />
            {[
              { bloco: "responsavel", titulo: "✍️ Responsável no local", padRef: responsavelPadRef },
              { bloco: "prestador", titulo: "🪝 Prestador", padRef: prestadorPadRef },
            ].map(({ bloco, titulo, padRef }) => {
              const assin = checklist.coleta?.assinaturas?.[bloco] || assinaturaVazia();
              const isPrestador = bloco === "prestador";
              return (
                <BlocoAssinatura
                  key={bloco}
                  titulo={titulo}
                  assin={assin}
                  bloco={bloco}
                  padRef={padRef}
                  substituindo={substituirColeta[bloco]}
                  onSubstituir={() => setSubstituirColeta((s) => ({ ...s, [bloco]: true }))}
                  onCampoChange={(campo, valor) => updateAssinaturaCampo(bloco, campo, valor)}
                  onSalvarAssinatura={() => salvarAssinaturaBloco(bloco)}
                  salvandoAssinatura={salvandoAssinaturaBloco[bloco]}
                  modoPrestador={isPrestador}
                  prestadorPerfilCompleto={isPrestador && prestadorPerfilOk}
                  prestadorLabel={isPrestador && prestadorPerfilOk ? `${perfil.nome} · ${perfil.documento}` : ""}
                  telefoneExtra={
                    bloco === "responsavel"
                      ? {
                          value: checklist.cliente?.telefone || "",
                          onChange: (v) => updateCliente("telefone", v),
                        }
                      : null
                  }
                  somenteLeitura={travarEtapasColeta}
                />
              );
            })}
            <button
              type="button"
              onClick={avancarEtapa4}
              disabled={salvando || travarEtapasColeta}
              style={{
                width: "100%",
                padding: "14px 0",
                background: validacao.completa ? C.green : C.orange,
                border: "none",
                borderRadius: 12,
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
                cursor: salvando ? "wait" : "pointer",
                fontFamily: "'Sora',sans-serif",
                opacity: salvando ? 0.7 : 1,
              }}
            >
              {salvando ? "Salvando…" : "Finalizar coleta"}
            </button>
            {checklist.status === "aguardando_entrega" && (
              <div
                style={{
                  background: C.greenLight,
                  border: `1px solid ${C.green}33`,
                  borderRadius: 12,
                  padding: "12px 16px",
                  color: C.green,
                  fontWeight: 700,
                  fontSize: 14,
                  textAlign: "center",
                }}
              >
                ✅ Coleta finalizada — aguardando entrega
              </div>
            )}
          </div>
        )}

        {etapa === 5 && (
          <EtapaPdfColeta
            checklist={checklist}
            frete={frete}
            perfil={perfil}
            gerandoPdf={gerandoPdf}
            coletaOk={coletaOk}
            onGerarPdf={handleGerarPdf}
          />
        )}

        {etapa === 6 && entregaHabilitada && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {travarEntrega && <AvisoEtapaTravada />}
            <AvisoIncompleto
              validacao={validacaoEntrega}
              tentouFinalizarColeta={tentouFinalizarEntrega}
              titulo="Entrega incompleta"
            />

            <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif" }}>
              📸 Fotos da entrega
            </div>
            <div style={{ color: C.text2, fontSize: 13, lineHeight: 1.5 }}>
              Tire as 4 fotos obrigatórias com carimbo de data/hora e GPS.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {CHECKLIST_ENTREGA_FOTO_SLOTS.filter((s) => !s.multipla).map((slot) => (
                <PhotoSlot
                  key={slot.id}
                  slot={slot}
                  foto={fotoEntregaPorSlot(slot.id)}
                  processing={processingEntregaSlot === slot.id && !fotoEntregaPorSlot(slot.id)?.previewUrl}
                  onCapture={() => abrirCaptura(slot.id, "entrega")}
                  onView={abrirVisualizadorFoto}
                  onRetry={(f) => retryUploadFoto(f, "entrega")}
                  somenteLeitura={travarEntrega}
                />
              ))}
            </div>
            <div style={{ color: C.navy, fontWeight: 800, fontSize: 14, fontFamily: "'Sora',sans-serif", marginTop: 4 }}>
              💥 Avarias da entrega (opcional)
            </div>
            {fotosAvariasEntrega.map((foto, idx) => {
              const globalIdx = fotosEntrega.indexOf(foto);
              return (
                <PhotoSlot
                  key={`entrega-avarias-${globalIdx}`}
                  slot={CHECKLIST_ENTREGA_FOTO_SLOTS.find((s) => s.id === "avarias")}
                  foto={foto}
                  processing={false}
                  onCapture={() => abrirCaptura("avarias", "entrega")}
                  onView={abrirVisualizadorFoto}
                  onRetry={(f) => retryUploadFoto(f, "entrega")}
                  onRemove={() => removerFotoAvaria(globalIdx, "entrega")}
                  somenteLeitura={travarEntrega}
                />
              );
            })}
            {!travarEntrega && (
            <button
              type="button"
              onClick={() => abrirCaptura("avarias", "entrega")}
              disabled={entregaProcessandoFoto}
              style={{
                width: "100%",
                padding: "12px 0",
                background: C.subtle,
                border: `2px dashed ${C.border}`,
                borderRadius: 12,
                color: C.text2,
                fontWeight: 700,
                fontSize: 14,
                cursor: entregaProcessandoFoto ? "wait" : "pointer",
              }}
            >
              {processingEntregaSlot === "avarias" ? "⏳ Processando…" : "+ Adicionar foto de avaria"}
            </button>
            )}

            <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginTop: 8 }}>
              👤 Quem recebe o veículo
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <BtnSelecao
                label="Mesma pessoa da coleta"
                ativo={checklist.entrega?.recebedor?.mesmaPessoaColeta === true}
                onClick={usarMesmaPessoaColeta}
                disabled={travarEntrega}
              />
              <BtnSelecao
                label="Outra pessoa"
                ativo={checklist.entrega?.recebedor?.mesmaPessoaColeta === false}
                onClick={usarOutraPessoa}
                disabled={travarEntrega}
              />
            </div>
            {checklist.entrega?.recebedor?.mesmaPessoaColeta === true ? (
              <div
                style={{
                  color: C.text2,
                  fontSize: 14,
                  fontWeight: 600,
                  lineHeight: 1.5,
                  padding: "12px 14px",
                  background: C.navyLight,
                  borderRadius: 12,
                  border: `1px solid ${C.navy}18`,
                }}
              >
                Recebedor: {checklist.entrega?.recebedor?.nome || "—"} ·{" "}
                {checklist.entrega?.recebedor?.documento || "—"}
              </div>
            ) : checklist.entrega?.recebedor?.mesmaPessoaColeta === false ? (
              <>
                <Field
                  label="Nome completo"
                  value={checklist.entrega?.recebedor?.nome || ""}
                  onChange={(v) => updateRecebedor("nome", v)}
                  placeholder="Nome de quem recebe"
                  readOnly={travarEntrega}
                />
                <Field
                  label="Documento (CPF/RG/CNH)"
                  value={checklist.entrega?.recebedor?.documento || ""}
                  onChange={(v) => updateRecebedor("documento", v)}
                  placeholder="000.000.000-00"
                  readOnly={travarEntrega}
                  inputMode="numeric"
                  pattern="[0-9]*"
                />
              </>
            ) : (
              <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.5 }}>
                Selecione acima se quem recebe é a mesma pessoa da coleta ou outra pessoa.
              </div>
            )}

            <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginTop: 8 }}>
              🔍 Conferência
            </div>
            <button
              type="button"
              onClick={marcarConforme}
              disabled={travarEntrega}
              style={{
                width: "100%",
                padding: "14px 0",
                background: checklist.entrega?.conferencia?.conforme === true ? C.green : C.navy,
                border: "none",
                borderRadius: 12,
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
                cursor: travarEntrega ? "default" : "pointer",
                fontFamily: "'Sora',sans-serif",
                opacity: travarEntrega ? 0.7 : 1,
              }}
            >
              ✅ Veículo conforme a coleta
            </button>
            <button
              type="button"
              onClick={() => !travarEntrega && setModalConfirmarDivergencia(true)}
              disabled={travarEntrega}
              style={{
                width: "100%",
                padding: "13px 0",
                background: checklist.entrega?.conferencia?.conforme === false ? C.orangeLight : C.subtle,
                border: `2px solid ${checklist.entrega?.conferencia?.conforme === false ? C.orange : C.border}`,
                borderRadius: 12,
                color: checklist.entrega?.conferencia?.conforme === false ? C.orange : C.text2,
                fontWeight: 700,
                fontSize: 14,
                cursor: travarEntrega ? "default" : "pointer",
                opacity: travarEntrega ? 0.7 : 1,
              }}
            >
              ⚠️ Há divergência
            </button>
            {mostrarDivergencias && checklist.entrega?.conferencia?.conforme === false && (
              <div
                style={{
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 14,
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ color: C.text2, fontSize: 13, lineHeight: 1.5 }}>
                  Toque nos itens para marcar o estado na entrega (mesmo ciclo da vistoria):
                </div>
                {(checklist.coleta?.acessorios ||
                  (resolveTipoVeiculo(checklist.veiculo) === "moto" ? CHECKLIST_ACESSORIOS_MOTO : CHECKLIST_ACESSORIOS_PADRAO).map(
                    (item) => ({ item, estado: null })
                  )).map(
                  (a) => {
                    const conf = checklist.entrega?.conferencia;
                    const estadoEntrega = getEstadoEntregaItem(conf, a.item, a.estado);
                    const temDivergencia = estadoEntrega !== a.estado;
                    const labelColeta = ACESSORIO_CORES[a.estado]?.label || a.estado || "—";
                    const labelEntrega =
                      ACESSORIO_CORES[estadoEntrega]?.label || estadoEntrega || "—";
                    return (
                      <div
                        key={a.item}
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "stretch",
                        }}
                      >
                        <div
                          role="button"
                          tabIndex={travarEntrega ? -1 : 0}
                          onClick={() => ciclarEstadoEntregaItem(a.item)}
                          onKeyDown={(e) => {
                            if (!travarEntrega && (e.key === "Enter" || e.key === " ")) {
                              e.preventDefault();
                              ciclarEstadoEntregaItem(a.item);
                            }
                          }}
                          style={{
                            flex: 1,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: temDivergencia ? `2px solid ${C.orange}` : `1px solid ${C.border}`,
                            background: temDivergencia ? C.orangeLight : "#F8FAFC",
                            cursor: travarEntrega ? "default" : "pointer",
                            textAlign: "left",
                            opacity: travarEntrega ? 0.85 : 1,
                          }}
                        >
                          <span style={{ color: temDivergencia ? C.text : C.muted, fontWeight: temDivergencia ? 700 : 600, fontSize: 13 }}>{a.item}</span>
                          <span style={{ color: temDivergencia ? C.orange : C.muted, fontSize: 12, fontWeight: 700 }}>
                            {temDivergencia
                              ? `Coleta: ${labelColeta} → ${labelEntrega}`
                              : `Coleta: ${labelColeta}`}
                          </span>
                        </div>
                        {temDivergencia && !travarEntrega && (
                          <button
                            type="button"
                            onClick={(e) => resetarEstadoEntregaItem(a.item, e)}
                            style={{
                              background: C.redLight,
                              border: `1px solid ${C.red}33`,
                              borderRadius: 10,
                              padding: "0 12px",
                              cursor: "pointer",
                              color: C.red,
                              fontWeight: 700,
                              fontSize: 14,
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  }
                )}
                <Field
                  label="Observação"
                  value={checklist.entrega?.conferencia?.observacao || ""}
                  onChange={updateObservacaoDivergencia}
                  placeholder="Descreva as divergências encontradas"
                  readOnly={travarEntrega}
                />
                {!travarEntrega && (
                <button
                  type="button"
                  onClick={() => void voltarParaConforme()}
                  style={{
                    width: "100%",
                    padding: "12px 0",
                    background: C.navy,
                    border: "none",
                    borderRadius: 11,
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: "pointer",
                    fontFamily: "'Sora',sans-serif",
                  }}
                >
                  ↩ Voltar para Conforme
                </button>
                )}
              </div>
            )}

            <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginTop: 8 }}>
              ✍️ Assinaturas da entrega
            </div>
            {[
              { bloco: "recebedor", titulo: "✍️ Recebedor", padRef: recebedorEntregaPadRef },
              { bloco: "prestador", titulo: "🪝 Prestador", padRef: prestadorEntregaPadRef },
            ].map(({ bloco, titulo, padRef }) => {
              const assin = checklist.entrega?.assinaturas?.[bloco] || assinaturaVazia();
              const isPrestador = bloco === "prestador";
              return (
                <BlocoAssinatura
                  key={bloco}
                  titulo={titulo}
                  assin={assin}
                  bloco={bloco}
                  padRef={padRef}
                  substituindo={substituirEntrega[bloco]}
                  onSubstituir={() => setSubstituirEntrega((s) => ({ ...s, [bloco]: true }))}
                  onCampoChange={(campo, valor) => updateAssinaturaEntregaCampo(bloco, campo, valor)}
                  onSalvarAssinatura={() => salvarAssinaturaEntregaBloco(bloco)}
                  salvandoAssinatura={salvandoAssinaturaEntregaBloco[bloco]}
                  modoPrestador={isPrestador}
                  prestadorPerfilCompleto={isPrestador && prestadorPerfilOk}
                  prestadorLabel={isPrestador && prestadorPerfilOk ? `${perfil.nome} · ${perfil.documento}` : ""}
                  somenteLeitura={travarEntrega}
                />
              );
            })}

            <button
              type="button"
              onClick={finalizarEntrega}
              disabled={entregaConcluida || salvando || entregaProcessandoFoto || travarEntrega}
              style={{
                width: "100%",
                padding: "14px 0",
                background: entregaConcluida ? C.green : validacaoEntrega.completa ? C.green : C.orange,
                border: "none",
                borderRadius: 12,
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
                cursor: entregaConcluida || salvando || entregaProcessandoFoto ? "default" : "pointer",
                fontFamily: "'Sora',sans-serif",
                opacity: entregaConcluida || salvando || entregaProcessandoFoto ? 0.7 : 1,
              }}
            >
              {salvando ? "Salvando…" : entregaConcluida ? "Entrega concluída" : "Finalizar entrega"}
            </button>
            {entregaConcluida && (
              <>
                <div
                  style={{
                    background: C.greenLight,
                    border: `1px solid ${C.green}33`,
                    borderRadius: 12,
                    padding: "12px 16px",
                    color: C.green,
                    fontWeight: 700,
                    fontSize: 14,
                    textAlign: "center",
                  }}
                >
                  ✅ Entrega finalizada — checklist completo
                </div>
                <EtapaPdfEntrega
                  gerandoPdfEntrega={gerandoPdfEntrega}
                  gerandoPdfCompleto={gerandoPdfCompleto}
                  onGerarPdfEntrega={handleGerarPdfEntrega}
                  onGerarPdfCompleto={handleGerarPdfCompleto}
                />
              </>
            )}
          </div>
        )}
      </div>

      <ToastAviso mensagem={toastMsg} />

      {fotoViewer && (
        <FotoViewerModal
          previewUrl={fotoViewer.previewUrl}
          storageUrl={fotoViewer.storageUrl}
          label={fotoViewer.label}
          onClose={() => setFotoViewer(null)}
        />
      )}

      {modalConfirmarDivergencia &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1100,
              background: "#1E3A8A66",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
          >
            <div
              style={{
                background: C.surface,
                borderRadius: 18,
                width: "100%",
                maxWidth: 360,
                padding: 24,
                boxShadow: "0 12px 40px #00000033",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 16, fontFamily: "'Sora',sans-serif", marginBottom: 8 }}>
                Confirmar divergência?
              </div>
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 18, lineHeight: 1.5 }}>
                Você vai registrar que o veículo não está conforme à coleta. Pode voltar ao estado conforme depois.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => void confirmarDivergencia()}
                  style={{
                    width: "100%",
                    padding: 13,
                    background: C.orange,
                    border: "none",
                    borderRadius: 12,
                    cursor: "pointer",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  Confirmar divergência
                </button>
                <button
                  type="button"
                  onClick={() => setModalConfirmarDivergencia(false)}
                  style={{
                    width: "100%",
                    padding: 13,
                    background: C.subtle,
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    cursor: "pointer",
                    color: C.text2,
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {showPdfShare &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1100,
              background: "#1E3A8A66",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
          >
            <div
              style={{
                background: C.surface,
                borderRadius: 18,
                width: "100%",
                maxWidth: 360,
                padding: 24,
                boxShadow: "0 12px 40px #00000033",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 16, fontFamily: "'Sora',sans-serif", marginBottom: 8 }}>
                PDF gerado!
              </div>
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 18, lineHeight: 1.5 }}>
                {pdfModalTipo === "completo"
                  ? "Compartilhe o laudo completo (coleta + entrega):"
                  : pdfModalTipo === "entrega"
                    ? "Compartilhe o laudo da entrega:"
                    : "Compartilhe o laudo da coleta:"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pdfBlobCache && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await sharePdfFileViaSystem(
                          pdfBlobCache,
                          pdfFilenameCache ||
                            (pdfModalTipo === "completo"
                              ? "checklist-completo.pdf"
                              : pdfModalTipo === "entrega"
                                ? "checklist-entrega.pdf"
                                : "checklist-coleta.pdf")
                        );
                      } catch {
                        if (pdfModalTipo === "completo") shareChecklistCompletoWhatsApp(pdfParams);
                        else if (pdfModalTipo === "entrega") shareChecklistEntregaWhatsApp(pdfParams);
                        else shareChecklistColetaWhatsApp(pdfParams);
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: 13,
                      background: C.navy,
                      border: "none",
                      borderRadius: 12,
                      cursor: "pointer",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  >
                    📄 Enviar PDF no WhatsApp
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowPdfShare(false)}
                  style={{
                    width: "100%",
                    padding: 12,
                    background: C.subtle,
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    cursor: "pointer",
                    color: C.text2,
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  Fechar
                </button>
                <div style={{ color: C.muted, fontSize: 11, lineHeight: 1.4, marginTop: 2 }}>
                  O PDF também fica em Downloads.
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
