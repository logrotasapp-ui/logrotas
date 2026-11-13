/**
 * V383 — Interpretação de etiquetas (OCR) pelo Claude, feita no SERVIDOR.
 * Antes a chamada saía do celular com a chave dentro do app (qualquer um podia copiar).
 * Agora a chave fica só no Secret Manager (ANTHROPIC_API_KEY) e o app chama esta função.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

const FUNCTION_REGION = "southamerica-east1";
const ANTHROPIC_API_KEY_SECRET = "ANTHROPIC_API_KEY";
const CLAUDE_OCR_MODEL = "claude-haiku-4-5";
const MAX_TEXTO = 20000; // caracteres de OCR aceitos por chamada
const LIMITE_DIARIO = 60; // chamadas por usuário por dia (proteção contra abuso)
const TZ_BRASIL = "America/Sao_Paulo";

/** Mesma regra de planoService.getPlanoAtual (app), só que lida do servidor. */
function usuarioEhPago(perfil) {
  if (!perfil || typeof perfil !== "object") return false;
  if (perfil.acessoVitalicio === true) return true;
  const tipoAcesso = String(perfil.tipoAcesso || "").trim().toLowerCase();
  const v = perfil.acessoValidoAte;
  const validoAte = v && typeof v.toDate === "function" ? v.toDate() : v ? new Date(v) : null;
  if (tipoAcesso === "trial" && validoAte && !Number.isNaN(validoAte.getTime()) && validoAte > new Date()) {
    return true;
  }
  const subStatus = String(perfil.subscriptionStatus || "").trim().toLowerCase();
  const planType = String(perfil.planType || "").trim().toUpperCase();
  return subStatus === "ativo" && (planType === "FRETE" || planType === "COMPLETO");
}

function diaChaveBrasil(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ_BRASIL }).format(date); // 2026-11-13
}

/** Conta +1 no dia; recusa acima do limite. */
async function consumirCotaDiaria(db, uid) {
  const ref = db.collection("ocrClaudeUso").doc(`${uid}_${diaChaveBrasil()}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const atual = snap.exists ? Number(snap.data().count) || 0 : 0;
    if (atual >= LIMITE_DIARIO) return false;
    tx.set(ref, { uid, count: atual + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
}

function montarPrompt(rawText) {
  return `Você recebe texto OCR bruto de etiquetas de entrega brasileiras.
Extraia cada etiqueta/destinatário como um objeto JSON com exatamente as chaves "nome", "endereco" e "complemento".
- "nome": nome do destinatário (string vazia se não houver)
- "endereco": endereço de entrega SEM complemento de unidade (rua, número, bairro, cidade, estado, CEP quando possível)
- "complemento": apto, bloco, casa, fundos, sala etc. quando aparecer na etiqueta (ex.: "Apto 22", "Bloco B"); string vazia se não houver
Extraia TODAS as entradas presentes no texto, sem omitir nenhuma, mesmo que a lista seja longa. Mantenha a correspondência exata entre cada nome e seu endereço conforme aparecem no texto original. Nunca invente, reordene ou pule entradas.
Ignore códigos de rastreio, remetente, peso, dimensões e outros dados que não sejam destinatário/endereço/complemento.
Responda APENAS com um array JSON válido, sem markdown, sem texto extra, sem comentários.
Exemplo: [{"nome":"João Silva","endereco":"Rua das Flores, 120, Centro, São Paulo - SP, 01310-100","complemento":"Apto 22"}]

Texto OCR:
${rawText}`;
}

const interpretarEtiquetasOcr = onCall(
  { region: FUNCTION_REGION, maxInstances: 10, timeoutSeconds: 60, secrets: [ANTHROPIC_API_KEY_SECRET] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Faça login para usar a leitura com IA.");

    const rawText = String(request.data?.rawText || "").trim();
    if (!rawText) throw new HttpsError("invalid-argument", "Texto vazio.");
    if (rawText.length > MAX_TEXTO) throw new HttpsError("invalid-argument", "Texto muito longo.");

    const db = admin.firestore();
    const perfilSnap = await db.collection("users").doc(uid).get();
    if (!usuarioEhPago(perfilSnap.exists ? perfilSnap.data() : null)) {
      throw new HttpsError("permission-denied", "Recurso disponível nos planos pagos.");
    }
    if (!(await consumirCotaDiaria(db, uid))) {
      throw new HttpsError("resource-exhausted", "Limite diário da leitura com IA atingido.");
    }

    const key = process.env[ANTHROPIC_API_KEY_SECRET];
    if (!key) {
      logger.error("interpretarEtiquetasOcr: secret ANTHROPIC_API_KEY ausente");
      throw new HttpsError("failed-precondition", "Leitura com IA indisponível no momento.");
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_OCR_MODEL,
        max_tokens: 4096,
        messages: [{ role: "user", content: montarPrompt(rawText) }],
      }),
    });

    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      logger.warn("interpretarEtiquetasOcr: Anthropic HTTP", { status: res.status, corpo: corpo.slice(0, 200) });
      throw new HttpsError("unavailable", "Leitura com IA falhou. Tente novamente.");
    }

    const data = await res.json();
    const textBlock = (data.content || []).find((c) => c.type === "text");
    return { text: textBlock?.text || "" };
  }
);

module.exports = { interpretarEtiquetasOcr };
