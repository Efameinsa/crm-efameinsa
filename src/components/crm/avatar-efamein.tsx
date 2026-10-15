import { LogoEEfameinsa } from "@/components/crm/logo-e-efameinsa";
import { cn } from "@/lib/utils";

/**
 * LA CARA DE EFAMEIN (Santos, 15-10: «un logo de fondo oscuro con el mismo
 * estilo glass que estamos usando en el CRM, el isotipo blanco… y una pequeña
 * animación como si sonriera»).
 *
 * Vidrio oscuro del color de la barra lateral (#16171a), con un brillo arriba
 * y un resplandor granate abajo; la «e» de EFAMEINSA en blanco. La sonrisa:
 * cada tanto la «e» se ladea y el cuarto de arriba se levanta, como quien
 * sonríe; al pasar el mouse sonríe en el momento. Con «reducir movimiento»
 * del sistema, quieta.
 */
export function AvatarEfamein({
  className,
  logo = "size-[58%]",
  sonrie = true,
}: {
  /** Tamaño y forma: `size-8 rounded-full`, `size-16 rounded-2xl`… */
  className?: string;
  /** Tamaño de la «e» dentro del vidrio. */
  logo?: string;
  sonrie?: boolean;
}) {
  return (
    <span
      className={cn(
        "efamein-avatar relative isolate flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        "bg-[linear-gradient(145deg,#33353d_0%,#1d1e23_45%,#121316_100%)]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-8px_16px_-8px_rgba(126,18,16,0.55),0_6px_18px_-6px_rgba(18,19,22,0.55)]",
        "ring-1 ring-white/10",
        sonrie && "efamein-sonrie",
        className,
      )}
    >
      {/* El brillo del vidrio, arriba a la izquierda. */}
      <span className="pointer-events-none absolute inset-x-[12%] top-[6%] h-[42%] rounded-full bg-gradient-to-b from-white/25 to-transparent blur-[1px]" aria-hidden="true" />
      <LogoEEfameinsa claro className={cn("relative drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]", logo)} />
      <style>{`
        .efamein-avatar svg { transform-box: fill-box; }
        .efamein-avatar .efamein-c, .efamein-avatar .efamein-cuarto { transform-box: fill-box; transform-origin: center; }
        .efamein-sonrie svg { animation: efamein-ladeo 7s cubic-bezier(.34,1.56,.64,1) infinite; transform-origin: 50% 60%; }
        .efamein-sonrie .efamein-cuarto { animation: efamein-mejilla 7s cubic-bezier(.34,1.56,.64,1) infinite; transform-origin: 0% 100%; }
        .group:hover .efamein-sonrie svg, .efamein-sonrie:hover svg { animation: efamein-ladeo-ya .9s cubic-bezier(.34,1.56,.64,1) both; }
        .group:hover .efamein-sonrie .efamein-cuarto, .efamein-sonrie:hover .efamein-cuarto { animation: efamein-mejilla-ya .9s cubic-bezier(.34,1.56,.64,1) both; }
        @keyframes efamein-ladeo {
          0%, 78%, 100% { transform: rotate(0) scale(1); }
          83% { transform: rotate(-12deg) scale(1.08); }
          89% { transform: rotate(3deg) scale(1.02); }
          94% { transform: rotate(0) scale(1); }
        }
        @keyframes efamein-mejilla {
          0%, 78%, 100% { transform: none; }
          83% { transform: translate(4%, -9%) rotate(-10deg); }
          89% { transform: translate(0, -2%) rotate(-2deg); }
          94% { transform: none; }
        }
        @keyframes efamein-ladeo-ya { 0% { transform: none; } 40% { transform: rotate(-12deg) scale(1.08); } 70% { transform: rotate(3deg) scale(1.02); } 100% { transform: none; } }
        @keyframes efamein-mejilla-ya { 0% { transform: none; } 40% { transform: translate(4%, -9%) rotate(-10deg); } 70% { transform: translate(0, -2%) rotate(-2deg); } 100% { transform: none; } }
        @media (prefers-reduced-motion: reduce) {
          .efamein-sonrie svg, .efamein-sonrie .efamein-cuarto { animation: none !important; }
        }
      `}</style>
    </span>
  );
}
