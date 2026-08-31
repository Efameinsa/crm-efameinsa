import { fechaLima } from "@/lib/fechas";
import { ChevronRight, FileDown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { AprobarCotizacionBotones } from "@/components/crm/aprobar-cotizacion-botones";
import { HistorialAprobaciones } from "@/components/crm/historial-aprobaciones";
import { CompendioGestion } from "@/components/crm/compendio-gestion";
import { cargarCompendio, type Compendio } from "@/lib/compendio-cierre";

export const dynamic = "force-dynamic";

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
      `id, codigo, serie, total, moneda, estado, estado_aprobacion, aprobada_at, nota_gerencia, enviada_at,
       oportunidades(cuentas(razon_social), perfiles(nombre)),
       cotizacion_items(cantidad, precio_lista, precio_unitario, bajo_lista, aprobado, descripcion, productos(marca, modelo, nombre))`,
    )
    .in("estado_aprobacion", ["aprobada_gerencia", "rechazada_gerencia"])
    .order("aprobada_at", { ascending: false, nullsFirst: false })
    .limit(30);

  const { data: cotizaciones } = await supabase
    .from("cotizaciones")
    .select(
      `id, codigo, serie, total, moneda, created_at, oportunidad_id,
       oportunidades(cuentas(razon_social), perfiles(nombre)),
       cotizacion_items(id, cantidad, precio_lista, precio_unitario, bajo_lista, requiere_aprobacion, descripcion, productos(marca, modelo, nombre, segmento, foto_path))`,
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
  await Promise.all(
    (cotizaciones ?? []).map(async (c) => {
      if (!c.oportunidad_id) return;
      const compendio = await cargarCompendio(c.oportunidad_id);
      if (compendio) compendios.set(c.id, compendio);
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
            const items = (c.cotizacion_items as unknown as {
              id: string;
              cantidad: number;
              precio_lista: number | null;
              precio_unitario: number;
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
                      <span className="font-mono">{c.codigo ?? "Borrador"}</span> · Serie {c.serie} · De{" "}
                      {oportunidad?.perfiles?.nombre ?? "un comercial"} ·{" "}
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
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <a
                    href={`/api/cotizaciones/${c.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <FileDown className="size-3.5" />
                    Ver PDF
                  </a>
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
    <HistorialAprobaciones filas={historial ?? []} />
    </div>
  );
}
