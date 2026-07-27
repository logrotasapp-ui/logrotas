/**
 * Formatação de duração estimada e ETA de paradas (Otimizador / calculadoras).
 */

/** "~21 min" | "~1h 37min" | "~2h 05min" */
export function formatDurationApprox(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return null;
  const totalMin = Math.round(s / 60);
  if (totalMin < 60) return `~${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `~${h}h ${String(m).padStart(2, "0")}min`;
}

/** "~15:47" a partir de timestamp ms */
export function formatEtaHHMM(ms) {
  if (!Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `~${hh}:${mm}`;
}

/**
 * @param {Array<{ durationSeg?: number|null }|number|null>} paradasOuDurations
 *   array de durations em segundos (por leg: origem→parada1, parada1→parada2, …)
 * @param {number} horarioBaseMs
 * @returns {string[]} ETA "~HH:MM" ou "—" por parada
 */
export function calcularETAsParadas(paradasOuDurations, horarioBaseMs) {
  if (!Number.isFinite(horarioBaseMs) || !Array.isArray(paradasOuDurations)) {
    return [];
  }
  const etas = [];
  let acc = 0;
  let quebrado = false;
  for (let i = 0; i < paradasOuDurations.length; i++) {
    const raw = paradasOuDurations[i];
    const dur =
      raw != null && typeof raw === "object"
        ? Number(raw.durationSeg ?? raw.duration ?? raw.durationS)
        : Number(raw);
    if (quebrado || !Number.isFinite(dur) || dur < 0) {
      quebrado = true;
      etas.push("—");
      continue;
    }
    acc += dur;
    etas.push(formatEtaHHMM(horarioBaseMs + acc * 1000));
  }
  return etas;
}
