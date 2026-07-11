/**
 * LogRotas — integração Asaas (assinaturas recorrentes).
 * Região: southamerica-east1 (alinhado ao app Firestore).
 */
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

function getDb() {
  return admin.firestore();
}

const USERS_COLLECTION = "users";
const FUNCTION_REGION = "southamerica-east1";
const ASAAS_API_BASE = "https://api.asaas.com/v3";

const ASAAS_API_KEY_SECRET = "ASAAS_API_KEY";
const ASAAS_WEBHOOK_TOKEN_SECRET = "ASAAS_WEBHOOK_TOKEN";

/** IDs de plano no painel Asaas (referência; cobrança via value na API). */
const ASAAS_PLAN_IDS = {
  FRETE: "854716371",
  COMPLETO: "854734389",
};

const PLANS = {
  FRETE: {
    value: 19.9,
    description: "LogRotas — Plano Frete (mensal)",
    asaasPlanId: ASAAS_PLAN_IDS.FRETE,
  },
  COMPLETO: {
    value: 29.9,
    description: "LogRotas — Plano Completo (mensal)",
    asaasPlanId: ASAAS_PLAN_IDS.COMPLETO,
  },
};

const SUBSCRIPTION_STATUS_BY_EVENT = {
  PAYMENT_CONFIRMED: "ativo",
  PAYMENT_RECEIVED: "ativo",
  PAYMENT_OVERDUE: "vencido",
  PAYMENT_FAILED: "falhou",
  SUBSCRIPTION_DELETED: "cancelado",
  SUBSCRIPTION_CANCELED: "cancelado",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAsaasApiKey() {
  const key = process.env.ASAAS_API_KEY;
  if (!key) {
    logger.error("ASAAS_API_KEY ausente no ambiente");
    throw new HttpsError(
      "internal",
      "Configuração de pagamento indisponível. Tente mais tarde.",
      { reason: "asaas-config" }
    );
  }
  return key;
}

function tomorrowIsoDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function normalizePlanType(raw) {
  const key = String(raw || "").trim().toUpperCase();
  return PLANS[key] ? key : null;
}

function normalizeCpfCnpj(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length !== 11 && digits.length !== 14) return null;
  return digits;
}

function resolveMobilePhone(userData) {
  const digits = String(userData?.telefoneDigits || userData?.telefone || "").replace(
    /\D/g,
    ""
  );
  return digits || undefined;
}

function mapAsaasErrorToHttps(err, context) {
  logger.error("Erro API Asaas", {
    ...context,
    err: err?.message,
    status: err?.status,
    body: err?.body,
  });
  throw new HttpsError(
    "internal",
    "Não foi possível processar o pagamento. Tente novamente em instantes.",
    { reason: "asaas-api" }
  );
}

/**
 * @param {string} path - ex: "/customers" ou "/subscriptions/abc"
 * @param {{ method?: string, body?: object }} options
 */
