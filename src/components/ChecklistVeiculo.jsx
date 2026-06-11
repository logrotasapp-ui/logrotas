import { useState, useCallback } from "react";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import {
  atualizarChecklist,
  coletaCompleta,
  CHECKLIST_TIPOS_SERVICO,
  CHECKLIST_MOTIVOS,
  CHECKLIST_ESTADOS_ACESSORIO,
  CHECKLIST_ESTADOS_PNEU,
  CHECKLIST_NIVEIS_COMBUSTIVEL,
} from "../services/checklistService.js";

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

const PNEU_CORES = {
  bom: C.green,
  regular: C.orange,
  ruim: C.red,
};

function proximoEstadoAcessorio(atual) {
  if (!atual) return CHECKLIST_ESTADOS_ACESSORIO[0];
  const idx = CHECKLIST_ESTADOS_ACESSORIO.indexOf(atual);
  return CHECKLIST_ESTADOS_ACESSORIO[(idx + 1) % CHECKLIST_ESTADOS_ACESSORIO.length];
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && (
        <label style={{ color: C.text2, fontSize: 14, fontWeight: 700, letterSpacing: 0.4 }}>
          {label}
        </label>
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

function EmConstrucao() {
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
        Em construção — próxima versão
      </div>
      <div style={{ color: C.muted, fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
        Esta etapa estará disponível na parte 2 do checklist.
      </div>
    </div>
  );
}

export default function ChecklistVeiculo({ checklist: initial, frete, uid, onClose, onSaved }) {
  const [checklist, setChecklist] = useState(initial);
  const [etapa, setEtapa] = useState(1);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const validacao = coletaCompleta(checklist);

  const salvar = useCallback(
    async (dados) => {
      if (!uid || !checklist?.id) return null;
      setSalvando(true);
      setErro("");
      try {
        const atualizado = await atualizarChecklist(uid, checklist.id, {
          ...dados,
          status: "coleta",
        });
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
      <link
        href="https://fonts.googleapis.com/css2?family=Sora:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      {/* Header */}
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

        {/* Navegação de etapas */}
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

        {/* ETAPA 1 — Dados */}
        {etapa === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 16,
                padding: "16px 18px",
              }}
            >
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 14 }}>
                👤 Cliente
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Field label="Nome" value={checklist.cliente?.nome || ""} onChange={(v) => updateCliente("nome", v)} placeholder="Nome do cliente" />
                <Field label="Telefone" value={checklist.cliente?.telefone || ""} onChange={(v) => updateCliente("telefone", v)} placeholder="(11) 99999-9999" />
              </div>
            </div>

            <div
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 16,
                padding: "16px 18px",
              }}
            >
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 14 }}>
                🚗 Veículo rebocado
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Field label="Placa" value={checklist.veiculo?.placa || ""} onChange={(v) => updateVeiculo("placa", v)} placeholder="ABC-1D23" />
                <Field label="Cor" value={checklist.veiculo?.cor || ""} onChange={(v) => updateVeiculo("cor", v)} placeholder="Prata" />
                <Field label="Marca" value={checklist.veiculo?.marca || ""} onChange={(v) => updateVeiculo("marca", v)} placeholder="Volkswagen" />
                <Field label="Modelo" value={checklist.veiculo?.modelo || ""} onChange={(v) => updateVeiculo("modelo", v)} placeholder="Gol" />
              </div>
            </div>

            <div
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 16,
                padding: "16px 18px",
              }}
            >
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 14 }}>
                🪝 Serviço
              </div>
              <div style={{ color: C.text2, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Tipo de serviço</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
                {CHECKLIST_TIPOS_SERVICO.map((t) => (
                  <BtnSelecao
                    key={t.id}
                    label={t.label}
                    ativo={checklist.servico?.tipo === t.id}
                    onClick={() => updateServico("tipo", t.id)}
                  />
                ))}
              </div>
              <div style={{ color: C.text2, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Motivo</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {CHECKLIST_MOTIVOS.map((m) => (
                  <BtnSelecao
                    key={m.id}
                    label={m.label}
                    ativo={checklist.servico?.motivo === m.id}
                    onClick={() => updateServico("motivo", m.id)}
                  />
                ))}
              </div>
            </div>

            <div
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 16,
                padding: "16px 18px",
              }}
            >
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 14 }}>
                📍 Origem e destino
              </div>
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

        {/* ETAPA 2 — Vistoria */}
        {etapa === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {!validacao.completa && (
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
            )}

            <div
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 16,
                padding: "16px 18px",
              }}
            >
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 14 }}>
                ❓ Perguntas de vistoria
              </div>
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

            <div
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 16,
                padding: "16px 18px",
              }}
            >
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 6 }}>
                🔧 Acessórios
              </div>
              <div style={{ color: C.muted, fontSize: 11, marginBottom: 12 }}>
                Toque para alternar: Bom → Ausente → Quebrado → N/A
              </div>
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

            <div
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 16,
                padding: "16px 18px",
              }}
            >
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 14 }}>
                🛞 Pneus
              </div>
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

            <div
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 16,
                padding: "16px 18px",
              }}
            >
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 14 }}>
                ⛽ Combustível
              </div>
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

            <div
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 16,
                padding: "16px 18px",
              }}
            >
              <div style={{ color: C.navy, fontWeight: 800, fontSize: 15, fontFamily: "'Sora',sans-serif", marginBottom: 14 }}>
                📝 Observações de avarias
              </div>
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

        {/* ETAPAS 3, 4, 5 — placeholder */}
        {etapa >= 3 && <EmConstrucao />}
      </div>
    </div>
  );
}
