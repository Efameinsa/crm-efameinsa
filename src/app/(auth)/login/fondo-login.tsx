// Fondo claro con acentos de marca: dos resplandores granate muy sutiles en
// las esquinas y los anillos concéntricos del isotipo (los arcos de la "e")
// desplazados a un costado, para no competir con la tarjeta del formulario.
// Puro CSS — sin JS, sin costo de hidratación en la página que ve todo el
// mundo antes de entrar a la app.
export function FondoLogin() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute -left-40 -top-40 size-[560px] rounded-full bg-[radial-gradient(circle,rgba(126,18,16,0.07)_0%,rgba(126,18,16,0)_70%)]" />
      <div className="absolute -bottom-52 -right-32 size-[620px] rounded-full bg-[radial-gradient(circle,rgba(126,18,16,0.06)_0%,rgba(126,18,16,0)_70%)]" />
      {[520, 380, 260].map((tam, i) => (
        <div
          key={tam}
          className="absolute rounded-full border border-[color-mix(in_srgb,var(--efameinsa-granate)_14%,transparent)] motion-safe:animate-[girar_70s_linear_infinite]"
          style={{
            width: tam,
            height: tam,
            right: -tam * 0.35,
            bottom: -tam * 0.35,
            animationDirection: i % 2 === 0 ? "normal" : "reverse",
            animationDuration: `${70 + i * 25}s`,
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
