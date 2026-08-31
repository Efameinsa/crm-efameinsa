import Link from "next/link";
import { AlertTriangle, Wrench, PackageSearch, ShieldCheck, Inbox, ArrowRight, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaLima } from "@/lib/fechas";
import { AprobarPedidoBoton } from "@/components/crm/aprobar-pedido-boton";
import { BotonReporteDiario } from "@/components/crm/boton-reporte-diario";
import { BotonCierreSemanal } from "@/components/crm/boton-cierre-semanal";
import { BotonReporteMensual } from "@/components/crm/boton-reporte-mensual";
import { hoyLima } from "@/lib/periodo";
import { lunesSemana } from "@/lib/potenciales-semana";
import { mesPorDefecto } from "@/lib/cierre-mensual";
import { relojAtencion, ETIQUETA_TIPO_ATENCION, type TipoAtencion } from "@/lib/atenciones";
import {
  queLoFrena,
  slaCaso,
  puedeVerPrecios,
  sinPrecios,
  estadoPago,
  ETIQUETA_ESTADO_PAGO,
  type ServicioPostventa,
} from "@/lib/postventa";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Con lo que postventa arranca el día. Plan 23, etapa 3: «Mi día» es una
 * BANDEJA, no un tablero — una sola pregunta: ¿qué llegó y espera que yo lo
 * tome?
 *
 * Hasta el 31-08 esa pregunta se contestaba en tres cajas separadas (pedidos,
 * casos, y un resumen de la semana que duplicaba el Calendario) con tres
 * relojes distintos. Ahora es una sola lista ordenada por urgencia real —el
 * mismo criterio que ya usan `relojAtencion` y `slaCaso`— y un segundo bloque
 * con SOLO lo de hoy: la semana entera es del Calendario, no de acá.
 */

const ETIQUETA_TIPO_CASO: Record<string, string> = {
  garantia: "Garantía",
  repuesto: "Repuesto",
  mantenimiento: "Mantenimiento",
};

const ICONO_TIPO_ATENCION: Record<TipoAtencion, LucideIcon> = {
  puesta_en_marcha: Wrench,
  problema_tecnico: AlertTriangle,
  solicitud_repuesto: PackageSearch,
  solicitud_mantenimiento: Wrench,
};

type EstadoUrgencia = "rojo" | "ambar" | "verde";
const ORDEN_URGENCIA: Record<EstadoUrgencia, number> = { rojo: 0, ambar: 1, verde: 2 };

interface ItemBandeja {
  clave: string;
  href: string;
  icono: LucideIcon;
  cliente: string;
  etiqueta: string;
  detalle: string | null;
  estado: EstadoUrgencia;
  horas: number;
  limite: number;
  recienLlegado: boolean;
  /**
   * Solo los pedidos tienen el acuse de un clic (Carlos: «yo pongo como
   * postventa aprobado»). Va como acción propia y no como enlace de la fila
   * entera: un botón dentro de un `<a>` es un clic que hace dos cosas a la
   * vez.
   */
  servicioIdParaAprobar?: string;
}

/** Lo mismo que `relojAtencion`, para el único origen que no tenía reloj propio. */
const LIMITE_PEDIDO_HORAS = 24;
function relojPedido(desde: string): { estado: EstadoUrgencia; horas: number } {
  const horas = (Date.now() - new Date(desde).getTime()) / 36e5;
  if (horas > LIMITE_PEDIDO_HORAS) return { estado: "rojo", horas };
  if (horas > LIMITE_PEDIDO_HORAS * 0.6) return { estado: "ambar", horas };
  return { estado: "verde", horas };
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="max-w-prose text-sm text-muted-foreground">{children}</p>;
}

