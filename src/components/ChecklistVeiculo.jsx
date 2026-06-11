import { useState, useCallback, useRef } from "react";
import { ArrowLeftIcon, XIcon, CameraIcon, RefreshCwIcon } from "lucide-react";
import {
  atualizarChecklist,
  coletaCompleta,
  CHECKLIST_TIPOS_SERVICO,
  CHECKLIST_MOTIVOS,
  CHECKLIST_ESTADOS_ACESSORIO,
  CHECKLIST_ESTADOS_PNEU,
  CHECKLIST_NIVEIS_COMBUSTIVEL,
  CHECKLIST_FOTO_SLOTS,
} from "../services/checklistService.js";
import {
  stampAndCompressImage,
  compressImageToJpegBlob,
  uploadChecklistImage,
  formatStampDataHora,
  buildPhotoStampText,
} from "../services/storageService.js";
import { getDriverGeolocation } from "../services/routingService.js";
import SignaturePad from "./SignaturePad.jsx";

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
  const coleta = cl?.coleta || {};
  return {
    ...cl,
    coleta: {
      ...coleta,
      fotos: coleta.fotos || [],
      assinaturas: {
        responsavel: { ...assinaturaVazia(), ...coleta.assinaturas?.responsavel },
        prestador: { ...assinaturaVazia(), ...coleta.assinaturas?.prestador },
      },
    },
  };
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

