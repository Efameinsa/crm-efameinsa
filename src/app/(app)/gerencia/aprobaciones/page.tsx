import { fechaLima } from "@/lib/fechas";
import { EtiquetaVersion } from "@/components/crm/etiqueta-version";
import { codigoConVersion } from "@/lib/version-cotizacion";
import { ChevronRight, FileDown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { AprobarCotizacionBotones } from "@/components/crm/aprobar-cotizacion-botones";
import { HistorialDecisionesGerencia } from "@/components/crm/historial-decisiones-gerencia";
import { decisionesDeGerencia, type DecisionGerencia } from "@/lib/datos-cotizador";
import { HistorialAprobaciones } from "@/components/crm/historial-aprobaciones";
import { CompendioGestion } from "@/components/crm/compendio-gestion";
import { cargarCompendio, type Compendio } from "@/lib/compendio-cierre";
import { VerPdfEnLaApp } from "@/components/crm/ver-pdf-en-la-app";

export const dynamic = "force-dynamic";

const haceDias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

export default async function AprobacionesPage() {
  const supabase = await createClient();
  // Lo ya resuelto. Pedido del ing. Carlos el 25-08: «si ya aprobaste, no
  // puedes ver lo que aprobaste, entonces tiene que haber un historial… para
  // saber por qué me manda Brenda». Sin esto, aprobar borraba la evidencia de
  // qué se había aprobado y a qué precio, que es justo lo que hay que poder
  // mirar cuando el mismo comercial vuelve a pedir un descuento parecido.
  const { data: historial } = await supabase
    .from("cotizaciones")
    .select(
      `id, codigo, serie, total, moneda, estado, estado_aprobacion, aprobada_at, nota_gerencia, enviada_at, version,
       oportunidades!cotizaciones_oportunidad_id_fkey(cuentas(razon_social), perfiles(nombre)),
       cotizacion_items(cantidad, precio_lista, precio_unitario, bajo_lista, aprobado, descripcion, productos(marca, modelo, nombre))`,
    )
    .in("estado_aprobacion", ["aprobada_gerencia", "rechazada_gerencia"])
    .order("aprobada_at", { ascending: false, nullsFirst: false })
    .limit(30);

  // LOS BORRADORES DE POSTVENTA (Santos, 05-10: «cuando Gabriela hace una
  // cotización se genera un borrador y el ingeniero debe poder verlo, como
  // los de los comerciales»). Los de un comercial llegan acá porque casi
  // siempre ceden algo sobre la referencia; los de postventa (servicios y
  // repuestos a precio de catálogo) salían «auto aprobados» y gerencia no se
  // enteraba hasta que estaban enviados. Se muestran para mirarlos: no hay
  // nada que aprobar, y si algo sí cede precio ya está en la lista de arriba.
  const { data: borradoresCrudos } = await supabase
    .from("cotizaciones")
    .select(
      `id, total, moneda, serie, created_at, updated_at,
       autor:perfiles!cotizaciones_creada_por_fkey(nombre, es_postventa, es_prueba),
       oportunidades!cotizaciones_oportunidad_id_fkey(cuentas(razon_social))`,
    )
    .eq("estado", "borrador")
    .neq("estado_aprobacion", "pendiente_gerencia")
    .gte("created_at", haceDias(30))
    .order("updated_at", { ascending: false })
    .limit(200);
  const borradoresPostventa = (borradoresCrudos ?? [])
    .map((b) => ({
      ...b,
      autor: b.autor as unknown as { nombre: string; es_postventa: boolean | null; es_prueba: boolean | null } | null,
      cliente: (b.oportunidades as unknown as { cuentas: { razon_social: string } | null } | null)?.cuentas?.razon_social ?? "Cliente sin nombre",
    }))
    .filter((b) => b.autor?.es_postventa && !b.autor.es_prueba && Number(b.total) > 0);

  const { data: cotizaciones } = await supabase
    .from("cotizaciones")
    .select(
      `id, codigo, serie, total, moneda, created_at, oportunidad_id, version,
       autor:perfiles!cotizaciones_creada_por_fkey(nombre, codigo_comercial),
       oportunidades!cotizaciones_oportunidad_id_fkey(cuentas(razon_social), perfiles(nombre)),
       cotizacion_items(id, cantidad, precio_lista, precio_unitario, precio_con_igv, bajo_lista, requiere_aprobacion, descripcion, productos(marca, modelo, nombre, segmento, foto_path))`,
    )
    .eq("estado_aprobacion", "pendiente_gerencia")
    .order("created_at", { ascending: true });

  // CÓMO SE LLEGÓ HASTA ACÁ, antes de decidir el precio. Pedido del ing.
  // Carlos el 31-08 por WhatsApp, mirando una cotización de COINREFRI que
  // pedía 16,3 % por debajo de la referencia: «es indispensable que me permita
  // verificar el detalle de esta gestión del cliente… un desplegable para ver
  // el seguimiento o histórico, a fin de entender el perfil por el cual se le
  // pretende ofertar un precio muy por debajo de lo establecido».
  //
  // Es el MISMO compendio que ya viaja en el expediente de cierre, no una
  // vista nueva: la pregunta de gerencia es la misma antes y después de la
  // venta —cómo se hizo esta gestión—, y dos pantallas que la contesten
  // distinto sería peor que una.
  const compendios = new Map<string, Compendio>();
  // Y LO QUE GERENCIA YA CONTESTÓ sobre este mismo cliente (0237): la segunda
  // versión llega con la observación de la primera a la vista, que es lo que
  // Carlos pidió el 15-09 con el caso de Brenda.
  const historiales = new Map<string, DecisionGerencia[]>();
  await Promise.all(
    (cotizaciones ?? []).map(async (c) => {
      if (!c.oportunidad_id) return;
      const [compendio, decisiones] = await Promise.all([
        cargarCompendio(c.oportunidad_id),
        decisionesDeGerencia(supabase, { oportunidadId: c.oportunidad_id }),
      ]);
      if (compendio) compendios.set(c.id, compendio);
      if (decisiones.length) historiales.set(c.id, decisiones);
    }),
  );

  return (
    <div className="space-y-4">
    <SeccionPanel
      titulo="Cotizaciones pendientes de aprobación"
      accion={
        cotizaciones && cotizaciones.length > 0 ? (
          <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            {cotizaciones.length} por revisar
          </span>
        ) : undefined
      }
    >
      {!cotizaciones || cotizaciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay cotizaciones esperando aprobación.</p>
      ) : (
        <div className="space-y-2">
          {cotizaciones.map((c) => {
            const oportunidad = c.oportunidades as unknown as {
              cuentas: { razon_social: string } | null;
              perfiles: { nombre: string } | null;
            } | null;
            // QUIÉN LA HIZO, no de quién es el expediente (29-09). En postventa
            // cualquiera del área cotiza en expedientes a nombre de PV: una
            // cotización de Gabriela (PV2) salía «De Rubí Simeon».
            const autor = c.autor as unknown as { nombre: string; codigo_comercial: string | null } | null;
            const dueno = oportunidad?.perfiles?.nombre ?? null;
            const items = (c.cotizacion_items as unknown as {
              id: string;
              cantidad: number;
              precio_lista: number | null;
              precio_unitario: number;
              precio_con_igv?: number | null;
              bajo_lista: boolean;
              requiere_aprobacion: boolean;
              descripcion: string | null;
              productos: { marca: string; modelo: string; nombre: string; segmento: string; foto_path: string | null } | null;
            }[]) ?? [];
            // Desde la migración 0074 gerencia decide una sola cosa: equipos
            // cotizados por debajo del precio de referencia. Se muestra cuánto
            // se está cediendo en total, que es la pregunta real.
            const porDecidir = items.filter((i) => i.requiere_aprobacion).length;
            const cedido = items
              .filter((i) => i.bajo_lista && i.precio_lista != null)
              .reduce((s, i) => s + (Number(i.precio_lista) - Number(i.precio_unitario)) * i.cantidad, 0);
            return (
              <div key={c.id} className="rounded-lg border border-border bg-background p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {oportunidad?.cuentas?.razon_social ?? "Cuenta sin nombre"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {/* Todavía no tiene número: el correlativo se asigna al
                          enviarla (migración 0064). */}
                      <span className="font-mono">{c.codigo ?? "Borrador"}</span>
                      {c.codigo && <EtiquetaVersion version={c.version} />} · Serie {c.serie} · De{" "}
                      {autor?.nombre ?? dueno ?? "un comercial"}
                      {autor && dueno && autor.nombre !== dueno && ` (expediente de ${dueno})`} ·{" "}
                      {fechaLima(c.created_at)} ·{" "}
                      <span className="font-semibold text-amber-700">
                        {porDecidir} de {items.length} por debajo de la referencia
                        {cedido > 0 && ` · se ceden ${c.moneda} ${Math.round(cedido).toLocaleString("es-PE")}`}
                      </span>
                    </p>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {c.moneda} {c.total.toLocaleString("es-PE")}
                  </span>
                </div>
                {compendios.has(c.id) && (
                  <details className="group mt-2.5 rounded-lg border border-border bg-secondary/40">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-accent">
                      <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
                      Ver la gestión de este cliente
                      <span className="font-normal text-muted-foreground">
                        · {compendios.get(c.id)!.gestiones}{" "}
                        {compendios.get(c.id)!.gestiones === 1 ? "gestión" : "gestiones"}
                      </span>
                    </summary>
                    <div className="p-2 pt-0">
                      <CompendioGestion compendio={compendios.get(c.id)!} titulo="Cómo se llegó hasta acá" />
                    </div>
                  </details>
                )}
                {historiales.has(c.id) && (
                  <div className="mt-2.5">
                    <HistorialDecisionesGerencia decisiones={historiales.get(c.id)!} compacto />
                  </div>
                )}
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <VerPdfEnLaApp
                    url={`/api/cotizaciones/${c.id}/pdf`}
                    titulo={codigoConVersion(c.codigo, c.version) ?? "Presupuesto"}
                    className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <FileDown className="size-3.5" />
                    Ver PDF
                  </VerPdfEnLaApp>
                  <AprobarCotizacionBotones
                    cotizacionId={c.id}
                    moneda={c.moneda}
                    items={items.map((i) => ({
                      id: i.id,
                      nombre: i.productos
                        ? `${i.productos.marca} ${i.productos.modelo} — ${i.productos.nombre}`
                        : (i.descripcion ?? "Equipo sin nombre"),
                      cantidad: i.cantidad,
                      precioLista: i.precio_lista != null ? Number(i.precio_lista) : null,
                      precioUnitario: Number(i.precio_unitario),
                      precioConIgv: i.precio_con_igv == null ? null : Number(i.precio_con_igv),
                      bajoLista: i.bajo_lista,
                      requiereAprobacion: i.requiere_aprobacion,
                      esIndustrial: i.productos?.segmento === "industrial",
                      fotoPath: i.productos?.foto_path ?? null,
                    }))}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SeccionPanel>
    <SeccionPanel
      titulo="Borradores de postventa"
      accion={
        borradoresPostventa.length > 0 ? (
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
            {borradoresPostventa.length} en los últimos 30 días
          </span>
        ) : undefined
      }
    >
      {borradoresPostventa.length === 0 ? (
        <p className="text-sm text-muted-foreground">Postventa no tiene cotizaciones en borrador en los últimos 30 días.</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            Cotizaciones de servicios y repuestos que postventa está armando y todavía no envió. Van a precio de catálogo, así que no piden
            aprobación: están acá para que se puedan revisar antes de que salgan.
          </p>
          <div className="divide-y divide-border rounded-lg border border-border">
            {borradoresPostventa.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{b.cliente}</p>
                  <p className="text-xs text-muted-foreground">
                    De {b.autor?.nombre ?? "postventa"} · Serie {b.serie} · actualizado el {fechaLima(b.updated_at ?? b.created_at)}
                  </p>
                </div>
                <span className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {b.moneda} {Number(b.total).toLocaleString("es-PE")}
                  </span>
                  <VerPdfEnLaApp
                    url={`/api/cotizaciones/${b.id}/pdf`}
                    titulo={`Borrador de ${b.cliente}`}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
                  >
                    <FileDown className="size-3.5" /> Ver PDF
                  </VerPdfEnLaApp>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </SeccionPanel>
    <HistorialAprobaciones filas={historial ?? []} />
    </div>
  );
}
