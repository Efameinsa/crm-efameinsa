import { RegistroNoDisponible } from "@/components/crm/registro-no-disponible";
import { PantallaCotizador } from "@/components/crm/pantalla-cotizador";
import { cargarContextoCotizador } from "@/lib/datos-cotizador";
import { tipoCambioDeGerencia } from "@/lib/datos-cotizador";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Cotización nueva.
 *
 * La pantalla arranca sin borrador: la fila en la base nace con el primer
 * equipo y, en cuanto existe, la URL pasa a `/cotizar/<id>` sin recargar
 * (window.history.replaceState). Así, refrescar o volver a entrar por el
 * enlace cae dentro del mismo documento en vez de empezar otro.
 */
export default async function NuevaCotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resultado = await cargarContextoCotizador(id);

  if (resultado.estado !== "editable") {
    return <RegistroNoDisponible volverHref="/comercial/mi-gestion" volverTexto="Volver a mi gestión" />;
  }

  const { contexto } = resultado;
  // Quién viene a cotizar. No es un permiso: es saber QUÉ viene a cotizar.
  // Postventa viene por un mantenimiento o un repuesto, no por una máquina, y
  // la pantalla ordena sus dos entradas según eso (07-09).
  const perfil = await requerirPerfil();
  return (
    <PantallaCotizador
      oportunidadId={contexto.oportunidadId}
      cuenta={contexto.cuenta}
      contacto={contexto.contacto}
      solicitud={contexto.solicitud}
      productos={contexto.productos}
      historialPrecios={contexto.historialPrecios}
      tipoCambio={await tipoCambioDeGerencia(await createClient())}
      esPostventa={perfil.es_postventa === true || perfil.hace_postventa === true}
    />
  );
}
