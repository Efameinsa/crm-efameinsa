import { RegistroNoDisponible } from "@/components/crm/registro-no-disponible";
import { PantallaCotizador } from "@/components/crm/pantalla-cotizador";
import { CotizacionConfirmada } from "@/components/crm/cotizacion-confirmada";
import { cargarContextoCotizador } from "@/lib/datos-cotizador";

export const dynamic = "force-dynamic";

/**
 * El borrador que ya existe: se entra acá desde «Continuar y confirmar» y desde
 * el propio autoguardado, que reescribe la URL en cuanto crea la fila.
 *
 * Tres finales: se edita, ya está confirmada (con su número y su PDF), o el
 * enlace apunta a algo que no es de esta oportunidad.
 */
export default async function CorregirCotizacionPage({
  params,
}: {
  params: Promise<{ id: string; cotizacionId: string }>;
}) {
  const { id, cotizacionId } = await params;
  const resultado = await cargarContextoCotizador(id, cotizacionId);
  const volverHref = `/comercial/oportunidades/${id}`;

  if (resultado.estado === "no-disponible") {
    return <RegistroNoDisponible volverHref={volverHref} volverTexto="Volver a la oportunidad" />;
  }

  if (resultado.estado === "cerrada") {
    return (
      <CotizacionConfirmada
        cotizacionId={resultado.cotizacionId}
        codigo={resultado.codigo}
        serie={resultado.serie}
        volverHref={volverHref}
      />
    );
  }

  const { contexto } = resultado;
  return (
    <PantallaCotizador
      oportunidadId={contexto.oportunidadId}
      cuenta={contexto.cuenta}
      contacto={contexto.contacto}
      solicitud={contexto.solicitud}
      productos={contexto.productos}
      historialPrecios={contexto.historialPrecios}
      edicion={contexto.borrador}
    />
  );
}
