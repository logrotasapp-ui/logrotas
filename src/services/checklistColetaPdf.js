import {
  CHECKLIST_TIPOS_SERVICO,
  CHECKLIST_MOTIVOS,
  CHECKLIST_FOTO_SLOTS,
} from "./checklistService.js";

function wrapLines(doc, text, maxWidth) {
  return doc.splitTextToSize(String(text || "—"), maxWidth);
}

function labelServico(id) {
  return CHECKLIST_TIPOS_SERVICO.find((t) => t.id === id)?.label || id || "—";
}

function labelMotivo(id) {
  return CHECKLIST_MOTIVOS.find((m) => m.id === id)?.label || id || "—";
}

function labelAcessorio(estado) {
  const map = { bom: "Bom", ausente: "Ausente", quebrado: "Quebrado", na: "N/A" };
  return map[estado] || "—";
}

function labelResposta(r) {
  if (r === "sim") return "Sim";
  if (r === "nao") return "Não";
  return "—";
}

function labelPneu(v) {
  if (!v) return "—";
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function labelCombustivel(v) {
  if (!v) return "—";
  return v === "vazio" ? "Vazio" : v;
}

function formatCoords(lat, lng) {
  if (lat == null || lng == null) return "GPS indisponível";
  return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
}

async function fetchImageDataUrl(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function imageFormat(dataUrl) {
  if (!dataUrl) return "JPEG";
  if (String(dataUrl).startsWith("data:image/png")) return "PNG";
  return "JPEG";
}

/**
 * @param {{ checklist: object, frete?: object, perfil?: object }} params
 */
export function buildChecklistColetaShareText({ checklist, frete, perfil }) {
  const { cliente, veiculo, origem, destino, coleta, numero } = checklist || {};
  const lines = [
    "LogRotas — Checklist de Veículo (Coleta)",
    "",
    `Nº ${numero || "—"}`,
    `Prestador: ${perfil?.nome || "—"}${perfil?.tipo ? ` (${perfil.tipo})` : ""}`,
    `Telefone: ${perfil?.telefone || "—"}`,
    "",
    `Cliente: ${cliente?.nome || "—"}`,
    `Telefone cliente: ${cliente?.telefone || "—"}`,
    "",
    `Origem: ${origem?.endereco || frete?.origin || "—"}`,
    `Destino: ${destino?.endereco || frete?.dest || "—"}`,
    "",
    `Veículo: ${veiculo?.placa || "—"} — ${[veiculo?.marca, veiculo?.modelo].filter(Boolean).join(" ") || "—"}`,
    `Cor: ${veiculo?.cor || "—"}`,
    `Serviço: ${labelServico(checklist?.servico?.tipo)} · ${labelMotivo(checklist?.servico?.motivo)}`,
    "",
    `Fotos: ${(coleta?.fotos || []).length}`,
    `Coleta finalizada: ${coleta?.finalizadaEm ? "Sim" : "Não"}`,
    "",
    "_Documento gerado pelo LogRotas — logrotas.com.br_",
  ];
  return lines.join("\n").trim();
}

/**
 * @param {{ checklist: object, frete?: object, perfil?: object }} params
 */
export async function generateChecklistColetaPdf({ checklist, frete, perfil }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  let y = 16;

  const ensureSpace = (need = 12) => {
    if (y + need > 285) {
      doc.addPage();
      y = 16;
    }
  };

  const sectionTitle = (title) => {
    ensureSpace(14);
    doc.setFillColor(238, 244, 255);
    doc.rect(margin, y - 5, contentWidth, 9, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 58, 138);
    doc.text(title, margin + 2, y);
    doc.setTextColor(0, 0, 0);
    y += 10;
  };

  const line = (text, bold = false) => {
    ensureSpace(6);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(10);
    wrapLines(doc, text, contentWidth).forEach((ln) => {
      ensureSpace(5);
      doc.text(ln, margin, y);
      y += 5;
    });
  };

  const { cliente, veiculo, servico, origem, destino, coleta, numero } = checklist || {};

  // Cabeçalho
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(30, 58, 138);
  doc.text("CHECKLIST DE VEÍCULO — COLETA", margin, y);
  y += 8;
  doc.setFontSize(12);
  doc.text(`Nº ${numero || "—"}`, margin, y);
  y += 10;
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  line(`Prestador: ${perfil?.nome || "—"}${perfil?.tipo ? ` · ${perfil.tipo}` : ""}`);
  line(`Telefone: ${perfil?.telefone || "—"}`);
  if (perfil?.veiculo) line(`Veículo guincho: ${perfil.veiculo}`);
  y += 4;

  sectionTitle("ORIGEM E DESTINO");
  line(`Origem (coleta): ${origem?.endereco || frete?.origin || "—"}`);
  line(`Destino (entrega): ${destino?.endereco || frete?.dest || "—"}`);
  y += 3;

  sectionTitle("DADOS DO VEÍCULO REBOCADO");
  line(`Cliente: ${cliente?.nome || "—"} · Tel: ${cliente?.telefone || "—"}`);
  line(`Placa: ${veiculo?.placa || "—"}`);
  line(`Marca/Modelo: ${[veiculo?.marca, veiculo?.modelo].filter(Boolean).join(" ") || "—"}`);
  line(`Cor: ${veiculo?.cor || "—"}`);
  line(`Serviço: ${labelServico(servico?.tipo)} · Motivo: ${labelMotivo(servico?.motivo)}`);
  y += 3;

  sectionTitle("VISTORIA");
  (coleta?.perguntas || []).forEach((p, i) => {
    line(`${i + 1}. ${p.texto} → ${labelResposta(p.resposta)}`);
  });
  y += 2;
  line("Acessórios:", true);
  (coleta?.acessorios || []).forEach((a) => {
    line(`• ${a.item}: ${labelAcessorio(a.estado)}`);
  });
  y += 2;
  line(
    `Pneus — Dianteiro: ${labelPneu(coleta?.pneus?.dianteiro)} · Traseiro: ${labelPneu(coleta?.pneus?.traseiro)} · Estepe: ${labelPneu(coleta?.pneus?.estepe)}`
  );
  line(`Combustível: ${labelCombustivel(coleta?.combustivel)}`);
  if (coleta?.observacoes?.trim()) {
    line("Observações de avarias:", true);
    line(coleta.observacoes);
  }
  y += 3;

  sectionTitle("FOTOS DA VISTORIA");
  const fotos = coleta?.fotos || [];
  const obrigatorias = CHECKLIST_FOTO_SLOTS.filter((s) => s.obrigatoria).map((s) => s.id);
  const fotosGrid = [
    ...obrigatorias.map((id) => fotos.find((f) => f.tipo === id)).filter(Boolean),
    ...fotos.filter((f) => f.tipo === "avarias"),
  ];

  const cellW = (contentWidth - 4) / 2;
  const imgH = 42;
  let col = 0;
  let rowStartY = y;

  for (const foto of fotosGrid) {
    ensureSpace(imgH + 14);
    const x = margin + col * (cellW + 4);
    if (col === 0) rowStartY = y;

    const slotLabel = CHECKLIST_FOTO_SLOTS.find((s) => s.id === foto.tipo)?.label || foto.label || foto.tipo;
    const dataUrl = await fetchImageDataUrl(foto.url);

    if (dataUrl) {
      try {
        doc.addImage(dataUrl, imageFormat(dataUrl), x, rowStartY, cellW, imgH);
      } catch {
        doc.setDrawColor(200, 200, 200);
        doc.rect(x, rowStartY, cellW, imgH);
        doc.setFontSize(8);
        doc.text("Imagem indisponível", x + 2, rowStartY + imgH / 2);
      }
    } else {
      doc.setDrawColor(200, 200, 200);
      doc.rect(x, rowStartY, cellW, imgH);
      doc.setFontSize(8);
      doc.text("Sem foto", x + 2, rowStartY + imgH / 2);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(slotLabel, x, rowStartY + imgH + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const stamp = `${foto.dataHora || "—"} · ${formatCoords(foto.lat, foto.lng)}`;
    wrapLines(doc, stamp, cellW).forEach((ln, i) => {
      doc.text(ln, x, rowStartY + imgH + 8 + i * 3.5);
    });

    col += 1;
    if (col >= 2) {
      col = 0;
      y = rowStartY + imgH + 16;
    }
  }
  if (col === 1) y = rowStartY + imgH + 16;
  if (fotosGrid.length === 0) {
    line("Nenhuma foto registrada.");
  }
  y += 4;

  sectionTitle("ASSINATURAS");
  const assinBlocks = [
    { key: "responsavel", titulo: "Responsável no local" },
    { key: "prestador", titulo: "Prestador" },
  ];

  for (const { key, titulo } of assinBlocks) {
    const assin = coleta?.assinaturas?.[key] || {};
    ensureSpace(52);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(titulo, margin, y);
    y += 6;
    line(`Nome: ${assin.nome || "—"} · Doc: ${assin.documento || "—"}`);
    line(`${assin.dataHora || "—"} · ${formatCoords(assin.lat, assin.lng)}`);

    const sigUrl = await fetchImageDataUrl(assin.imagemUrl);
    if (sigUrl) {
      try {
        ensureSpace(28);
        doc.addImage(sigUrl, imageFormat(sigUrl), margin, y, 80, 22);
        y += 26;
      } catch {
        line("(Assinatura não carregada)");
      }
    } else {
      line("(Sem assinatura)");
    }
    y += 4;
  }

  // Rodapé em todas as páginas
  const totalPages = doc.getNumberOfPages();
  const geradoEm = new Date().toLocaleString("pt-BR");
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Gerado por LogRotas — logrotas.com.br · ${geradoEm}`, margin, 290);
    doc.text(`Página ${p} de ${totalPages}`, pageWidth - margin - 20, 290);
    doc.setTextColor(0, 0, 0);
  }

  const safeNum = (numero || "coleta").replace(/\//g, "-");
  const filename = `checklist-coleta-${safeNum}.pdf`;
  const blob = doc.output("blob");
  return { doc, blob, filename };
}

function triggerAnchorDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * @param {{ checklist: object, frete?: object, perfil?: object }} params
 */
export async function saveChecklistColetaPdf(params) {
  const { doc, blob, filename } = await generateChecklistColetaPdf(params);
  const pdfFile = new File([blob], filename, { type: "application/pdf" });

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      if (!navigator.canShare || navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          files: [pdfFile],
          title: "LogRotas — Checklist de Coleta",
          text: buildChecklistColetaShareText(params).slice(0, 500),
        });
        return { blob, filename, method: "share" };
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        return { blob, filename, method: "cancelled" };
      }
    }
  }

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  if (isMobile) {
    try {
      doc.save(filename);
      return { blob, filename, method: "jspdf-save" };
    } catch {
      /* fallback */
    }
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, "_blank");
    if (!opened) triggerAnchorDownload(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    return { blob, filename, method: "open-tab" };
  }

  const url = URL.createObjectURL(blob);
  triggerAnchorDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { blob, filename, method: "download" };
}

/**
 * @param {{ checklist: object, frete?: object, perfil?: object }} params
 */
export function shareChecklistColetaWhatsApp(params) {
  const text = buildChecklistColetaShareText(params);
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}
