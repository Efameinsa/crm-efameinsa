import Link from "@/components/enlace";
import { notFound } from "next/navigation";
import { ArrowRight, Building2, FileText, MapPin, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { puedeVerPrecios, veTodoPostventa } from "@/lib/postventa";
import { cargarHistorialCuenta } from "@/lib/historial-cuenta";
import { firmarAdjuntosDeCierres } from "@/lib/adjuntos-cierre";
import { fechaLima, fechaAgendada } from "@/lib/fechas";
import { cn } from "@/lib/utils";
import { guardaFichaCliente } from "@/lib/propuesta/guardas";
import { PendientesDelCliente } from "@/components/crm/pendientes-del-cliente";
import { UltimosCierres } from "@/components/crm/ultimos-cierres";
import { EquiposDelCliente } from "@/components/crm/equipos-del-cliente";
import { HistorialCuenta } from "@/components/crm/historial-cuenta";
import { ListaInformesCierre, TablaComprasAnteriores } from "@/components/crm/secciones-cliente";
import { AperturaLlamadaBoton } from "@/components/crm/apertura-llamada-boton";
import { VisitaPlantaBoton } from "@/components/crm/visita-planta-boton";
import { RegistrarSeguimientoBoton } from "@/components/crm/registrar-seguimiento-boton";
import { Plus } from "lucide-react";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ResumenCuenta } from "@/components/crm/resumen-cuenta";
import { GrupoEconomico } from "@/components/crm/grupo-economico";
import { AvisoMismoCliente } from "@/components/crm/aviso-mismo-cliente";
import { ReasignarCarteraBoton } from "@/components/crm/reasignar-cartera-boton";
import { AccionNuevoInforme } from "@/components/crm/secciones-cliente";
import { ContactosEditables } from "@/components/crm/contactos-editables";
import { IdentidadCuenta } from "@/components/crm/identidad-cuenta";
import { CambiarRubro } from "@/components/crm/cambiar-rubro";
import { DocumentosDelServidor } from "@/components/crm/documentos-del-servidor";
import { OfrecerMantenimientoBoton } from "@/components/crm/ofrecer-mantenimiento-boton";
import { TraerPedidoAntiguoBoton } from "@/components/crm/traer-pedido-antiguo-boton";
import { ListaOportunidadesCuenta, rangoOportunidad } from "@/components/crm/ficha-cuenta";

export const dynamic = "force-dynamic";

