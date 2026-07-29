/**
 * LogRotas Cloud Functions — cadastro fechado por código beta (site logrotas.com.br).
 */
const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

const {
  createAsaasSubscription,
  webhookAsaas,
  cancelAsaasSubscription,
  getFatura,
  getFaturaPendente,
  getPixQrCode,
  payWithCard,
} = require("./asaas");

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

const BETA_CODES_COLLECTION = "betaCodes";
const USERS_COLLECTION = "users";
const RATE_LIMIT_COLLECTION = "registerRateLimits";

const BETA_CODE_PREFIX = "BETA-LR-";
const BETA_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_BETA_CODES_PER_CALL = 50;
const MAX_BETA_CODE_COLLISION_RETRIES = 24;

const PROFILE_LABELS = {
  caminhoneiro: "Caminhoneiro",
  guincheiro: "Guincheiro",
  motoqueiro: "Motoqueiro",
  entregador: "Entregador",
  outros: "Outros",
};

/** Alinhado ao Firestore do app (southamerica-east1). */
const FUNCTION_REGION = "southamerica-east1";

setGlobalOptions({ maxInstances: 10, region: FUNCTION_REGION });

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeBetaCode(raw) {
  return String(raw || "").trim().toUpperCase();
}

/** Apenas dígitos — usado para dedup 1 telefone = 1 conta. */
function normalizePhoneDigits(raw) {
  return String(raw || "").replace(/\D/g, "");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Celular/fixo BR: 10–11 dígitos (com DDD). */
function isValidPhoneDigits(digits) {
  return digits.length >= 10 && digits.length <= 11;
}

function normalizeTipoPerfil(raw) {
  const slug = String(raw || "").trim().toLowerCase();
  return PROFILE_LABELS[slug] ? slug : null;
}

function buildTrialAcessoValidoAte() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);
  return admin.firestore.Timestamp.fromDate(expiresAt);
}

function buildUserProfilePayload({
  nome,
  email,
  telefone,
  telefoneDigits,
  profileSlug,
  codigoBeta,
  accessMode,
}) {
  const base = {
    nome,
    email,
    telefone,
    telefoneDigits,
    perfil: profileSlug,
    documento: "",
    profile: profileSlug,
    tipo: PROFILE_LABELS[profileSlug],
    veiculo: "",
    empresa: "",
    servicosFechamento: [],
    precoCombustivel: "",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (accessMode === "beta") {
    return {
      ...base,
      tipoAcesso: "beta",
      codigoUsado: codigoBeta,
      codigoBetaUsado: codigoBeta,
      betaAccess: true,
      acessoVitalicio: true,
    };
  }

  return {
    ...base,
    tipoAcesso: "trial",
    acessoValidoAte: buildTrialAcessoValidoAte(),
  };
}

function mapAuthError(err) {
  const code = err?.code || "";
  if (code === "auth/email-already-exists") {
    return new HttpsError(
      "already-exists",
      "Este e-mail já está cadastrado. Faça login ou use outro e-mail.",
      { reason: "email-ja-cadastrado" }
    );
  }
  if (code === "auth/invalid-email") {
    return new HttpsError(
      "invalid-argument",
      "E-mail inválido. Verifique e tente novamente.",
      { reason: "email-invalido" }
    );
  }
  if (code === "auth/weak-password") {
    return new HttpsError(
      "invalid-argument",
      "A senha precisa ter pelo menos 6 caracteres.",
      { reason: "senha-fraca" }
    );
  }
  return new HttpsError(
    "internal",
    "Não foi possível criar sua conta. Tente novamente em instantes.",
    { reason: "erro-interno" }
  );
}

/**
 * Rate limit básico por IP: máx. 8 tentativas / 15 min.
 * Persistido no Firestore (funciona entre instâncias).
 */
async function checkRateLimit(clientKey) {
  if (!clientKey || clientKey === "unknown") return;

  const ref = db.collection(RATE_LIMIT_COLLECTION).doc(clientKey);
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 8;
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;

    if (!data || now - (data.windowStart || 0) > windowMs) {
      tx.set(ref, { count: 1, windowStart: now });
      return;
    }

    if (data.count >= maxAttempts) {
      throw new HttpsError(
        "resource-exhausted",
        "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
        { reason: "rate-limit" }
      );
    }

    tx.update(ref, { count: admin.firestore.FieldValue.increment(1) });
  });
}

function getClientKey(request) {
  const forwarded = request?.rawRequest?.headers?.["x-forwarded-for"];
  const ip =
    (typeof forwarded === "string"
      ? forwarded.split(",").map(s => s.trim()).filter(Boolean).pop()
      : null) ||
    request?.rawRequest?.ip ||
    "unknown";
  return `ip_${ip.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120)}`;
}

