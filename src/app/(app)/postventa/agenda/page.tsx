import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ElDiaDelArea } from "@/components/crm/el-dia-del-area";
import { BitacoraDia, type ActividadDia } from "@/components/crm/bitacora-dia";
import type { ServicioPostventa } from "@/lib/postventa";
import { cargarEventosPostventa, pendientesDePostventa } from "@/lib/agenda-postventa-datos";
import { PendientesPorTipo } from "@/components/crm/pendientes-por-tipo";
import { CalendarioPostventa, type VistaCalendario } from "@/components/crm/calendario-postventa";
import { filtrarPorZona } from "@/lib/calendario-postventa";
import { diasDelMes, diasDeSemana, lunesDe } from "@/lib/calendario";
import { requerirPerfil } from "@/lib/auth";
import { ETIQUETA_TIPO_ATENCION } from "@/lib/atenciones";

export const dynamic = "force-dynamic";

/**
 * El calendario del área: SOLO el calendario.
 *
 * Nació como «agenda de despachos», después sumó las pestañas «Lista»,
 * «Histórico del Excel» y «Completados» — que respondían «¿qué me falta?», no
 * «¿cuándo?». El plan 23 (31-08) las mudó a Atenciones, que es donde vive el
 * resto de esa misma pregunta; acá queda una sola idea, la que Carlos pidió
 * mirándolo: «¿qué voy a hacer mañana, qué voy a hacer en la semana?».
 *
 * Las URL viejas (`?ver=lista`, `?ver=gestion`, `?ver=historico`,
 * `?ver=completados`) siguen funcionando: redirigen a su lugar nuevo en
 * Atenciones, con la búsqueda y el filtro que traían.
 */
const REDIRECCIONES: Record<string, string> = {
  lista: "despachos",
  gestion: "despachos",
  historico: "historico",
  completados: "historico",
};

