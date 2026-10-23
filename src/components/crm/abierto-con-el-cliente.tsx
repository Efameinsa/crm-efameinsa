import Link from "@/components/enlace";
import { AlertTriangle, ArrowRight, Building2, CalendarClock, FileText, FolderOpen, Package, PhoneForwarded, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { bloquesPedido, etiquetaResponsable, sinPrecios, type ServicioPostventa } from "@/lib/postventa";
import { ETIQUETA_ETAPA, ETIQUETA_TIPO_ATENCION, type EtapaAtencion, type TipoAtencion } from "@/lib/atenciones";
import { fechaAgendada, fechaCalendario, fechaHoraLima, fechaLima } from "@/lib/fechas";
import { ETIQUETA_ESTADO_APERTURA, ETIQUETA_TIPO_APERTURA, aQuienLeToca, estadoApertura, type TipoApertura } from "@/lib/aperturas-llamada";
import { TipoExpedienteBadge } from "@/components/crm/tipo-expediente-badge";
import { EtapaBadge } from "@/components/crm/etapa-badge";
import { AperturaLlamadaBoton } from "@/components/crm/apertura-llamada-boton";
import { cn } from "@/lib/utils";

/**
 * LO ABIERTO CON ESTE CLIENTE, EN UN SOLO PANEL (rediseño de postventa, 23-10).
 *
 * La ficha tenía tres paneles que decían lo mismo con distinto nombre:
 * «Pendiente con este cliente» (pedidos, casos y llamadas sueltos), «Expedientes
 * vivos» (la carpeta, con «casos abiertos en esta carpeta: CASO-…») y «Lo que
 * sigue con este cliente» (la próxima acción de esa misma carpeta). Desde que un
 * cliente tiene UNA carpeta de postventa (17-10), la carpeta y su contenido
 * salían dos veces: gerencia lo vio el 20-10 con Lernake («el mismo caso salía
 * arriba y abajo») y Santos el 23-10 con Inversiones Turísticas Centenario.
 *
 * Acá cada carpeta es la cabecera —tipo, etapa, quién la lleva, cotización,
 * lo que sigue, última gestión— y debajo cuelga lo que se está ejecutando en
 * ella: casos técnicos (con sus llamadas al almacén), pedidos (con el paso que
 * sigue y quién lo tiene) y aperturas. Lo que no cuelga de ninguna carpeta va
 * al final, en «Sin carpeta», y se dice por qué: una llamada derivada desde la
 * ficha sin caso (Centenario, 23-10) queda ahí hasta que se le ponga su caso.
 *
 * Solo lectura y sin montos para quien no los ve. Los enlaces llevan a la
 * pantalla donde se hace la gestión si quien mira es del área.
 */

export type CarpetaViva = {
  id: string;
  etapa: string;
  tipo_postventa: string | null;
  proxima_accion: string | null;
  proxima_accion_at: string | null;
  proxima_accion_hora: string | null;
  lead_id?: string | null;
  perfiles: { nombre: string; codigo_comercial: string | null } | null;
  /** Si es de otra empresa del grupo, cuál (17-10). */
  empresa?: { id: string; razon_social: string };
};

type Caso = {
  id: string;
  codigo: string | null;
  tipo: TipoAtencion;
  etapa: EtapaAtencion;
  equipo_texto: string | null;
  solicitado_at: string;
  programada_at: string | null;
  oportunidad_id: string | null;
  servicio_id: string | null;
};
type Apertura = Parameters<typeof estadoApertura>[0] & {
  id: string;
  tipo: TipoApertura;
  programada_para: string;
  equipos: string;
  atencion_id: string | null;
  servicio_id: string | null;
};

const ESTADO_COTIZACION: Record<string, string> = { borrador: "borrador", enviada: "confirmada", aceptada: "aceptada", perdida: "perdida", vencida: "vencida" };
const APROBACION: Record<string, { texto: string; clases: string }> = {
  pendiente_gerencia: { texto: "espera a gerencia", clases: "bg-amber-500/10 text-amber-800" },
  aprobada_gerencia: { texto: "aprobada por gerencia", clases: "bg-[#1E7F4F]/10 text-[#1E7F4F]" },
  auto_aprobada: { texto: "aprobada", clases: "bg-[#1E7F4F]/10 text-[#1E7F4F]" },
  rechazada_gerencia: { texto: "rechazada por gerencia", clases: "bg-destructive/10 text-destructive" },
};

/** Adónde lleva un expediente: al expediente o —para Central— a su derivación, si la tiene. */
function enlaceDelExpediente(id: string, derivaciones: Map<string, string> | null): string | null {
  if (!derivaciones) return `/comercial/oportunidades/${id}`;
  const lead = derivaciones.get(id);
  return lead ? `/central/derivados/${lead}` : null;
}

export async function AbiertoConElCliente({
  cuentaId,
  vivas: propias,
  verPrecios,
  conAnotar,
  conEnlace,
  puedeDerivar,
  derivacionPorExpediente,
  titulo = "Abierto con este cliente",
}: {
  cuentaId: string;
  vivas: CarpetaViva[];
  verPrecios: boolean;
  conAnotar: boolean;
  /** Quien mira es del área: los enlaces llevan a donde se hace la gestión. */
  conEnlace: boolean;
  /** Puede derivar una llamada al almacén desde cada caso. */
  puedeDerivar: boolean;
  /** Solo Central: expediente → su derivación. */
  derivacionPorExpediente: Map<string, string> | null;
  titulo?: string;
}) {
  const supabase = await createClient();

  // LOS DEL GRUPO TAMBIÉN (17-10, Ariana PV3): una cadena factura con varias
  // razones sociales; la garantía de una se ve desde la empresa madre.
  const { data: grupo } = await supabase.rpc("grupo_economico", { p_cuenta_id: cuentaId });
  const otras = ((grupo ?? []) as { id: string; razon_social: string; es_esta: boolean }[]).filter((g) => !g.es_esta);
  const { data: delGrupo } = otras.length
    ? await supabase
        .from("oportunidades")
        .select("id, etapa, tipo_postventa, proxima_accion, proxima_accion_at, proxima_accion_hora, cuenta_id, lead_id, perfiles:comercial_id(nombre, codigo_comercial)")
        .in("cuenta_id", otras.map((g) => g.id))
        .is("cerrada_at", null)
        .not("etapa", "in", "(venta,rechazada,derivada,historico)")
        .limit(30)
    : { data: [] };
  const carpetas: CarpetaViva[] = [
    ...propias,
    ...((delGrupo ?? []) as unknown as (CarpetaViva & { cuenta_id: string })[]).map((o) => {
      const g = otras.find((x) => x.id === o.cuenta_id)!;
      return { ...o, empresa: { id: g.id, razon_social: g.razon_social } };
    }),
  ];
  const ids = carpetas.map((o) => o.id);

  const [{ data: cotizaciones }, { data: gestiones }, { data: pedidosData }, { data: casosData }, { data: aperturasData }] = await Promise.all([
    ids.length
      ? supabase.from("cotizaciones").select("oportunidad_id, codigo, estado, estado_aprobacion, total, moneda, created_at").in("oportunidad_id", ids).is("anulada_at", null).neq("estado", "anulada").order("created_at", { ascending: false }).limit(40)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase.from("actividades").select("oportunidad_id, tipo, nota, realizada_at, perfiles:realizada_por(nombre, codigo_comercial)").in("oportunidad_id", ids).order("realizada_at", { ascending: false }).limit(60)
      : Promise.resolve({ data: [] }),
    supabase.from("servicios_postventa").select("*").eq("cuenta_id", cuentaId).is("cerrado_at", null).order("created_at", { ascending: false }).limit(20),
    supabase
      .from("atenciones")
      .select("id, codigo, tipo, etapa, equipo_texto, solicitado_at, programada_at, oportunidad_id, servicio_id")
      .eq("cuenta_id", cuentaId)
      .is("cerrado_at", null)
      .order("solicitado_at", { ascending: false })
      .limit(20),
    // Las llamadas al almacén todavía vivas (0281). El comercial no las lee (RLS).
    supabase
      .from("aperturas_llamada")
      .select("id, tipo, programada_para, equipos, anulada_at, enviada_cliente_at, revisada_at, informe_at, tomada_at, atencion_id, servicio_id")
      .eq("cuenta_id", cuentaId)
      .is("anulada_at", null)
      .is("enviada_cliente_at", null)
      .order("programada_para", { ascending: true })
      .limit(20),
  ]);

  const cotizacionDe = new Map<string, NonNullable<typeof cotizaciones>[number]>();
  for (const c of cotizaciones ?? []) if (!cotizacionDe.has(c.oportunidad_id as string)) cotizacionDe.set(c.oportunidad_id as string, c);
  const gestionDe = new Map<string, NonNullable<typeof gestiones>[number]>();
  for (const g of gestiones ?? []) if (!gestionDe.has(g.oportunidad_id as string)) gestionDe.set(g.oportunidad_id as string, g);

  const pedidos = ((pedidosData ?? []) as unknown as (ServicioPostventa & { oportunidad_id?: string | null })[]).map((s) => (verPrecios ? s : sinPrecios(s)) as ServicioPostventa & { oportunidad_id?: string | null });
  const casos = (casosData ?? []) as Caso[];
  const aperturas = ((aperturasData ?? []) as unknown as Apertura[]).filter((a) => aQuienLeToca(estadoApertura(a)) !== null);

  // Cada cosa cuelga de su carpeta: el caso y el pedido por `oportunidad_id`;
  // la llamada, por el caso o el pedido del que salió.
  const casoDeCarpeta = (c: Caso) => (c.oportunidad_id && ids.includes(c.oportunidad_id) ? c.oportunidad_id : null);
  const pedidoDeCarpeta = (p: { oportunidad_id?: string | null }) => (p.oportunidad_id && ids.includes(p.oportunidad_id) ? p.oportunidad_id : null);
  const carpetaDeCaso = new Map(casos.map((c) => [c.id, casoDeCarpeta(c)]));
  const carpetaDePedido = new Map(pedidos.map((p) => [p.id, pedidoDeCarpeta(p)]));
  const aperturaDeCarpeta = (a: Apertura) => (a.atencion_id ? (carpetaDeCaso.get(a.atencion_id) ?? null) : a.servicio_id ? (carpetaDePedido.get(a.servicio_id) ?? null) : null);

  const llamadasDelCaso = (casoId: string) => aperturas.filter((a) => a.atencion_id === casoId);
  const llamadasDelPedido = (pedidoId: string) => aperturas.filter((a) => !a.atencion_id && a.servicio_id === pedidoId);
  const sueltas = {
    casos: casos.filter((c) => !casoDeCarpeta(c)),
    pedidos: pedidos.filter((p) => !pedidoDeCarpeta(p)),
    aperturas: aperturas.filter((a) => !a.atencion_id && !a.servicio_id),
  };
  const haySueltas = sueltas.casos.length + sueltas.pedidos.length + sueltas.aperturas.length > 0;
  const total = carpetas.length + casos.length + pedidos.length + aperturas.length;
  if (total === 0) return null;

  const deOtras = carpetas.length - propias.length;

  return (
    <div className="rounded-xl border border-primary/30 bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-foreground">
          <FolderOpen className="size-4" /> {titulo}
          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">{total}</span>
          {deOtras > 0 && (
            <span className="text-[11px] font-medium normal-case tracking-normal text-muted-foreground">
              {deOtras} de otra{deOtras === 1 ? "" : "s"} empresa{deOtras === 1 ? "" : "s"} del grupo
            </span>
          )}
        </h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Cada carpeta con lo que se está haciendo adentro: casos, llamadas al almacén y pedidos, con el paso que sigue y quién lo tiene.
        </p>
      </div>

      <ul className="divide-y divide-border">
        {carpetas.map((o) => {
          const cot = cotizacionDe.get(o.id);
          const ges = gestionDe.get(o.id);
          const autor = ges?.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;
          const aprob = cot?.estado_aprobacion ? APROBACION[cot.estado_aprobacion as string] : null;
          const href = enlaceDelExpediente(o.id, derivacionPorExpediente);
          const casosAqui = casos.filter((c) => casoDeCarpeta(c) === o.id);
          const pedidosAqui = pedidos.filter((p) => pedidoDeCarpeta(p) === o.id);
          const aperturasAqui = aperturas.filter((a) => aperturaDeCarpeta(a) === o.id);
          return (
            <li key={o.id} className="px-4 py-3">
              {/* LA CARPETA: de qué es, en qué va, quién la lleva y qué sigue. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <TipoExpedienteBadge tipo={o.tipo_postventa} grande />
                <EtapaBadge etapa={o.etapa} />
                {o.empresa && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">
                    <Building2 className="size-3" /> {o.empresa.razon_social}
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground">{o.perfiles ? `la lleva ${o.perfiles.codigo_comercial ?? ""} ${o.perfiles.nombre}`.trim() : "sin dueño"}</span>
                {href ? (
                  <Link href={href} className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                    {derivacionPorExpediente ? "Ver la derivación" : "Abrir la carpeta"} <ArrowRight className="size-3.5" />
                  </Link>
                ) : (
                  <span className="ml-auto text-[11px] text-muted-foreground">del archivo, sin derivación</span>
                )}
              </div>
              <div className="mt-1.5 space-y-1">
                {o.proxima_accion ? (
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-foreground">
                    <CalendarClock className="size-3.5 text-primary" />
                    <span className="font-semibold">Sigue:</span> {o.proxima_accion}
                    <span className="text-muted-foreground">· {o.proxima_accion_at ? fechaAgendada(o.proxima_accion_at, o.proxima_accion_hora) : "sin fecha"}</span>
                  </p>
                ) : (
                  <p className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-800">
                    <CalendarClock className="size-3.5" /> Sin próxima acción{conAnotar ? " — agéndela con «Anotar gestión»" : ""}
                  </p>
                )}
                {cot && (
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-foreground">
                    <FileText className="size-3.5 text-muted-foreground" />
                    <span className="font-medium">Cotización {cot.codigo ?? ""}</span>
                    {verPrecios && cot.total != null && (
                      <span className="tabular-nums text-muted-foreground">· {cot.moneda} {Number(cot.total).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    )}
                    <span className="text-muted-foreground">· {ESTADO_COTIZACION[cot.estado as string] ?? cot.estado}</span>
                    {aprob && <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", aprob.clases)}>{aprob.texto}</span>}
                  </p>
                )}
                {ges && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Última gestión</span> · {fechaLima(ges.realizada_at as string)}
                    {autor ? ` · ${autor.codigo_comercial ?? autor.nombre}` : ""}
                    {ges.nota ? ` — ${(ges.nota as string).trim()}` : ""}
                  </p>
                )}
              </div>

              {/* LO QUE CUELGA DE LA CARPETA. */}
              {casosAqui.length + pedidosAqui.length + aperturasAqui.length > 0 ? (
                <ul className="mt-2 space-y-1.5 border-l-2 border-primary/20 pl-3">
                  {casosAqui.map((c) => (
                    <FilaCaso key={c.id} c={c} llamadas={llamadasDelCaso(c.id)} conEnlace={conEnlace} puedeDerivar={puedeDerivar} cuentaId={cuentaId} />
                  ))}
                  {pedidosAqui.map((p) => (
                    <FilaPedido key={p.id} s={p} llamadas={llamadasDelPedido(p.id)} conEnlace={conEnlace} />
                  ))}
                  {aperturasAqui
                    .filter((a) => !casosAqui.some((c) => c.id === a.atencion_id) && !pedidosAqui.some((p) => p.id === a.servicio_id))
                    .map((a) => (
                      <FilaApertura key={a.id} a={a} />
                    ))}
                </ul>
              ) : (
                <p className="mt-2 text-[11px] text-muted-foreground">Sin casos ni pedidos en curso dentro de esta carpeta.</p>
              )}
            </li>
          );
        })}

        {haySueltas && (
          <li className="px-4 py-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
              <AlertTriangle className="size-3.5" /> Sin carpeta
            </p>
            <p className="text-[11px] text-muted-foreground">
              Se registró desde la ficha o desde otro lado y no cuelga de ninguna carpeta: no sale en el historial del caso. Ábralo y únalo a su caso o carpeta.
            </p>
            <ul className="mt-2 space-y-1.5 border-l-2 border-amber-400/40 pl-3">
              {sueltas.casos.map((c) => (
                <FilaCaso key={c.id} c={c} llamadas={llamadasDelCaso(c.id)} conEnlace={conEnlace} puedeDerivar={puedeDerivar} cuentaId={cuentaId} />
              ))}
              {sueltas.pedidos.map((p) => (
                <FilaPedido key={p.id} s={p} llamadas={llamadasDelPedido(p.id)} conEnlace={conEnlace} />
              ))}
              {sueltas.aperturas.map((a) => (
                <FilaApertura key={a.id} a={a} sinCaso />
              ))}
            </ul>
          </li>
        )}
      </ul>
    </div>
  );
}

function FilaCaso({ c, llamadas, conEnlace, puedeDerivar, cuentaId }: { c: Caso; llamadas: Apertura[]; conEnlace: boolean; puedeDerivar: boolean; cuentaId: string }) {
  const contenido = (
    <div className="flex items-start gap-2">
      <Wrench className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          {c.codigo && <span className="mr-1.5 font-mono text-xs text-primary">{c.codigo}</span>}
          {ETIQUETA_TIPO_ATENCION[c.tipo] ?? c.tipo}
          <span className="ml-2 text-[11px] font-normal text-muted-foreground">
            {c.equipo_texto ? `${c.equipo_texto.split("\n")[0]} · ` : ""}desde el {fechaLima(c.solicitado_at)}
          </span>
        </p>
        <p className="text-xs text-foreground">
          Etapa: <b>{ETIQUETA_ETAPA[c.etapa] ?? c.etapa}</b>
          {c.programada_at ? <span className="text-muted-foreground"> · programada {fechaLima(c.programada_at)}</span> : null}
        </p>
      </div>
      {conEnlace && <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
    </div>
  );
  return (
    <li>
      {conEnlace ? (
        <Link href={`/postventa/atenciones/${c.id}`} className="block rounded-md px-2 py-1.5 transition-colors hover:bg-accent">
          {contenido}
        </Link>
      ) : (
        <div className="px-2 py-1.5">{contenido}</div>
      )}
      {(llamadas.length > 0 || puedeDerivar) && (
        <ul className="ml-8 space-y-1">
          {llamadas.map((a) => (
            <FilaApertura key={a.id} a={a} chica />
          ))}
          {puedeDerivar && (
            <li className="pt-0.5">
              <AperturaLlamadaBoton cuentaId={cuentaId} atencionId={c.id} tipo="atencion_in_situ" equipos={c.equipo_texto ?? ""} etiqueta="Derivar llamada al almacén" compacto />
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

function FilaPedido({ s, llamadas, conEnlace }: { s: ServicioPostventa; llamadas: Apertura[]; conEnlace: boolean }) {
  const pasos = bloquesPedido(s).flatMap((b) => b.pasos);
  const hechos = pasos.length - pasos.filter((p) => !p.hecho).length;
  const faltan = pasos.filter((p) => !p.hecho);
  const siguiente = faltan[0] ?? null;
  const equipo = (s.equipo ?? "").split("\n")[0].trim() || "Pedido";
  const tieneProtocolo = Boolean(s.prueba_lista_at) || (Array.isArray(s.protocolo_fotos) && s.protocolo_fotos.length > 0);
  const contenido = (
    <div className="flex items-start gap-2">
      <Package className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold text-foreground" title={s.equipo ?? undefined}>{equipo}</p>
        <p className="text-[11px] text-muted-foreground">
          Pedido{s.numero_pedido_erp ? ` ERP ${s.numero_pedido_erp}` : ""} · {hechos} de {pasos.length} pasos
          {s.fecha_despacho && !s.despachado_at ? ` · sale el ${fechaCalendario(s.fecha_despacho)}` : ""}
          {s.despachado_at ? ` · despachado el ${fechaLima(s.despachado_at)}` : ""}
        </p>
        {siguiente && (
          <p className={cn("mt-0.5 text-xs", siguiente.trabado ? "text-amber-800" : "text-foreground")}>
            {siguiente.trabado && <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />}
            Sigue: <b>{siguiente.etiqueta}</b>
            <span className="text-muted-foreground"> · {etiquetaResponsable(siguiente.responsable)}</span>
          </p>
        )}
        {faltan.length > 1 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {faltan.slice(1, 6).map((p) => (
              <span key={p.etiqueta} className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {p.etiqueta}
              </span>
            ))}
            {faltan.length > 6 && <span className="text-[10px] text-muted-foreground">+{faltan.length - 6}</span>}
          </div>
        )}
      </div>
      {conEnlace && <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
    </div>
  );
  return (
    <li>
      {conEnlace ? (
        <>
          <Link href={`/postventa/pedidos/${s.id}`} className="block rounded-md px-2 pt-1.5 pb-1 transition-colors hover:bg-accent">
            {contenido}
          </Link>
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-2 pb-1 pl-8 text-[11px]">
            {tieneProtocolo ? (
              <Link href={`/pedidos/${s.id}/protocolo`} className="font-medium text-primary hover:underline">
                Protocolo de pruebas
              </Link>
            ) : (
              <span className="text-muted-foreground">Protocolo: el almacén todavía no lo sube</span>
            )}
          </div>
        </>
      ) : (
        <div className="px-2 py-1.5">{contenido}</div>
      )}
      {llamadas.length > 0 && (
        <ul className="ml-8 space-y-1">
          {llamadas.map((a) => (
            <FilaApertura key={a.id} a={a} chica />
          ))}
        </ul>
      )}
    </li>
  );
}

function FilaApertura({ a, chica = false, sinCaso = false }: { a: Apertura; chica?: boolean; sinCaso?: boolean }) {
  const estado = estadoApertura(a);
  return (
    <li>
      <Link href={`/aperturas/${a.id}`} className={cn("block rounded-md px-2 transition-colors hover:bg-accent", chica ? "py-1" : "py-1.5")}>
        <div className="flex items-start gap-2">
          <PhoneForwarded className={cn("mt-0.5 shrink-0 text-muted-foreground", chica ? "size-3.5" : "size-4")} />
          <div className="min-w-0 flex-1">
            <p className={cn("font-semibold text-foreground", chica ? "text-xs" : "text-sm")}>
              Llamada al almacén · {ETIQUETA_TIPO_APERTURA[a.tipo]}
              {sinCaso && <span className="ml-2 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">sin caso</span>}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {fechaHoraLima(a.programada_para)} · {a.equipos.split("\n")[0]}
            </p>
            <p className="text-xs text-foreground">
              <b>{ETIQUETA_ESTADO_APERTURA[estado]}</b>
              <span className="text-muted-foreground"> · le toca a{aQuienLeToca(estado) === "almacen" ? "l almacén" : " postventa"}</span>
            </p>
          </div>
          <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        </div>
      </Link>
    </li>
  );
}
