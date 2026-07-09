import { ref, getBlob } from "firebase/storage";
import { logChecklist } from "./checklistLogSanitizer.js";
import { storage } from "../firebase.js";
import {
  CHECKLIST_TIPOS_SERVICO,
  CHECKLIST_MOTIVOS,
  CHECKLIST_FOTO_SLOTS,
  CHECKLIST_ENTREGA_FOTO_SLOTS,
  resolveTipoVeiculo,
  derivarDivergenciasEntrega,
} from "./checklistService.js";

const IMAGE_FETCH_TIMEOUT_MS = 10000;

/** Extrai caminho do Storage a partir de URL HTTPS de download do Firebase. */
function storagePathFromHttpsUrl(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url);
    if (!u.hostname.includes("firebasestorage.googleapis.com")) return null;
    const oIdx = u.pathname.indexOf("/o/");
    if (oIdx < 0) return null;
    return decodeURIComponent(u.pathname.slice(oIdx + 3));
  } catch {
    return null;
  }
}

async function blobViaGetBlob(pathOrUrl, context) {
  const path =
    typeof pathOrUrl === "string" && pathOrUrl.startsWith("https://")
      ? storagePathFromHttpsUrl(pathOrUrl) || pathOrUrl
      : pathOrUrl;
  return Promise.race([
    getBlob(ref(storage, path)),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout 10s")), IMAGE_FETCH_TIMEOUT_MS)
    ),
  ]);
}

function wrapLines(doc, text, maxWidth) {
  return doc.splitTextToSize(String(text || "—"), maxWidth);
}

function stripEmojis(text) {
  return String(text || "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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
  if (lat == null || lng == null) return "GPS indisponivel";
  return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("FileReader falhou"));
    reader.readAsDataURL(blob);
  });
}

function loadImageElementFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível carregar a imagem."));
    };
    img.src = url;
  });
}

/** Aplica orientação EXIF e retorna data URL + dimensões reais para embutir no PDF sem distorção. */
async function preparePdfImage(blob) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      width = bitmap.width;
      height = bitmap.height;
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close?.();
    } catch {
      /* fallback */
    }
  }

  if (!width) {
    const img = await loadImageElementFromBlob(blob);
    width = img.naturalWidth || img.width;
    height = img.naturalHeight || img.height;
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0);
  }

  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.92),
    width,
    height,
  };
}

/** Encaixa imagem na célula do PDF mantendo proporção (contain — sem esticar nem vazar). */
function containFitInBox(iw, ih, boxX, boxY, boxW, boxH) {
  const scale = Math.min(boxW / iw, boxH / ih);
  const w = iw * scale;
  const h = ih * scale;
  return {
    x: boxX + (boxW - w) / 2,
    y: boxY + (boxH - h) / 2,
    w,
    h,
  };
}

function fotoCellMeta(doc, foto, fotoSlots, cellW) {
  const slotLabel = slotLabelForFoto(foto, fotoSlots);
  const stamp = `${foto.dataHora || "-"} - ${formatCoords(foto.lat, foto.lng)}`;
  const stampLines = wrapLines(doc, stamp, cellW);
  return { slotLabel, stampLines };
}

