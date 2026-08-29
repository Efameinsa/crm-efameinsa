import Link from "next/link";
import { Check, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CorregirCotizacionBoton } from "@/components/crm/corregir-cotizacion-boton";

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
 *
 * ACÁ NO ESTÁ «DUPLICAR», y se quitó a propósito el 29-08. Era el sustituto de
 * corregir —«para cambiarle algo hay que duplicarla»— y en esta pantalla se
 * leía como «así se arreglan los errores», que es justo lo que no hay que hacer
 * cuando el número ya salió al banco. Duplicar sigue existiendo en la lista de
 * la oportunidad, donde su trabajo es otro: arrancar una cotización nueva
 * reusando los equipos de una anterior.
 */
export function CotizacionConfirmada({
  cotizacionId,
  codigo,
  serie,
  volverHref,
  version = 1,
}: {
  cotizacionId: string;
  codigo: string | null;
  serie: string;
  volverHref: string;
  /** Cuántas veces salió este número; 1 = como se emitió (migración 0123). */
  version?: number;
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
        Ya tiene su número de la serie {serie} y el documento queda cerrado: corregirlo necesita autorización de
        operaciones o gerencia.
      </p>
      {version > 1 && (
        <p className="mt-2 text-xs font-medium text-primary">
          Va por la versión {version}: se corrigió {version - 1} {version === 2 ? "vez" : "veces"} conservando el mismo
          número.
        </p>
      )}
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
        {/* En segundo plano, con contorno: lo normal es bajar el PDF y
            mandarlo. Corregir es la excepción —5 a 10 veces al año— y el texto
            de arriba ya avisó que cuesta una autorización. */}
        <CorregirCotizacionBoton cotizacionId={cotizacionId} codigo={codigo} volverHref={volverHref} />
      </div>
      <div className="mt-4">
        <Button variant="ghost" size="sm" render={<Link href={volverHref}>Volver a la oportunidad</Link>} />
      </div>
    </div>
  );
}
