/** URL da página de assinatura (site LogRotas). */
export const ASSINAR_URL = "https://logrotas.com.br/assinar";

const C = {
  navy: "#1E3A8A",
  navyLight: "#EEF4FF",
  orange: "#E85D04",
  orangeLight: "#FFF0E8",
  border: "#E2E8F0",
  text: "#1E293B",
  muted: "#64748B",
};

/**
 * Aviso reutilizável quando o plano FREE atinge o limite mensal.
 * @param {{ mensagem: string, onAssinar?: () => void, style?: object }} props
 */
export default function LimiteAtingido({ mensagem, onAssinar, style = {} }) {
  const handleAssinar = () => {
    if (onAssinar) {
      onAssinar();
      return;
    }
    window.open(ASSINAR_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${C.navyLight} 0%, ${C.orangeLight} 100%)`,
        border: `1.5px solid ${C.orange}44`,
        borderRadius: 14,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        boxShadow: "0 2px 10px #1E3A8A0C",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden>
          🔒
        </span>
        <p
          style={{
            margin: 0,
            color: C.text,
            fontSize: 14,
            lineHeight: 1.55,
            fontWeight: 600,
          }}
        >
          {mensagem}
        </p>
      </div>
      <button
        type="button"
        onClick={handleAssinar}
        style={{
          alignSelf: "stretch",
          padding: "13px 16px",
          background: `linear-gradient(135deg, ${C.navy}, ${C.orange})`,
          border: "none",
          borderRadius: 12,
          cursor: "pointer",
          color: "#fff",
          fontWeight: 700,
          fontSize: 14,
          fontFamily: "'Sora', sans-serif",
          boxShadow: `0 4px 14px ${C.orange}44`,
        }}
      >
        Assinar agora
      </button>
    </div>
  );
}
