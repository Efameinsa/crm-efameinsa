import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { puedeVerPrecios, sinPrecios, type ServicioPostventa } from "@/lib/postventa";
import { CalendarioPostventa, type VistaCalendario } from "@/components/crm/calendario-postventa";
import {
  eventoDeCaso,
  eventoDeTarea,
  eventosDePedido,
  filtrarPorZona,
  type CasoAgendable,
  type EventoCalendario,
  type TareaAgendable,
} from "@/lib/calendario-postventa";
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
  const verPrecios = puedeVerPrecios(perfil);
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

  const verTodo = perfil.rol === "gerencia" || perfil.rol === "admin";
  let consultaCasos = supabase
    .from("oportunidades")
    .select(
      "id, etapa, intencion, tipo_postventa, proxima_accion, proxima_accion_at, proxima_accion_hora, cuentas(razon_social, departamento, distrito)",
    )
    .not("tipo_postventa", "is", null)
    .gte("proxima_accion_at", desde)
    .lte("proxima_accion_at", hasta)
    .limit(300);
  if (!verTodo) consultaCasos = consultaCasos.eq("comercial_id", perfil.id);

  const [{ data: pedidos }, { data: casos }, { data: abiertos }, { data: tareas }] = await Promise.all([
    supabase
      .from("servicios_postventa")
      .select("*")
      .or(
        `and(fecha_despacho.gte.${desde},fecha_despacho.lte.${hasta}),and(puesta_en_marcha.gte.${desde},puesta_en_marcha.lte.${hasta})`,
      )
      .limit(400),
    consultaCasos,
    supabase
      .from("servicios_postventa")
      .select("id, cliente_texto, equipo, despacho_nota, completado, fecha_despacho, puesta_en_marcha")
      .eq("completado", false)
      .is("fecha_despacho", null)
      .is("puesta_en_marcha", null)
      .limit(200),
    // Las tareas personales (0028): antes solo se veían en «Mi agenda», que
    // el área ya no tiene en su menú — Santos, 31-08, mirando la semana:
    // «se crean desde ahí pero se ven en otra pantalla, lo cual es absurdo».
    supabase
      .from("tareas_agenda")
      .select("id, titulo, fecha, hora, completada")
      .eq("comercial_id", perfil.id)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .limit(200),
  ]);

  const listaPedidos = ((pedidos ?? []) as unknown as ServicioPostventa[]).map((s) => (verPrecios ? s : sinPrecios(s)));
  const eventosPedidos = listaPedidos.flatMap(eventosDePedido);
  const eventosCasos = ((casos ?? []) as unknown as {
    id: string;
    etapa: string;
    intencion: string | null;
    tipo_postventa: string | null;
    proxima_accion: string | null;
    proxima_accion_at: string | null;
    proxima_accion_hora: string | null;
    cuentas: { razon_social: string; departamento: string | null; distrito: string | null } | null;
  }[])
    .map((c): CasoAgendable => {
      const dep = (c.cuentas?.departamento ?? "").toUpperCase();
      return {
        id: c.id,
        tipo_postventa: c.tipo_postventa,
        intencion: c.intencion,
        etapa: c.etapa,
        proxima_accion: c.proxima_accion,
        proxima_accion_at: c.proxima_accion_at,
        proxima_accion_hora: c.proxima_accion_hora,
        cliente: c.cuentas?.razon_social ?? "Cliente sin nombre",
        zona: dep ? (dep === "LIMA" ? "lima" : "provincia") : null,
      };
    })
    .map(eventoDeCaso)
    .filter((e): e is EventoCalendario => e !== null);
  const eventosTareas = ((tareas ?? []) as unknown as TareaAgendable[]).map(eventoDeTarea);

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

  const eventos = filtrarPorZona([...eventosPedidos, ...eventosCasos, ...eventosTareas], zona);
  const porProgramar = ((abiertos ?? []) as unknown as ServicioPostventa[])
    .filter((s) => !s.completado && !s.fecha_despacho && !s.puesta_en_marcha)
    .map((s) => ({
      id: s.id,
      cliente: s.cliente_texto ?? "Cliente sin nombre",
      equipo: s.equipo,
      nota: s.despacho_nota,
    }));

  return (
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
