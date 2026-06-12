import { useState, useCallback, useRef, useEffect, Component } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftIcon, XIcon, CameraIcon, RefreshCwIcon } from "lucide-react";
import {
  atualizarChecklist,
  coletaCompleta,
  entregaCompleta,
  CHECKLIST_TIPOS_SERVICO,
  CHECKLIST_MOTIVOS,
  CHECKLIST_ESTADOS_ACESSORIO,
  CHECKLIST_ESTADOS_PNEU,
  CHECKLIST_NIVEIS_COMBUSTIVEL,
  CHECKLIST_FOTO_SLOTS,
  CHECKLIST_ENTREGA_FOTO_SLOTS,
  CHECKLIST_ACESSORIOS_PADRAO,
  normalizeColetaData,
  normalizeEntregaData,
} from "../services/checklistService.js";
import {
  stampAndCompressImage,
  compressImageToJpegBlob,
  uploadChecklistImage,
  uploadChecklistEntregaImage,
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
  shareChecklistColetaWhatsApp,
  shareChecklistCompletoWhatsApp,
} from "../services/checklistColetaPdf.js";
import { sharePdfFileViaSystem } from "../services/deliveryReportPdf.js";

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
      console.warn("[Checklist] imagemUrl base64 removida antes de gravar coleta", { bloco });
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
      console.warn("[Checklist] imagemUrl base64 removida antes de gravar entrega", { bloco });
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
    const idx = previewUrlRef ? fotos.findIndex((f) => f.previewUrl === previewUrlRef) : -1;
    if (idx >= 0) fotos[idx] = foto;
    else fotos.push(foto);
  } else {
    fotos = fotos.filter((f) => f.tipo !== slotAtivo);
    fotos.push(foto);
  }
  return fotos;
}

function proximoEstadoAcessorio(atual) {
  if (!atual) return CHECKLIST_ESTADOS_ACESSORIO[0];
  const idx = CHECKLIST_ESTADOS_ACESSORIO.indexOf(atual);
  return CHECKLIST_ESTADOS_ACESSORIO[(idx + 1) % CHECKLIST_ESTADOS_ACESSORIO.length];
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && (
        <label style={{ color: C.text2, fontSize: 14, fontWeight: 700, letterSpacing: 0.4 }}>{label}</label>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: C.subtle,
          border: `1.5px solid ${C.border}`,
          borderRadius: 10,
          color: C.text,
          padding: "10px 12px",
          fontSize: 14,
          outline: "none",
        }}
      />
    </div>
  );
}

function BtnSelecao({ label, ativo, onClick, cor = C.navy }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        minWidth: 0,
        background: ativo ? `${cor}18` : "#fff",
        border: `2px solid ${ativo ? cor : C.border}`,
        borderRadius: 11,
        padding: "9px 8px",
        cursor: "pointer",
        color: ativo ? cor : C.text,
        fontWeight: 700,
        fontSize: 12,
        transition: "all .15s",
      }}
    >
      {label}
    </button>
  );
}

