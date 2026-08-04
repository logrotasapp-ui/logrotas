/**
 * Limpeza completa de dados de usuário (Firestore + Storage).
 * Usado pela callable admin deleteUserComplete.
 */
const admin = require("firebase-admin");
const { logger } = require("firebase-functions");

const USERS_COLLECTION = "users";
const TOP_LEVEL_UID_COLLECTIONS = ["avaliacoes", "pagamentos", "cancelamentos"];
const BATCH_LIMIT = 500;

function getDb() {
  return admin.firestore();
}

/**
 * Apaga docs de uma coleção top-level onde campo uid == uid informado.
 * Pagina em lotes de até 500 (limite do batch).
 * Idempotente: zero docs = no-op.
 */
async function deleteTopLevelByUid(db, collectionName, uid) {
  let total = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await db
      .collection(collectionName)
      .where("uid", "==", uid)
      .limit(BATCH_LIMIT)
      .get();

    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;

    if (snap.size < BATCH_LIMIT) break;
  }

  logger.info("userCleanup: top-level limpa", {
    uid,
    collection: collectionName,
    deleted: total,
  });
  return total;
}

/**
 * Apaga perfil Firestore (doc + subcoleções), Storage e coleções top-level
 * que referenciam o uid. Não toca Auth.
 *
 * @param {string} uid
 * @returns {Promise<{ uid: string }>}
 */
async function deleteUserCompleteData(uid) {
  const safeUid = String(uid || "").trim();
  if (!safeUid) {
    throw new Error("uid inválido para limpeza.");
  }

  const db = getDb();

  // 1) Firestore: users/{uid} + subcoleções (recursiveDelete)
  logger.info("userCleanup: iniciando recursiveDelete users/{uid}", { uid: safeUid });
  try {
    await db.recursiveDelete(db.doc(`${USERS_COLLECTION}/${safeUid}`));
    logger.info("userCleanup: recursiveDelete concluído", { uid: safeUid });
  } catch (err) {
    // Doc inexistente / já limpo — segue
    const code = err?.code;
    const msg = String(err?.message || "");
    if (code === 5 || code === "not-found" || /not.?found/i.test(msg)) {
      logger.info("userCleanup: users/{uid} já ausente (ok)", { uid: safeUid });
    } else {
      throw err;
    }
  }

  // 2) Storage: prefixo users/{uid}/
  logger.info("userCleanup: apagando Storage prefix users/{uid}/", { uid: safeUid });
  try {
    const bucket = admin.storage().bucket();
    await bucket.deleteFiles({ prefix: `users/${safeUid}/` });
    logger.info("userCleanup: Storage limpo", { uid: safeUid });
  } catch (err) {
    const code = err?.code;
    const msg = String(err?.message || "");
    // Prefixo vazio / sem arquivos — treat as sucesso
    if (
      code === 404 ||
      code === "ENOENT" ||
      /no such object|not found|does not exist/i.test(msg)
    ) {
      logger.info("userCleanup: Storage sem arquivos (ok)", { uid: safeUid });
    } else {
      throw err;
    }
  }

  // 3) Top-level por campo uid
  for (const col of TOP_LEVEL_UID_COLLECTIONS) {
    await deleteTopLevelByUid(db, col, safeUid);
  }

  logger.info("userCleanup: limpeza completa finalizada", { uid: safeUid });
  return { uid: safeUid };
}

module.exports = {
  deleteUserCompleteData,
  TOP_LEVEL_UID_COLLECTIONS,
};
