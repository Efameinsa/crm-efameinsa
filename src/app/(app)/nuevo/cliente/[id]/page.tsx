import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Building2, FileText, MapPin, Phone, Mail, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { puedeVerPrecios, veTodoPostventa } from "@/lib/postventa";
import { cargarHistorialCuenta } from "@/lib/historial-cuenta";
import { firmarAdjuntosDeCierres } from "@/lib/adjuntos-cierre";
import { fechaLima, fechaAgendada } from "@/lib/fechas";
import { cn } from "@/lib/utils";
import { PendientesDelCliente } from "@/components/crm/pendientes-del-cliente";
import { UltimosCierres } from "@/components/crm/ultimos-cierres";
import { EquiposDelCliente } from "@/components/crm/equipos-del-cliente";
import { HistorialCuenta } from "@/components/crm/historial-cuenta";
import { ListaInformesCierre, TablaComprasAnteriores } from "@/components/crm/secciones-cliente";
import { EtapaBadge } from "@/components/crm/etapa-badge";
import { AperturaLlamadaBoton } from "@/components/crm/apertura-llamada-boton";
import { VisitaPlantaBoton } from "@/components/crm/visita-planta-boton";
import { RegistrarSeguimientoBoton } from "@/components/crm/registrar-seguimiento-boton";

export const dynamic = "force-dynamic";

const TIPO_EXPEDIENTE: Record<string, string> = {
  garantia: "Soporte técnico",
  repuesto: "Repuestos",
  mantenimiento: "Mantenimiento preventivo",
  seguimiento: "Seguimiento de postventa",
};

const PESTANAS = [
  { clave: "resumen", etiqueta: "Resumen" },
  { clave: "pedidos", etiqueta: "Pedidos y casos" },
  { clave: "equipos", etiqueta: "Equipos" },
  { clave: "ventas", etiqueta: "Ventas" },
  { clave: "historial", etiqueta: "Historial" },
  { clave: "contactos", etiqueta: "Contactos" },
] as const;

/**
 * FICHA 360 DEL CLIENTE (propuesta, 23-09).
 *
 * La ficha de hoy es una página larga: resumen, expedientes, documentos,
 * cierres, compras, historial y contactos uno debajo del otro, y lo vivo del
 * cliente se pierde entre la historia. Acá la cabecera queda fija con lo que
 * se pregunta primero (de quién es, cuándo compró, qué tiene abierto, sus
 * equipos) y las acciones del día; el contenido va en pestañas, y la de
 * entrada —Resumen— es solo lo que pide acción y lo último que pasó.
 */
