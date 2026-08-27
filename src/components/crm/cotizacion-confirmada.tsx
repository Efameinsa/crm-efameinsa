import Link from "next/link";
import { Check, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * La cotización ya tiene número y está cerrada.
 *
 * Se pinta en dos momentos que son el mismo para quien lo mira: justo después
 * de confirmar, y al volver a entrar a `/cotizar/<id>` de una que ya se
 * confirmó.
 *
 * LO SEGUNDO NO ES UN LUJO. `enviarCotizacion` revalida `/comercial`, y ese
 * refresco vuelve a pedirle esta ruta al servidor: sin esta pantalla, el
 * servidor respondía «esto ya no se puede mostrar» —porque el documento dejó de
 * ser borrador— y se comía el aviso de éxito justo cuando la comercial iba a
 * bajar el PDF. Que las dos vías terminen en la misma pantalla es lo que hace
 * que el refresco deje de importar.
 *
 * Y dice con todas las letras que el CRM no manda nada: confirmar le pone el
 * número; el documento sale por correo o WhatsApp, a mano (corrección de
 * Darwin, 27-08).
 */
export function CotizacionConfirmada({
  cotizacionId,
  codigo,
  serie,
  volverHref,
}: {
  cotizacionId: string;
  codigo: string | null;
  serie: string;
  volverHref: string;
}) {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#1E7F4F]/10 text-[#1E7F4F]">
        <Check className="size-6" />
      </div>
      <h1 className="mt-4 text-xl font-bold text-foreground">
        Cotización confirmada{codigo ? ` como ${codigo}` : ""}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ya tiene su número de la serie {serie} y el documento queda cerrado: para cambiarle algo hay que duplicarla.
      </p>
      <p className="mt-3 text-sm font-medium text-foreground">
        Falta lo último, y eso va por fuera del CRM: descargue el PDF y mándeselo al cliente por correo o WhatsApp.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <a
          href={`/api/cotizaciones/${cotizacionId}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <FileDown className="size-4" />
          Descargar el PDF para el cliente
        </a>
        <Button variant="outline" render={<Link href={volverHref}>Volver a la oportunidad</Link>} />
      </div>
    </div>
  );
}