async function assertPhoneAvailable(telefoneDigits) {
  const existing = await db
    .collection(USERS_COLLECTION)
    .where("telefoneDigits", "==", telefoneDigits)
    .limit(1)
    .get();

  if (!existing.empty) {
    throw new HttpsError(
      "already-exists",
      "Este telefone já está vinculado a uma conta.",
      { reason: "telefone-ja-cadastrado" }
    );
  }
}

/**
 * Reserva o código beta (uso único) dentro de transação.
 * Retorna o e-mail normalizado gravado em usedBy.
 */
async function claimBetaCodeInTransaction(code, email) {
  const codeRef = db.collection(BETA_CODES_COLLECTION).doc(code);
  const normalizedEmail = email.trim().toLowerCase();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(codeRef);

    if (!snap.exists) {
      throw new HttpsError(
        "failed-precondition",
        "Código beta inválido ou já utilizado.",
        { reason: "codigo-invalido" }
      );
    }

    const data = snap.data() || {};
    if (data.used === true) {
      throw new HttpsError(
        "failed-precondition",
        "Código beta inválido ou já utilizado.",
        { reason: "codigo-ja-usado" }
      );
    }

    tx.update(codeRef, {
      used: true,
      usedBy: normalizedEmail,
      usedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return normalizedEmail;
}

/** Reverte consumo do código se a criação da conta falhar depois da reserva. */
async function releaseBetaCode(code) {
  try {
    await db.collection(BETA_CODES_COLLECTION).doc(code).update({
      used: false,
      usedBy: null,
      usedAt: null,
    });
  } catch (err) {
    logger.error("Falha ao reverter código beta", { code, err: err?.message });
  }
}

function randomBetaCodeSuffix(length = 4) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += BETA_CODE_CHARS[Math.floor(Math.random() * BETA_CODE_CHARS.length)];
  }
  return out;
}

function buildRandomBetaCode() {
  return `${BETA_CODE_PREFIX}${randomBetaCodeSuffix(4)}`;
}

async function assertAdmin(uid) {
  const snap = await db.collection(USERS_COLLECTION).doc(uid).get();
  if (!snap.exists || snap.data()?.role !== "admin") {
    throw new HttpsError(
      "permission-denied",
      "Acesso restrito a administradores.",
      { reason: "nao-admin" }
    );
  }
}

