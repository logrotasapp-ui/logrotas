// V379 — Relatório financeiro mensal em PDF (tela Financeiro → "Exportar PDF do mês").
// Recebe os números JÁ calculados pela tela, para o PDF sempre bater com o app.
import { formatMoeda, formatKm } from "./formatUtils.js";
import { sharePdfFileViaSystem } from "./deliveryReportPdf.js";

const NAVY = [30, 58, 138];
const TEXT = [31, 41, 55];
const MUTED = [107, 114, 128];
const RED = [185, 28, 28];
const GREEN = [21, 128, 61];
const LINE = [229, 231, 235];
const ZEBRA = [243, 246, 252];

const money = (v) => formatMoeda(Number(v) || 0);
const km = (v) => `${formatKm(Number(v) || 0)} km`;

/**
 * @param {{
 *   mesLabel: string, ano: number, mesNum: number,
 *   resumo: { receita:number, custo:number, manutencoes:number, despesas:number, saldo:number, km:number, receitaKm:number, margemPct:number|null },
 *   custos: { combustivel:number, pedagio:number, arla:number, desgaste:number, semDetalhamento:number },
 *   ganhos: Array<{ servico:string, qtd:number, km:number, receita:number, custo:number, liquido:number }>,
 *   lancamentos: Array<{ data:string, servico:string, km:number, valor:number, custo:number, lucro:number }>,
 * }} d
 */