async function asaasFetch(path, options = {}) {
  const apiKey = getAsaasApiKey();
  const url = `${ASAAS_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const { method = "GET", body } = options;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        access_token: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const wrapped = new Error(err?.message || "fetch failed");
    wrapped.status = 0;
    throw wrapped;
  }

  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }

  if (!response.ok) {
    const apiErr = new Error(
      parsed?.errors?.[0]?.description || parsed?.message || `HTTP ${response.status}`
    );
    apiErr.status = response.status;
    apiErr.body = parsed;
    throw apiErr;
  }

  return parsed;
}

async function createAsaasCustomer({ uid, nome, email, mobilePhone, cpfCnpj }) {
  const payload = {
    name: nome,
    email,
    externalReference: uid,
    cpfCnpj,
  };
  if (mobilePhone) payload.mobilePhone = mobilePhone;

  return asaasFetch("/customers", { method: "POST", body: payload });
}

async function fetchAsaasCustomer(customerId) {
  return asaasFetch(`/customers/${encodeURIComponent(customerId)}`);
}

async function updateAsaasCustomerCpfCnpj(customerId, cpfCnpj) {
  return asaasFetch(`/customers/${encodeURIComponent(customerId)}`, {
    method: "PUT",
    body: { cpfCnpj },
  });
}

async function createAsaasSubscriptionRecord({ customerId, plan, nextDueDate }) {
  return asaasFetch("/subscriptions", {
    method: "POST",
    body: {
      customer: customerId,
      billingType: "UNDEFINED",
      nextDueDate,
      value: plan.value,
      cycle: "MONTHLY",
      description: plan.description,
    },
  });
}

/** Primeira cobrança gerada pela assinatura — link de pagamento. */
async function fetchFirstInvoiceUrl(subscriptionId) {
  const result = await asaasFetch(
    `/payments?subscription=${encodeURIComponent(subscriptionId)}&limit=1`
  );
  const payment = result?.data?.[0];
  return (
    payment?.invoiceUrl ||
    payment?.bankSlipUrl ||
    payment?.transactionReceiptUrl ||
    null
  );
}

async function findUserByAsaasSubscriptionId(subscriptionId) {
  const snap = await getDb()
    .collection(USERS_COLLECTION)
    .where("asaasSubscriptionId", "==", subscriptionId)
    .limit(1)
    .get();

  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { uid: doc.id, ref: doc.ref, data: doc.data() };
}

function extractSubscriptionIdFromWebhook(body) {
  if (body?.payment?.subscription) return String(body.payment.subscription);
  if (body?.subscription?.id) return String(body.subscription.id);
  return null;
}

function mapWebhookEventToStatus(event) {
  return SUBSCRIPTION_STATUS_BY_EVENT[event] || null;
}

// ── Callables ─────────────────────────────────────────────────────────────────

/**
 * Cria assinatura Asaas para usuário autenticado.
 * Entrada: { planType: "FRETE" | "COMPLETO", cpfCnpj: string }
 * Sucesso: { success: true, invoiceUrl, subscriptionId }
 */
const createAsaasSubscription = onCall(
  { region: FUNCTION_REGION, maxInstances: 10, secrets: [ASAAS_API_KEY_SECRET] },
  async (request) => {
    const db = getDb();

    if (!request.auth?.uid) {
      throw new HttpsError(
        "unauthenticated",
        "Faça login para assinar um plano.",
        { reason: "nao-autenticado" }
      );
    }

    const uid = request.auth.uid;
    const planType = normalizePlanType(request.data?.planType);
    if (!planType) {
      throw new HttpsError(
        "invalid-argument",
        'Plano inválido. Use "FRETE" ou "COMPLETO".',
        { reason: "plano-invalido" }
      );
    }

    const cpfCnpj = normalizeCpfCnpj(request.data?.cpfCnpj);
    if (!cpfCnpj) {
      throw new HttpsError(
        "invalid-argument",
        "CPF ou CNPJ é obrigatório e deve ser válido.",
        { reason: "cpf-cnpj-invalido" }
      );
    }

    const plan = PLANS[planType];
    const userRef = db.collection(USERS_COLLECTION).doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      throw new HttpsError(
        "not-found",
        "Perfil do usuário não encontrado. Complete seu cadastro no app.",
        { reason: "usuario-nao-encontrado" }
      );
    }

    const userData = userSnap.data() || {};
    const nome = String(userData.nome || request.auth.token?.name || "Cliente LogRotas").trim();
    const email = String(
      userData.email || request.auth.token?.email || ""
    )
      .trim()
      .toLowerCase();

    if (!email) {
      throw new HttpsError(
        "failed-precondition",
        "E-mail do usuário não encontrado. Atualize seu perfil.",
        { reason: "email-ausente" }
      );
    }

    let asaasCustomerId = userData.asaasCustomerId || null;

    try {
      if (!asaasCustomerId) {
        const customer = await createAsaasCustomer({
          uid,
          nome,
          email,
          mobilePhone: resolveMobilePhone(userData),
          cpfCnpj,
        });
        asaasCustomerId = customer?.id;
        if (!asaasCustomerId) {
          throw new Error("Resposta Asaas sem id de customer");
        }
        await userRef.set(
          {
            asaasCustomerId,
            cpfCnpj,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        const existingCustomer = await fetchAsaasCustomer(asaasCustomerId);
        if (!normalizeCpfCnpj(existingCustomer?.cpfCnpj)) {
          await updateAsaasCustomerCpfCnpj(asaasCustomerId, cpfCnpj);
          await userRef.set(
            {
              cpfCnpj,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          logger.info("Customer Asaas existente atualizado com CPF/CNPJ", {
            uid,
            asaasCustomerId,
          });
        }
      }

      const nextDueDate = tomorrowIsoDate();
      const subscription = await createAsaasSubscriptionRecord({
        customerId: asaasCustomerId,
        plan,
        nextDueDate,
      });

      const subscriptionId = subscription?.id;
      if (!subscriptionId) {
        throw new Error("Resposta Asaas sem id de assinatura");
      }

      const invoiceUrl = await fetchFirstInvoiceUrl(subscriptionId);

      await userRef.set(
        {
          asaasSubscriptionId: subscriptionId,
          planType,
          subscriptionStatus: "pending",
          asaasPlanId: plan.asaasPlanId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      logger.info("Assinatura Asaas criada", {
        uid,
        planType,
        subscriptionId,
        asaasCustomerId,
        hasInvoiceUrl: !!invoiceUrl,
      });

      return {
        success: true,
        invoiceUrl,
        subscriptionId,
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      mapAsaasErrorToHttps(err, { uid, planType, step: "createAsaasSubscription" });
    }
  }
);

/**
 * Cancela assinatura Asaas do usuário autenticado.
 * Sucesso: { success: true }
 */
const cancelAsaasSubscription = onCall(
  { region: FUNCTION_REGION, maxInstances: 10, secrets: [ASAAS_API_KEY_SECRET] },
  async (request) => {
    const db = getDb();

    if (!request.auth?.uid) {
      throw new HttpsError(
        "unauthenticated",
        "Faça login para cancelar sua assinatura.",
        { reason: "nao-autenticado" }
      );
    }

    const uid = request.auth.uid;
    const userRef = db.collection(USERS_COLLECTION).doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      throw new HttpsError(
        "not-found",
        "Perfil do usuário não encontrado.",
        { reason: "usuario-nao-encontrado" }
      );
    }

    const asaasSubscriptionId = userSnap.data()?.asaasSubscriptionId;
    if (!asaasSubscriptionId) {
      throw new HttpsError(
        "not-found",
        "Nenhuma assinatura ativa encontrada para esta conta.",
        { reason: "assinatura-nao-encontrada" }
      );
    }

    try {
      await asaasFetch(`/subscriptions/${encodeURIComponent(asaasSubscriptionId)}`, {
        method: "DELETE",
      });

      await userRef.set(
        {
          subscriptionStatus: "cancelado",
          canceladoEm: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      logger.info("Assinatura Asaas cancelada", { uid, asaasSubscriptionId });

      return { success: true };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      mapAsaasErrorToHttps(err, { uid, asaasSubscriptionId, step: "cancelAsaasSubscription" });
    }
  }
);

/**
 * Consulta fatura (cobrança) no Asaas.
 * Entrada: { faturaId: string }
 * Sucesso: { numeroFatura, valor, vencimento, descricao, status, comprador }
 */
const getFatura = onCall(
  { region: FUNCTION_REGION, maxInstances: 10, secrets: [ASAAS_API_KEY_SECRET] },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError(
        "unauthenticated",
        "Faça login para consultar a fatura.",
        { reason: "nao-autenticado" }
      );
    }

    const uid = request.auth.uid;
    const faturaId = String(request.data?.faturaId || "").trim();
    if (!faturaId) {
      throw new HttpsError(
        "invalid-argument",
        "ID da fatura é obrigatório.",
        { reason: "fatura-id-ausente" }
      );
    }

    try {
      const payment = await asaasFetch(`/payments/${encodeURIComponent(faturaId)}`);
      console.log("[getFatura] GET /v3/payments/{faturaId} raw:", JSON.stringify(payment));

      let nome = "";
      let email = "";
      const customerRef = payment?.customer;

      if (customerRef && typeof customerRef === "object") {
        nome = String(customerRef.name || "").trim();
        email = String(customerRef.email || "").trim().toLowerCase();
      } else if (customerRef) {
        const customer = await fetchAsaasCustomer(String(customerRef).trim());
        console.log("[getFatura] GET /v3/customers/{customerId} raw:", JSON.stringify(customer));
        nome = String(customer?.name || "").trim();
        email = String(customer?.email || "").trim().toLowerCase();
      }

      return {
        numeroFatura: payment?.invoiceNumber || payment?.id || faturaId,
        valor: payment?.value ?? null,
        vencimento: payment?.dueDate ?? null,
        descricao: payment?.description ?? null,
        status: payment?.status ?? null,
        comprador: { nome, email },
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      mapAsaasErrorToHttps(err, { uid, faturaId, step: "getFatura" });
    }
  }
);

// ── Webhook HTTP ──────────────────────────────────────────────────────────────

/**
 * Webhook Asaas — validação por header asaas-access-token.
 * Sempre responde 200 após processar (ou se usuário não encontrado).
 */
const webhookAsaas = onRequest(
  {
    region: FUNCTION_REGION,
    maxInstances: 10,
    secrets: [ASAAS_API_KEY_SECRET, ASAAS_WEBHOOK_TOKEN_SECRET],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
    const receivedToken = req.get("asaas-access-token") || req.get("Asaas-Access-Token");

    if (!expectedToken || receivedToken !== expectedToken) {
      logger.warn("Webhook Asaas rejeitado — token inválido", {
        hasExpected: !!expectedToken,
        hasReceived: !!receivedToken,
      });
      res.status(401).send("Unauthorized");
      return;
    }

    const body = req.body || {};
    const event = String(body.event || "");

    logger.info("Webhook Asaas recebido", { event });

    const subscriptionId = extractSubscriptionIdFromWebhook(body);
    const newStatus = mapWebhookEventToStatus(event);

    if (!subscriptionId) {
      logger.warn("Webhook Asaas sem subscriptionId", { event });
      res.status(200).send("OK");
      return;
    }

    if (!newStatus) {
      logger.info("Webhook Asaas ignorado — evento sem mapeamento", {
        event,
        subscriptionId,
      });
      res.status(200).send("OK");
      return;
    }

    try {
      const user = await findUserByAsaasSubscriptionId(subscriptionId);

      if (!user) {
        logger.warn("Webhook Asaas — usuário não encontrado", {
          event,
          subscriptionId,
          newStatus,
        });
        res.status(200).send("OK");
        return;
      }

      const patch = {
        subscriptionStatus: newStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (newStatus === "ativo") {
        patch.ultimoPagamentoConfirmadoEm = admin.firestore.FieldValue.serverTimestamp();
      }

      if (newStatus === "cancelado") {
        patch.canceladoEm = admin.firestore.FieldValue.serverTimestamp();
      }

      await user.ref.set(patch, { merge: true });

      logger.info("Webhook Asaas processado", {
        event,
        subscriptionId,
        uid: user.uid,
        subscriptionStatus: newStatus,
      });

      res.status(200).send("OK");
    } catch (err) {
      logger.error("Webhook Asaas falhou ao atualizar Firestore", {
        event,
        subscriptionId,
        err: err?.message,
      });
      // 200 evita retentativas em massa; evento pode ser reconciliado manualmente
      res.status(200).send("OK");
    }
  }
);

module.exports = {
  createAsaasSubscription,
  webhookAsaas,
  cancelAsaasSubscription,
  getFatura,
};
