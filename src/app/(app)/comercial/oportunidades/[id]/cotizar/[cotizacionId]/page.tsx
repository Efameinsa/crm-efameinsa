import { RegistroNoDisponible } from "@/components/crm/registro-no-disponible";
import { PantallaCotizador } from "@/components/crm/pantalla-cotizador";
import { CotizacionRechazada } from "@/components/crm/cotizacion-rechazada";
import { CotizacionConfirmada } from "@/components/crm/cotizacion-confirmada";
import { cargarContextoCotizador } from "@/lib/datos-cotizador";
import { tipoCambioDeGerencia } from "@/lib/datos-cotizador";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { hoyLima } from "@/lib/periodo";
import { cargarLoQueTieneElCliente } from "@/lib/lo-que-tiene-el-cliente";

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

  // «sin-autorizacion» no sale por acá —es de la ruta /corregir— pero el tipo
  // es común a las dos, así que se cierra igual que lo no disponible.
  if (resultado.estado === "no-disponible" || resultado.estado === "sin-autorizacion") {
    return <RegistroNoDisponible volverHref={volverHref} volverTexto="Volver a la oportunidad" />;
  }

  if (resultado.estado === "rechazada") {
    return (
      <CotizacionRechazada
        codigo={resultado.codigo}
        serie={resultado.serie}
        items={resultado.items}
        decisiones={resultado.decisiones}
        nuevaHref={`/comercial/oportunidades/${id}/cotizar`}
        volverHref={volverHref}
      />
    );
  }

  if (resultado.estado === "cerrada") {
    return (
      <CotizacionConfirmada
        cotizacionId={resultado.cotizacionId}
        codigo={resultado.codigo}
        serie={resultado.serie}
        version={resultado.version}
        volverHref={volverHref}
      />
    );
  }

  const { contexto } = resultado;
  // Igual que en la cotización nueva: postventa viene por un servicio.
  const perfil = await requerirPerfil();
  // POSTVENTA NO VENDE MÁQUINAS, Y COTIZA MIRANDO LO QUE EL CLIENTE YA TIENE (26-09).
  const esPostventa = perfil.es_postventa === true || perfil.hace_postventa === true;
  const soloServiciosYRepuestos = perfil.es_postventa === true || contexto.esCasoPostventa;
  const loQueTiene =
    esPostventa && contexto.cuenta ? await cargarLoQueTieneElCliente(await createClient(), contexto.cuenta.id) : null;
  return (
    <PantallaCotizador
      oportunidadId={contexto.oportunidadId}
      cuenta={contexto.cuenta}
      contacto={contexto.contacto}
      solicitud={contexto.solicitud}
      productos={contexto.productos}
      historialPrecios={contexto.historialPrecios}
      tipoCambio={await tipoCambioDeGerencia(await createClient())}
      esPostventa={esPostventa}
      soloServiciosYRepuestos={soloServiciosYRepuestos}
      loQueTiene={loQueTiene}
      hoy={hoyLima()}
      edicion={contexto.borrador}
    />
  );
}
