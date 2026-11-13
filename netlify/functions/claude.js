/**
 * Proxy server-side para a API Messages da Anthropic.
 * A chave fica só em process.env.ANTHROPIC_API_KEY (variável de servidor do Netlify).
 */

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Método não permitido. Use POST." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    return jsonResponse(500, {
      error: "ANTHROPIC_API_KEY não configurada no servidor.",
    });
  }

  let body = event.body || "";
  if (event.isBase64Encoded && body) {
    body = Buffer.from(body, "base64").toString("utf8");
  }

  try {
    const res = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": String(apiKey).trim(),
        "anthropic-version": "2023-06-01",
      },
      body,
    });

    const text = await res.text();
    return {
      statusCode: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/json",
      },
      body: text,
    };
  } catch {
    return jsonResponse(502, { error: "Falha ao contatar a Anthropic." });
  }
};
