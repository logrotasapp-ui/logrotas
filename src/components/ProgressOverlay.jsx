import { useEffect, useState } from "react";

/**
 * V235 — Overlay de progresso do LogRotas (otimização + importação de endereços).
 * Spinner de 12 bolinhas alternando azul/laranja da marca, com rastro que esmaece.
 * - Fundo semitransparente bloqueia duplo clique.
 * - Timeout de segurança (60s) fecha o overlay via onTimeout (nunca fica preso).
 * - Transição suave de entrada/saída (fade).
 */

const AZUL = "#2563EB";     // azul primário (botões principais)
const LARANJA = "#F59E0B";  // laranja da marca (marcador do motorista/logo)
const DOTS = 12;
const SIZE = 66;            // diâmetro total (~60-70px)
const DOT = 8;              // diâmetro de cada bolinha
const TIMEOUT_MS = 60000;

const SPINNER_CSS = `
@keyframes lr-dot-pulse {
  0% { opacity: 1; transform: scale(1); }
  55% { opacity: 0.12; transform: scale(0.72); }
  100% { opacity: 0.12; transform: scale(0.72); }
}
@keyframes lr-overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
`;

function BrandDotSpinner() {
  const r = (SIZE - DOT) / 2;
  const dots = Array.from({ length: DOTS }, (_, i) => {
    const ang = (i / DOTS) * 2 * Math.PI - Math.PI / 2;
    return {
      left: SIZE / 2 + r * Math.cos(ang) - DOT / 2,
      top: SIZE / 2 + r * Math.sin(ang) - DOT / 2,
      color: i % 2 === 0 ? AZUL : LARANJA,
      delay: (i / DOTS) * 1.2,
    };
  });
  return (
    <div style={{ position: "relative", width: SIZE, height: SIZE }} aria-hidden="true">
      {dots.map((d, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: d.left,
            top: d.top,
            width: DOT,
            height: DOT,
            borderRadius: "50%",
            background: d.color,
            opacity: 0.12,
            animation: `lr-dot-pulse 1.2s linear ${d.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export default function ProgressOverlay({ visible, message, onTimeout }) {
  const [closing, setClosing] = useState(false);
  const [mounted, setMounted] = useState(visible);

  // fade-out suave: mantém montado por 250ms após visible=false
  useEffect(() => {
    if (visible) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const t = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // timeout de segurança: nunca deixar o overlay preso na tela
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => onTimeout?.(), TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [visible, onTimeout]);

  if (!mounted) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 950,
        background: "#1E3A8A55",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        opacity: closing ? 0 : 1,
        transition: "opacity 0.25s ease",
        animation: closing ? "none" : "lr-overlay-in 0.2s ease",
      }}
    >
      <style>{SPINNER_CSS}</style>
      <div
        style={{
          background: "#fff",
          borderRadius: 18,
          padding: "28px 30px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          maxWidth: 300,
          width: "100%",
          boxShadow: "0 10px 40px #1E3A8A33",
          textAlign: "center",
        }}
      >
        <BrandDotSpinner />
        <div
          style={{
            color: "#1E3A8A",
            fontWeight: 700,
            fontSize: 14,
            lineHeight: 1.45,
            fontFamily: "'Sora',sans-serif",
          }}
        >
          {message || "Processando…"}
        </div>
      </div>
    </div>
  );
}
