import { RegistroNoDisponible } from "@/components/crm/registro-no-disponible";
import { PantallaCotizador } from "@/components/crm/pantalla-cotizador";
import { cargarContextoCotizador } from "@/lib/datos-cotizador";

export const dynamic = "force-dynamic";

/**
 * El borrador que ya existe: se entra acá desde «Corregir» y desde el propio
 * autoguardado, que reescribe la URL en cuanto crea la fila.
 *
 * `cargarContextoCotizador` devuelve null —y la pantalla muestra el aviso de
 * siempre— si el borrador es de otra oportunidad o si ya salió al cliente: una
 * cotización enviada no se modifica, se duplica (migración 0062).
 */
export default async function CorregirCotizacionPage({
  params,
}: {
  params: Promise<{ id: string; cotizacionId: string }>;
}) {
  const { id, cotizacionId } = await params;
  const contexto = await cargarContextoCotizador(id, cotizacionId);

  if (!contexto) {
    return (
      <RegistroNoDisponible
        volverHref={`/comercial/oportunidades/${id}`}
        volverTexto="Volver a la oportunidad"
      />
    );
  }

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