function drawFotoCell(doc, {
  meta,
  imgEntry,
  x,
  rowStartY,
  cellW,
  imgH,
}) {
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(220, 220, 220);
  doc.rect(x, rowStartY, cellW, imgH, "FD");

  if (imgEntry?.dataUrl) {
    try {
      const fit = containFitInBox(imgEntry.width, imgEntry.height, x, rowStartY, cellW, imgH);
      doc.addImage(imgEntry.dataUrl, "JPEG", fit.x, fit.y, fit.w, fit.h);
    } catch (err) {
      logChecklist("error", "[Checklist PDF] addImage falhou:", meta.slotLabel, err);
      drawPlaceholder(doc, x, rowStartY, cellW, imgH, "Sem foto");
    }
  } else {
    drawPlaceholder(doc, x, rowStartY, cellW, imgH, "Sem foto");
  }

  const labelY = rowStartY + imgH + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(stripEmojis(meta.slotLabel), x, labelY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  meta.stampLines.forEach((ln, i) => {
    doc.text(ln, x, labelY + 4 + i * 3.5);
  });

  return labelY + 4 + meta.stampLines.length * 3.5;
}

/**
 * Firebase Storage SDK (getBlob) -> orientação EXIF -> dataURL + dimensões (timeout 10s por imagem)
 */
async function fetchImageDataUrl(urlOrPath, context = "") {
  if (!urlOrPath) {
    logChecklist("warn", "[Checklist PDF] Imagem ausente:", context);
    return null;
  }

  try {
    let blob;
    if (typeof urlOrPath === "string" && urlOrPath.startsWith("https://")) {
      try {
        const res = await Promise.race([
          fetch(urlOrPath),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("timeout 10s")), IMAGE_FETCH_TIMEOUT_MS)
          ),
        ]);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        blob = await res.blob();
        logChecklist("log", "[Checklist PDF] Imagem OK via fetch:", context);
      } catch (fetchErr) {
        logChecklist(
          "warn",
          "[Checklist PDF] fetch falhou, fallback getBlob SDK:",
          context,
          fetchErr?.message || fetchErr
        );
        blob = await blobViaGetBlob(urlOrPath, context);
        logChecklist("log", "[Checklist PDF] Imagem OK via getBlob fallback:", context);
      }
    } else {
      blob = await blobViaGetBlob(urlOrPath, context);
      logChecklist("log", "[Checklist PDF] Imagem OK via getBlob path:", context);
    }
    return await preparePdfImage(blob);
  } catch (err) {
    logChecklist(
      "error",
      "[Checklist PDF] Falha ao carregar imagem (placeholder no PDF):",
      context,
      String(urlOrPath).slice(0, 80),
      err
    );
    return null;
  }
}

function slotLabelForFoto(foto, slots) {
  return slots.find((s) => s.id === foto.tipo)?.label || foto.label || foto.tipo;
}

async function preloadChecklistImages({
  fotosGrid,
  coleta,
  assinBlocks,
  entregaFotosGrid = [],
  entregaAssinBlocks = [],
  entrega,
  fotoSlots = CHECKLIST_FOTO_SLOTS,
  entregaFotoSlots = CHECKLIST_ENTREGA_FOTO_SLOTS,
}) {
  const tasks = [
    ...fotosGrid.map((foto) => {
      const slotLabel = slotLabelForFoto(foto, fotoSlots);
      return {
        mapKey: `foto:${foto.tipo}:${foto.url}`,
        promise: fetchImageDataUrl(foto.url, `foto:${slotLabel}`),
      };
    }),
    ...assinBlocks.map(({ key }) => {
      const assin = coleta?.assinaturas?.[key] || {};
      return {
        mapKey: `assinatura:${key}`,
        promise: fetchImageDataUrl(assin.imagemUrl, `assinatura:${key}`),
      };
    }),
    ...entregaFotosGrid.map((foto) => {
      const slotLabel = slotLabelForFoto(foto, entregaFotoSlots);
      return {
        mapKey: `entrega-foto:${foto.tipo}:${foto.url}`,
        promise: fetchImageDataUrl(foto.url, `entrega-foto:${slotLabel}`),
      };
    }),
    ...entregaAssinBlocks.map(({ key }) => {
      const assin = entrega?.assinaturas?.[key] || {};
      return {
        mapKey: `entrega-assinatura:${key}`,
        promise: fetchImageDataUrl(assin.imagemUrl, `entrega-assinatura:${key}`),
      };
    }),
  ];

  const settled = await Promise.allSettled(tasks.map((t) => t.promise));
  const cache = {};
  tasks.forEach((task, i) => {
    const result = settled[i];
    if (result.status === "fulfilled") {
      cache[task.mapKey] = result.value;
    } else {
      cache[task.mapKey] = null;
      logChecklist("error", "[Checklist PDF] Falha ao carregar imagem:", task.mapKey, result.reason);
    }
  });
  return cache;
}