const PESTANAS = [
  { clave: "resumen", etiqueta: "Resumen" },
  { clave: "pedidos", etiqueta: "Pedidos y casos" },
  { clave: "equipos", etiqueta: "Equipos" },
  { clave: "ventas", etiqueta: "Ventas" },
  { clave: "historial", etiqueta: "Historial" },
  { clave: "documentos", etiqueta: "Documentos y sedes" },
  { clave: "contactos", etiqueta: "Datos y contactos" },
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
  guardaFichaCliente(perfil);
  const verPrecios = puedeVerPrecios(perfil);
  const esArea = veTodoPostventa(perfil);
  // LAS MISMAS REGLAS QUE LA FICHA DE SIEMPRE (auditoría 25-09): quién ve cada
  // acción no cambia con la vista.
  const comoGerencia = ["gerencia", "admin"].includes(perfil.rol);
  const haceCasos = Boolean(perfil.es_postventa) || Boolean(perfil.hace_postventa);
  const puedeCrearRubros = ["gerencia", "admin", "operaciones"].includes(perfil.rol) || Boolean(perfil.es_operaciones);
  const supabase = await createClient();

  const { data: cuenta } = await supabase
    .from("cuentas")
    .select(
      "id, razon_social, nombre_comercial, tipo_doc, num_doc, rubro_id, comercial_id, carpetas_servidor, direccion, ultima_venta_at, cartera_desde, notas, fusionada_en, perfiles(nombre, codigo_comercial), contactos(id, nombre, cargo, telefono, email, documento, direccion, es_principal)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!cuenta) notFound();

  const [{ data: rubros }, { data: comerciales }] = await Promise.all([
    supabase.from("catalogo_rubros").select("id, nombre").eq("activo", true).order("nombre"),
    comoGerencia
      ? supabase.from("perfiles").select("id, nombre, codigo_comercial").eq("rol", "comercial").eq("activo", true).eq("es_prueba", false).eq("es_soporte", false).order("codigo_comercial")
      : Promise.resolve({ data: null }),
  ]);
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
      .select("id, etapa, intencion, tipo_postventa, proxima_accion, proxima_accion_at, proxima_accion_hora, cerrada_at, monto_estimado, moneda, comercial_id, lead_id, perfiles:comercial_id(nombre, codigo_comercial)")
      .eq("cuenta_id", id)
      .order("cerrada_at", { ascending: true, nullsFirst: true })
      .limit(50),
  ]);
  const dueno = cuenta.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;
  const contactos = (cuenta.contactos ?? []) as {
    id: string; nombre: string; cargo: string | null; telefono: string | null; email: string | null; documento: string | null; direccion: string | null; es_principal: boolean;
  }[];
  const principal = contactos.find((c) => c.es_principal) ?? contactos[0];
  const ops = (oportunidades ?? []) as unknown as {
    id: string; etapa: string; tipo_postventa: string | null; proxima_accion: string | null; proxima_accion_at: string | null; proxima_accion_hora: string | null;
    cerrada_at: string | null; monto_estimado: number | null; moneda: string; intencion: string | null; comercial_id: string | null; lead_id: string | null;
    perfiles: { nombre: string; codigo_comercial: string | null } | null;
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
            {comoGerencia && (
              <div className="mt-1">
                <ReasignarCarteraBoton cuentaId={cuenta.id} razonSocial={cuenta.razon_social} comercialActual={cuenta.comercial_id as string | null} comerciales={comerciales ?? []} />
              </div>
            )}
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
              {cuenta.cartera_desde && <span>Cliente desde {fechaLima(cuenta.cartera_desde)}</span>}
            </p>
            <AvisoMismoCliente cuentaId={cuenta.id} baseHref={comoGerencia ? "/gerencia/clientes" : undefined} className="mt-2" />
          </div>
          <div className="flex max-w-xl flex-wrap items-center justify-end gap-1.5">
            {!comoGerencia && <VisitaPlantaBoton cuentaId={cuenta.id} empresa={cuenta.razon_social} ruc={cuenta.num_doc as string | null} compacto />}
            {haceCasos && !comoGerencia && <RegistrarSeguimientoBoton cuentaId={cuenta.id} compacto />}
            {haceCasos && !comoGerencia && <AperturaLlamadaBoton cuentaId={cuenta.id} tipo="atencion_in_situ" etiqueta="Derivar llamada" compacto />}
            {!haceCasos && !comoGerencia && cuenta.comercial_id === perfil.id && <RegistrarSeguimientoBoton cuentaId={cuenta.id} compacto comercial />}
            {haceCasos && !perfil.solo_preventivo && !comoGerencia && <TraerPedidoAntiguoBoton cuentaId={cuenta.id} compacto />}
            {esArea && !comoGerencia && <OfrecerMantenimientoBoton cuentaId={cuenta.id} compacto />}
            {haceCasos && !perfil.solo_preventivo && (
              <Link
                href={`/postventa/casos/nuevo?cuenta=${cuenta.id}`}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Plus className="size-3.5" /> Registrar un caso
              </Link>
            )}
            <Link
              href={comoGerencia ? `/gerencia/clientes/${cuenta.id}?hoy=1` : `/comercial/cartera/${cuenta.id}?hoy=1`}
              className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:underline"
            >
              Vista anterior de la ficha
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
              {/* Editable, como en la ficha de siempre (auditoría 25-09). */}
              <ResumenCuenta cuentaId={cuenta.id} notasIniciales={cuenta.notas} />
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

        {pestana === "ventas" && (
          <PestanaVentas cuentaId={cuenta.id} informes={informes ?? []} ops={ops} verPrecios={verPrecios} quienMira={perfil.id} comoGerencia={comoGerencia} />
        )}

        {pestana === "documentos" && (
          <div className="max-w-4xl space-y-4">
            <DocumentosDelServidor
              cuentaId={cuenta.id}
              razonSocial={cuenta.razon_social}
              nombreComercial={cuenta.nombre_comercial as string | null}
              carpetas={cuenta.carpetas_servidor as Record<string, string> | null}
            />
            <GrupoEconomico cuentaId={cuenta.id} comoGerencia={comoGerencia} />
          </div>
        )}

        {pestana === "historial" && <HistorialCompleto cuentaId={cuenta.id} verPrecios={verPrecios} />}

        {pestana === "contactos" && (
          <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="text-[13px] font-bold uppercase tracking-wide text-foreground">Datos del cliente</p>
              <IdentidadCuenta
                cuentaId={cuenta.id}
                tipoDoc={cuenta.tipo_doc}
                numDoc={cuenta.num_doc}
                razonSocial={cuenta.razon_social}
                rubroId={(cuenta.rubro_id as number | null) ?? null}
                rubros={(rubros ?? []) as { id: number; nombre: string }[]}
              />
              {(rubros ?? []).length > 0 && (
                <CambiarRubro
                  cuentaId={cuenta.id}
                  rubroId={(cuenta.rubro_id as number | null) ?? null}
                  rubros={(rubros ?? []) as { id: number; nombre: string }[]}
                  puedeAgregar={puedeCrearRubros}
                />
              )}
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="mb-2 text-[13px] font-bold uppercase tracking-wide text-foreground">Contactos ({contactos.length})</p>
              <ContactosEditables cuentaId={cuenta.id} contactos={contactos} />
            </div>
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
  quienMira,
  comoGerencia,
}: {
  quienMira: string;
  comoGerencia: boolean;
  cuentaId: string;
  informes: { id: string; codigo: string | null; serie: string | null; fecha: string | null; monto_total: number | null; moneda: string | null; emitido_at: string | null; adjuntos: unknown }[];
  ops: {
    id: string; etapa: string; tipo_postventa: string | null; intencion: string | null; proxima_accion: string | null; proxima_accion_at: string | null; cerrada_at: string | null;
    monto_estimado: number | null; moneda: string; comercial_id: string | null; perfiles: { nombre: string; codigo_comercial: string | null } | null;
  }[];
  verPrecios: boolean;
}) {
  const supabase = await createClient();
  const adjuntos = await firmarAdjuntosDeCierres(supabase, informes as Parameters<typeof firmarAdjuntosDeCierres>[1]);
  const { ventasConDetalle } = await cargarHistorialCuenta(supabase, cuentaId, { sinMontos: !verPrecios });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* La lista de la ficha de siempre (auditoría 25-09): de quién es cada
          expediente, su monto, y «trabajar» los del histórico. */}
      <div className="self-start">
        <SeccionPanel titulo={`Expedientes (${ops.length})`}>
          <ListaOportunidadesCuenta oportunidades={[...ops].sort((a, b) => rangoOportunidad(a) - rangoOportunidad(b))} quienMira={quienMira} comoGerencia={comoGerencia} />
        </SeccionPanel>
      </div>
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[13px] font-bold uppercase tracking-wide text-foreground">Cierres</p>
            <AccionNuevoInforme cuentaId={cuentaId} />
          </div>
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
