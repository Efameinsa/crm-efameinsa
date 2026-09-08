import { RegistroNoDisponible } from "@/components/crm/registro-no-disponible";
import { PantallaCotizador } from "@/components/crm/pantalla-cotizador";
import { cargarContextoCotizador } from "@/lib/datos-cotizador";
import { tipoCambioDeGerencia } from "@/lib/datos-cotizador";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { hoyLima } from "@/lib/periodo";

export const dynamic = "force-dynamic";

/**
 * Cotización nueva.
 *
 * La pantalla arranca sin borrador: la fila en la base nace con el primer
 * equipo y, en cuanto existe, la URL pasa a `/cotizar/<id>` sin recargar
 * (window.history.replaceState). Así, refrescar o volver a entrar por el
 * enlace cae dentro del mismo documento en vez de empezar otro.
 */
export default async function NuevaCotizacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** `?caso=<atencionId>` cuando se llega desde una atención de postventa. */
  searchParams: Promise<{ caso?: string }>;
}) {
  const { id } = await params;
  const { caso } = await searchParams;
  const resultado = await cargarContextoCotizador(id);

  if (resultado.estado !== "editable") {
    return <RegistroNoDisponible volverHref="/comercial/mi-gestion" volverTexto="Volver a mi gestión" />;
  }

  const { contexto } = resultado;
  // Quién viene a cotizar. No es un permiso: es saber QUÉ viene a cotizar.
  // Postventa viene por un mantenimiento o un repuesto, no por una máquina, y
  // la pantalla ordena sus dos entradas según eso (07-09).
  const perfil = await requerirPerfil();

  // DE QUÉ CASO VIENE. Sin esto el cotizador abría en blanco y el técnico
  // reescribía de memoria la máquina y el diagnóstico que acababa de ver
  // (informe de UX del 08-09). Se lee de la atención, no se pasa por la URL:
  // la URL solo dice CUÁL, y las políticas de la base deciden si esta persona
  // puede verla — si no puede, no viene contexto y el cotizador funciona igual.
  let desdeCaso = null;
  if (caso) {
    const supabase = await createClient();
    const { data: atencion } = await supabase
      .from("atenciones")
      .select("id, tipo, equipo_texto, detalle, diagnostico, repuestos_usados, equipos_instalados(serie, ultimo_mantenimiento, proximo_mantenimiento)")
      .eq("id", caso)
      .maybeSingle();
    if (atencion) {
      // EL EMBED VIENE DE DOS FORMAS. Los tipos de supabase-js lo declaran
      // como arreglo, pero en una relación de a uno PostgREST devuelve el
      // OBJETO. Tomar [0] a secas daba undefined y la máquina desaparecía sin
      // ningún error — el mismo fallo mudo que costó doce consultas vacías el
      // 07-09. Se aceptan las dos formas.
      type FilaEquipo = {
        serie: string | null;
        ultimo_mantenimiento: string | null;
        proximo_mantenimiento: string | null;
      };
      const crudo = atencion.equipos_instalados as unknown as FilaEquipo | FilaEquipo[] | null;
      const equipo = Array.isArray(crudo) ? (crudo[0] ?? null) : crudo;
      // EL PREVENTIVO VENCIDO DE ESTA MISMA MÁQUINA. Es, textualmente, lo que
      // el área necesita vender: el técnico ya está ahí, la visita ya está
      // pagada, y sumarlo a esta cotización no le cuesta un viaje más. De 314
      // máquinas del parque, 132 lo tienen vencido (0187).
      const vencido =
        equipo?.proximo_mantenimiento != null && equipo.proximo_mantenimiento < hoyLima();
      desdeCaso = {
        id: atencion.id as string,
        tipo: String(atencion.tipo),
        serie: equipo?.serie ?? null,
        equipo: (atencion.equipo_texto as string | null) ?? null,
        diagnostico: (atencion.diagnostico as string | null) ?? null,
        reporto: (atencion.detalle as string | null) ?? null,
        preventivoVencido: vencido,
        ultimoPreventivo: equipo?.ultimo_mantenimiento ?? null,
        // LO QUE EL TÉCNICO YA PUSO. Hasta hoy los repuestos usados en la
        // visita se escribían a mano en la atención y morían ahí: no
        // generaban línea ni llegaban a ninguna cotización, así que el
        // repuesto se instalaba y no se cobraba (informe de UX del 08-09).
        repuestosUsados: (atencion.repuestos_usados as string | null) ?? null,
      };
    }
  }

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
      desdeCaso={desdeCaso}
    />
  );
}
