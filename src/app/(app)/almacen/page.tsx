import Link from "@/components/enlace";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { hoyLima } from "@/lib/periodo";
import { fechaCalendarioLarga } from "@/lib/fechas";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { PasarContactoCentral } from "@/components/crm/pasar-contacto-central";
import { MandadoACentral } from "@/components/crm/mandado-a-central";
import { listarMandadoACentral } from "@/lib/mandado-a-central";
import { campaniasWhatsappActivas } from "@/lib/acciones/whatsapp-campanas";
import { ETIQUETA_TIPO_ATENCION } from "@/lib/atenciones";
import { circuitoDe, type ServicioPostventa } from "@/lib/postventa";
import { cn } from "@/lib/utils";
import { torresSinSegundaSerie } from "@/lib/torres";
import { colaDelDia, type Tarea, type Urgencia } from "@/lib/propuesta/cola-del-dia";
import { agruparTareas, hechosDelAlmacen, indicadoresDelAlmacen, resumenDeHechos, separarHechos, type Hecho, type TipoHecho } from "@/lib/almacen-dia";
import { ActividadesAlmacen } from "@/components/crm/actividades-almacen";
import { BotonReporteDiario } from "@/components/crm/boton-reporte-diario";
import { ArrowRight, CheckCircle2, ClipboardCheck, FileText, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * LA AGENDA DEL ALMACÉN (0246 → 21-10).
 *
 * Carlos, 16-09: «el almacén, la primera ventana, tiene que ver así como lo
 * tenemos en macro: puesta en marcha, despachos, mantenimiento y soporte
 * técnico. Y también tiene que ver las visitas». Esa primera versión era una
 * pared de 18 números.
 *
 * Santos, 21-10: «quiero que me ayudes a definir cómo podríamos mejorar su
 * agenda desde el CRM: qué cosas deberían figurar y acciones que hizo al
 * día, algo así como lo que tiene postventa y comercial, pero enfocado a sus
 * actividades propias del área». Son tareas DEL ÁREA (hoy las trabaja Diana);
 * «otras gestiones» va en texto libre hasta mapearlas; la meta no es una
 * cantidad sino cero colgados; y gerencia ve su cierre del día como el de
 * los demás.
 *
 * Así quedó, de arriba abajo:
 *   1. Tres indicadores con meta cero y cuánto se hizo hoy.
 *   2. «Hoy, en orden»: la cola del día agrupada en el orden de ataque
 *      (despachos, pruebas, llamadas, salidas por cerrar, recepciones,
 *      series), con el botón de cada tarea. Al lado, la agenda con hora.
 *   3. «Lo que hizo el almacén hoy»: las marcas que dejó el CRM, con hora y
 *      quién, más lo anotado a mano.
 *   4. Todos los números de antes, plegados, para quien los busca.
 */
interface Cuadro { titulo: string; numero: number; ayuda: string; href: string; alerta?: boolean }
const cliente = (t: string | null) => (t ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, "");

const URGENCIA: Record<Urgencia, { texto: string; clase: string }> = {
  atrasado: { texto: "Atrasado", clase: "bg-destructive/10 text-destructive border-destructive/30" },
  hoy: { texto: "Hoy", clase: "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200" },
  semana: { texto: "Esta semana", clase: "bg-muted text-muted-foreground border-border" },
};

const PUNTO: Record<TipoHecho, string> = {
  prueba: "bg-[#1E7F4F]",
  serie: "bg-sky-600",
  listo: "bg-emerald-500",
  salida: "bg-primary",
  agencia: "bg-primary/70",
  letras: "bg-violet-600",
  llamada: "bg-amber-500",
  informe: "bg-amber-600",
  recepcion: "bg-teal-600",
  stock: "bg-slate-500",
  anotado: "bg-muted-foreground/60",
};

function Tarjeta({ c }: { c: Cuadro }) {
  return (
    <Link href={c.href} className={cn("flex flex-col rounded-lg border p-3 transition-colors hover:bg-accent", c.alerta && c.numero > 0 ? "border-destructive/40 bg-destructive/5" : "border-border")}>
      <span className={cn("text-2xl font-bold leading-none tabular-nums", c.alerta && c.numero > 0 ? "text-destructive" : "text-foreground")}>{c.numero}</span>
      <span className="mt-1.5 text-xs font-semibold text-foreground">{c.titulo}</span>
      <span className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{c.ayuda}</span>
    </Link>
  );
}

/** Un indicador con meta cero: verde cuando está en cero, rojo cuando no. */
function Indicador({ titulo, numero, ayuda, href }: { titulo: string; numero: number; ayuda: string; href: string }) {
  const alDia = numero === 0;
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col justify-between rounded-xl border p-3.5 transition-colors hover:bg-accent",
        alDia ? "border-[#1E7F4F]/30 bg-[#1E7F4F]/5" : "border-destructive/40 bg-destructive/5",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold leading-snug text-foreground">{titulo}</span>
        {alDia ? <CheckCircle2 className="size-4 shrink-0 text-[#1E7F4F]" aria-hidden /> : <span className="text-2xl font-bold leading-none tabular-nums text-destructive">{numero}</span>}
      </div>
      <span className="mt-2 text-[11px] leading-snug text-muted-foreground">{alDia ? "Al día. " : ""}{ayuda}</span>
    </Link>
  );
}