function imageFormat(dataUrl) {
  if (!dataUrl) return "JPEG";
  if (String(dataUrl).startsWith("data:image/png")) return "PNG";
  return "JPEG";
}

function drawPlaceholder(doc, x, y, w, h, text) {
  doc.setDrawColor(200, 200, 200);
  doc.rect(x, y, w, h);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(text, x + 2, y + h / 2);
}

/**
 * @param {{ checklist: object, frete?: object, perfil?: object }} params
 */
export function buildChecklistColetaShareText({ checklist, frete, perfil }) {
  const { cliente, veiculo, origem, destino, coleta, numero } = checklist || {};
  const lines = [
    "LogRotas - Checklist de Veiculo (Coleta)",
    "",
    `No ${numero || "-"}`,
    `Prestador: ${perfil?.nome || "-"}${perfil?.tipo ? ` (${perfil.tipo})` : ""}`,
    `Telefone: ${perfil?.telefone || "-"}`,
    "",
    `Cliente: ${cliente?.nome || "-"}`,
    `Telefone cliente: ${cliente?.telefone || "-"}`,
    "",
    `Origem: ${origem?.endereco || frete?.origin || "-"}`,
    `Destino: ${destino?.endereco || frete?.dest || "-"}`,
    "",
    `Veiculo: ${veiculo?.placa || "-"} - ${[veiculo?.marca, veiculo?.modelo].filter(Boolean).join(" ") || "-"}`,
    `Cor: ${veiculo?.cor || "-"}`,
    `Servico: ${labelServico(checklist?.servico?.tipo)} - ${labelMotivo(checklist?.servico?.motivo)}`,
    "",
    `Fotos: ${(coleta?.fotos || []).length}`,
    `Coleta finalizada: ${coleta?.finalizadaEm ? "Sim" : "Nao"}`,
    "",
    "Documento gerado pelo LogRotas - logrotas.com.br",
  ];
  return lines.join("\n").trim();
}

function renderFotosGrid(doc, {
  fotosGrid,
  imageCache,
  fotoSlots,
  keyPrefix,
  margin,
  contentWidth,
  yRef,
  sectionLabel,
}) {
  const ensureSpace = (need = 12) => {
    if (yRef.y + need > 285) {
      doc.addPage();
      yRef.y = 16;
    }
  };

  const cellW = (contentWidth - 4) / 2;
  const imgH = 42;
  const colGap = 4;
  const rowGap = 8;
  const titleBlockH = 14;
  const firstRowH = imgH + 20;

  if (fotosGrid.length > 0 && yRef.y + titleBlockH + firstRowH > 285) {
    doc.addPage();
    yRef.y = 16;
  }

  ensureSpace(14);
  doc.setFillColor(238, 244, 255);
  doc.rect(margin, yRef.y - 5, contentWidth, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 58, 138);
  doc.text(stripEmojis(sectionLabel), margin + 2, yRef.y);
  doc.setTextColor(0, 0, 0);
  yRef.y += 10;

  for (let i = 0; i < fotosGrid.length; i += 2) {
    const left = fotosGrid[i];
    const right = fotosGrid[i + 1];
    const leftMeta = fotoCellMeta(doc, left, fotoSlots, cellW);
    const rightMeta = right ? fotoCellMeta(doc, right, fotoSlots, cellW) : null;

    const leftBottom = imgH + 8 + leftMeta.stampLines.length * 3.5;
    const rightBottom = rightMeta ? imgH + 8 + rightMeta.stampLines.length * 3.5 : 0;
    const rowH = Math.max(leftBottom, rightBottom) + rowGap;

    if (yRef.y + rowH > 285) {
      doc.addPage();
      yRef.y = 16;
    }

    const rowStartY = yRef.y;
    const leftEntry = imageCache[`${keyPrefix}:${left.tipo}:${left.url}`];
    drawFotoCell(doc, {
      meta: leftMeta,
      imgEntry: leftEntry,
      x: margin,
      rowStartY,
      cellW,
      imgH,
    });

    if (right && rightMeta) {
      const rightEntry = imageCache[`${keyPrefix}:${right.tipo}:${right.url}`];
      drawFotoCell(doc, {
        meta: rightMeta,
        imgEntry: rightEntry,
        x: margin + cellW + colGap,
        rowStartY,
        cellW,
        imgH,
      });
    }

    yRef.y = rowStartY + rowH;
  }

  if (fotosGrid.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    wrapLines(doc, "Nenhuma foto registrada.", contentWidth).forEach((ln) => {
      ensureSpace(5);
      doc.text(ln, margin, yRef.y);
      yRef.y += 5;
    });
  }
  yRef.y += 4;
}