function FotoPreviewImg({ urlOrPath, alt, style }) {
  const [src, setSrc] = useState(urlOrPath || "");
  const objectUrlRef = useRef(null);
  const fallbackTriedRef = useRef(false);

  useEffect(() => {
    fallbackTriedRef.current = false;
    setSrc(urlOrPath || "");
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [urlOrPath]);

  useEffect(() => {
    if (!urlOrPath || urlOrPath.startsWith("blob:") || isChecklistDownloadUrl(urlOrPath)) return;
    let cancelled = false;
    (async () => {
      try {
        const blob = await getBlob(ref(storage, urlOrPath));
        if (cancelled) return;
        const objUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objUrl;
        setSrc(objUrl);
      } catch (err) {
        console.error("[Checklist] Falha preview foto:", urlOrPath, err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [urlOrPath]);

  const handleError = async () => {
    if (!urlOrPath || fallbackTriedRef.current || src !== urlOrPath) return;
    fallbackTriedRef.current = true;
    try {
      const blob = await getBlob(ref(storage, urlOrPath));
      const objUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objUrl;
      setSrc(objUrl);
    } catch (err) {
      console.error("[Checklist] Falha fallback foto:", urlOrPath, err);
    }
  };

  if (!src) return null;

  return <img src={src} alt={alt} onError={handleError} style={style} />;
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
    console.error("[Checklist] Erro no bloco de assinatura:", error);
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

function AssinaturaPreviewImg({ imagemUrl, bloco }) {
  const [src, setSrc] = useState(imagemUrl);
  const objectUrlRef = useRef(null);
  const fallbackTriedRef = useRef(false);

  useEffect(() => {
    fallbackTriedRef.current = false;
    setSrc(imagemUrl);
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [imagemUrl]);

  const handleError = async () => {
    if (!imagemUrl || fallbackTriedRef.current) return;
    fallbackTriedRef.current = true;
    try {
      const blob = await getBlob(ref(storage, imagemUrl));
      const objUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objUrl;
      setSrc(objUrl);
    } catch (err) {
      console.error("[Checklist] Falha preview assinatura:", bloco, err);
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
}) {
  const assinSafe = { ...assinaturaVazia(), ...(assin && typeof assin === "object" ? assin : {}) };
  const temAssinaturaSalva =
    !!assinSafe.imagemUrl?.trim() && !String(assinSafe.imagemUrl).startsWith("data:");
  const mostrarPad = !temAssinaturaSalva || substituindo;

  const handleCampo = (campo, valor) => {
    try {
      onCampoChange?.(campo, typeof valor === "string" ? valor : "");
    } catch (err) {
      console.error("[Checklist] Erro ao atualizar campo de assinatura:", bloco, campo, err);
    }
  };

  const handleSubstituir = () => {
    try {
      onSubstituir?.();
      padRef?.current?.clear?.();
    } catch (err) {
      console.error("[Checklist] Erro ao substituir assinatura:", bloco, err);
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
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
          <Field
            label="Nome completo"
            value={assinSafe.nome ?? ""}
            onChange={(v) => handleCampo("nome", v)}
            placeholder="Nome de quem assina"
          />
          <Field
            label="Documento (RG/CPF)"
            value={assinSafe.documento ?? ""}
            onChange={(v) => handleCampo("documento", v)}
            placeholder="000.000.000-00"
          />
        </div>
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
            <AssinaturaPreviewImg imagemUrl={assinSafe.imagemUrl} bloco={bloco} />
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
  gerandoPdfCompleto,
  onGerarPdf,
  onGerarPdfCompleto,
  onWhatsApp,
  coletaOk,
  entregaConcluida,
}) {
  if (!coletaOk) {
    return (
      <div
        style={{
          background: C.orangeLight,
          border: `1px solid ${C.orange}44`,
          borderRadius: 16,
          padding: "28px 20px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
        <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif" }}>
          Coleta ainda não concluída
        </div>
        <div style={{ color: C.muted, fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
          Complete todas as etapas anteriores para gerar o PDF da coleta.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
          {entregaConcluida ? "Checklist completo" : "Coleta concluída"}
        </div>
        <div style={{ color: C.text2, fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
          Gere o laudo em PDF do checklist {checklist?.numero || ""}.
          {!entregaConcluida && " O PDF completo fica disponível após finalizar a entrega."}
        </div>
      </div>
      <button
        type="button"
        onClick={onGerarPdf}
        disabled={gerandoPdf || gerandoPdfCompleto}
        style={{
          width: "100%",
          padding: "14px 0",
          background: C.navy,
          border: "none",
          borderRadius: 12,
          color: "#fff",
          fontWeight: 800,
          fontSize: 15,
          cursor: gerandoPdf || gerandoPdfCompleto ? "wait" : "pointer",
          fontFamily: "'Sora',sans-serif",
          opacity: gerandoPdf || gerandoPdfCompleto ? 0.7 : 1,
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
      <button
        type="button"
        onClick={onGerarPdfCompleto}
        disabled={!entregaConcluida || gerandoPdf || gerandoPdfCompleto}
        style={{
          width: "100%",
          padding: "14px 0",
          background: entregaConcluida ? C.green : C.subtle,
          border: entregaConcluida ? "none" : `1.5px solid ${C.border}`,
          borderRadius: 12,
          color: entregaConcluida ? "#fff" : C.muted,
          fontWeight: 800,
          fontSize: 15,
          cursor: !entregaConcluida || gerandoPdf || gerandoPdfCompleto ? "not-allowed" : "pointer",
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
      <button
        type="button"
        onClick={onWhatsApp}
        style={{
          width: "100%",
          padding: "13px 0",
          background: "#25D366",
          border: "none",
          borderRadius: 12,
          color: "#fff",
          fontWeight: 700,
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        Compartilhar no WhatsApp
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

function PhotoSlot({ slot, foto, onCapture, uploading, onRemove }) {
  const displayUrl = foto?.previewUrl || foto?.url;
  const temFoto = !!displayUrl;
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
        onClick={onCapture}
        disabled={uploading}
        style={{
          width: "100%",
          border: "none",
          background: temFoto ? "#000" : C.subtle,
          cursor: uploading ? "wait" : "pointer",
          padding: 0,
          position: "relative",
          minHeight: 120,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {uploading ? (
          <div style={{ color: C.navy, fontWeight: 700, fontSize: 13, padding: 20 }}>⏳ Enviando…</div>
        ) : temFoto ? (
          foto?.previewUrl ? (
            <img
              src={foto.previewUrl}
              alt={slot.label}
              style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }}
            />
          ) : (
            <FotoPreviewImg
              urlOrPath={foto.url}
              alt={slot.label}
              style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }}
            />
          )
        ) : (
          <div style={{ padding: 20, textAlign: "center" }}>
            <CameraIcon size={28} color={C.muted} style={{ margin: "0 auto 8px" }} />
            <div style={{ color: C.text2, fontWeight: 700, fontSize: 13 }}>Toque para fotografar</div>
          </div>
        )}
        {temFoto && !uploading && (
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
            {foto.dataHora || (uploading ? "Enviando…" : "")}
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
        {temFoto && (
          <button
            type="button"
            onClick={onCapture}
            disabled={uploading}
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
        {slot.multipla && temFoto && onRemove && (
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

export default function ChecklistVeiculo({ checklist: initial, frete, uid, perfil, onClose, onSaved }) {
  const [checklist, setChecklist] = useState(() => normalizeChecklist(initial));
  const [etapa, setEtapa] = useState(1);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [tentouFinalizarColeta, setTentouFinalizarColeta] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState(null);
  const [slotAtivo, setSlotAtivo] = useState(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [gerandoPdfCompleto, setGerandoPdfCompleto] = useState(false);
  const [showPdfShare, setShowPdfShare] = useState(false);
  const [pdfBlobCache, setPdfBlobCache] = useState(null);
  const [pdfFilenameCache, setPdfFilenameCache] = useState("");
  const [pdfModalTipo, setPdfModalTipo] = useState("coleta");
  const [tentouFinalizarEntrega, setTentouFinalizarEntrega] = useState(false);
  const [uploadingEntregaSlot, setUploadingEntregaSlot] = useState(null);
  const [fotoContexto, setFotoContexto] = useState("coleta");
  const [mostrarDivergencias, setMostrarDivergencias] = useState(false);
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
  const fileInputRef = useRef(null);
  const responsavelPadRef = useRef(null);
  const prestadorPadRef = useRef(null);
  const recebedorEntregaPadRef = useRef(null);
  const prestadorEntregaPadRef = useRef(null);
  const checklistRef = useRef(checklist);
  const migrationRanRef = useRef(null);
  checklistRef.current = checklist;

  const validacao = coletaCompleta(checklist);
  const validacaoEntrega = entregaCompleta(checklist);
  const coletaOk = checklist?.status === "aguardando_entrega" || checklist?.status === "concluido" || validacao.completa;
  const entregaHabilitada = checklist?.status === "aguardando_entrega" || checklist?.status === "concluido";
  const entregaConcluida = checklist?.status === "concluido";
  const pdfParams = { checklist, frete, perfil };

  useEffect(() => {
    if (!initial?.id || checklist?.id) return;
    console.warn("[Checklist] State sem id — sincronizando da prop", { propId: initial.id });
    setChecklist((c) => ({ ...c, id: initial.id }));
  }, [initial?.id, checklist?.id]);

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
        const atualizado = await atualizarChecklist(uid, initial.id, payload);
        if (cancelled) return;
        const merged = {
          ...checklistRef.current,
          ...(coletaChanged ? { coleta: normalizeColetaData(atualizado.coleta || coleta, checklistRef.current) } : {}),
          ...(entregaChanged ? { entrega: normalizeEntregaData(atualizado.entrega || entrega) } : {}),
          id: initial.id,
        };
        setChecklist(merged);
        onSaved?.(merged);
      } catch (err) {
        console.warn("[Checklist] Falha ao persistir migracao de URLs:", err);
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

  useEffect(() => {
    if (checklist.entrega?.conferencia?.conforme === false) {
      setMostrarDivergencias(true);
    }
  }, [checklist.entrega?.conferencia?.conforme]);

  const notificarErroSalvar = useCallback((mensagem, err) => {
    console.error("[Checklist] Falha ao salvar:", mensagem, err || "");
    setErro(mensagem);
    setToastMsg(mensagem);
  }, []);

  const salvar = useCallback(
    async (dados) => {
      const checklistId = checklist?.id || initial?.id;
      console.log("[Checklist] salvar() iniciado", { checklistId, uid: !!uid });
      if (!uid || !checklistId) {
        const mensagem = !uid
          ? "Usuário não autenticado. Faça login novamente."
          : "Checklist sem identificador. Feche e abra o checklist novamente.";
        console.warn("[Checklist] salvar() retorno antecipado: sem uid ou checklistId", {
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
        payload.coleta = stripBase64AssinaturasColeta(normalizeColetaData(payload.coleta, base));
      }
      if (payload.entrega) {
        payload.entrega = stripBase64AssinaturasEntrega(normalizeEntregaData(payload.entrega));
      }
      setSalvando(true);
      setErro("");
      try {
        await atualizarChecklist(uid, checklistId, payload);
        const merged = { ...base, id: checklistId };
        Object.entries(payload).forEach(([key, val]) => {
          merged[key] = val;
        });
        if (merged.coleta) merged.coleta = normalizeColetaData(merged.coleta, merged);
        if (merged.entrega) merged.entrega = normalizeEntregaData(merged.entrega);
        if (!merged?.id) {
          console.warn("[Checklist] Retorno antecipado: merged sem id após gravar", {
            checklistId,
            mergedKeys: merged ? Object.keys(merged) : null,
          });
          notificarErroSalvar("Falha ao montar dados salvos. Tente novamente.");
          return null;
        }
        setChecklist(merged);
        checklistRef.current = merged;
        onSaved?.(merged);
        console.log("[Checklist] salvar() concluído com sucesso", { checklistId });
        return merged;
      } catch (err) {
        const codigo = err?.code ? ` (${err.code})` : "";
        const detalhe = err?.message ? `: ${err.message}` : "";
        console.warn("[Checklist] Retorno antecipado: exceção em atualizarChecklist", {
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
    const atual = checklistRef.current || checklist;
    const okColeta =
      atual?.status === "aguardando_entrega" ||
      atual?.status === "concluido" ||
      coletaCompleta(atual).completa;
    console.log("[Checklist] Gerar PDF clicado", {
      coletaOk: okColeta,
      gerandoPdf,
      gerandoPdfCompleto,
      status: atual?.status,
      temAssinResp: !!atual?.coleta?.assinaturas?.responsavel?.imagemUrl,
      temAssinPrest: !!atual?.coleta?.assinaturas?.prestador?.imagemUrl,
    });
    if (gerandoPdf || gerandoPdfCompleto) {
      console.warn("[Checklist] Gerar PDF retorno antecipado: geração em andamento");
      return;
    }
    if (!okColeta) {
      const val = coletaCompleta(atual);
      const msg = val.faltando.length
        ? `Complete a coleta para gerar o PDF: ${val.faltando.slice(0, 3).join(", ")}${val.faltando.length > 3 ? "…" : ""}`
        : "Finalize a coleta antes de gerar o PDF.";
      console.warn("[Checklist] Gerar PDF bloqueado — pré-condições", { faltando: val.faltando });
      setErro(msg);
      setToastMsg(msg);
      return;
    }
    if (pdfBlobCache && pdfModalTipo === "coleta") {
      console.log("[Checklist] Gerar PDF: reutilizando cache");
      setPdfModalTipo("coleta");
      setShowPdfShare(true);
      return;
    }
    setGerandoPdf(true);
    setErro("");
    try {
      const params = { checklist: atual, frete, perfil };
      console.log("[Checklist] Gerar PDF: iniciando generateChecklistColetaPdf");
      const { blob, filename } = await generateChecklistColetaPdf(params);
      console.log("[Checklist] Gerar PDF concluído", { filename, bytes: blob?.size });
      setPdfBlobCache(blob);
      setPdfFilenameCache(filename);
      setPdfModalTipo("coleta");
      setShowPdfShare(true);
    } catch (err) {
      console.error("[Checklist] Gerar PDF falhou:", err);
      setErro("Não foi possível gerar o PDF. Verifique sua conexão e tente novamente.");
      setToastMsg("Não foi possível gerar o PDF.");
    } finally {
      setGerandoPdf(false);
    }
  };

  const handleGerarPdfCompleto = async () => {
    const atual = checklistRef.current || checklist;
    console.log("[Checklist] Gerar PDF completo clicado", {
      entregaConcluida: atual?.status === "concluido",
      gerandoPdf,
      gerandoPdfCompleto,
    });
    if (gerandoPdf || gerandoPdfCompleto) {
      console.warn("[Checklist] Gerar PDF completo retorno antecipado: geração em andamento");
      return;
    }
    if (atual?.status !== "concluido") {
      const msg = "Finalize a entrega antes de gerar o PDF completo.";
      console.warn("[Checklist] Gerar PDF completo bloqueado", { status: atual?.status });
      setErro(msg);
      setToastMsg(msg);
      return;
    }
    if (pdfBlobCache && pdfModalTipo === "completo") {
      setShowPdfShare(true);
      return;
    }
    setGerandoPdfCompleto(true);
    setErro("");
    try {
      const params = { checklist: atual, frete, perfil };
      const { blob, filename } = await generateChecklistCompletoPdf(params);
      console.log("[Checklist] Gerar PDF completo concluído", { filename, bytes: blob?.size });
      setPdfBlobCache(blob);
      setPdfFilenameCache(filename);
      setPdfModalTipo("completo");
      setShowPdfShare(true);
    } catch (err) {
      console.error("[Checklist] Gerar PDF completo falhou:", err);
      setErro("Não foi possível gerar o PDF completo.");
      setToastMsg("Não foi possível gerar o PDF completo.");
    } finally {
      setGerandoPdfCompleto(false);
    }
  };

  const assinaturaSalvaValida = (assin) =>
    !!assin?.imagemUrl?.trim() && !String(assin.imagemUrl).startsWith("data:");

  const salvarAssinaturaBloco = useCallback(
    async (bloco) => {
      const padRef = bloco === "responsavel" ? responsavelPadRef : prestadorPadRef;
      const atual = checklistRef.current || checklist;
      const checklistId = atual?.id;

      console.log("[Checklist] Salvar assinatura clicado", { bloco, checklistId });

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
      setSalvandoAssinaturaBloco((s) => ({ ...s, [bloco]: true }));
      setErro("");
      try {
        const gps = await getDriverGeolocation({ preferFresh: true });
        const blob = await padRef.current.toBlob();
        const jpeg = await compressImageToJpegBlob(blob);
        const nomeArquivo = `assinatura_${bloco}_${Date.now()}`;
        console.log("[Checklist] Enviando assinatura ao Storage", { bloco, nomeArquivo });
        const url = await uploadChecklistImage(uid, checklistId, nomeArquivo, jpeg);
        console.log("[Checklist] Upload assinatura OK", { bloco, url: url?.slice(0, 80) });

        const dataHora = formatStampDataHora();
        const assinaturas = {
          ...(atual.coleta?.assinaturas || {}),
          [bloco]: {
            ...assinAtual,
            nome: (assinAtual.nome || "").trim(),
            documento: (assinAtual.documento || "").trim(),
            imagemUrl: url,
            dataHora,
            lat: gps?.lat ?? null,
            lng: gps?.lng ?? null,
          },
        };
        const coletaAtualizada = { ...atual.coleta, assinaturas };
        const ok = await salvar({ coleta: coletaAtualizada });
        if (ok) {
          padRef.current?.clear?.();
          setSubstituirColeta((s) => ({ ...s, [bloco]: false }));
          console.log("[Checklist] Assinatura persistida no Firestore", { bloco });
        } else {
          setErro("Não foi possível gravar a assinatura. Tente novamente.");
        }
      } catch (err) {
        console.error("[Checklist] Falha salvar assinatura:", bloco, err);
        setErro("Não foi possível salvar a assinatura. Tente novamente.");
        setToastMsg("Falha ao salvar assinatura.");
      } finally {
        setSalvandoAssinaturaBloco((s) => ({ ...s, [bloco]: false }));
      }
    },
    [uid, checklist, salvar]
  );

  const salvarAssinaturaEntregaBloco = useCallback(
    async (bloco) => {
      const padRef = bloco === "recebedor" ? recebedorEntregaPadRef : prestadorEntregaPadRef;
      const atual = checklistRef.current || checklist;
      const checklistId = atual?.id;

      console.log("[Checklist] Salvar assinatura entrega clicado", { bloco, checklistId });

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
      setSalvandoAssinaturaEntregaBloco((s) => ({ ...s, [bloco]: true }));
      setErro("");
      try {
        const gps = await getDriverGeolocation({ preferFresh: true });
        const blob = await padRef.current.toBlob();
        const jpeg = await compressImageToJpegBlob(blob);
        const nomeArquivo = `assinatura_entrega_${bloco}_${Date.now()}`;
        console.log("[Checklist] Enviando assinatura entrega ao Storage", { bloco, nomeArquivo });
        const url = await uploadChecklistEntregaImage(uid, checklistId, nomeArquivo, jpeg);

        const assinaturas = {
          ...entregaNorm.assinaturas,
          [bloco]: {
            ...assinAtual,
            nome: (assinAtual.nome || "").trim(),
            documento: (assinAtual.documento || "").trim(),
            imagemUrl: url,
            dataHora: formatStampDataHora(),
            lat: gps?.lat ?? null,
            lng: gps?.lng ?? null,
          },
        };
        const entregaSalvar = { ...entregaNorm, assinaturas };
        const ok = await salvar({ entrega: entregaSalvar });
        if (ok) {
          padRef.current?.clear?.();
          setSubstituirEntrega((s) => ({ ...s, [bloco]: false }));
          console.log("[Checklist] Assinatura entrega persistida", { bloco });
        } else {
          setErro("Não foi possível gravar a assinatura. Tente novamente.");
        }
      } catch (err) {
        console.error("[Checklist] Falha salvar assinatura entrega:", bloco, err);
        setErro("Não foi possível salvar a assinatura. Tente novamente.");
        setToastMsg("Falha ao salvar assinatura.");
      } finally {
        setSalvandoAssinaturaEntregaBloco((s) => ({ ...s, [bloco]: false }));
      }
    },
    [uid, salvar]
  );

  const uploadAssinaturaImagem = useCallback(
    async (imagemUrl, padRef, nomeArquivo, checklistId) => {
      if (imagemUrl && isChecklistDownloadUrl(imagemUrl)) return imagemUrl;
      if (imagemUrl && String(imagemUrl).startsWith("data:image")) {
        console.log("[Checklist] Convertendo assinatura base64 para Storage", { nomeArquivo });
        const resp = await fetch(imagemUrl);
        const rawBlob = await resp.blob();
        const jpeg = await compressImageToJpegBlob(rawBlob);
        return uploadChecklistImage(uid, checklistId, nomeArquivo, jpeg);
      }
      if (padRef?.current && !padRef.current.isEmpty?.()) {
        const blob = await padRef.current.toBlob();
        const jpeg = await compressImageToJpegBlob(blob);
        return uploadChecklistImage(uid, checklistId, nomeArquivo, jpeg);
      }
      return imagemUrl || "";
    },
    [uid]
  );

  const persistirAssinaturasColeta = useCallback(
    async ({ finalizar = false } = {}) => {
      const atual = checklistRef.current || checklist;
      const checklistId = atual?.id;
      if (!uid || !checklistId) {
        console.warn("[Checklist] persistirAssinaturas retorno antecipado: sem uid/id");
        return null;
      }

      const resp = atual.coleta?.assinaturas?.responsavel || {};
      const prest = atual.coleta?.assinaturas?.prestador || {};

      if (finalizar) {
        if (!resp.nome?.trim() || !resp.documento?.trim()) {
          setErro("Preencha nome e documento do responsável no local.");
          return null;
        }
        if (!prest.nome?.trim() || !prest.documento?.trim()) {
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
        const gps = precisaGps ? await getDriverGeolocation({ preferFresh: true }) : null;
        const lat = gps?.lat ?? null;
        const lng = gps?.lng ?? null;
        const dataHora = formatStampDataHora();

        console.log("[Checklist] persistirAssinaturas iniciado", {
          finalizar,
          respPadNovo,
          prestPadNovo,
          checklistId,
        });

        const respUrl = await uploadAssinaturaImagem(
          resp.imagemUrl,
          responsavelPadRef,
          `assinatura_responsavel_${Date.now()}`,
          checklistId
        );
        const prestUrl = await uploadAssinaturaImagem(
          prest.imagemUrl,
          prestadorPadRef,
          `assinatura_prestador_${Date.now()}`,
          checklistId
        );

        if (respPadNovo && respUrl) {
          console.log("[Checklist] Upload assinatura responsavel OK", { url: respUrl.slice(0, 80) });
        }
        if (prestPadNovo && prestUrl) {
          console.log("[Checklist] Upload assinatura prestador OK", { url: prestUrl.slice(0, 80) });
        }

        const assinaturas = {
          responsavel: {
            nome: (resp.nome || "").trim(),
            documento: (resp.documento || "").trim(),
            imagemUrl: respUrl,
            dataHora: respPadNovo || !resp.dataHora ? dataHora : resp.dataHora,
            lat: respPadNovo ? lat : resp.lat ?? lat,
            lng: respPadNovo ? lng : resp.lng ?? lng,
          },
          prestador: {
            nome: (prest.nome || "").trim(),
            documento: (prest.documento || "").trim(),
            imagemUrl: prestUrl,
            dataHora: prestPadNovo || !prest.dataHora ? dataHora : prest.dataHora,
            lat: prestPadNovo ? lat : prest.lat ?? lat,
            lng: prestPadNovo ? lng : prest.lng ?? lng,
          },
        };

        const coletaAtualizada = { ...atual.coleta, assinaturas };
        const payload = { coleta: coletaAtualizada };

        if (finalizar) {
          const checklistAtualizado = { ...atual, coleta: coletaAtualizada };
          const val = coletaCompleta(checklistAtualizado);
          if (val.completa) {
            coletaAtualizada.finalizadaEm = new Date().toISOString();
            payload.status = "aguardando_entrega";
          }
        }

        const payloadBytes = JSON.stringify(payload).length;
        console.log("[Checklist] persistirAssinaturas payload", {
          bytes: payloadBytes,
          finalizar,
          temAssinResp: !!assinaturas.responsavel.imagemUrl,
          temAssinPrest: !!assinaturas.prestador.imagemUrl,
        });
        if (payloadBytes > 900000) {
          console.error("[Checklist] Payload próximo do limite Firestore (1MB)", { payloadBytes });
          setErro("Dados muito grandes para salvar. As assinaturas devem ser enviadas como imagem, não texto.");
          return null;
        }

        const ok = await salvar(payload);
        if (ok) {
          if (respPadNovo) responsavelPadRef.current?.clear?.();
          if (prestPadNovo) prestadorPadRef.current?.clear?.();
          setSubstituirColeta({ responsavel: false, prestador: false });
        }
        return ok;
      } catch (err) {
        console.error("[Checklist] Falha persistirAssinaturas:", err);
        setErro("Falha ao salvar assinaturas. Tente novamente.");
        return null;
      } finally {
        setSalvando(false);
      }
    },
    [uid, checklist, salvar, uploadAssinaturaImagem]
  );

  const irParaEtapa = (id) => {
    const etapaInfo = ETAPAS.find((e) => e.id === id);
    if (etapaInfo?.requerColeta && !entregaHabilitada) {
      const val = coletaCompleta(checklist);
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
        console.log("[Checklist] Auto-save vistoria ao trocar aba", { de: etapa, para: id });
        await salvar({ coleta: atual.coleta });
      }
      if (etapa === 3 && id !== 3 && atual?.coleta) {
        console.log("[Checklist] Auto-save fotos ao trocar aba", { de: etapa, para: id });
        await salvar({ coleta: atual.coleta });
      }
      if (etapa === 4 && id !== 4) {
        console.log("[Checklist] Auto-save assinaturas ao trocar aba", { de: etapa, para: id });
        await persistirAssinaturasColeta({ finalizar: false });
      }
      if (etapa === 6 && id !== 6 && atual?.entrega) {
        console.log("[Checklist] Auto-save entrega ao trocar aba", { de: etapa, para: id });
        await salvar({ entrega: normalizeEntregaData(atual.entrega) });
      }
      setEtapa(id);
    })();
  };

  const avancarEtapa1 = async () => {
    const checklistId = checklist?.id || initial?.id;
    console.log("[Checklist] Salvar clicado", { etapa, checklistId, uid: !!uid, salvando });
    if (salvando) {
      console.warn("[Checklist] Retorno antecipado: salvando em andamento");
      return;
    }
    if (!uid) {
      console.warn("[Checklist] Retorno antecipado: uid ausente");
      notificarErroSalvar("Usuário não autenticado. Faça login novamente.");
      return;
    }
    if (!checklistId) {
      console.warn("[Checklist] Retorno antecipado: checklist sem id", {
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
      console.log("[Checklist] Salvar etapa 1 concluído", { ok: !!ok });
      if (ok) setEtapa(2);
    } catch (err) {
      console.error("[Checklist] Erro não tratado em avancarEtapa1:", err);
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
    setFotoContexto(contexto);
    setSlotAtivo(slotId);
    fileInputRef.current?.click();
  };

  const handleArquivoFoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !slotAtivo || !uid || !checklist?.id) {
      console.warn("[Checklist] Foto ignorada: arquivo/slot/uid/id ausente", {
        temArquivo: !!file,
        slotAtivo,
        uid: !!uid,
        checklistId: checklist?.id,
      });
      return;
    }

    const isEntrega = fotoContexto === "entrega";
    const checklistId = checklist.id;
    console.log("[Checklist] Foto capturada", { slot: slotAtivo, contexto: fotoContexto, checklistId });

    if (isEntrega) setUploadingEntregaSlot(slotAtivo);
    else setUploadingSlot(slotAtivo);
    setErro("");

    let previewUrl = null;
    let fotoPersistida = false;
    try {
      const gps = await getDriverGeolocation({ preferFresh: true });
      const lat = gps?.lat ?? null;
      const lng = gps?.lng ?? null;
      const now = new Date();
      const dataHora = formatStampDataHora(now);
      const stamp = buildPhotoStampText(lat, lng, now);
      const blob = await stampAndCompressImage(file, stamp);
      previewUrl = URL.createObjectURL(blob);
      console.log("[Checklist] Foto comprimida, preview local criado", { slot: slotAtivo });

      const slots = isEntrega ? CHECKLIST_ENTREGA_FOTO_SLOTS : CHECKLIST_FOTO_SLOTS;
      const slotInfo = slots.find((s) => s.id === slotAtivo);
      const novaFoto = {
        tipo: slotAtivo,
        label: slotInfo?.label || slotAtivo,
        url: "",
        previewUrl,
        dataHora,
        lat,
        lng,
      };

      const base = checklistRef.current || checklist;
      if (isEntrega) {
        const fotos = atualizarFotosLista(base.entrega?.fotos, slotAtivo, novaFoto);
        const entrega = { ...base.entrega, fotos };
        setChecklist((c) => ({ ...c, entrega }));
        checklistRef.current = { ...base, entrega };
      } else {
        const fotos = atualizarFotosLista(base.coleta?.fotos, slotAtivo, novaFoto);
        const coleta = { ...base.coleta, fotos };
        setChecklist((c) => ({ ...c, coleta }));
        checklistRef.current = { ...base, coleta };
      }

      const nomeArquivo =
        slotAtivo === "avarias"
          ? `avarias_${Date.now()}`
          : isEntrega
            ? `entrega_${slotAtivo}`
            : slotAtivo;
      console.log("[Checklist] Enviando foto ao Storage", { nomeArquivo, checklistId });
      const url = isEntrega
        ? await uploadChecklistEntregaImage(uid, checklistId, nomeArquivo, blob)
        : await uploadChecklistImage(uid, checklistId, nomeArquivo, blob);
      console.log("[Checklist] Upload concluído", { slot: slotAtivo, url: url?.slice(0, 80) });

      const fotoFinal = { ...novaFoto, url };
      delete fotoFinal.previewUrl;

      const atual = checklistRef.current || checklist;
      if (isEntrega) {
        const fotos = atualizarFotosLista(atual.entrega?.fotos, slotAtivo, fotoFinal, previewUrl);
        const entregaSalvar = { ...atual.entrega, fotos };
        setChecklist((c) => ({ ...c, entrega: entregaSalvar }));
        checklistRef.current = { ...atual, entrega: entregaSalvar };
        console.log("[Checklist] Persistindo foto entrega no Firestore", {
          slot: slotAtivo,
          totalFotos: fotos.length,
        });
        const ok = await salvar({ entrega: entregaSalvar });
        console.log("[Checklist] Foto entrega salva", { ok: !!ok, slot: slotAtivo });
        fotoPersistida = !!ok;
      } else {
        const fotos = atualizarFotosLista(atual.coleta?.fotos, slotAtivo, fotoFinal, previewUrl);
        const coletaSalvar = { ...atual.coleta, fotos };
        setChecklist((c) => ({ ...c, coleta: coletaSalvar }));
        checklistRef.current = { ...atual, coleta: coletaSalvar };
        console.log("[Checklist] Persistindo foto coleta no Firestore", {
          slot: slotAtivo,
          totalFotos: fotos.length,
        });
        const ok = await salvar({ coleta: coletaSalvar });
        console.log("[Checklist] Foto coleta salva", { ok: !!ok, slot: slotAtivo });
        fotoPersistida = !!ok;
      }
    } catch (err) {
      console.error("[Checklist] Falha no fluxo de foto:", err);
      const base = checklistRef.current || checklist;
      if (isEntrega) {
        const fotos = (base.entrega?.fotos || []).filter((f) => f.previewUrl !== previewUrl);
        setChecklist((c) => ({ ...c, entrega: { ...c.entrega, fotos } }));
      } else {
        const fotos = (base.coleta?.fotos || []).filter((f) => f.previewUrl !== previewUrl);
        setChecklist((c) => ({ ...c, coleta: { ...c.coleta, fotos } }));
      }
      setErro("Falha ao enviar foto. Tente novamente.");
    } finally {
      if (previewUrl && fotoPersistida) URL.revokeObjectURL(previewUrl);
      if (isEntrega) setUploadingEntregaSlot(null);
      else setUploadingSlot(null);
      setSlotAtivo(null);
    }
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
    console.log("[Checklist] Finalizar coleta clicado");
    const ok = await persistirAssinaturasColeta({ finalizar: true });
    if (ok) {
      const val = coletaCompleta(checklistRef.current);
      console.log("[Checklist] Finalizar coleta concluído", { completa: val.completa });
      if (val.completa || checklistRef.current?.status === "aguardando_entrega") setEtapa(5);
    }
  };

  const updateCliente = (campo, valor) =>
    setChecklist((c) => ({ ...c, cliente: { ...c.cliente, [campo]: valor } }));
  const updateVeiculo = (campo, valor) =>
    setChecklist((c) => ({ ...c, veiculo: { ...c.veiculo, [campo]: valor } }));
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
    const entrega = {
      ...normalizeEntregaData(atual.entrega),
      recebedor: {
        nome: resp.nome || "",
        documento: resp.documento || "",
        mesmaPessoaColeta: true,
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
    const entrega = {
      ...normalizeEntregaData(atual.entrega),
      conferencia: { conforme: true },
    };
    setMostrarDivergencias(false);
    setChecklist((c) => {
      const next = { ...c, entrega };
      checklistRef.current = next;
      return next;
    });
    await salvar({ entrega });
  };

  const marcarDivergencia = async () => {
    const atual = checklistRef.current || checklist;
    const entrega = {
      ...normalizeEntregaData(atual.entrega),
      conferencia: {
        conforme: false,
        divergencias: atual.entrega?.conferencia?.divergencias || [],
        observacao: atual.entrega?.conferencia?.observacao || "",
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

  const toggleDivergenciaItem = (item, estadoColeta) => {
    const atual = checklistRef.current || checklist;
    const conf = atual.entrega?.conferencia || { conforme: false, divergencias: [], observacao: "" };
    const divergencias = [...(conf.divergencias || [])];
    const idx = divergencias.findIndex((d) => d.item === item);
    if (idx < 0) {
      divergencias.push({ item, estadoColeta, estadoEntrega: CHECKLIST_ESTADOS_ACESSORIO[0] });
    } else {
      const estadoAtual = divergencias[idx].estadoEntrega;
      const nextIdx = (CHECKLIST_ESTADOS_ACESSORIO.indexOf(estadoAtual) + 1) % CHECKLIST_ESTADOS_ACESSORIO.length;
      divergencias[idx] = { ...divergencias[idx], estadoEntrega: CHECKLIST_ESTADOS_ACESSORIO[nextIdx] };
    }
    setChecklist((c) => {
      const next = {
        ...c,
        entrega: {
          ...c.entrega,
          conferencia: { ...conf, conforme: false, divergencias },
        },
      };
      checklistRef.current = next;
      return next;
    });
  };

  const removerDivergenciaItem = (item) => {
    const atual = checklistRef.current || checklist;
    const conf = atual.entrega?.conferencia || {};
    const divergencias = (conf.divergencias || []).filter((d) => d.item !== item);
    setChecklist((c) => {
      const next = {
        ...c,
        entrega: {
          ...c.entrega,
          conferencia: { ...conf, conforme: false, divergencias },
        },
      };
      checklistRef.current = next;
      return next;
    });
  };

  const updateObservacaoDivergencia = (valor) => {
    const atual = checklistRef.current || checklist;
    const conf = atual.entrega?.conferencia || { conforme: false, divergencias: [] };
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
    if (!prest.nome?.trim() || !prest.documento?.trim()) {
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

    const val = entregaCompleta({ ...atual, entrega: entregaNorm });
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
        recebedorEntregaPadRef.current?.clear?.();
        prestadorEntregaPadRef.current?.clear?.();
        setSubstituirEntrega({ recebedor: false, prestador: false });
      }
    } catch (err) {
      console.error("[Checklist] Falha finalizar entrega:", err);
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

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 950,
        background: C.bg,
        overflowY: "auto",
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
              {checklist?.status === "aguardando_entrega" && " · ✅ Coleta concluída"}
              {checklist?.status === "concluido" && " · ✅ Entrega concluída"}
              {frete ? ` · ${frete.origin || ""} → ${frete.dest || ""}` : ""}
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
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px" }}>
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 14 }}>👤 Cliente</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Field label="Nome" value={checklist.cliente?.nome || ""} onChange={(v) => updateCliente("nome", v)} placeholder="Nome do cliente" />
                <Field label="Telefone" value={checklist.cliente?.telefone || ""} onChange={(v) => updateCliente("telefone", v)} placeholder="(11) 99999-9999" />
              </div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px" }}>
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 14 }}>🚗 Veículo rebocado</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Field label="Placa" value={checklist.veiculo?.placa || ""} onChange={(v) => updateVeiculo("placa", v)} placeholder="ABC-1D23" />
                <Field label="Cor" value={checklist.veiculo?.cor || ""} onChange={(v) => updateVeiculo("cor", v)} placeholder="Prata" />
                <Field label="Marca" value={checklist.veiculo?.marca || ""} onChange={(v) => updateVeiculo("marca", v)} placeholder="Volkswagen" />
                <Field label="Modelo" value={checklist.veiculo?.modelo || ""} onChange={(v) => updateVeiculo("modelo", v)} placeholder="Gol" />
              </div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px" }}>
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 14 }}>🪝 Serviço</div>
              <div style={{ color: C.text2, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Tipo de serviço</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
                {CHECKLIST_TIPOS_SERVICO.map((t) => (
                  <BtnSelecao key={t.id} label={t.label} ativo={checklist.servico?.tipo === t.id} onClick={() => updateServico("tipo", t.id)} />
                ))}
              </div>
              <div style={{ color: C.text2, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Motivo</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {CHECKLIST_MOTIVOS.map((m) => (
                  <BtnSelecao key={m.id} label={m.label} ativo={checklist.servico?.motivo === m.id} onClick={() => updateServico("motivo", m.id)} />
                ))}
              </div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px" }}>
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 14 }}>📍 Origem e destino</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Field label="Origem (coleta)" value={checklist.origem?.endereco || ""} onChange={(v) => updateEndereco("origem", v)} placeholder="Endereço de coleta" />
                <Field label="Destino (entrega)" value={checklist.destino?.endereco || ""} onChange={(v) => updateEndereco("destino", v)} placeholder="Endereço de entrega" />
              </div>
            </div>
            <button
              type="button"
              onClick={() => void avancarEtapa1()}
              disabled={salvando}
              style={{
                width: "100%",
                padding: "14px 0",
                background: C.orange,
                border: "none",
                borderRadius: 12,
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
                cursor: salvando ? "wait" : "pointer",
                fontFamily: "'Sora',sans-serif",
                boxShadow: `0 3px 10px ${C.orange}44`,
                opacity: salvando ? 0.7 : 1,
              }}
            >
              {salvando ? "Salvando…" : "Salvar e ir para Vistoria →"}
            </button>
          </div>
        )}

        {etapa === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px" }}>
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 14 }}>❓ Perguntas de vistoria</div>
              {(checklist.coleta?.perguntas || []).map((p, i) => (
                <div key={i} style={{ marginBottom: i < 2 ? 16 : 0 }}>
                  <div style={{ color: C.text, fontSize: 14, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>
                    {i + 1}. {p.texto}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <BtnSelecao label="✅ Sim" ativo={p.resposta === "sim"} onClick={() => updatePergunta(i, "sim")} cor={C.green} />
                    <BtnSelecao label="❌ Não" ativo={p.resposta === "nao"} onClick={() => updatePergunta(i, "nao")} cor={C.red} />
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
                      onClick={() => updateAcessorio(i)}
                      style={{
                        background: cores.bg,
                        border: `2px solid ${cores.border}`,
                        borderRadius: 11,
                        padding: "10px 8px",
                        cursor: "pointer",
                        textAlign: "left",
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
              {[
                { campo: "dianteiro", label: "Dianteiro" },
                { campo: "traseiro", label: "Traseiro" },
                { campo: "estepe", label: "Estepe" },
              ].map(({ campo, label }) => (
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
                  />
                ))}
              </div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px" }}>
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 14 }}>📝 Observações de avarias</div>
              <textarea
                value={checklist.coleta?.observacoes || ""}
                onChange={(e) => updateObservacoes(e.target.value)}
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
              disabled={salvando}
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
                opacity: salvando ? 0.7 : 1,
              }}
            >
              {salvando ? "Salvando…" : "Salvar vistoria →"}
            </button>
          </div>
        )}

        {etapa === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ color: C.text2, fontSize: 13, lineHeight: 1.5 }}>
              📸 Tire as fotos guiadas da vistoria. Cada imagem recebe carimbo com data/hora e GPS antes do envio.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {CHECKLIST_FOTO_SLOTS.filter((s) => !s.multipla).map((slot) => (
                <PhotoSlot
                  key={slot.id}
                  slot={slot}
                  foto={fotoPorSlot(slot.id)}
                  uploading={uploadingSlot === slot.id}
                  onCapture={() => abrirCaptura(slot.id)}
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
                  uploading={uploadingSlot === "avarias"}
                  onCapture={() => abrirCaptura("avarias")}
                  onRemove={() => removerFotoAvaria(globalIdx)}
                />
              );
            })}
            <button
              type="button"
              onClick={() => abrirCaptura("avarias")}
              disabled={!!uploadingSlot}
              style={{
                width: "100%",
                padding: "12px 0",
                background: C.subtle,
                border: `2px dashed ${C.border}`,
                borderRadius: 12,
                color: C.text2,
                fontWeight: 700,
                fontSize: 14,
                cursor: uploadingSlot ? "wait" : "pointer",
              }}
            >
              + Adicionar foto de avaria
            </button>
            <button
              type="button"
              onClick={avancarEtapa3}
              disabled={salvando || !!uploadingSlot}
              style={{
                width: "100%",
                padding: "14px 0",
                background: C.navy,
                border: "none",
                borderRadius: 12,
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
                cursor: salvando || uploadingSlot ? "wait" : "pointer",
                fontFamily: "'Sora',sans-serif",
                opacity: salvando || uploadingSlot ? 0.7 : 1,
              }}
            >
              {salvando ? "Salvando…" : "Ir para Assinaturas →"}
            </button>
          </div>
        )}

        {etapa === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <AvisoIncompleto validacao={validacao} tentouFinalizarColeta={tentouFinalizarColeta} />
            {[
              { bloco: "responsavel", titulo: "✍️ Responsável no local", padRef: responsavelPadRef },
              { bloco: "prestador", titulo: "🪝 Prestador", padRef: prestadorPadRef },
            ].map(({ bloco, titulo, padRef }) => {
              const assin = checklist.coleta?.assinaturas?.[bloco] || assinaturaVazia();
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
                  salvandoAssinatura={salvandoAssinaturaBloco[bloco] || salvando}
                />
              );
            })}
            <button
              type="button"
              onClick={avancarEtapa4}
              disabled={salvando}
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
            gerandoPdfCompleto={gerandoPdfCompleto}
            coletaOk={coletaOk}
            entregaConcluida={entregaConcluida}
            onGerarPdf={handleGerarPdf}
            onGerarPdfCompleto={handleGerarPdfCompleto}
            onWhatsApp={() => shareChecklistColetaWhatsApp(pdfParams)}
          />
        )}

        {etapa === 6 && entregaHabilitada && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
                  uploading={uploadingEntregaSlot === slot.id}
                  onCapture={() => abrirCaptura(slot.id, "entrega")}
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
                  uploading={uploadingEntregaSlot === "avarias"}
                  onCapture={() => abrirCaptura("avarias", "entrega")}
                  onRemove={() => removerFotoAvaria(globalIdx, "entrega")}
                />
              );
            })}
            <button
              type="button"
              onClick={() => abrirCaptura("avarias", "entrega")}
              disabled={!!uploadingEntregaSlot}
              style={{
                width: "100%",
                padding: "12px 0",
                background: C.subtle,
                border: `2px dashed ${C.border}`,
                borderRadius: 12,
                color: C.text2,
                fontWeight: 700,
                fontSize: 14,
                cursor: uploadingEntregaSlot ? "wait" : "pointer",
              }}
            >
              + Adicionar foto de avaria
            </button>

            <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginTop: 8 }}>
              👤 Quem recebe o veículo
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <BtnSelecao
                label="Mesma pessoa da coleta"
                ativo={checklist.entrega?.recebedor?.mesmaPessoaColeta === true}
                onClick={usarMesmaPessoaColeta}
              />
              <BtnSelecao
                label="Outra pessoa"
                ativo={checklist.entrega?.recebedor?.mesmaPessoaColeta === false}
                onClick={usarOutraPessoa}
              />
            </div>
            <Field
              label="Nome completo"
              value={checklist.entrega?.recebedor?.nome || ""}
              onChange={(v) => updateRecebedor("nome", v)}
              placeholder="Nome de quem recebe"
            />
            <Field
              label="Documento (RG/CPF)"
              value={checklist.entrega?.recebedor?.documento || ""}
              onChange={(v) => updateRecebedor("documento", v)}
              placeholder="000.000.000-00"
            />

            <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginTop: 8 }}>
              🔍 Conferência
            </div>
            <button
              type="button"
              onClick={marcarConforme}
              style={{
                width: "100%",
                padding: "14px 0",
                background: checklist.entrega?.conferencia?.conforme === true ? C.green : C.navy,
                border: "none",
                borderRadius: 12,
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
                cursor: "pointer",
                fontFamily: "'Sora',sans-serif",
              }}
            >
              ✅ Veículo conforme a coleta
            </button>
            <button
              type="button"
              onClick={marcarDivergencia}
              style={{
                width: "100%",
                padding: "13px 0",
                background: checklist.entrega?.conferencia?.conforme === false ? C.orangeLight : C.subtle,
                border: `2px solid ${checklist.entrega?.conferencia?.conforme === false ? C.orange : C.border}`,
                borderRadius: 12,
                color: checklist.entrega?.conferencia?.conforme === false ? C.orange : C.text2,
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
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
                  Toque nos itens divergentes para marcar o estado na entrega:
                </div>
                {(checklist.coleta?.acessorios || CHECKLIST_ACESSORIOS_PADRAO.map((item) => ({ item, estado: null }))).map(
                  (a) => {
                    const divergente = (checklist.entrega?.conferencia?.divergencias || []).find((d) => d.item === a.item);
                    const cores = divergente ? ACESSORIO_CORES[divergente.estadoEntrega] || ACESSORIO_CORES.bom : null;
                    return (
                      <div
                        key={a.item}
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "stretch",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleDivergenciaItem(a.item, a.estado)}
                          style={{
                            flex: 1,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: `2px solid ${divergente ? cores.border : C.border}`,
                            background: divergente ? cores.bg : "#fff",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          <span style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>{a.item}</span>
                          <span style={{ color: divergente ? cores.text : C.muted, fontSize: 12, fontWeight: 700 }}>
                            {divergente
                              ? `Coleta: ${ACESSORIO_CORES[a.estado]?.label || a.estado || "—"} → ${cores.label}`
                              : `Coleta: ${ACESSORIO_CORES[a.estado]?.label || a.estado || "—"}`}
                          </span>
                        </button>
                        {divergente && (
                          <button
                            type="button"
                            onClick={() => removerDivergenciaItem(a.item)}
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
                />
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
                  salvandoAssinatura={salvandoAssinaturaEntregaBloco[bloco] || salvando}
                />
              );
            })}

            <button
              type="button"
              onClick={finalizarEntrega}
              disabled={entregaConcluida || salvando || !!uploadingEntregaSlot}
              style={{
                width: "100%",
                padding: "14px 0",
                background: entregaConcluida ? C.green : validacaoEntrega.completa ? C.green : C.orange,
                border: "none",
                borderRadius: 12,
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
                cursor: entregaConcluida || salvando || uploadingEntregaSlot ? "default" : "pointer",
                fontFamily: "'Sora',sans-serif",
                opacity: entregaConcluida || salvando || uploadingEntregaSlot ? 0.7 : 1,
              }}
            >
              {salvando ? "Salvando…" : entregaConcluida ? "Entrega concluída" : "Finalizar entrega"}
            </button>
            {entregaConcluida && (
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
            )}
          </div>
        )}
      </div>

      <ToastAviso mensagem={toastMsg} />

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
                            (pdfModalTipo === "completo" ? "checklist-completo.pdf" : "checklist-coleta.pdf")
                        );
                      } catch {
                        if (pdfModalTipo === "completo") shareChecklistCompletoWhatsApp(pdfParams);
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
                  onClick={() =>
                    pdfModalTipo === "completo"
                      ? shareChecklistCompletoWhatsApp(pdfParams)
                      : shareChecklistColetaWhatsApp(pdfParams)
                  }
                  style={{
                    width: "100%",
                    padding: 13,
                    background: "#25D366",
                    border: "none",
                    borderRadius: 12,
                    cursor: "pointer",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  💬 Enviar resumo em texto
                </button>
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