function FilaTarea({ t }: { t: Tarea }) {
  const u = URGENCIA[t.urgencia];
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2.5 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("rounded-full border px-1.5 py-px text-[10px] font-semibold", u.clase)}>{u.texto}</span>
          <span className="text-sm font-semibold text-foreground">{t.que}</span>
        </div>
        <p className="mt-0.5 text-xs text-foreground/80">{t.cliente}</p>
        <p className="text-[11px] leading-snug text-muted-foreground">{t.porque}</p>
      </div>
      <Link
        href={t.accion.href}
        className="inline-flex h-8 shrink-0 items-center gap-1 self-start rounded-md border border-primary/40 bg-primary/5 px-2.5 text-xs font-semibold text-primary hover:bg-primary/10 sm:self-center"
      >
        {t.accion.etiqueta}
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </li>
  );
}

function FilaHecho({ h }: { h: Hecho }) {
  const cuerpo = (
    <>
      <span className="w-11 shrink-0 text-xs font-semibold tabular-nums text-foreground">{h.hora ?? "—"}</span>
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", PUNTO[h.tipo])} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="text-xs font-semibold text-foreground">{h.que}</span>
        {h.cliente && <span className="text-xs text-foreground/80"> · {h.cliente}</span>}
        {h.detalle && <span className="block truncate text-[11px] text-muted-foreground">{h.detalle}</span>}
      </span>
      {h.quien && <span className="shrink-0 text-[11px] text-muted-foreground">{h.quien}</span>}
    </>
  );
  const clase = "flex items-start gap-2 rounded-md px-2 py-1.5";
  return <li>{h.href ? <Link href={h.href} className={cn(clase, "hover:bg-accent")}>{cuerpo}</Link> : <div className={clase}>{cuerpo}</div>}</li>;
}

