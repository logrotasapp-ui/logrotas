function pacoteStatusLabel(status) {
  if (status === "entregue") return "Entregue";
  if (status === "nao_entregue") return "Não entregue";
  return "Pendente";
}

function statusLabel(status) {
  if (status === "entregue" || status === "concluida") return "Concluída";
  if (status === "nao_entregue") return "Não entregue";
  return "Pendente";
}

function wrapLines(doc, text, maxWidth) {
  return doc.splitTextToSize(String(text || "—"), maxWidth);
}

/**
 * @param {{
 *   motorista?: string,
 *   date?: string,
 *   hora?: string,
 *   total?: number,
 *   entregues?: number,
 *   naoEntregues?: number,
 *   paradas?: Array<{ endereco?: string, status?: string, motivo?: string|null, horario?: string }>,
 * }} data
 */
export function buildDeliveryReportText(data) {
  const lines = [
    "LogRotas — Relatório de Entregas",
    "",
    `Motorista: ${data.motorista || "—"}`,
    `Data: ${data.date || "—"}`,
    `Início: ${data.horaInicio || "—"}  Término: ${data.hora || "—"}`,
    "",
    "Resumo",
    `Total de paradas: ${data.total ?? data.paradas?.length ?? 0}`,
    `Entregues: ${data.entregues ?? 0}`,
    `Não entregues: ${data.naoEntregues ?? 0}`,
    "",
    "Detalhamento",
  ];

  (data.paradas || []).forEach((p, i) => {
    lines.push(`${i + 1}. ${p.endereco || "—"}`);
    const pacotes = Array.isArray(p.pacotes) ? p.pacotes : [];
    if (pacotes.length > 0) {
      pacotes.forEach((pk, j) => {
        const nome = (pk.nome || "").trim() || `Pacote ${j + 1}`;
        const comp = (pk.complemento || "").trim();
        const label = comp ? `${nome} (${comp})` : nome;
        const hora = pk.horario ? ` às ${pk.horario}` : "";
        lines.push(`   • ${label}: ${pacoteStatusLabel(pk.status)}${hora}`);
        if (pk.status === "nao_entregue" && pk.motivoNaoEntrega) {
          lines.push(`     Motivo: ${pk.motivoNaoEntrega}`);
        }
      });
    } else {
      lines.push(`   Status: ${statusLabel(p.status)}${p.horario ? ` (${p.horario})` : ""}`);
      if (p.status === "nao_entregue" && p.motivo) {
        lines.push(`   Motivo: ${p.motivo}`);
      }
    }
    lines.push("");
  });

  return lines.join("\n").trim();
}

function buildPdfDocument(data, jsPDF) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  let y = 18;

  const ensureSpace = (need = 12) => {
    if (y + need > 285) {
      doc.addPage();
      y = 18;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("LogRotas — Relatório de Entregas", margin, y);
  y += 9;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Motorista: ${data.motorista || "—"}`, margin, y);
  y += 6;
  doc.text(`Data: ${data.date || "—"}`, margin, y);
  y += 6;
  doc.text(
    `Início: ${data.horaInicio || "—"}    Término: ${data.hora || "—"}`,
    margin,
    y
  );
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.text("Resumo", margin, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.text(`Total de paradas: ${data.total ?? data.paradas?.length ?? 0}`, margin, y);
  y += 6;
  doc.text(`Entregues: ${data.entregues ?? 0}`, margin, y);
  y += 6;
  doc.text(`Não entregues: ${data.naoEntregues ?? 0}`, margin, y);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.text("Detalhamento", margin, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  (data.paradas || []).forEach((p, i) => {
    ensureSpace(24);
    doc.setFont("helvetica", "bold");
    doc.text(`Parada ${i + 1}`, margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    wrapLines(doc, p.endereco || "—", contentWidth).forEach((line) => {
      ensureSpace(5);
      doc.text(line, margin, y);
      y += 5;
    });
    const pacotes = Array.isArray(p.pacotes) ? p.pacotes : [];
    if (pacotes.length > 0) {
      pacotes.forEach((pk, j) => {
        ensureSpace(8);
        const nome = (pk.nome || "").trim() || `Pacote ${j + 1}`;
        const comp = (pk.complemento || "").trim();
        const label = comp ? `${nome} (${comp})` : nome;
        const hora = pk.horario ? ` às ${pk.horario}` : "";
        doc.text(`• ${label}: ${pacoteStatusLabel(pk.status)}${hora}`, margin + 2, y);
        y += 5;
        if (pk.status === "nao_entregue" && pk.motivoNaoEntrega) {
          wrapLines(doc, `Motivo: ${pk.motivoNaoEntrega}`, contentWidth - 4).forEach((line) => {
            ensureSpace(5);
            doc.text(line, margin + 4, y);
            y += 5;
          });
        }
      });
    } else {
      ensureSpace(5);
      doc.text(
        `Status: ${statusLabel(p.status)}${p.horario ? ` · ${p.horario}` : ""}`,
        margin,
        y
      );
      y += 5;
      if (p.status === "nao_entregue" && p.motivo) {
        wrapLines(doc, `Motivo: ${p.motivo}`, contentWidth).forEach((line) => {
          ensureSpace(5);
          doc.text(line, margin, y);
          y += 5;
        });
      }
    }
    y += 4;
  });

  return doc;
}

/**
 * @param {Parameters<typeof buildDeliveryReportText>[0]} data
 */
export async function generateDeliveryReportPdf(data) {
  const { jsPDF } = await import("jspdf");
  const safeDate = (data.date || "rota").replace(/\//g, "-");
  const filename = `logrotas-entregas-${safeDate}.pdf`;
  const doc = buildPdfDocument(data, jsPDF);
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
 * Salva/compartilha PDF — compatível com PWA Android (Share API + fallbacks).
 * @returns {Promise<{ blob: Blob, filename: string, method: string }>}
 */
export async function saveDeliveryReportPdf(data) {
  const { doc, blob, filename } = await generateDeliveryReportPdf(data);
  const pdfFile = new File([blob], filename, { type: "application/pdf" });

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      if (!navigator.canShare || navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          files: [pdfFile],
          title: "LogRotas — Relatório de Entregas",
          text: buildDeliveryReportText(data).slice(0, 500),
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
      /* fallback abaixo */
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

export function shareDeliveryReportWhatsApp(data) {
  window.open(`https://wa.me/?text=${encodeURIComponent(buildDeliveryReportText(data))}`, "_blank");
}

export function shareDeliveryReportEmail(data) {
  const subject = encodeURIComponent(`LogRotas — Entregas ${data.date || ""}`);
  const body = encodeURIComponent(buildDeliveryReportText(data));
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

/** @deprecated use saveDeliveryReportPdf */
export function downloadPdfBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  triggerAnchorDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function sharePdfFileViaSystem(blob, filename) {
  const file = new File([blob], filename, { type: "application/pdf" });
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    await navigator.share({ files: [file], title: filename });
    return true;
  }
  return false;
}