function buildDoc(d, jsPDF) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const M = 14;
  const W = doc.internal.pageSize.getWidth();
  const CW = W - M * 2;
  const BOTTOM = 282;
  let y = 18;

  const ensure = (need) => {
    if (y + need > BOTTOM) {
      doc.addPage();
      y = 18;
      return true;
    }
    return false;
  };
  const font = (size, style = "normal", color = TEXT) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const section = (title) => {
    ensure(16);
    y += 4;
    font(12, "bold", NAVY);
    doc.text(title, M, y);
    y += 2;
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.4);
    doc.line(M, y, M + CW, y);
    y += 6;
  };
  const row = (label, value, opts = {}) => {
    ensure(7);
    font(10, opts.bold ? "bold" : "normal", opts.color || TEXT);
    doc.text(label, M + 2, y);
    doc.text(value, M + CW - 2, y, { align: "right" });
    y += 6;
  };

  // Tabela simples: cols = [{ title, w, align }]
  const table = (cols, rows, totalRow) => {
    const xs = [];
    let x = M;
    cols.forEach((c) => { xs.push(x); x += c.w; });
    const cellX = (i) => (cols[i].align === "right" ? xs[i] + cols[i].w - 2 : xs[i] + 2);
    const header = () => {
      doc.setFillColor(...NAVY);
      doc.rect(M, y - 4.5, CW, 7, "F");
      font(9, "bold", [255, 255, 255]);
      cols.forEach((c, i) => doc.text(c.title, cellX(i), y, { align: c.align === "right" ? "right" : "left" }));
      y += 7;
    };
    ensure(14);
    header();
    rows.forEach((r, idx) => {
      if (ensure(7)) header();
      if (idx % 2 === 1) {
        doc.setFillColor(...ZEBRA);
        doc.rect(M, y - 4.5, CW, 6.5, "F");
      }
      font(9, "normal", TEXT);
      r.forEach((cell, i) => {
        const txt = doc.splitTextToSize(String(cell ?? "—"), cols[i].w - 3)[0];
        doc.text(txt, cellX(i), y, { align: cols[i].align === "right" ? "right" : "left" });
      });
      y += 6.5;
    });
    if (totalRow) {
      if (ensure(8)) header();
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.3);
      doc.line(M, y - 4.5, M + CW, y - 4.5);
      font(9, "bold", TEXT);
      totalRow.forEach((cell, i) => {
        if (cell == null) return;
        doc.text(String(cell), cellX(i), y, { align: cols[i].align === "right" ? "right" : "left" });
      });
      y += 7;
    }
  };

  // ── Cabeçalho ──
  font(17, "bold", NAVY);
  doc.text("LogRotas — Relatório financeiro", M, y);
  y += 7;
  font(13, "bold", TEXT);
  doc.text(`${d.mesLabel} ${d.ano}`, M, y);
  font(9, "normal", MUTED);
  doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, M + CW, y, { align: "right" });
  y += 4;

  // ── Resumo ──
  const r = d.resumo;
  section("Resumo do mês");
  row("Receita bruta", money(r.receita));
  row("Custo das viagens", `- ${money(r.custo)}`, { color: RED });
  if (r.manutencoes > 0) row("Manutenções", `- ${money(r.manutencoes)}`, { color: RED });
  if (r.despesas > 0) row("Despesas", `- ${money(r.despesas)}`, { color: RED });
  row("Saldo líquido", `${r.saldo < 0 ? "- " : ""}${money(Math.abs(r.saldo))}`, { bold: true, color: r.saldo < 0 ? RED : GREEN });
  row("Km rodados", km(r.km));
  row("Receita por km", r.km > 0 ? `${money(r.receitaKm)}/km` : "—");
  if (r.margemPct != null) row("Margem", `${r.margemPct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);

  // ── Custos por tipo ──
  const c = d.custos;
  const pct = (v) => (r.custo > 0 ? `  (${Math.round((v / r.custo) * 100)}%)` : "");
  section("Custo das viagens por tipo");
  row("Combustível", `${money(c.combustivel)}${pct(c.combustivel)}`);
  row("Pedágio / outros", `${money(c.pedagio)}${pct(c.pedagio)}`);
  if (c.arla > 0) row("ARLA 32", `${money(c.arla)}${pct(c.arla)}`);
  row("Desgaste do veículo (reserva)", `${money(c.desgaste)}${pct(c.desgaste)}`);
  if (c.semDetalhamento >= 0.01) row("Sem detalhamento", `${money(c.semDetalhamento)}${pct(c.semDetalhamento)}`);
  row("Total", money(r.custo), { bold: true, color: RED });

  // ── Ganhos por serviço ──
  if (d.ganhos.length) {
    section("Ganhos por serviço");
    table(
      [
        { title: "Serviço", w: 52 },
        { title: "Qtd", w: 14, align: "right" },
        { title: "Km", w: 26, align: "right" },
        { title: "Receita", w: 30, align: "right" },
        { title: "Custo", w: 30, align: "right" },
        { title: "Líquido", w: CW - 152, align: "right" },
      ],
      d.ganhos.map((g) => [g.servico, g.qtd, km(g.km), money(g.receita), money(g.custo), money(g.liquido)]),
    );
  }

  // ── Lançamentos ──
  section(`Lançamentos (${d.lancamentos.length})`);
  const tot = d.lancamentos.reduce(
    (a, l) => ({ km: a.km + (Number(l.km) || 0), valor: a.valor + (Number(l.valor) || 0), custo: a.custo + (Number(l.custo) || 0), lucro: a.lucro + (Number(l.lucro) || 0) }),
    { km: 0, valor: 0, custo: 0, lucro: 0 },
  );
  table(
    [
      { title: "Data", w: 22 },
      { title: "Serviço", w: 48 },
      { title: "Km", w: 22, align: "right" },
      { title: "Recebido", w: 30, align: "right" },
      { title: "Custo", w: 28, align: "right" },
      { title: "Lucro", w: CW - 150, align: "right" },
    ],
    d.lancamentos.map((l) => [l.data, l.servico, km(l.km), money(l.valor), money(l.custo), money(l.lucro)]),
    ["Total", null, km(tot.km), money(tot.valor), money(tot.custo), money(tot.lucro)],
  );

  // ── Rodapé com paginação ──
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    font(8, "normal", MUTED);
    doc.text(`LogRotas · ${d.mesLabel} ${d.ano}`, M, 292);
    doc.text(`Página ${i} de ${pages}`, M + CW, 292, { align: "right" });
  }
  return doc;
}

/** Gera e salva/compartilha o PDF (mesmo fluxo do relatório de entregas). */
export async function saveFinanceiroPdf(d) {
  const { jsPDF } = await import("jspdf");
  const doc = buildDoc(d, jsPDF);
  const filename = `logrotas-financeiro-${d.ano}-${String(d.mesNum).padStart(2, "0")}.pdf`;
  const blob = doc.output("blob");
  try {
    if (await sharePdfFileViaSystem(blob, filename)) return { method: "share" };
  } catch (err) {
    if (err?.name === "AbortError") return { method: "cancelled" };
  }
  try {
    doc.save(filename);
    return { method: "save" };
  } catch {
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    return { method: "open-tab" };
  }
}
