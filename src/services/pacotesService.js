/**
 * V256 — entrega por pacote individual dentro de cada parada.
 * Migração na leitura para paradas antigas sem pacotes[].
 */

export function newPacoteId() {
  return `pkg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createPacote(nome = "") {
  return {
    id: newPacoteId(),
    nome: nome || "",
    status: "pendente",
    motivoNaoEntrega: "",
  };
}

export function normalizePacote(p) {
  if (!p || typeof p !== "object") return createPacote("");
  return {
    id: p.id || newPacoteId(),
    nome: p.nome || "",
    status:
      p.status === "entregue" || p.status === "nao_entregue" ? p.status : "pendente",
    motivoNaoEntrega: p.motivoNaoEntrega || "",
  };
}

export function deriveParadaStatus(pacotes) {
  const list = pacotes || [];
  if (!list.length) return "pendente";
  if (list.some((pk) => pk.status === "pendente")) return "pendente";
  return "concluida";
}

export function deriveParadaFromPacotes(parada) {
  const pacotes = (parada.pacotes || []).map((p) => normalizePacote(p));
  const status = deriveParadaStatus(pacotes);
  const allDone = status === "concluida";
  const allEntregue = allDone && pacotes.every((p) => p.status === "entregue");

  let motivo = null;
  if (allDone) {
    const falhas = pacotes.filter((p) => p.status === "nao_entregue");
    if (falhas.length === 1) {
      motivo = falhas[0].motivoNaoEntrega || null;
    } else if (falhas.length > 1) {
      motivo =
        falhas
          .map((p, idx) => {
            const nome = pacoteDisplayName(p, pacotes.indexOf(p));
            return `${nome}: ${p.motivoNaoEntrega || "—"}`;
          })
          .join("; ") || null;
    }
  } else {
    motivo = parada.motivo || null;
  }

  return {
    ...parada,
    pacotes,
    status,
    entregue: allEntregue,
    motivo,
  };
}

/** Migra parada antiga (status único ou pacotes numérico) para pacotes[]. */
export function migrateParada(parada) {
  if (!parada) return parada;

  if (
    Array.isArray(parada.pacotes) &&
    parada.pacotes.length > 0 &&
    typeof parada.pacotes[0] === "object"
  ) {
    return deriveParadaFromPacotes({ ...parada, pacotes: parada.pacotes });
  }

  const legacyCount = Number(parada.pacotes);
  const oldStatus = parada.status || (parada.entregue ? "entregue" : "pendente");
  const pkgStatus =
    oldStatus === "pendente"
      ? "pendente"
      : oldStatus === "nao_entregue"
        ? "nao_entregue"
        : "entregue";
  const motivo = parada.motivo || "";
  const count = legacyCount > 1 ? legacyCount : 1;

  const pacotes = Array.from({ length: count }, () => ({
    id: newPacoteId(),
    nome: "",
    status: pkgStatus,
    motivoNaoEntrega: pkgStatus === "nao_entregue" ? motivo : "",
  }));

  const { pacotes: _legacyPacotes, ...rest } = parada;
  return deriveParadaFromPacotes({ ...rest, pacotes });
}

export function migrateParadas(paradas) {
  return (paradas || []).map(migrateParada);
}

export function getParadaStatus(p) {
  const m = migrateParada(p);
  return m.status || "pendente";
}

export function pacoteDisplayName(pacote, index) {
  const nome = (pacote?.nome || "").trim();
  return nome || `Pacote ${index + 1}`;
}

export function countPacotes(parada) {
  return migrateParada(parada).pacotes?.length || 1;
}

export function totalPacotesEmParadas(paradas) {
  return migrateParadas(paradas).reduce((sum, p) => sum + countPacotes(p), 0);
}

export function pacotesResumo(parada) {
  const list = migrateParada(parada).pacotes || [];
  return {
    total: list.length,
    entregues: list.filter((x) => x.status === "entregue").length,
    pendentes: list.filter((x) => x.status === "pendente").length,
    naoEntregues: list.filter((x) => x.status === "nao_entregue").length,
  };
}

export function resumoPacotesLabel(parada) {
  const r = pacotesResumo(parada);
  if (r.total <= 1) return "1 pacote";
  const parts = [];
  if (r.entregues) parts.push(`${r.entregues} entregue${r.entregues !== 1 ? "s" : ""}`);
  if (r.pendentes) parts.push(`${r.pendentes} pendente${r.pendentes !== 1 ? "s" : ""}`);
  if (r.naoEntregues) {
    parts.push(`${r.naoEntregues} não entregue${r.naoEntregues !== 1 ? "s" : ""}`);
  }
  return `${r.total} pacotes${parts.length ? ` • ${parts.join(", ")}` : ""}`;
}

export function adicionarPacoteNaParada(parada, nome = "") {
  const m = migrateParada(parada);
  const pacotes = [...m.pacotes, createPacote(nome)];
  return deriveParadaFromPacotes({ ...m, pacotes, status: "pendente" });
}

export function criarParadaNova({ id, endereco, coords, nomes = [""] }) {
  const listaNomes = nomes.length ? nomes : [""];
  const pacotes = listaNomes.map((nome) => createPacote(nome || ""));
  return deriveParadaFromPacotes({
    id: id || Date.now(),
    endereco,
    coords,
    pacotes,
  });
}

export function marcarPacoteNaParada(parada, pacoteId, status, motivoNaoEntrega = "", ts = null) {
  const m = migrateParada(parada);
  const pacotes = m.pacotes.map((pk) => {
    if (pk.id !== pacoteId) return pk;
    return {
      ...pk,
      status,
      motivoNaoEntrega: status === "nao_entregue" ? motivoNaoEntrega || "" : "",
    };
  });
  const next = deriveParadaFromPacotes({ ...m, pacotes });
  if (getParadaStatus(next) === "concluida" && ts) {
    return { ...next, horario: ts.horario, data: ts.data };
  }
  return next;
}

export function countPacotesStats(paradas) {
  const list = migrateParadas(paradas);
  let entregues = 0;
  let naoEntregues = 0;
  let pendentes = 0;
  for (const p of list) {
    for (const pk of p.pacotes || []) {
      if (pk.status === "entregue") entregues++;
      else if (pk.status === "nao_entregue") naoEntregues++;
      else pendentes++;
    }
  }
  return { entregues, naoEntregues, pendentes };
}

export function sanitizePacoteForFirestore(p) {
  return {
    id: p.id || newPacoteId(),
    nome: p.nome || "",
    status: p.status || "pendente",
    motivoNaoEntrega: p.motivoNaoEntrega || "",
  };
}

export function sanitizeParadaForFirestore(p) {
  const m = migrateParada(p);
  return {
    endereco: m.endereco || "",
    status: getParadaStatus(m),
    motivo: m.motivo || null,
    horario: m.horario || "",
    data: m.data || "",
    coords: Array.isArray(m.coords) && m.coords.length >= 2 ? m.coords : null,
    pacotes: (m.pacotes || []).map(sanitizePacoteForFirestore),
  };
}

export function logPacotes(msg, data) {
  if (typeof console !== "undefined") {
    console.log(`[Pacotes] ${msg}`, data !== undefined ? data : "");
  }
}

/** V257 — remove paradas com id duplicado (primeira ocorrência vence). */
export function dedupParadasPorId(paradas) {
  const seen = new Set();
  const out = [];
  let removidas = 0;
  for (const p of migrateParadas(paradas || [])) {
    const id = p?.id;
    if (id == null) {
      out.push(p);
      continue;
    }
    if (seen.has(id)) {
      removidas++;
      continue;
    }
    seen.add(id);
    out.push(p);
  }
  if (removidas > 0) {
    if (typeof console !== "undefined") {
      console.log("[Lista] dedup paradas", { removidas, total: out.length });
    }
  }
  return out;
}