export default async function PostventaPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const hoyIso = hoyLima();
  const lunes = lunesSemana();

  const [{ data: nuevos }, { data: casos }, { data: atencionesNuevas }, { data: hoyProgramado }, { count: atrasados }] =
    await Promise.all([
      // Liberados por Central (los dos checks) y todavía sin acuse.
      supabase
        .from("servicios_postventa")
        .select("*")
        .not("pedido_ejecutado_at", "is", null)
        .not("liquidacion_at", "is", null)
        .is("aprobado_at", null)
        .eq("completado", false)
        .order("pedido_ejecutado_at", { ascending: false })
        .limit(20),
      // UN CASO ES UN CASO, y acá solo los que TODAVÍA no se tomaron
      // («asignada» es justo lo que la propia pantalla vieja llamaba «sin
      // atender»): lo que ya está en curso se sigue en Atenciones o en el
      // Kanban, no compite acá por la primera mirada del día.
      supabase
        .from("oportunidades")
        .select("id, tipo_postventa, serie_texto, codigo_error, created_at, cuentas(razon_social)")
        .eq("comercial_id", perfil.id)
        .eq("origen", "crm")
        .eq("etapa", "asignada")
        .not("tipo_postventa", "is", null)
        .order("created_at", { ascending: false })
        .limit(30),
      // Las atenciones que Central acaba de devolver al área («registro»):
      // falta tomarlas y verificar la garantía. Es la misma pista de 9 etapas
      // de Atenciones, mirada desde el único paso que apremia por definición.
      supabase
        .from("atenciones")
        .select("id, cuenta_id, cliente_texto, tipo, etapa, detalle, solicitado_at, atendido_at, cerrado_at, cuentas(razon_social)")
        .eq("etapa", "registro")
        .is("cerrado_at", null)
        .order("solicitado_at", { ascending: true })
        .limit(30),
      // Lo programado PARA HOY, y nada más: la semana completa es del
      // Calendario (duplicarla acá era una de las tres redundancias del
      // diagnóstico del plan 23).
      supabase
        .from("servicios_postventa")
        .select("*")
        .eq("completado", false)
        .or(`fecha_despacho.eq.${hoy},puesta_en_marcha.eq.${hoy}`)
        .limit(40),
      // Los atrasados se cuentan, no se listan acá: la lista vive en
      // Atenciones → Despachos, que es donde de verdad se trabaja la cola
      // vieja del Excel.
      supabase
        .from("servicios_postventa")
        .select("id", { count: "exact", head: true })
        .eq("completado", false)
        .lt("fecha_despacho", hoy)
        .is("despachado_at", null),
    ]);

  const verPrecios = puedeVerPrecios(perfil);

  // UN CASO CON GESTIÓN YA ESTÁ TOMADO. La etapa no alcanza como señal:
  // Hever registra sus llamadas como actividades SIN mover el caso de
  // «asignada» — el 31-08 Santos vio 26 casos «sin atender» de los que 20
  // tenían gestiones suyas de toda la semana. Atendido es que alguien hizo
  // algo, no que alguien actualizó un desplegable; el caso ya gestionado se
  // sigue viendo en Atenciones → Casos anteriores y en el Kanban.
  const idsCasos = (casos ?? []).map((c) => c.id as string);
  const { data: gestionadas } = idsCasos.length
    ? await supabase.from("actividades").select("oportunidad_id").in("oportunidad_id", idsCasos)
    : { data: [] as { oportunidad_id: string }[] };
  const conGestion = new Set((gestionadas ?? []).map((g) => g.oportunidad_id as string));
  const casosSinTocar = (casos ?? []).filter((c) => !conGestion.has(c.id as string));

  // ── La bandeja única: «Sin atender todavía» ───────────────────────────────
  const itemsPedidos: ItemBandeja[] = (nuevos as unknown as ServicioPostventa[] | null ?? []).map((s) => {
    // El filtro de la consulta ya exige `pedido_ejecutado_at` no nulo.
    const reloj = relojPedido(s.pedido_ejecutado_at as string);
    return {
      clave: `pedido-${s.id}`,
      href: `/postventa/pedidos/${s.id}`,
      icono: Inbox,
      // El texto importado trae el RUC pegado adelante («20000000102 - HOTEL…»)
      // y las atenciones no: dos formatos para el mismo cliente en la misma
      // lista confunden (Santos, 31-08). El RUC se quita solo para mostrar.
      cliente: (s.cliente_texto ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, ""),
      etiqueta: "Nuevo pedido",
      detalle: verPrecios
        ? s.monto
          ? `${s.moneda} ${Number(s.monto).toLocaleString("es-PE")}`
          : "sin monto"
        : ETIQUETA_ESTADO_PAGO[estadoPago(s)],
      estado: reloj.estado,
      horas: reloj.horas,
      limite: LIMITE_PEDIDO_HORAS,
      recienLlegado: reloj.horas < 1,
      servicioIdParaAprobar: s.id,
    };
  });

  const itemsCasos: ItemBandeja[] = ((casosSinTocar ?? []) as unknown as {
    id: string;
    tipo_postventa: string | null;
    serie_texto: string | null;
    codigo_error: string | null;
    created_at: string;
    cuentas: { razon_social: string } | null;
  }[]).map((c) => {
    const sla = slaCaso(c.tipo_postventa, c.created_at, false);
    const tipo = c.tipo_postventa;
    // NO `c.intencion`: es la intención de COMPRA («alto_potencial»,
    // «sin_definir»...), un dato comercial que no describe el caso técnico y
    // que salía crudo en pantalla («· sin_definir»). Lo que sí describe el
    // caso es la serie del equipo o el código de error, cuando los hay.
    const detalle = c.codigo_error ? `error ${c.codigo_error}` : c.serie_texto ? `serie ${c.serie_texto}` : null;
    return {
      clave: `caso-${c.id}`,
      href: `/comercial/oportunidades/${c.id}`,
      icono: tipo === "garantia" ? ShieldCheck : tipo === "repuesto" ? PackageSearch : Wrench,
      cliente: c.cuentas?.razon_social ?? "Cliente sin nombre",
      etiqueta: tipo ? (ETIQUETA_TIPO_CASO[tipo] ?? tipo) : "Sin clasificar",
      detalle,
      estado: sla.estado,
      horas: sla.horas,
      limite: sla.limite,
      recienLlegado: sla.horas < 1,
    };
  });

  const itemsAtenciones: ItemBandeja[] = ((atencionesNuevas ?? []) as unknown as {
    id: string;
    cliente_texto: string | null;
    tipo: TipoAtencion;
    etapa: "registro";
    detalle: string | null;
    solicitado_at: string;
    atendido_at: string | null;
    cerrado_at: string | null;
    cuentas: { razon_social: string } | null;
  }[]).map((a) => {
    const reloj = relojAtencion(a as unknown as Parameters<typeof relojAtencion>[0]);
    return {
      clave: `atencion-${a.id}`,
      href: `/postventa/atenciones/${a.id}`,
      icono: ICONO_TIPO_ATENCION[a.tipo] ?? Wrench,
      cliente: a.cuentas?.razon_social ?? a.cliente_texto ?? "Cliente sin nombre",
      etiqueta: ETIQUETA_TIPO_ATENCION[a.tipo],
      detalle: a.detalle,
      estado: reloj.estado,
      horas: reloj.horas,
      limite: reloj.limite,
      recienLlegado: reloj.horas < 1,
    };
  });

  const bandeja = [...itemsAtenciones, ...itemsCasos, ...itemsPedidos].sort((a, b) => {
    const porUrgencia = ORDEN_URGENCIA[a.estado] - ORDEN_URGENCIA[b.estado];
    return porUrgencia !== 0 ? porUrgencia : b.horas - a.horas;
  });
  const enRojo = bandeja.filter((i) => i.estado === "rojo").length;

  // ── Hoy ────────────────────────────────────────────────────────────────
  const listaHoy = (hoyProgramado as unknown as ServicioPostventa[] | null ?? []).map((s) =>
    verPrecios ? s : sinPrecios(s),
  );

  return (
    <div className="space-y-4">
      {/* «Mi agenda» salió del menú del área (plan 23, etapa 2): estos tres
          botones eran la única razón por la que seguía abierta. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <BotonReporteMensual mes={mesPorDefecto(hoyIso)} compacto />
        <BotonCierreSemanal semana={lunes} compacto />
        <BotonReporteDiario fecha={hoyIso} compacto />
      </div>

      <SeccionPanel
        titulo="Sin atender todavía"
        accion={
          bandeja.length > 0 ? (
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                enRojo > 0 ? "bg-destructive/10 text-destructive" : "bg-primary px-2.5 text-primary-foreground",
              )}
            >
              {bandeja.length}
              {enRojo > 0 && ` · ${enRojo} pasada${enRojo === 1 ? "" : "s"} de tiempo`}
            </span>
          ) : undefined
        }
      >
        {bandeja.length === 0 ? (
          <Vacio>
            Nada por atender. Acá caen los pedidos que libera Central, los casos recién asignados y las atenciones
            que Central acaba de devolver al área — apenas se registren, antes de que alguien las tome.
          </Vacio>
        ) : (
          <div className="space-y-2">
            {bandeja.map((item) => {
              const Icono = item.icono;
              return (
                <div
                  key={item.clave}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-lg border p-3",
                    item.estado === "rojo" ? "border-destructive/30 bg-destructive/5" : "border-border bg-background",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 flex-none items-center justify-center rounded-full",
                      item.estado === "rojo"
                        ? "bg-destructive/10 text-destructive"
                        : item.estado === "ambar"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-secondary text-foreground",
                    )}
                  >
                    <Icono className="size-4" />
                  </span>
                  <Link href={item.href} className="min-w-[220px] flex-1 hover:underline">
                    <p className="text-sm font-semibold text-foreground">{item.cliente}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground no-underline">
                      {item.etiqueta}
                      {item.detalle && ` · ${item.detalle}`}
                    </p>
                  </Link>
                  <span
                    className={cn(
                      "text-right text-[11px] font-semibold",
                      item.estado === "rojo"
                        ? "text-destructive"
                        : item.estado === "ambar"
                          ? "text-amber-700"
                          : "text-muted-foreground",
                    )}
                  >
                    {item.recienLlegado ? "recién llegado" : `${Math.round(item.horas)} h · límite ${item.limite} h`}
                  </span>
                  {item.servicioIdParaAprobar ? (
                    <AprobarPedidoBoton servicioId={item.servicioIdParaAprobar} />
                  ) : (
                    <ArrowRight className="size-3.5 flex-none text-muted-foreground" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SeccionPanel>

      <SeccionPanel
        titulo="Hoy"
        accion={
          <Link href="/postventa/agenda" className="text-xs font-medium text-primary hover:underline">
            Ver la semana completa
          </Link>
        }
      >
        {(atrasados ?? 0) > 0 && (
          <p className="mb-2 flex flex-wrap items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs font-semibold text-amber-900">
            <AlertTriangle className="size-3.5" />
            {atrasados} despacho{atrasados === 1 ? "" : "s"} con la fecha ya vencida ·{" "}
            <Link href="/postventa/atenciones?ver=despachos&estado=atrasados" className="underline hover:no-underline">
              ver la lista completa
            </Link>
          </p>
        )}
        {listaHoy.length === 0 ? (
          <Vacio>Nada programado para hoy.</Vacio>
        ) : (
          <div className="space-y-1.5">
            {listaHoy.map((s) => {
              const frena = queLoFrena(s);
              return (
                <Link
                  key={s.id}
                  href={`/postventa/pedidos/${s.id}`}
                  className="flex flex-wrap items-start gap-3 rounded-md border border-border p-2.5 transition-colors hover:bg-accent"
                >
                  <span className="w-20 flex-none font-mono text-xs font-semibold tabular-nums text-foreground">
                    {fechaLima(s.fecha_despacho ?? s.puesta_en_marcha)}
                  </span>
                  <div className="min-w-[200px] flex-1">
                    <p className="text-sm font-medium text-foreground">{s.cliente_texto ?? "—"}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{s.equipo ?? "Sin equipo"}</p>
                  </div>
                  {frena && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        frena.grave ? "bg-amber-100 text-amber-900" : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {frena.texto}
                    </span>
                  )}
                  <ArrowRight className="mt-1 size-3.5 flex-none text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        )}
      </SeccionPanel>
    </div>
  );
}