function renderAssinaturasBlock(doc, {
  assinBlocks,
  assinaturas,
  imageCache,
  keyPrefix,
  margin,
  contentWidth,
  yRef,
  sectionLabel,
}) {
  const ensureSpace = (need = 12) => {
    if (yRef.y + need > 285) {
      doc.addPage();
      yRef.y = 16;
    }
  };

  const line = (text, bold = false) => {
    ensureSpace(6);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(10);
    wrapLines(doc, stripEmojis(text), contentWidth).forEach((ln) => {
      ensureSpace(5);
      doc.text(ln, margin, yRef.y);
      yRef.y += 5;
    });
  };

  ensureSpace(14);
  doc.setFillColor(238, 244, 255);
  doc.rect(margin, yRef.y - 5, contentWidth, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 58, 138);
  doc.text(stripEmojis(sectionLabel), margin + 2, yRef.y);
  doc.setTextColor(0, 0, 0);
  yRef.y += 10;

  for (const { key, titulo } of assinBlocks) {
    const assin = assinaturas?.[key] || {};
    ensureSpace(52);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(titulo, margin, yRef.y);
    yRef.y += 6;

    const sigEntry = imageCache[`${keyPrefix}:${key}`];
    const sigUrl = sigEntry?.dataUrl ?? sigEntry;
    ensureSpace(28);
    if (sigUrl) {
      try {
        doc.addImage(sigUrl, imageFormat(sigUrl), margin, yRef.y, 80, 22);
      } catch (err) {
        logChecklist("error", "[Checklist PDF] addImage assinatura falhou:", key, err);
        drawPlaceholder(doc, margin, yRef.y, 80, 22, "Sem assinatura");
      }
    } else {
      drawPlaceholder(doc, margin, yRef.y, 80, 22, "Sem assinatura");
    }
    yRef.y += 26;

    line(`Nome: ${assin.nome || "-"} - Doc: ${assin.documento || "-"}`);
    line(`${assin.dataHora || "-"} - ${formatCoords(assin.lat, assin.lng)}`);
    yRef.y += 4;
  }
}

/**
 * @param {{ checklist: object, frete?: object, perfil?: object, includeEntrega?: boolean, onlyEntrega?: boolean }} params
 */