export default async function AlmacenPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const hoy = hoyLima();
  const enUnaSemana = new Date(new Date(hoy + "T12:00:00-05:00").getTime() + 7 * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  const [{ data: pedidos }, { data: atenciones }, { data: visitas }, { data: aperturas }, cola, hechos, { data: bitacora }, mandadoACentral, campaniasWhatsapp] = await Promise.all([
    supabase
      .from("servicios_postventa")
      .select("id, cliente_texto, equipo, fecha_despacho, despachado_at, apertura_despacho_at, prueba_solicitada_at, prueba_lista_at, prueba_embalaje, almacen_listo_at, agencia_at, guia, guia_confirmada_at, salida_fotos, completado, cerrado_at, informe_cierre_id, pedido_ejecutado_at, aprobado_at, tipo_pedido, entrega_en")
      .eq("completado", false)
      .is("cerrado_at", null)
      .or("informe_cierre_id.is.null,pedido_ejecutado_at.not.is.null")
      .limit(2000),
    supabase
      .from("atenciones")
      .select("id, tipo, programada_at, tecnico, cliente_texto, equipo_texto, cuentas(razon_social)")
      .not("programada_at", "is", null)
      .is("cerrado_at", null)
      .gte("programada_at", `${hoy}T00:00:00-05:00`)
      .order("programada_at")
      .limit(300),
    supabase
      .from("visitas_planta")
      .select("id, empresa, persona, motivo, fecha, hora, showroom")
      .gte("fecha", hoy)
      .lte("fecha", enUnaSemana)
      .is("cancelada_at", null)
      .order("fecha")
      .order("hora", { nullsFirst: false }),
    // Las aperturas de llamada de postventa (0281) que esperan al almacén.
    supabase
      .from("aperturas_llamada")
      .select("id, tomada_at, informe_at")
      .is("anulada_at", null)
      .is("informe_at", null)
      .limit(500),
    // La misma cola del día de /nuevo (tareas con urgencia y botón) y la agenda con hora.
    colaDelDia(supabase, perfil, "almacen"),
    hechosDelAlmacen(supabase, hoy),
    // Lo anotado a mano por quien está en sesión («Otras gestiones de hoy»).
    supabase.from("bitacora_dia").select("id, orden, texto, created_at").eq("perfil_id", perfil.id).eq("fecha", hoy).order("orden", { ascending: true }),
    // LA LLAMADA QUE LE ENTRA AL ALMACÉN (Lesly, 25-09): se registra acá y va a
    // la cola de Central, como el «Pasar contacto a Central» de comercial y postventa.
    listarMandadoACentral(supabase, perfil.id),
    campaniasWhatsappActivas(),
  ]);
  const ap = (aperturas ?? []) as { id: string; tomada_at: string | null; informe_at: string | null }[];
  // Las series que Central pidió (0290): pedidos con al menos un equipo sin serie.
  // Con el filtro en la unión, no con .in() de cientos de ids (que revienta la URL).
  const { data: sinSerie } = await supabase
    .from("pedido_equipos")
    .select("servicio_id, servicios_postventa!inner(id)")
    .is("serie", null)
    .not("servicios_postventa.series_pedidas_at", "is", null)
    .is("servicios_postventa.cerrado_at", null)
    .limit(2000);
  // Y las torres con una sola serie: falta la de la secadora (0359, Lesly 30-09).
  const torresIncompletas = await torresSinSegundaSerie(supabase);
  const pedidosSinSerie = new Set([...((sinSerie ?? []) as { servicio_id: string }[]).map((x) => x.servicio_id), ...torresIncompletas.keys()]).size;

  const vivos = (pedidos ?? []) as unknown as ServicioPostventa[];
  const probado = (s: ServicioPostventa) => s.prueba_lista_at != null || String(s.prueba_embalaje ?? "").toUpperCase() === "SI";
  const porProbar = vivos.filter((s) => s.prueba_solicitada_at && !probado(s));
  const sinPedirPrueba = vivos.filter((s) => s.aprobado_at && !s.prueba_solicitada_at && !probado(s) && s.informe_cierre_id);
  const conApertura = vivos.filter((s) => s.apertura_despacho_at && !s.despachado_at);
  // Finanzas autorizó la guía y todavía no se emite (reunión de gerencia 06-10 11:01).
  const guiasAutorizadas = conApertura.filter((s) => s.guia_confirmada_at && !s.guia);
  const programados = vivos.filter((s) => s.fecha_despacho && !s.despachado_at);
  const programadosHoy = programados.filter((s) => s.fecha_despacho === hoy);
  const atrasados = programados.filter((s) => (s.fecha_despacho as string) < hoy);
  const porConfirmar = programados.filter((s) => !s.almacen_listo_at);
  // EL DOBLE FILTRO (Carlos, 22-09): de los programados, cuántos NO tienen
  // apertura todavía — «si no ha cumplido, no puedo hacer nada».
  const sinApertura = programados.filter((s) => !s.apertura_despacho_at);
  // La misma regla que la lista «Salieron, sin guía» (/almacen/pedidos?ver=guia).
  const salidosSinGuia = vivos.filter((s) => s.despachado_at && !s.guia && !s.agencia_at && !circuitoDe(s).esServicio);

  const at = (atenciones ?? []) as unknown as { id: string; tipo: string; programada_at: string; tecnico: string | null; cliente_texto: string | null; equipo_texto: string | null; cuentas: { razon_social: string } | null }[];
  const porTipo = (t: string) => at.filter((a) => a.tipo === t).length;

  const cuadrosPedidos: Cuadro[] = [
    { titulo: "Generación de código", numero: pedidosSinSerie, ayuda: "Central pidió las series para generar el código: escríbalas como se leen en la placa. Quedan fijas.", href: "/almacen/pedidos?ver=series", alerta: true },
    { titulo: "Por probar y embalar", numero: porProbar.length, ayuda: "Postventa pidió la prueba; falta el protocolo y el check.", href: "/almacen/pedidos?ver=probar", alerta: true },
    { titulo: "Despachos de hoy", numero: programadosHoy.length, ayuda: "Programados para hoy y sin salir.", href: "/almacen/pedidos?ver=hoy", alerta: true },
    { titulo: "Programados sin confirmar", numero: porConfirmar.length, ayuda: "Postventa puso fecha; falta decir que el almacén está listo.", href: "/almacen/pedidos?ver=confirmar" },
    { titulo: "De esos, sin apertura", numero: sinApertura.length, ayuda: "Postventa todavía no cumplió: no hay nada que preparar todavía.", href: "/almacen/pedidos?ver=confirmar", alerta: true },
    { titulo: "Atrasados", numero: atrasados.length, ayuda: "Tenían fecha y no salieron.", href: "/almacen/pedidos?ver=atrasados", alerta: true },
    { titulo: "Guías autorizadas", numero: guiasAutorizadas.length, ayuda: "Contabilidad o Finanzas revisó la apertura y dijo con qué comprobante sale: emita la guía.", href: "/almacen/pedidos?ver=guias", alerta: true },
    { titulo: "Con apertura, sin salir", numero: conApertura.length, ayuda: "Ya se puede despachar.", href: "/almacen/pedidos?ver=apertura" },
    { titulo: "Salieron, sin guía", numero: salidosSinGuia.length, ayuda: "Falta la foto de la guía en la agencia.", href: "/almacen/pedidos?ver=guia", alerta: true },
    { titulo: "Aprobados sin pedido de prueba", numero: sinPedirPrueba.length, ayuda: "Postventa todavía no pidió la prueba; se puede adelantar.", href: "/almacen/pedidos?ver=aprobados" },
  ];
  const cuadrosAtenciones: Cuadro[] = [
    { titulo: "Aperturas sin tomar", numero: ap.filter((a) => !a.tomada_at).length, ayuda: "Postventa pidió una videollamada o atención; tómela para que sepan que está en sus manos.", href: "/almacen/aperturas", alerta: true },
    { titulo: "Aperturas sin informe", numero: ap.filter((a) => a.tomada_at).length, ayuda: "Tomadas; falta subir lo que se vio en la llamada.", href: "/almacen/aperturas" },
    { titulo: "Puestas en marcha programadas", numero: porTipo("puesta_en_marcha"), ayuda: "Con día, hora y técnico.", href: "/almacen/atenciones?tipo=puesta_en_marcha" },
    { titulo: "Mantenimientos programados", numero: porTipo("solicitud_mantenimiento"), ayuda: "En planta o en el cliente.", href: "/almacen/atenciones?tipo=solicitud_mantenimiento" },
    { titulo: "Problemas técnicos programados", numero: porTipo("problema_tecnico"), ayuda: "Fallas con técnico asignado.", href: "/almacen/atenciones?tipo=problema_tecnico" },
    { titulo: "Soporte técnico programado", numero: porTipo("soporte_tecnico"), ayuda: "Orientar, capacitar o asistir sin avería.", href: "/almacen/atenciones?tipo=soporte_tecnico" },
    { titulo: "Visitas a planta esta semana", numero: (visitas ?? []).length, ayuda: "Clientes que vienen; algunos a recoger repuestos.", href: "/almacen/visitas" },
  ];

  const grupos = agruparTareas(cola.tareas);
  const indicadores = indicadoresDelAlmacen(cola.tareas);
  // Solo suma lo que hizo el almacén; lo de Central y Lesly va aparte (Santos 21-10).
  const { propios: hechosAlmacen, otros: hechosOtros } = separarHechos(hechos);
  const resumen = resumenDeHechos(hechosAlmacen);
  const visitasHoy = (visitas ?? []).filter((v) => v.fecha === hoy);
  const visitasSemana = (visitas ?? []).filter((v) => v.fecha !== hoy);
  const totalTareas = cola.tareas.length;
  const atrasadas = cola.tareas.filter((t) => t.urgencia === "atrasado").length;

  return (
    <div className="space-y-4">
      {/* Cabecera: qué día es y los accesos de siempre. */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-foreground">Agenda del almacén</h1>
          <p className="text-xs text-muted-foreground">
            {fechaCalendarioLarga(hoy)} · {totalTareas === 0 ? "nada pendiente" : `${totalTareas} ${totalTareas === 1 ? "tarea" : "tareas"}${atrasadas ? `, ${atrasadas} ${atrasadas === 1 ? "atrasada" : "atrasadas"}` : ""}`} · {resumen.total} {resumen.total === 1 ? "acción hecha" : "acciones hechas"} hoy
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {/* Lo que hace en planta sin pedido del CRM (Santos 22-10): a un clic desde arriba. */}
          <a href="#registrar-actividad" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#8B1510] px-3 text-sm font-medium text-white hover:bg-[#8B1510]/90">
            <Plus className="size-3.5" /> Registrar actividad
          </a>
          <Link href="/almacen/protocolos" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-accent">
            <ClipboardCheck className="size-4" aria-hidden />
            Protocolos
          </Link>
          {/* Lesly, 20-10: «que se aperture en almacén la vista de protocolos… subir los de stock». */}
          <Link href="/almacen/protocolos?nuevo=1" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-accent">
            <Plus className="size-4" aria-hidden />
            Protocolo de equipo en stock
          </Link>
          <PasarContactoCentral contexto="almacen" campaniasWhatsapp={campaniasWhatsapp} />
          {/* El cierre del día del almacén (Santos, 21-10): el mismo botón de postventa, con el reporte propio del área. */}
          <BotonReporteDiario fecha={hoy} ruta="/api/reportes/almacen" etiqueta="Reporte del día" elegirFecha />
        </div>
      </div>

      {/* 1. La meta es cero colgados (Santos, 21-10), más cuánto se hizo hoy. */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {indicadores.map((i) => <Indicador key={i.clave} {...i} />)}
        <a href="#hecho-hoy" className="flex flex-col justify-between rounded-xl border border-border bg-muted/30 p-3.5 transition-colors hover:bg-accent">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-semibold leading-snug text-foreground">Hecho hoy</span>
            <span className="text-2xl font-bold leading-none tabular-nums text-foreground">{resumen.total}</span>
          </div>
          <span className="mt-2 text-[11px] leading-snug text-muted-foreground">
            {resumen.total === 0
              ? "Todavía nada registrado hoy."
              : [
                  resumen.pruebas && `${resumen.pruebas} ${resumen.pruebas === 1 ? "prueba" : "pruebas"}`,
                  resumen.series && `${resumen.series} ${resumen.series === 1 ? "serie" : "series"}`,
                  resumen.salidas && `${resumen.salidas} ${resumen.salidas === 1 ? "salida" : "salidas"}`,
                  resumen.agencias && `${resumen.agencias} en agencia`,
                  resumen.llamadas && `${resumen.llamadas} de llamadas`,
                  resumen.recepciones && `${resumen.recepciones} de recepciones`,
                  resumen.anotados && `${resumen.anotados} ${resumen.anotados === 1 ? "anotada" : "anotadas"}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </span>
        </a>
      </div>

      {/* 2. Hoy, en orden de ataque + la agenda con hora. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SeccionPanel titulo="Hoy, en orden">
            {grupos.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Nada pendiente para el almacén. Lo que postventa o Central pidan aparecerá acá, en el orden en que conviene atenderlo.
              </p>
            ) : (
              <div className="space-y-4">
                {grupos.map((g, i) => (
                  <section key={g.clave} aria-labelledby={`grupo-${g.clave}`}>
                    <div className="mb-1.5 flex items-baseline gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background">{i + 1}</span>
                      <h3 id={`grupo-${g.clave}`} className="text-sm font-semibold text-foreground">{g.titulo}</h3>
                      <span className="text-xs tabular-nums text-muted-foreground">{g.tareas.length}</span>
                      {g.ayuda && <span className="hidden text-[11px] text-muted-foreground sm:inline">· {g.ayuda}</span>}
                    </div>
                    <ul className="space-y-1.5">
                      {g.tareas.map((t) => <FilaTarea key={t.id} t={t} />)}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </SeccionPanel>
        </div>
        <div className="space-y-4">
          <SeccionPanel titulo="Agenda de hoy">
            {cola.agenda.length === 0 && visitasHoy.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin despachos, atenciones ni visitas con hora para hoy.</p>
            ) : (
              <ul className="space-y-1">
                {cola.agenda.map((e) => (
                  <li key={e.id}>
                    <Link href={e.href} className="flex items-start gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent">
                      <span className="w-11 shrink-0 font-semibold tabular-nums text-foreground">{e.hora}</span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-foreground">{e.titulo}</span>
                        <span className="line-clamp-1 break-words text-muted-foreground">{e.detalle}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {/* Los despachos de hoy con su semáforo (Carlos, 22-09: sin apertura no hay nada que confirmar). */}
            {programadosHoy.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Despachos programados para hoy</p>
                <ul className="space-y-1">
                  {programadosHoy.map((s) => (
                    <li key={s.id}>
                      <Link href={`/almacen/pedidos/${s.id}`} className="block rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent">
                        <span className="font-semibold text-foreground">{cliente(s.cliente_texto)}</span>
                        <span className="line-clamp-1 break-words text-muted-foreground">{s.equipo}</span>
                        <span className={cn("text-[11px] font-semibold", !s.apertura_despacho_at ? "text-destructive" : s.almacen_listo_at ? "text-[#1E7F4F]" : "text-amber-700")}>
                          {!s.apertura_despacho_at ? "Postventa no ha cumplido" : s.almacen_listo_at ? "Listo" : "Falta confirmar que está listo"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {visitasSemana.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Vienen esta semana</p>
                <ul className="space-y-1">
                  {visitasSemana.map((v) => (
                    <li key={v.id} className="rounded-md border border-border px-2.5 py-1.5 text-xs">
                      <span className="font-semibold tabular-nums text-foreground">{v.fecha.slice(8, 10)}/{v.fecha.slice(5, 7)}{v.hora ? ` ${String(v.hora).slice(0, 5)}` : ""}</span> · {v.persona} · {v.empresa}
                      <span className="line-clamp-1 break-words text-muted-foreground">{v.motivo}{v.showroom ? " · abrir la lavandería" : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </SeccionPanel>
        </div>
      </div>

      {/* 3. Lo que hizo el almacén hoy: lo que el CRM registró solo, más lo anotado a mano. */}
      <SeccionPanel titulo="Lo que hizo el almacén hoy" id="hecho-hoy">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {hechosAlmacen.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Todavía nada hoy. Cada prueba, serie, salida, foto en agencia, llamada o recepción que se registre aparece acá sola, con la hora y quién la hizo.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {hechosAlmacen.map((h) => <FilaHecho key={h.id} h={h} />)}
              </ul>
            )}
            {hechosOtros.length > 0 && (
              <details className="mt-3 rounded-lg border border-dashed border-border px-3 py-2">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Otras áreas en pedidos del almacén hoy · {hechosOtros.length} (no suman al almacén)
                </summary>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Lo registraron Central, operaciones u otra área. Se muestra para que el almacén lo sepa; no es trabajo del almacén.
                </p>
                <ul className="mt-1 divide-y divide-border/60 opacity-75">
                  {hechosOtros.map((h) => <FilaHecho key={h.id} h={h} />)}
                </ul>
              </details>
            )}
          </div>
          <div id="registrar-actividad">
            <p className="mb-1.5 text-xs font-semibold text-foreground">Actividades que no están en el CRM</p>
            <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
              Lo que hizo en planta sin un pedido del CRM: embalar o despachar un producto, recibir mercadería, entregar en ventanilla, inventario. Queda con la hora y entra a su reporte del día.
            </p>
            <ActividadesAlmacen
              fecha={hoy}
              actividades={((bitacora ?? []) as { id: string; orden: number; texto: string; created_at: string | null }[]).map((b) => ({
                id: b.id,
                orden: b.orden,
                texto: b.texto,
                hora: b.created_at ? new Date(b.created_at).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false }) : null,
              }))}
            />
          </div>
        </div>
      </SeccionPanel>

      {/* 4. Todos los números, plegados: la pared de antes, para quien la busca. */}
      <details className="group rounded-xl border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-foreground">
          <span>Todos los números</span>
          <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
            <a
              href="/almacen/pedidos/reporte"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-accent"
              title="Códigos dados, pendientes de código, por probar, despachos y otras actividades, para imprimir o guardar en PDF (Lesly, 01-10)."
            >
              <FileText className="size-3.5" aria-hidden />
              Reporte del almacén (PDF)
            </a>
            <span className="transition-transform group-open:rotate-180" aria-hidden>▾</span>
          </span>
        </summary>
        <div className="space-y-4 border-t border-border px-4 pb-4 pt-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-foreground">Pedidos</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{cuadrosPedidos.map((c) => <Tarjeta key={c.titulo} c={c} />)}</div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-foreground">Atenciones y visitas</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{cuadrosAtenciones.map((c) => <Tarjeta key={c.titulo} c={c} />)}</div>
          </div>
          {at.filter((a) => a.programada_at.startsWith(hoy) || new Date(a.programada_at).toLocaleDateString("en-CA", { timeZone: "America/Lima" }) === hoy).length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-foreground">Técnicos que salen hoy</p>
              <ul className="space-y-1">
                {at
                  .filter((a) => a.programada_at.startsWith(hoy) || new Date(a.programada_at).toLocaleDateString("en-CA", { timeZone: "America/Lima" }) === hoy)
                  .map((a) => (
                    <li key={a.id} className="rounded-md border border-border px-2.5 py-1.5 text-xs">
                      <span className="font-semibold tabular-nums text-foreground">{new Date(a.programada_at).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" })}</span>
                      {" · "}{ETIQUETA_TIPO_ATENCION[a.tipo as keyof typeof ETIQUETA_TIPO_ATENCION] ?? a.tipo} · {a.cuentas?.razon_social ?? a.cliente_texto}
                      {a.tecnico && <span className="text-muted-foreground"> · {a.tecnico}</span>}
                      {a.equipo_texto && <span className="line-clamp-1 break-words text-muted-foreground">{a.equipo_texto}</span>}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      </details>
      <MandadoACentral filas={mandadoACentral} contexto="almacen" />
    </div>
  );
}
