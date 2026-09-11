import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * La pantalla de carga de la casa.
 *
 * Adaptada del diseño que trajo Santos el 11-09 (`efameinsa-loading-screen`):
 * el anillo doble en rojo girando en sentidos contrarios, el logotipo, la
 * barra que recorre y el «cargando» con sus tres puntos. Lo que se cambió y
 * por qué:
 *
 * · El logotipo es el del proyecto (`/logo-efameinsa-transparente.png`, la
 *   versión con fondo transparente del oficial, 60 KB), no el PNG de 1,4 MB que
 *   venía en la carpeta: una pantalla de carga que tarda en cargar su propio
 *   logo se contradice sola.
 * · Hay dos tamaños. `completa` ocupa la ventana entera y es para la entrada
 *   (login) y las rutas fuera del CRM. La compacta vive DENTRO del área de
 *   contenido, con la barra lateral ya pintada: al navegar entre pantallas no
 *   hay que tapar el menú, que es lo que le dice a la persona dónde está.
 * · Sin «Preparando experiencia»: acá se dice qué se está cargando, en las
 *   palabras del CRM.
 * · Las animaciones son solo CSS (`globals.css`, `carga-*`) y respetan
 *   `prefers-reduced-motion`, como el resto de la casa.
 *
 * Es un componente de servidor sin estado: Next lo pinta al instante desde
 * cada `loading.tsx` mientras arma la página de verdad.
 */
export function PantallaDeCarga({
  completa = false,
  mensaje = "Cargando",
}: {
  completa?: boolean;
  mensaje?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${mensaje}…`}
      className={cn(
        "carga-fondo relative grid place-items-center overflow-hidden",
        completa ? "min-h-screen" : "min-h-[60vh] rounded-xl",
      )}
    >
      <div className={cn("relative z-10 text-center", completa ? "w-[min(520px,calc(100vw-48px))]" : "w-[min(420px,100%)]")}>
        <div className={cn("carga-anillo relative mx-auto grid place-items-center", completa ? "size-28" : "size-20")} aria-hidden>
          <span className="carga-anillo-exterior" />
          <span className="carga-anillo-interior" />
        </div>

        <Image
          src="/logo-efameinsa-transparente.png"
          alt="Efameinsa"
          width={2345}
          height={381}
          priority
          // Versión con fondo transparente del logotipo oficial: el PNG de
          // siempre trae el blanco pintado y sobre el gris se veía el rectángulo.
          className={cn("mx-auto mt-4 h-auto", completa ? "w-[min(440px,100%)]" : "w-[min(300px,100%)]")}
        />

        <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.32em] text-muted-foreground">
          Ingeniería para su operación
        </p>

        <div className={cn("carga-barra mx-auto mt-6 h-[3px] overflow-hidden rounded-full", completa ? "w-full" : "w-4/5")} aria-hidden>
          <span className="carga-barra-luz" />
        </div>

        <p className="carga-estado mt-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {mensaje}
        </p>
      </div>
    </div>
  );
}
