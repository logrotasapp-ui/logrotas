/** Ícone “Minha localização” — mesmo visual do mapa expandido (Google Maps). */
export default function GoogleLocationIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="2.5" fill="#4285F4" />
      <circle cx="12" cy="12" r="7" fill="none" stroke="#4285F4" strokeWidth="2" />
      <path
        d="M12 2v3M12 19v3M2 12h3M19 12h3"
        stroke="#4285F4"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
