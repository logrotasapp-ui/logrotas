/**
 * Testes unitários do histórico de pagamentos no webhook Asaas.
 * Executar: node asaasPagamentos.test.js
 */
const assert = require("assert");
const {
  mapWebhookEventToTipoEvento,
  resolvePlanoLabel,
  buildPagamentoHistorico,
  resolvePagamentoDocId,
  PAGAMENTOS_COLLECTION,
} = require("./asaas");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  OK  ${name}`);
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
    process.exitCode = 1;
  }
}

console.log("asaasPagamentos.test.js\n");

test("coleção se chama pagamentos", () => {
  assert.strictEqual(PAGAMENTOS_COLLECTION, "pagamentos");
});

test("mapeia eventos Asaas para tipo legível", () => {
  assert.strictEqual(mapWebhookEventToTipoEvento("PAYMENT_CONFIRMED"), "confirmado");
  assert.strictEqual(mapWebhookEventToTipoEvento("PAYMENT_RECEIVED"), "recebido");
  assert.strictEqual(mapWebhookEventToTipoEvento("PAYMENT_OVERDUE"), "vencido");
  assert.strictEqual(mapWebhookEventToTipoEvento("PAYMENT_FAILED"), "falhou");
  assert.strictEqual(mapWebhookEventToTipoEvento("SUBSCRIPTION_DELETED"), "cancelado");
  assert.strictEqual(mapWebhookEventToTipoEvento("SUBSCRIPTION_CANCELED"), "cancelado");
  assert.strictEqual(mapWebhookEventToTipoEvento("PAYMENT_CREATED"), null);
});

test("resolve plano Frete/Completo a partir de planType", () => {
  assert.strictEqual(resolvePlanoLabel("FRETE"), "Frete");
  assert.strictEqual(resolvePlanoLabel("completo"), "Completo");
  assert.strictEqual(resolvePlanoLabel(""), null);
  assert.strictEqual(resolvePlanoLabel(null), null);
});

test("buildPagamentoHistorico — PAYMENT_CONFIRMED com plano do usuário", () => {
  const doc = buildPagamentoHistorico({
    uid: "user-abc",
    event: "PAYMENT_CONFIRMED",
    body: {
      id: "evt_test_001",
      event: "PAYMENT_CONFIRMED",
      dateCreated: "2026-07-25 12:00:00",
      payment: {
        id: "pay_123",
        value: 19.9,
        subscription: "sub_456",
      },
    },
    userData: { planType: "FRETE" },
  });

  assert.ok(doc);
  assert.strictEqual(doc.uid, "user-abc");
  assert.strictEqual(doc.valor, 19.9);
  assert.strictEqual(doc.tipoEvento, "confirmado");
  assert.strictEqual(doc.eventoAsaas, "PAYMENT_CONFIRMED");
  assert.strictEqual(doc.dataEvento, "2026-07-25 12:00:00");
  assert.strictEqual(doc.plano, "Frete");
  assert.strictEqual(doc.asaasPaymentId, "pay_123");
  assert.strictEqual(doc.asaasSubscriptionId, "sub_456");
  assert.strictEqual(doc.asaasEventId, "evt_test_001");
});

test("buildPagamentoHistorico — PAYMENT_OVERDUE plano Completo", () => {
  const doc = buildPagamentoHistorico({
    uid: "user-xyz",
    event: "PAYMENT_OVERDUE",
    body: {
      id: "evt_overdue_1",
      dateCreated: "2026-07-20 08:00:00",
      payment: { id: "pay_999", value: 29.9, subscription: "sub_999" },
    },
    userData: { planType: "COMPLETO" },
  });

  assert.strictEqual(doc.tipoEvento, "vencido");
  assert.strictEqual(doc.plano, "Completo");
  assert.strictEqual(doc.valor, 29.9);
});

test("buildPagamentoHistorico — evento sem mapeamento retorna null", () => {
  const doc = buildPagamentoHistorico({
    uid: "user-abc",
    event: "PAYMENT_CREATED",
    body: { payment: { id: "pay_1", value: 19.9 } },
    userData: { planType: "FRETE" },
  });
  assert.strictEqual(doc, null);
});

test("buildPagamentoHistorico — cancelamento de assinatura sem payment.value", () => {
  const doc = buildPagamentoHistorico({
    uid: "user-abc",
    event: "SUBSCRIPTION_CANCELED",
    body: {
      id: "evt_cancel_1",
      dateCreated: "2026-07-25 15:00:00",
      subscription: { id: "sub_456", value: 19.9 },
    },
    userData: { planType: "FRETE" },
  });

  assert.strictEqual(doc.tipoEvento, "cancelado");
  assert.strictEqual(doc.valor, 19.9);
  assert.strictEqual(doc.asaasSubscriptionId, "sub_456");
  assert.strictEqual(doc.plano, "Frete");
});

test("resolvePagamentoDocId — usa id do evento Asaas (idempotência)", () => {
  assert.strictEqual(
    resolvePagamentoDocId({ id: "evt_05b708f961d739ea&368604920" }, "PAYMENT_RECEIVED"),
    "evt_05b708f961d739ea&368604920"
  );
  assert.strictEqual(
    resolvePagamentoDocId({ id: "evt_a/b" }, "PAYMENT_RECEIVED"),
    "evt_a_b"
  );
  assert.strictEqual(
    resolvePagamentoDocId({ payment: { id: "pay_1" } }, "PAYMENT_CONFIRMED"),
    "pay_1_PAYMENT_CONFIRMED"
  );
  assert.strictEqual(resolvePagamentoDocId({}, "PAYMENT_CONFIRMED"), null);
});

if (process.exitCode) {
  console.log("\nAlguns testes falharam.");
} else {
  console.log(`\nTodos os ${passed} testes passaram.`);
}
