import { jsPDF } from "jspdf";

function statusLabel(status) {
  if (status === "entregue") return "Entregue";
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
    `Data: ${data.date || "—"}  Hora: ${data.hora || "—"}`,
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
    lines.push(`   Status: ${statusLabel(p.status)}${p.horario ? ` (${p.horario})` : ""}`);
    if (p.status === "nao_entregue" && p.motivo) {
      lines.push(`   Motivo: ${p.motivo}`);
    }
    lines.push("");
  });

  return lines.join("\n").trim();
}

/**
 * @param {Parameters<typeof buildDeliveryReportText>[0]} data
 */
export async function generateDeliveryReportPdf(data) {
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
  doc.text(`Data: ${data.date || "—"}    Hora: ${data.hora || "—"}`, margin, y);
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
    y += 4;
  });

  const safeDate = (data.date || "rota").replace(/\//g, "-");
  const filename = `logrotas-entregas-${safeDate}.pdf`;
  return { blob: doc.output("blob"), filename };
}

export function downloadPdfBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function shareDeliveryReportWhatsApp(data) {
  window.open(`https://wa.me/?text=${encodeURIComponent(buildDeliveryReportText(data))}`, "_blank");
}

export function shareDeliveryReportEmail(data) {
  const subject = encodeURIComponent(`LogRotas — Entregas ${data.date || ""}`);
  const body = encodeURIComponent(buildDeliveryReportText(data));
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}