/** Cria um código beta único em betaCodes/{code}; retenta se já existir. */
async function createUniqueBetaCode() {
  for (let attempt = 0; attempt < MAX_BETA_CODE_COLLISION_RETRIES; attempt++) {
    const code = buildRandomBetaCode();
    const codeRef = db.collection(BETA_CODES_COLLECTION).doc(code);
    const created = await db.runTransaction(async (tx) => {
      const snap = await tx.get(codeRef);
      if (snap.exists) return null;
      tx.set(codeRef, {
        used: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return code;
    });
    if (created) return created;
  }
  throw new HttpsError(
    "internal",
    "Não foi possível gerar código único. Tente novamente.",
    { reason: "colisao-codigo" }
  );
}

// ── Callable ──────────────────────────────────────────────────────────────────

/**
 * Cadastro: site envia dados + código beta opcional; function cria Auth + users/{uid}.
 * Sem código: trial 14 dias. Com código válido: acesso vitalício beta.
 *
 * Entrada: { email, senha, nome, telefone, tipoPerfil, codigoBeta? }
 * Sucesso: { uid, email }
 */
exports.registerWithBetaCode = onCall(
  {
    region: FUNCTION_REGION,
    maxInstances: 10,
    // Callable público (site, sem login prévio). Considere App Check no site depois.
  },
  async (request) => {
    const data = request.data || {};

    const email = String(data.email || "").trim().toLowerCase();
    const senha = String(data.senha || "");
    const nome = String(data.nome || "").trim();
    const telefone = String(data.telefone || "").trim();
    const tipoPerfil = data.tipoPerfil;
    const codigoBeta = normalizeBetaCode(data.codigoBeta);
    const hasBetaCode = codigoBeta !== "";

    // ── 1. Validação de entrada ─────────────────────────────────────────────
    if (!email || !senha || !nome || !telefone || !tipoPerfil) {
      throw new HttpsError(
        "invalid-argument",
        "Preencha todos os campos obrigatórios.",
        { reason: "campos-obrigatorios" }
      );
    }

    if (!isValidEmail(email)) {
      throw new HttpsError(
        "invalid-argument",
        "E-mail inválido. Verifique e tente novamente.",
        { reason: "email-invalido" }
      );
    }

    if (senha.length < 6) {
      throw new HttpsError(
        "invalid-argument",
        "A senha precisa ter pelo menos 6 caracteres.",
        { reason: "senha-fraca" }
      );
    }

    const telefoneDigits = normalizePhoneDigits(telefone);
    if (!isValidPhoneDigits(telefoneDigits)) {
      throw new HttpsError(
        "invalid-argument",
        "Telefone inválido. Informe DDD + número (10 ou 11 dígitos).",
        { reason: "telefone-invalido" }
      );
    }

    const profileSlug = normalizeTipoPerfil(tipoPerfil);
    if (!profileSlug) {
      throw new HttpsError(
        "invalid-argument",
        "Tipo de perfil inválido. Escolha: caminhoneiro, guincheiro, motoqueiro, entregador ou outros.",
        { reason: "perfil-invalido" }
      );
    }

    // ── 8. Rate limit (básico por IP) ───────────────────────────────────────
    await checkRateLimit(getClientKey(request));

    // ── 4. Dedup telefone ───────────────────────────────────────────────────
    await assertPhoneAvailable(telefoneDigits);

    // ── 3 + 7. Reservar código beta (somente se informado) ──────────────────
    let claimedBetaCode = null;
    if (hasBetaCode) {
      await claimBetaCodeInTransaction(codigoBeta, email);
      claimedBetaCode = codigoBeta;
    }

    let uid = null;

    try {
      // ── 5. Firebase Auth ────────────────────────────────────────────────────
      const userRecord = await auth.createUser({
        email,
        password: senha,
        displayName: nome,
      });
      uid = userRecord.uid;

      // ── 6. Perfil Firestore (trial ou beta) ───────────────────────────────
      const profilePayload = buildUserProfilePayload({
        nome,
        email,
        telefone,
        telefoneDigits,
        profileSlug,
        codigoBeta: claimedBetaCode,
        accessMode: hasBetaCode ? "beta" : "trial",
      });

      await db.collection(USERS_COLLECTION).doc(uid).set(profilePayload);

      logger.info("Cadastro concluído", {
        uid,
        email,
        tipoAcesso: hasBetaCode ? "beta" : "trial",
        codigoBeta: claimedBetaCode,
        profileSlug,
      });

      return {
        uid,
        email,
        message: "Conta criada com sucesso. Você já pode entrar no app.",
      };
    } catch (err) {
      if (claimedBetaCode) {
        await releaseBetaCode(claimedBetaCode);
      }

      if (uid) {
        try {
          await auth.deleteUser(uid);
        } catch (deleteErr) {
          logger.error("Falha ao remover usuário Auth após erro", {
            uid,
            err: deleteErr?.message,
          });
        }
      }

      if (err instanceof HttpsError) throw err;
      if (err?.code?.startsWith?.("auth/")) throw mapAuthError(err);

      logger.error("registerWithBetaCode falhou", {
        email,
        codigoBeta: claimedBetaCode,
        err: err?.message,
        code: err?.code,
      });

      throw new HttpsError(
        "internal",
        "Não foi possível concluir o cadastro. Tente novamente.",
        { reason: "erro-interno" }
      );
    }
  }
);

/**
 * Gera códigos beta aleatórios (admin). Formato BETA-LR-XXXX.
 *
 * Entrada: { quantidade } — inteiro 1..50
 * Sucesso: { success: true, codigos: string[] }
 */
exports.generateBetaCodes = onCall(
  {
    region: FUNCTION_REGION,
    maxInstances: 10,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError(
        "unauthenticated",
        "Faça login para gerar códigos beta.",
        { reason: "nao-autenticado" }
      );
    }

    const uid = request.auth.uid;

    try {
      await assertAdmin(uid);

      const quantidade = Number(request.data?.quantidade);
      if (
        !Number.isInteger(quantidade) ||
        quantidade < 1 ||
        quantidade > MAX_BETA_CODES_PER_CALL
      ) {
        throw new HttpsError(
          "invalid-argument",
          `Informe uma quantidade entre 1 e ${MAX_BETA_CODES_PER_CALL}.`,
          { reason: "quantidade-invalida" }
        );
      }

      const codigos = [];
      for (let i = 0; i < quantidade; i++) {
        const code = await createUniqueBetaCode();
        codigos.push(code);
      }

      logger.info("Códigos beta gerados", { uid, quantidade, codigos });

      return { success: true, codigos };
    } catch (err) {
      if (err instanceof HttpsError) throw err;

      logger.error("generateBetaCodes falhou", {
        uid,
        err: err?.message,
        code: err?.code,
      });

      throw new HttpsError(
        "internal",
        "Não foi possível gerar os códigos beta. Tente novamente.",
        { reason: "erro-interno" }
      );
    }
  }
);

// ── Asaas (assinaturas) ───────────────────────────────────────────────────────

exports.createAsaasSubscription = createAsaasSubscription;
exports.webhookAsaas = webhookAsaas;
exports.cancelAsaasSubscription = cancelAsaasSubscription;
exports.getFatura = getFatura;
exports.getFaturaPendente = getFaturaPendente;
exports.getPixQrCode = getPixQrCode;
exports.payWithCard = payWithCard;