export default async function AgendaPostventaPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string; q?: string; estado?: string; vista?: string; fecha?: string; zona?: string }>;
}) {
  const sp = await searchParams;

  if (sp.ver && REDIRECCIONES[sp.ver]) {
    const destino = new URLSearchParams({ ver: REDIRECCIONES[sp.ver] });
    if (sp.q) destino.set("q", sp.q);
    if (sp.estado) destino.set("estado", sp.estado);
    redirect(`/postventa/atenciones?${destino}`);
  }

  const supabase = await createClient();
  const perfil = await requerirPerfil();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  const vista: VistaCalendario = (["semana", "mes", "dia"] as const).includes(sp.vista as VistaCalendario)
    ? (sp.vista as VistaCalendario)
    : "semana";
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha ?? "") ? (sp.fecha as string) : hoy;
  const zona = sp.zona === "lima" || sp.zona === "provincia" ? sp.zona : "";

  const dias =
    vista === "mes"
      ? diasDelMes(fecha.slice(0, 7)).map((d) => d.iso)
      : vista === "semana"
        ? diasDeSemana(lunesDe(fecha))
        : [fecha];
  const desde = dias[0];
  const hasta = dias[dias.length - 1];

  // Lo que se hizo hoy y no es un caso ni un pedido (Rubí, 21-09: «otras
  // gestiones»: el correo, la llamada que no abrió caso). Es la misma bitácora
  // del informe de Central, por persona y por día.
  const { data: bitacora } = await supabase
    .from("bitacora_dia")
    .select("id, orden, texto")
    .eq("perfil_id", perfil.id)
    .eq("fecha", hoy)
    .order("orden", { ascending: true });

  // Todo lo que tiene fecha en el rango: pedidos, casos, tareas, atenciones,
  // visitas. La misma carga la usa el reporte diario (21-09).
  const [eventosTodos, { data: abiertos }, pendientes] = await Promise.all([
    cargarEventosPostventa(supabase, perfil, desde, hasta),
    supabase
      .from("servicios_postventa")
      .select("id, cliente_texto, equipo, despacho_nota, completado, fecha_despacho, puesta_en_marcha")
      .eq("completado", false)
      .is("fecha_despacho", null)
      .is("puesta_en_marcha", null)
      .limit(200),
    pendientesDePostventa(supabase),
  ]);

  const { data: aProgramar } = await supabase
    .from("atenciones")
    .select("id, tipo, detalle, cliente_texto, cuentas(razon_social)")
    .eq("etapa", "diagnostico")
    .is("cerrado_at", null)
    .order("solicitado_at", { ascending: true })
    .limit(50);
  const atencionesPorProgramar = ((aProgramar ?? []) as unknown as {
    id: string;
    tipo: string;
    detalle: string | null;
    cliente_texto: string | null;
    cuentas: { razon_social: string } | null;
  }[]).map((a) => ({
    id: a.id,
    cliente: a.cuentas?.razon_social ?? a.cliente_texto ?? "Cliente sin nombre",
    tipo: ETIQUETA_TIPO_ATENCION[a.tipo as keyof typeof ETIQUETA_TIPO_ATENCION] ?? a.tipo,
    detalle: a.detalle,
  }));

  const eventos = filtrarPorZona(eventosTodos, zona);
  const porProgramar = ((abiertos ?? []) as unknown as ServicioPostventa[])
    .filter((s) => !s.completado && !s.fecha_despacho && !s.puesta_en_marcha)
    .map((s) => ({
      id: s.id,
      cliente: s.cliente_texto ?? "Cliente sin nombre",
      equipo: s.equipo,
      nota: s.despacho_nota,
    }));

  return (
    <div className="space-y-4">
      {/* PRIMERO «¿QUÉ ME FALTA?», DESPUÉS «¿CUÁNDO?». Carlos, 09-09, dos veces
          y las dos con la palabra urgente: «acá nos falta la agenda diaria…
          despachos programados, despachos pendientes, puesta en marcha
          pendiente, entregas pendientes». Y el porqué: «siguen trabajando en el
          board… llenando información repetida que ya está acá». */}
      <SeccionPanel titulo="El día del área">
        <ElDiaDelArea />
      </SeccionPanel>

      <SeccionPanel titulo="Pendiente por tipo">
        <PendientesPorTipo pendientes={pendientes} />
      </SeccionPanel>

      <SeccionPanel titulo="Otras gestiones de hoy">
        <p className="mb-2 text-xs text-muted-foreground">
          Lo que hizo hoy y no es un caso ni un pedido: correos, llamadas que no abrieron atención, coordinaciones. Entra al
          reporte del día tal cual, numerado.
        </p>
        <BitacoraDia
          fecha={hoy}
          actividades={(bitacora ?? []) as ActividadDia[]}
          ejemplo="Se coordinó con el almacén el despacho de Bungarena"
          sugerencias={[
            "Se revisó correo y WhatsApp del área",
            "Se coordinó con el almacén los despachos del día",
            "Se llamó a clientes con despacho programado para confirmar recepción",
            "Se enviaron cotizaciones de repuestos por correo",
            "Se informó a gerencia el avance del día",
          ]}
        />
      </SeccionPanel>

    <SeccionPanel titulo="Calendario de atenciones" accion={<BotonesAgendar />}>
      <CalendarioPostventa
        vista={vista}
        fecha={fecha}
        hoy={hoy}
        zona={zona}
        eventos={eventos}
        porProgramar={porProgramar}
        atencionesPorProgramar={atencionesPorProgramar}
      />
    </SeccionPanel>
    </div>
  );
}

/**
 * Desde dónde se agenda, dicho en la pantalla.
 *
 * Hever avisó el 31-08 que quiso poner algo en el calendario del día y no
 * encontró cómo. No se inventa un «evento de calendario» suelto: lo que el
 * área agenda es una atención, y la atención ya se crea en
 * /postventa/casos/nuevo.
 *
 * El botón «Tarea personal» que vivía acá se quitó esa misma noche, cuando
 * Santos lo auditó: mandaba a «Mi agenda» —la pantalla que la etapa 2 sacó
 * del menú del área— con parpadeo en blanco incluido. Y era doblemente
 * redundante: el «Agendar» de CADA DÍA del calendario ya crea la tarea
 * propia ahí mismo, en el día que se está mirando, sin irse a ningún lado.
 */
function BotonesAgendar() {
  return (
    <Link
      href="/postventa/casos/nuevo"
      className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground hover:brightness-110"
    >
      <Plus className="size-3.5" /> Nueva atención
    </Link>
  );
}
