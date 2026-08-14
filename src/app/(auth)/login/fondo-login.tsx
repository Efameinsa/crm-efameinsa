// Fondo ambiental: resplandor granate + anillos concéntricos que retoman el
// motivo del isotipo (los arcos de la "e"). Puro CSS — sin JS, sin costo de
// hidratación en la página que ve todo el mundo antes de entrar a la app.
export function FondoLogin() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute left-1/2 top-1/2 size-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(126,18,16,0.35)_0%,rgba(126,18,16,0)_65%)]" />
      {[560, 420, 300].map((tam, i) => (
        <div
          key={tam}
          className="absolute left-1/2 top-1/2 rounded-full border border-[color-mix(in_srgb,var(--efameinsa-granate)_35%,transparent)] motion-safe:animate-[girar_60s_linear_infinite]"
          style={{
            width: tam,
            height: tam,
            marginLeft: -tam / 2,
            marginTop: -tam / 2,
            animationDirection: i % 2 === 0 ? "normal" : "reverse",
            animationDuration: `${60 + i * 20}s`,
            borderStyle: "dashed",
            opacity: 0.25 - i * 0.05,
          }}
        />
      ))}
      <style>{`
        @keyframes girar {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