export async function generateChecklistColetaPdf({
  checklist,
  frete,
  perfil,
  includeEntrega = false,
  onlyEntrega = false,
}) {
  const showColeta = !onlyEntrega;
  const showEntrega = includeEntrega || onlyEntrega;
  logChecklist("log", "[Checklist PDF] generateChecklistColetaPdf iniciado", {
    numero: checklist?.numero,
    includeEntrega,
    onlyEntrega,
    fotosColeta: checklist?.coleta?.fotos?.length || 0,
  });
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
    doc.text(stripEmojis(title), margin + 2, y);
    doc.setTextColor(0, 0, 0);
    y += 10;
  };

  const line = (text, bold = false) => {
    ensureSpace(6);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(10);
    wrapLines(doc, stripEmojis(text), contentWidth).forEach((ln) => {
      ensureSpace(5);
      doc.text(ln, margin, y);
      y += 5;
    });
  };

  const { cliente, veiculo, servico, origem, destino, coleta, entrega, numero } = checklist || {};

  const empresaNome = perfil?.empresa?.trim();
  if (empresaNome) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(30, 58, 138);
    wrapLines(doc, stripEmojis(empresaNome), contentWidth).forEach((ln) => {
      doc.text(ln, margin, y);
      y += 6;
    });
    y += 2;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(30, 58, 138);
  const tituloPdf = onlyEntrega
    ? "CHECKLIST DE VEICULO - ENTREGA"
    : includeEntrega
      ? "CHECKLIST DE VEICULO - COMPLETO"
      : "CHECKLIST DE VEICULO - COLETA";
  doc.text(tituloPdf, margin, y);
  y += 8;
  doc.setFontSize(12);
  doc.text(`No ${numero || "-"}`, margin, y);
  y += 10;
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  line(`Prestador: ${perfil?.nome || "-"}${perfil?.tipo ? ` - ${perfil.tipo}` : ""}`);
  line(`Telefone: ${perfil?.telefone || "-"}`);
  if (perfil?.veiculo) line(`Veiculo guincho: ${perfil.veiculo}`);
  y += 4;

  sectionTitle("ORIGEM E DESTINO");
  line(`Origem (coleta): ${origem?.endereco || frete?.origin || "-"}`);
  line(`Destino (entrega): ${destino?.endereco || frete?.dest || "-"}`);
  y += 3;

  sectionTitle("DADOS DO VEICULO REBOCADO");
  line(`Cliente: ${cliente?.nome || "-"} - Tel: ${cliente?.telefone || "-"}`);
  line(`Placa: ${veiculo?.placa || "-"}`);
  line(`Marca/Modelo: ${[veiculo?.marca, veiculo?.modelo].filter(Boolean).join(" ") || "-"}`);
  line(`Cor: ${veiculo?.cor || "-"}`);
  line(`Servico: ${labelServico(servico?.tipo)} - Motivo: ${labelMotivo(servico?.motivo)}`);
  y += 3;

  const fotos = coleta?.fotos || [];
  const obrigatorias = CHECKLIST_FOTO_SLOTS.filter((s) => s.obrigatoria).map((s) => s.id);
  const fotosGrid = showColeta
    ? [
        ...obrigatorias.map((id) => fotos.find((f) => f.tipo === id)).filter(Boolean),
        ...fotos.filter((f) => f.tipo === "avarias"),
      ]
    : [];

  const assinBlocks = showColeta
    ? [
        { key: "responsavel", titulo: "Responsavel no local" },
        { key: "prestador", titulo: "Prestador" },
      ]
    : [];

  if (showColeta) {
    sectionTitle("VISTORIA");
    (coleta?.perguntas || []).forEach((p, i) => {
      line(`${i + 1}. ${stripEmojis(p.texto)} - Resposta: ${labelResposta(p.resposta)}`);
    });
    y += 2;
    line("Acessorios:", true);
    (coleta?.acessorios || []).forEach((a) => {
      line(`- ${stripEmojis(a.item)}: ${labelAcessorio(a.estado)}`);
    });
    y += 2;
    line(
      resolveTipoVeiculo(veiculo) === "moto"
        ? `Pneus - Dianteiro: ${labelPneu(coleta?.pneus?.dianteiro)} - Traseiro: ${labelPneu(coleta?.pneus?.traseiro)}`
        : `Pneus - Dianteiro: ${labelPneu(coleta?.pneus?.dianteiro)} - Traseiro: ${labelPneu(coleta?.pneus?.traseiro)} - Estepe: ${labelPneu(coleta?.pneus?.estepe)}`
    );
    line(`Combustivel: ${labelCombustivel(coleta?.combustivel)}`);
    if (coleta?.observacoes?.trim()) {
      line("Observacoes de avarias:", true);
      line(coleta.observacoes);
    }
    y += 3;
  }

  const entregaFotos = entrega?.fotos || [];
  const entregaObrigatorias = CHECKLIST_ENTREGA_FOTO_SLOTS.filter((s) => s.obrigatoria).map((s) => s.id);
  const entregaFotosGrid = [
    ...entregaObrigatorias.map((id) => entregaFotos.find((f) => f.tipo === id)).filter(Boolean),
    ...entregaFotos.filter((f) => f.tipo === "avarias"),
  ];
  const entregaAssinBlocks = [
    { key: "recebedor", titulo: "Recebedor" },
    { key: "prestador", titulo: "Prestador" },
  ];

  const imageCache = await preloadChecklistImages({
    fotosGrid,
    coleta: showColeta ? coleta : null,
    assinBlocks,
    entregaFotosGrid: showEntrega ? entregaFotosGrid : [],
    entregaAssinBlocks: showEntrega ? entregaAssinBlocks : [],
    entrega: showEntrega ? entrega : null,
  });

  const yRef = { y };

  if (showColeta) {
    renderFotosGrid(doc, {
      fotosGrid,
      imageCache,
      fotoSlots: CHECKLIST_FOTO_SLOTS,
      keyPrefix: "foto",
      margin,
      contentWidth,
      yRef,
      sectionLabel: "FOTOS DA VISTORIA",
    });
    y = yRef.y;

    renderAssinaturasBlock(doc, {
      assinBlocks,
      assinaturas: coleta?.assinaturas,
      imageCache,
      keyPrefix: "assinatura",
      margin,
      contentWidth,
      yRef,
      sectionLabel: "ASSINATURAS",
    });
    y = yRef.y;
  }

  if (showEntrega) {
    yRef.y = y;
    renderFotosGrid(doc, {
      fotosGrid: entregaFotosGrid,
      imageCache,
      fotoSlots: CHECKLIST_ENTREGA_FOTO_SLOTS,
      keyPrefix: "entrega-foto",
      margin,
      contentWidth,
      yRef,
      sectionLabel: "ENTREGA - FOTOS",
    });
    y = yRef.y;

    sectionTitle("CONFERENCIA NA ENTREGA");
    const conf = entrega?.conferencia;
    if (conf?.conforme === true) {
      line("Veiculo conforme a coleta");
    } else if (conf?.conforme === false) {
      line("Houve divergencia na entrega:", true);
      derivarDivergenciasEntrega(coleta?.acessorios, conf).forEach((d) => {
        line(
          `- ${stripEmojis(d.item)}: coleta ${labelAcessorio(d.estadoColeta)} -> entrega ${labelAcessorio(d.estadoEntrega)}`
        );
      });
      if (conf.observacao?.trim()) {
        line("Observacao:", true);
        line(conf.observacao);
      }
    } else {
      line("Conferencia nao registrada");
    }
    y += 3;

    sectionTitle("QUEM RECEBEU");
    line(`Nome: ${entrega?.recebedor?.nome || "-"}`);
    line(`Documento: ${entrega?.recebedor?.documento || "-"}`);
    y += 3;

    yRef.y = y;
    renderAssinaturasBlock(doc, {
      assinBlocks: entregaAssinBlocks,
      assinaturas: entrega?.assinaturas,
      imageCache,
      keyPrefix: "entrega-assinatura",
      margin,
      contentWidth,
      yRef,
      sectionLabel: "ASSINATURAS DA ENTREGA",
    });
    y = yRef.y;
  }

  const totalPages = doc.getNumberOfPages();
  const geradoEm = new Date().toLocaleString("pt-BR");
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Gerado por LogRotas - logrotas.com.br - ${geradoEm}`, margin, 290);
    doc.text(`Pagina ${p} de ${totalPages}`, pageWidth - margin - 20, 290);
    doc.setTextColor(0, 0, 0);
  }

  const safeNum = (numero || "coleta").replace(/\//g, "-");
  const filename = onlyEntrega
    ? `checklist-entrega-${safeNum}.pdf`
    : includeEntrega
      ? `checklist-completo-${safeNum}.pdf`
      : `checklist-coleta-${safeNum}.pdf`;
  const blob = doc.output("blob");
  logChecklist("log", "[Checklist PDF] generateChecklistColetaPdf concluído", {
    filename,
    bytes: blob?.size,
    paginas: totalPages,
  });
  return { doc, blob, filename };
}

/**
 * @param {{ checklist: object, frete?: object, perfil?: object }} params
 */
export async function generateChecklistCompletoPdf(params) {
  return generateChecklistColetaPdf({ ...params, includeEntrega: true });
}

/**
 * @param {{ checklist: object, frete?: object, perfil?: object }} params
 */
export async function generateChecklistEntregaPdf(params) {
  return generateChecklistColetaPdf({ ...params, onlyEntrega: true });
}

/**
 * @param {{ checklist: object, frete?: object, perfil?: object }} params
 */
export function buildChecklistEntregaShareText({ checklist, frete, perfil }) {
  const { entrega, numero, destino, veiculo } = checklist || {};
  const conf = entrega?.conferencia;
  const lines = [
    `LogRotas - Checklist de Entrega ${numero || ""}`.trim(),
    `Prestador: ${perfil?.nome || "-"}`,
    `Destino: ${destino?.endereco || frete?.dest || "-"}`,
    `Veiculo: ${veiculo?.placa || "-"} ${[veiculo?.marca, veiculo?.modelo].filter(Boolean).join(" ")}`,
    "",
    `Recebedor: ${entrega?.recebedor?.nome || "-"}`,
    `Documento: ${entrega?.recebedor?.documento || "-"}`,
    `Conferencia: ${conf?.conforme === true ? "Conforme" : conf?.conforme === false ? "Com divergencia" : "-"}`,
    `Fotos entrega: ${(entrega?.fotos || []).length}`,
    `Entrega finalizada: ${entrega?.finalizadaEm ? "Sim" : "Nao"}`,
  ];
  return lines.join("\n").trim();
}

/**
 * @param {{ checklist: object, frete?: object, perfil?: object }} params
 */
export function shareChecklistEntregaWhatsApp(params) {
  const text = buildChecklistEntregaShareText(params);
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}

/**
 * @param {{ checklist: object, frete?: object, perfil?: object }} params
 */
export function buildChecklistCompletoShareText({ checklist, frete, perfil }) {
  const base = buildChecklistColetaShareText({ checklist, frete, perfil });
  const { entrega } = checklist || {};
  const conf = entrega?.conferencia;
  const lines = [
    base,
    "",
    "ENTREGA",
    `Recebedor: ${entrega?.recebedor?.nome || "-"}`,
    `Conferencia: ${conf?.conforme === true ? "Conforme" : conf?.conforme === false ? "Com divergencia" : "-"}`,
    `Fotos entrega: ${(entrega?.fotos || []).length}`,
    `Entrega finalizada: ${entrega?.finalizadaEm ? "Sim" : "Nao"}`,
  ];
  return lines.join("\n").trim();
}

/**
 * @param {{ checklist: object, frete?: object, perfil?: object }} params
 */
export function shareChecklistCompletoWhatsApp(params) {
  const text = buildChecklistCompletoShareText(params);
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
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
          title: "LogRotas - Checklist de Coleta",
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