function AvisoIncompleto({ validacao }) {
  if (validacao.completa) return null;
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
        ⚠️ Checklist incompleto
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, color: C.text2, fontSize: 13, lineHeight: 1.6 }}>
        {validacao.faltando.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function EmConstrucaoPdf() {
  return (
    <div
      style={{
        background: C.navyLight,
        border: `1.5px dashed ${C.navy}44`,
        borderRadius: 16,
        padding: "40px 20px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>🚧</div>
      <div style={{ color: C.navy, fontWeight: 800, fontSize: 16, fontFamily: "'Sora',sans-serif" }}>
        Em construção — V239
      </div>
      <div style={{ color: C.muted, fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
        A geração do PDF estará disponível na próxima versão.
      </div>
    </div>
  );
}

function PhotoSlot({ slot, foto, onCapture, uploading, onRemove }) {
  const temFoto = !!foto?.url;
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
          <img
            src={foto.url}
            alt={slot.label}
            style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }}
          />
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
            {foto.dataHora}
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

export default function ChecklistVeiculo({ checklist: initial, frete, uid, onClose, onSaved }) {
  const [checklist, setChecklist] = useState(() => normalizeChecklist(initial));
  const [etapa, setEtapa] = useState(1);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [uploadingSlot, setUploadingSlot] = useState(null);
  const [slotAtivo, setSlotAtivo] = useState(null);
  const fileInputRef = useRef(null);
  const responsavelPadRef = useRef(null);
  const prestadorPadRef = useRef(null);

  const validacao = coletaCompleta(checklist);

  const salvar = useCallback(
    async (dados) => {
      if (!uid || !checklist?.id) return null;
      const { status = "coleta", ...rest } = dados;
      setSalvando(true);
      setErro("");
      try {
        const atualizado = await atualizarChecklist(uid, checklist.id, { ...rest, status });
        setChecklist((c) => ({ ...c, ...atualizado }));
        onSaved?.(atualizado);
        return atualizado;
      } catch {
        setErro("Não foi possível salvar. Verifique sua conexão.");
        return null;
      } finally {
        setSalvando(false);
      }
    },
    [uid, checklist?.id, onSaved]
  );

  const avancarEtapa1 = async () => {
    const ok = await salvar({
      cliente: checklist.cliente,
      veiculo: checklist.veiculo,
      servico: checklist.servico,
      origem: checklist.origem,
      destino: checklist.destino,
    });
    if (ok) setEtapa(2);
  };

  const avancarEtapa2 = async () => {
    const ok = await salvar({ coleta: checklist.coleta });
    if (ok) setEtapa(3);
  };

  const avancarEtapa3 = async () => {
    const ok = await salvar({ coleta: checklist.coleta });
    if (ok) setEtapa(4);
  };

  const abrirCaptura = (slotId) => {
    setSlotAtivo(slotId);
    fileInputRef.current?.click();
  };

  const handleArquivoFoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !slotAtivo || !uid || !checklist?.id) return;

    setUploadingSlot(slotAtivo);
    setErro("");
    try {
      const gps = await getDriverGeolocation({ preferFresh: true });
      const lat = gps?.lat ?? null;
      const lng = gps?.lng ?? null;
      const now = new Date();
      const dataHora = formatStampDataHora(now);
      const stamp = buildPhotoStampText(lat, lng, now);
      const blob = await stampAndCompressImage(file, stamp);
      const slotInfo = CHECKLIST_FOTO_SLOTS.find((s) => s.id === slotAtivo);
      const nomeArquivo = slotAtivo === "avarias" ? `avarias_${Date.now()}` : slotAtivo;
      const url = await uploadChecklistImage(uid, checklist.id, nomeArquivo, blob);

      const novaFoto = {
        tipo: slotAtivo,
        label: slotInfo?.label || slotAtivo,
        url,
        dataHora,
        lat,
        lng,
      };

      let fotos = [...(checklist.coleta?.fotos || [])];
      if (slotAtivo === "avarias") {
        fotos.push(novaFoto);
      } else {
        fotos = fotos.filter((f) => f.tipo !== slotAtivo);
        fotos.push(novaFoto);
      }

      const coleta = { ...checklist.coleta, fotos };
      setChecklist((c) => ({ ...c, coleta }));
      await salvar({ coleta });
    } catch {
      setErro("Falha ao enviar foto. Tente novamente.");
    } finally {
      setUploadingSlot(null);
      setSlotAtivo(null);
    }
  };

  const removerFotoAvaria = async (idx) => {
    const fotos = (checklist.coleta?.fotos || []).filter((_, i) => i !== idx);
    const coleta = { ...checklist.coleta, fotos };
    setChecklist((c) => ({ ...c, coleta }));
    await salvar({ coleta });
  };

  const updateAssinaturaCampo = (bloco, campo, valor) =>
    setChecklist((c) => ({
      ...c,
      coleta: {
        ...c.coleta,
        assinaturas: {
          ...c.coleta.assinaturas,
          [bloco]: { ...c.coleta.assinaturas[bloco], [campo]: valor },
        },
      },
    }));

  const avancarEtapa4 = async () => {
    const resp = checklist.coleta?.assinaturas?.responsavel || {};
    const prest = checklist.coleta?.assinaturas?.prestador || {};

    if (!resp.nome?.trim() || !resp.documento?.trim()) {
      setErro("Preencha nome e documento do responsável no local.");
      return;
    }
    if (!prest.nome?.trim() || !prest.documento?.trim()) {
      setErro("Preencha nome e documento do prestador.");
      return;
    }
    const respPadNovo = !responsavelPadRef.current?.isEmpty?.();
    const prestPadNovo = !prestadorPadRef.current?.isEmpty?.();
    const respSalva = checklist.coleta?.assinaturas?.responsavel?.imagemUrl;
    const prestSalva = checklist.coleta?.assinaturas?.prestador?.imagemUrl;

    if (!respPadNovo && !respSalva) {
      setErro("Assinatura do responsável no local é obrigatória.");
      return;
    }
    if (!prestPadNovo && !prestSalva) {
      setErro("Assinatura do prestador é obrigatória.");
      return;
    }

    setSalvando(true);
    setErro("");
    try {
      const gps = await getDriverGeolocation({ preferFresh: true });
      const lat = gps?.lat ?? null;
      const lng = gps?.lng ?? null;
      const dataHora = formatStampDataHora();

      let respUrl = respSalva || "";
      let prestUrl = prestSalva || "";

      if (respPadNovo) {
        const respBlob = await responsavelPadRef.current.toBlob();
        const respJpeg = await compressImageToJpegBlob(respBlob);
        respUrl = await uploadChecklistImage(uid, checklist.id, `assinatura_responsavel_${Date.now()}`, respJpeg);
      }
      if (prestPadNovo) {
        const prestBlob = await prestadorPadRef.current.toBlob();
        const prestJpeg = await compressImageToJpegBlob(prestBlob);
        prestUrl = await uploadChecklistImage(uid, checklist.id, `assinatura_prestador_${Date.now()}`, prestJpeg);
      }

      const assinRespSalva = checklist.coleta?.assinaturas?.responsavel || {};
      const assinPrestSalva = checklist.coleta?.assinaturas?.prestador || {};

      const assinaturas = {
        responsavel: {
          nome: resp.nome.trim(),
          documento: resp.documento.trim(),
          imagemUrl: respUrl,
          dataHora: respPadNovo ? dataHora : assinRespSalva.dataHora || dataHora,
          lat: respPadNovo ? lat : assinRespSalva.lat ?? lat,
          lng: respPadNovo ? lng : assinRespSalva.lng ?? lng,
        },
        prestador: {
          nome: prest.nome.trim(),
          documento: prest.documento.trim(),
          imagemUrl: prestUrl,
          dataHora: prestPadNovo ? dataHora : assinPrestSalva.dataHora || dataHora,
          lat: prestPadNovo ? lat : assinPrestSalva.lat ?? lat,
          lng: prestPadNovo ? lng : assinPrestSalva.lng ?? lng,
        },
      };

      const coletaAtualizada = { ...checklist.coleta, assinaturas };
      const checklistAtualizado = { ...checklist, coleta: coletaAtualizada };
      const val = coletaCompleta(checklistAtualizado);
      const status = val.completa ? "aguardando_entrega" : "coleta";
      if (val.completa) {
        coletaAtualizada.finalizadaEm = new Date().toISOString();
      }

      const ok = await salvar({ coleta: coletaAtualizada, status });
      if (ok) {
        if (val.completa) setEtapa(5);
      }
    } catch {
      setErro("Falha ao salvar assinaturas. Tente novamente.");
    } finally {
      setSalvando(false);
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
      const perguntas = [...(c.coleta?.perguntas || [])];
      perguntas[idx] = { ...perguntas[idx], resposta };
      return { ...c, coleta: { ...c.coleta, perguntas } };
    });
  const updateAcessorio = (idx) =>
    setChecklist((c) => {
      const acessorios = [...(c.coleta?.acessorios || [])];
      const atual = acessorios[idx]?.estado;
      acessorios[idx] = { ...acessorios[idx], estado: proximoEstadoAcessorio(atual) };
      return { ...c, coleta: { ...c.coleta, acessorios } };
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

  const fotos = checklist.coleta?.fotos || [];
  const fotoPorSlot = (slotId) => fotos.find((f) => f.tipo === slotId);
  const fotosAvarias = fotos.filter((f) => f.tipo === "avarias");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        background: C.bg,
        overflowY: "auto",
        fontFamily: "'DM Sans',sans-serif",
      }}
    >
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
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => setEtapa(e.id)}
                style={{
                  flex: "1 0 auto",
                  minWidth: 56,
                  padding: "7px 6px",
                  border: "none",
                  borderRadius: 10,
                  cursor: "pointer",
                  background: ativo ? C.navy : C.subtle,
                  color: ativo ? "#fff" : C.text2,
                  fontWeight: 700,
                  fontSize: 11,
                  fontFamily: "'Sora',sans-serif",
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
              onClick={avancarEtapa1}
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
            <AvisoIncompleto validacao={validacao} />
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
            <AvisoIncompleto validacao={validacao} />
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
            <AvisoIncompleto validacao={validacao} />
            {[
              { bloco: "responsavel", titulo: "✍️ Responsável no local", padRef: responsavelPadRef },
              { bloco: "prestador", titulo: "🪝 Prestador", padRef: prestadorPadRef },
            ].map(({ bloco, titulo, padRef }) => {
              const assin = checklist.coleta?.assinaturas?.[bloco] || assinaturaVazia();
              const temAssinaturaSalva = !!assin.imagemUrl;
              return (
                <div
                  key={bloco}
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
                      value={assin.nome}
                      onChange={(v) => updateAssinaturaCampo(bloco, "nome", v)}
                      placeholder="Nome de quem assina"
                    />
                    <Field
                      label="Documento (RG/CPF)"
                      value={assin.documento}
                      onChange={(v) => updateAssinaturaCampo(bloco, "documento", v)}
                      placeholder="000.000.000-00"
                    />
                  </div>
                  {temAssinaturaSalva ? (
                    <div>
                      <img
                        src={assin.imagemUrl}
                        alt={`Assinatura ${bloco}`}
                        style={{
                          width: "100%",
                          maxHeight: 120,
                          objectFit: "contain",
                          border: `1px solid ${C.border}`,
                          borderRadius: 10,
                          background: "#fff",
                        }}
                      />
                      <div style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>
                        Salva em {assin.dataHora || "—"}
                        {assin.lat != null ? ` · ${assin.lat.toFixed(4)}, ${assin.lng.toFixed(4)}` : ""}
                      </div>
                      <div style={{ color: C.muted, fontSize: 11, marginTop: 8 }}>
                        Assine novamente abaixo para substituir.
                      </div>
                    </div>
                  ) : null}
                  <SignaturePad ref={padRef} />
                </div>
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
              {salvando ? "Salvando…" : validacao.completa ? "✅ Finalizar coleta" : "Salvar assinaturas →"}
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

        {etapa === 5 && <EmConstrucaoPdf />}
      </div>
    </div>
  );
}
