import Link from "@/components/enlace";
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
import { diasDelMes, diasDeSemana, lunesDe, rotuloDia, sumarDias } from "@/lib/calendario";
import { requerirPerfil } from "@/lib/auth";
import { ETIQUETA_TIPO_ATENCION } from "@/lib/atenciones";
import { NombreAFicha } from "@/components/crm/nombre-a-ficha";

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
  searchParams: Promise<{ ver?: string; q?: string; estado?: string; vista?: string; fecha?: string; zona?: string; cliente?: string }>;
}) {
  const sp = await searchParams;

  if (sp.ver && REDIRECCIONES[sp.ver]) {
    // Los despachos ya no son una pestaña de Atenciones (08-09): viven en
    // Pedidos → Despachos. Mandarlos a `/postventa/atenciones?ver=despachos`
    // dejaba a postventa mirando las atenciones abiertas (22-09).
    if (REDIRECCIONES[sp.ver] === "despachos") {
      const destino = new URLSearchParams({ vista: "despachos" });
      if (sp.q) destino.set("q", sp.q);
      if (sp.estado) destino.set("estado", sp.estado);
      redirect(`/postventa/control?${destino}`);
    }
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
  // Reunión 02-10: «quiero ver el cronograma de un solo cliente» (¿era el
  // miércoles 30 o el viernes 2?). Filtra la grilla y lista sus fechas.
  const cliente = (sp.cliente ?? "").trim();
  const delCliente = (e: { cliente: string; titulo: string }) =>
    `${e.cliente} ${e.titulo}`.toLowerCase().includes(cliente.toLowerCase());

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

  const eventos = filtrarPorZona(eventosTodos, zona).filter((e) => !cliente || delCliente(e));
  const fechasDelCliente = cliente
    ? (await cargarEventosPostventa(supabase, perfil, sumarDias(hoy, -90), sumarDias(hoy, 180)))
        .filter(delCliente)
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
    : [];
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
      <form action="/postventa/agenda" className="mb-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="ver" value="calendario" />
        <input type="hidden" name="vista" value={vista} />
        <input type="hidden" name="fecha" value={fecha} />
        {zona && <input type="hidden" name="zona" value={zona} />}
        <input
          name="cliente"
          defaultValue={cliente}
          placeholder="Buscar cliente en el calendario…"
          className="h-8 w-64 rounded-md border border-border bg-background px-2 text-sm"
        />
        <button type="submit" className="h-8 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent">Buscar</button>
        {cliente && (
          <Link href={`/postventa/agenda?ver=calendario&vista=${vista}&fecha=${fecha}${zona ? `&zona=${zona}` : ""}`} className="text-xs text-muted-foreground underline">
            Ver todos
          </Link>
        )}
      </form>
      {cliente && (
        <div className="mb-3 rounded-md border border-border p-3 text-sm">
          <p className="mb-1.5 font-medium">
            Fechas de «{cliente}» <span className="font-normal text-muted-foreground">(3 meses atrás y 6 adelante)</span>
          </p>
          {fechasDelCliente.length === 0 ? (
            <p className="text-xs text-muted-foreground">No tiene nada agendado en ese tiempo. Revise cómo está escrito el nombre.</p>
          ) : (
            <ul className="space-y-1">
              {fechasDelCliente.map((e) => (
                <li key={e.clave} className={e.fecha < hoy ? "text-muted-foreground" : ""}>
                  <Link href={e.href} className="hover:underline">
                    <span className="capitalize">{rotuloDia(e.fecha)}</span>
                    {e.hora ? ` · ${e.hora}` : ""} · {e.titulo} · <NombreAFicha cuentaId={e.cuentaId}>{e.cliente}</NombreAFicha>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <CalendarioPostventa
        cliente={cliente}
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