export default async function Ficha360Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  const pestana = PESTANAS.find((p) => p.clave === tab)?.clave ?? "resumen";
  const perfil = await requerirPerfil();
  const verPrecios = puedeVerPrecios(perfil);
  const esArea = veTodoPostventa(perfil);
  const supabase = await createClient();

  const { data: cuenta } = await supabase
    .from("cuentas")
    .select("id, razon_social, nombre_comercial, tipo_doc, num_doc, direccion, ultima_venta_at, cartera_desde, notas, fusionada_en, perfiles(nombre, codigo_comercial), contactos(id, nombre, cargo, telefono, email, es_principal)")
    .eq("id", id)
    .maybeSingle();
  if (!cuenta) notFound();

  const [
    { count: pedidosAbiertos },
    { count: equipos },
    { count: casosAbiertos },
    { data: informes },
    { data: oportunidades },
  ] = await Promise.all([
    supabase.from("servicios_postventa").select("id", { count: "exact", head: true }).eq("cuenta_id", id).is("cerrado_at", null),
    supabase.from("equipos_instalados").select("id", { count: "exact", head: true }).eq("cuenta_id", id),
    supabase.from("atenciones").select("id", { count: "exact", head: true }).eq("cuenta_id", id).is("cerrado_at", null),
    supabase.from("informes_cierre").select("id, codigo, serie, fecha, monto_total, moneda, emitido_at, adjuntos").eq("cuenta_id", id).order("created_at", { ascending: false }),
    supabase
      .from("oportunidades")
      .select("id, etapa, tipo_postventa, proxima_accion, proxima_accion_at, proxima_accion_hora, cerrada_at, monto_estimado, moneda, perfiles:comercial_id(codigo_comercial)")
      .eq("cuenta_id", id)
      .order("cerrada_at", { ascending: true, nullsFirst: true })
      .limit(50),
  ]);
  const dueno = cuenta.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;
  const contactos = (cuenta.contactos ?? []) as { id: string; nombre: string; cargo: string | null; telefono: string | null; email: string | null; es_principal: boolean }[];
  const principal = contactos.find((c) => c.es_principal) ?? contactos[0];
  const ops = (oportunidades ?? []) as unknown as {
    id: string; etapa: string; tipo_postventa: string | null; proxima_accion: string | null; proxima_accion_at: string | null; proxima_accion_hora: string | null;
    cerrada_at: string | null; monto_estimado: number | null; moneda: string; perfiles: { codigo_comercial: string | null } | null;
  }[];
  const vivas = ops.filter((o) => !o.cerrada_at && !["venta", "rechazada", "derivada", "historico"].includes(o.etapa));
  const siguiente = vivas.filter((o) => o.proxima_accion_at).sort((a, b) => (a.proxima_accion_at! < b.proxima_accion_at! ? -1 : 1))[0];

  const chips: { etiqueta: string; valor: string; tab: string; alerta?: boolean }[] = [
    { etiqueta: "Expedientes vivos", valor: String(vivas.length), tab: "ventas" },
    { etiqueta: "Pedidos abiertos", valor: String(pedidosAbiertos ?? 0), tab: "pedidos", alerta: (pedidosAbiertos ?? 0) > 0 },
    { etiqueta: "Casos técnicos", valor: String(casosAbiertos ?? 0), tab: "pedidos", alerta: (casosAbiertos ?? 0) > 0 },
    { etiqueta: "Equipos", valor: String(equipos ?? 0), tab: "equipos" },
    { etiqueta: "Última venta", valor: cuenta.ultima_venta_at ? fechaLima(cuenta.ultima_venta_at) : "Nunca", tab: "ventas" },
  ];

  return (
    <div className="space-y-4">
      {/* LA CABECERA FIJA: quién es, de quién es, qué tiene y qué se hace. */}
      <div className="sticky top-0 z-10 -mx-1 rounded-xl border border-border bg-card/95 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Building2 className="size-3.5" /> Cliente · cartera de {dueno ? `${dueno.codigo_comercial ?? ""} ${dueno.nombre}`.trim() : "nadie"}
            </p>
            <h1 className="truncate text-xl font-bold text-foreground">{cuenta.razon_social}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {cuenta.num_doc && (
                <span className="inline-flex items-center gap-1">
                  <FileText className="size-3.5" /> {cuenta.tipo_doc} {cuenta.num_doc}
                </span>
              )}
              {cuenta.direccion && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" /> {cuenta.direccion}
                </span>
              )}
              {principal && (
                <span className="inline-flex items-center gap-1">
                  <UserRound className="size-3.5" /> {principal.nombre}
                  {principal.telefono ? ` · ${principal.telefono}` : ""}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {esArea && <RegistrarSeguimientoBoton cuentaId={cuenta.id} compacto />}
            {esArea && <AperturaLlamadaBoton cuentaId={cuenta.id} tipo="atencion_in_situ" etiqueta="Derivar llamada" compacto />}
            <VisitaPlantaBoton cuentaId={cuenta.id} empresa={cuenta.razon_social} ruc={cuenta.num_doc as string | null} compacto />
            <Link href={`/comercial/cartera/${cuenta.id}?hoy=1`} className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:underline">
              Ficha de hoy
            </Link>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {chips.map((c) => (
            <Link
              key={c.etiqueta}
              href={`?tab=${c.tab}`}
              className={cn("rounded-lg border px-3 py-2 transition-colors hover:bg-accent", c.alerta ? "border-primary/30 bg-primary/5" : "border-border")}
            >
              <p className={cn("text-base font-bold tabular-nums", c.alerta ? "text-primary" : "text-foreground")}>{c.valor}</p>
              <p className="text-[11px] text-muted-foreground">{c.etiqueta}</p>
            </Link>
          ))}
        </div>

        <nav className="-mb-4 mt-3 flex gap-1 overflow-x-auto border-t border-border pt-1" aria-label="Pestañas de la ficha">
          {PESTANAS.map((p) => (
            <Link
              key={p.clave}
              href={`?tab=${p.clave}`}
              aria-current={p.clave === pestana ? "page" : undefined}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                p.clave === pestana ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {p.etiqueta}
            </Link>
          ))}
        </nav>
      </div>

      <div className="pt-2">
        {pestana === "resumen" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-4">
              {siguiente && (
                <Link href={`/comercial/oportunidades/${siguiente.id}`} className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Lo que sigue con este cliente</p>
                    <p className="text-base font-semibold text-foreground">{siguiente.proxima_accion ?? "Seguimiento"}</p>
                    <p className="text-xs text-muted-foreground">{fechaAgendada(siguiente.proxima_accion_at, siguiente.proxima_accion_hora)}</p>
                  </div>
                  <ArrowRight className="size-5 text-primary" />
                </Link>
              )}
              <UltimosCierres informes={informes ?? []} />
              {cuenta.notas && (
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Lo que hay que saber</p>
                  <p className="line-clamp-6 whitespace-pre-wrap text-sm text-foreground">{cuenta.notas}</p>
                </div>
              )}
              <UltimoHistorial cuentaId={cuenta.id} verPrecios={verPrecios} />
            </div>
            <PendientesDelCliente cuentaId={cuenta.id} conEnlace={esArea} />
          </div>
        )}

        {pestana === "pedidos" && (
          <div className="max-w-3xl">
            <PendientesDelCliente cuentaId={cuenta.id} conEnlace={esArea} />
            {(pedidosAbiertos ?? 0) + (casosAbiertos ?? 0) === 0 && (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No hay pedidos ni casos técnicos abiertos con este cliente. Lo cerrado está en «Ventas» e «Historial».
              </p>
            )}
          </div>
        )}

        {pestana === "equipos" && (
          <div className="max-w-4xl">
            {(equipos ?? 0) > 0 ? (
              <EquiposDelCliente cuentaId={cuenta.id} />
            ) : (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Todavía no hay equipos de este cliente en el parque. Entran cuando se cierra un pedido con su serie.
              </p>
            )}
          </div>
        )}

        {pestana === "ventas" && <PestanaVentas cuentaId={cuenta.id} informes={informes ?? []} ops={ops} verPrecios={verPrecios} />}

        {pestana === "historial" && <HistorialCompleto cuentaId={cuenta.id} verPrecios={verPrecios} />}

        {pestana === "contactos" && (
          <div className="grid max-w-4xl gap-3 sm:grid-cols-2">
            {contactos.length === 0 && <p className="text-sm text-muted-foreground">Sin contactos cargados.</p>}
            {contactos.map((c) => (
              <div key={c.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <p className="font-semibold text-foreground">
                  {c.nombre}
                  {c.es_principal && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Principal</span>}
                </p>
                {c.cargo && <p className="text-xs text-muted-foreground">{c.cargo}</p>}
                <div className="mt-2 space-y-1 text-sm">
                  {c.telefono && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="size-3.5 text-muted-foreground" /> {c.telefono}
                    </p>
                  )}
                  {c.email && (
                    <p className="flex items-center gap-1.5">
                      <Mail className="size-3.5 text-muted-foreground" /> {c.email}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

async function UltimoHistorial({ cuentaId, verPrecios }: { cuentaId: string; verPrecios: boolean }) {
  const supabase = await createClient();
  const { eventos } = await cargarHistorialCuenta(supabase, cuentaId, { sinMontos: !verPrecios });
  const ultimos = eventos.slice(0, 5);
  if (ultimos.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-[13px] font-bold uppercase tracking-wide text-foreground">Lo último que pasó</p>
        <Link href="?tab=historial" className="text-[11px] font-medium text-primary hover:underline">
          Todo el historial →
        </Link>
      </div>
      <div className="p-2">
        <HistorialCuenta eventos={ultimos} />
      </div>
    </div>
  );
}

async function HistorialCompleto({ cuentaId, verPrecios }: { cuentaId: string; verPrecios: boolean }) {
  const supabase = await createClient();
  const { eventos } = await cargarHistorialCuenta(supabase, cuentaId, { sinMontos: !verPrecios });
  return (
    <div className="max-w-5xl rounded-xl border border-border bg-card p-2 shadow-sm">
      <HistorialCuenta eventos={eventos} />
    </div>
  );
}

async function PestanaVentas({
  cuentaId,
  informes,
  ops,
  verPrecios,
}: {
  cuentaId: string;
  informes: { id: string; codigo: string | null; serie: string | null; fecha: string | null; monto_total: number | null; moneda: string | null; emitido_at: string | null; adjuntos: unknown }[];
  ops: { id: string; etapa: string; tipo_postventa: string | null; proxima_accion: string | null; proxima_accion_at: string | null; cerrada_at: string | null; monto_estimado: number | null; moneda: string; perfiles: { codigo_comercial: string | null } | null }[];
  verPrecios: boolean;
}) {
  const supabase = await createClient();
  const adjuntos = await firmarAdjuntosDeCierres(supabase, informes as Parameters<typeof firmarAdjuntosDeCierres>[1]);
  const { ventasConDetalle } = await cargarHistorialCuenta(supabase, cuentaId, { sinMontos: !verPrecios });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="self-start rounded-xl border border-border bg-card shadow-sm">
        <p className="border-b border-border px-4 py-3 text-[13px] font-bold uppercase tracking-wide text-foreground">Expedientes ({ops.length})</p>
        <ul className="divide-y divide-border">
          {ops.map((o) => (
            <li key={o.id}>
              <Link href={`/comercial/oportunidades/${o.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent">
                <EtapaBadge etapa={o.etapa} />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {TIPO_EXPEDIENTE[o.tipo_postventa ?? ""] ?? "Venta de equipo"}
                  <span className="text-muted-foreground">
                    {o.cerrada_at
                      ? ` · cerrado el ${fechaLima(o.cerrada_at)}`
                      : o.proxima_accion
                        ? ` · ${o.proxima_accion}${o.proxima_accion_at ? ` (${o.proxima_accion_at.split("-").reverse().join("/")})` : ""}`
                        : " · sin próxima acción"}
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground">{o.perfiles?.codigo_comercial ?? ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="mb-2 text-[13px] font-bold uppercase tracking-wide text-foreground">Cierres</p>
          <ListaInformesCierre informes={informes as Parameters<typeof ListaInformesCierre>[0]["informes"]} adjuntosPorInforme={adjuntos} sinPrecios={!verPrecios} />
        </div>
      </div>
      {ventasConDetalle.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm lg:col-span-2">
          <p className="mb-2 text-[13px] font-bold uppercase tracking-wide text-foreground">Compras anteriores</p>
          <TablaComprasAnteriores ventas={ventasConDetalle} />
        </div>
      )}
    </div>
  );
}
