import Link from "next/link";
import { KeyRound } from "lucide-react";
import { RegistroNoDisponible } from "@/components/crm/registro-no-disponible";
import { PantallaCorreccion } from "@/components/crm/pantalla-correccion";
import { cargarContextoCotizador } from "@/lib/datos-cotizador";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/**
 * Corregir una cotización ya numerada, conservando el número (migración 0123).
 *
 * NO SE LLEGA ACÁ POR EL ENLACE: se llega desde el cuadro que pide el motivo y
 * el código. Esta ruta solo dibuja la pantalla si hay una autorización viva
 * para esta cotización y este comercial — y si no la hay, lo dice y ofrece
 * volver a pedirla, en vez de un error que no explica nada.
 */
export default async function CorregirPage({
  params,
}: {
  params: Promise<{ id: string; cotizacionId: string }>;
}) {
  const { id, cotizacionId } = await params;
  const resultado = await cargarContextoCotizador(id, cotizacionId, "correccion");
  const volverHref = `/comercial/oportunidades/${id}`;

  if (resultado.estado === "no-disponible") {
    return <RegistroNoDisponible volverHref={volverHref} volverTexto="Volver a la oportunidad" />;
  }

  if (resultado.estado === "sin-autorizacion" || resultado.estado === "cerrada") {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <KeyRound className="size-6" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-foreground">Esta corrección necesita autorización</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Corregir una cotización que ya salió con su número lo autoriza operaciones o gerencia, con un código de cuatro
          dígitos. Si ya lo pidió, puede que se haya vencido: son treinta minutos.
        </p>
        <div className="mt-6">
          <Button render={<Link href={`${volverHref}/cotizar/${cotizacionId}`}>Ir a la cotización y pedirla</Link>} />
        </div>
      </div>
    );
  }

  const { contexto } = resultado;
  if (!contexto.borrador || !contexto.correccion) {
    return <RegistroNoDisponible volverHref={volverHref} volverTexto="Volver a la oportunidad" />;
  }

  return (
    <PantallaCorreccion
      oportunidadId={contexto.oportunidadId}
      cuenta={contexto.cuenta}
      productos={contexto.productos}
      edicion={contexto.borrador}
      correccion={contexto.correccion}
    />
  );
}
