import { fechaLima } from "@/lib/fechas";
import { FileDown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { AprobarCotizacionBotones } from "@/components/crm/aprobar-cotizacion-botones";

export default async function AprobacionesPage() {
  const supabase = await createClient();
  const { data: cotizaciones } = await supabase
    .from("cotizaciones")
    .select(
      `id, codigo, serie, total, moneda, created_at,
       oportunidades(cuentas(razon_social), perfiles(nombre)),
       cotizacion_items(id, cantidad, precio_lista, precio_unitario, bajo_lista, requiere_aprobacion, descripcion, productos(marca, modelo, nombre, segmento))`,
    )
    .eq("estado_aprobacion", "pendiente_gerencia")
    .order("created_at", { ascending: true });

  return (
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
              productos: { marca: string; modelo: string; nombre: string; segmento: string } | null;
            }[]) ?? [];
            // Lo que gerencia tiene que decidir: bajo lista O industrial
            // (migración 0067). Se dice el motivo porque no es el mismo trabajo
            // revisar un precio cedido que confirmar el de un industrial.
            const porDecidir = items.filter((i) => i.requiere_aprobacion).length;
            const bajoLista = items.filter((i) => i.bajo_lista).length;
            const industriales = items.filter((i) => i.requiere_aprobacion && !i.bajo_lista).length;
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
                        {porDecidir} de {items.length} por revisar
                        {bajoLista > 0 && industriales > 0
                          ? ` (${bajoLista} bajo lista, ${industriales} industrial${industriales === 1 ? "" : "es"})`
                          : bajoLista > 0
                            ? " bajo lista"
                            : " · industriales"}
                      </span>
                    </p>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {c.moneda} {c.total.toLocaleString("es-PE")}
                  </span>
                </div>
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
                    }))}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SeccionPanel>
  );
}
