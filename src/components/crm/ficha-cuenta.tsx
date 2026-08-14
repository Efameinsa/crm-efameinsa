import { notFound } from "next/navigation";
import { Phone, Mail, MapPin, FileText, User } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { HistorialCuenta } from "@/components/crm/historial-cuenta";
import type { EventoTimeline } from "@/components/crm/linea-tiempo-cuenta";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Se muestran las 300 actividades más recientes por cuenta — de sobra para el
// volumen real del piloto (~50 gestiones/día por comercial); si algún día se
// supera, la expansión del cliente (LineaTiempoCuenta) igual funciona sobre
// lo que llega, solo dejaría de ser "el historial completo".
const LIMITE_ACTIVIDADES = 300;

function etiquetaCotizacion(estado: string, estadoAprobacion: string): { label: string; color: "ambar" | "verde" | "rojo" } {
  if (estadoAprobacion === "pendiente_gerencia") return { label: "pendiente de aprobación", color: "ambar" };
  if (estadoAprobacion === "rechazada_gerencia") return { label: "rechazada", color: "rojo" };
  if (estado === "enviada") return { label: "enviada", color: "verde" };
  if (estado === "aceptada") return { label: "aceptada", color: "verde" };
  return { label: "creada", color: "verde" };
}

interface Item {
  cantidad: number;
  precio_unitario: number;
  productos: { marca: string; modelo: string; nombre: string } | null;
}

interface VentaConDetalle {
  id: string;
  fecha_venta: string;
  monto_total: number;
  moneda: string;
  oportunidad_id: string;
  cotizaciones: { codigo: string | null; serie: string; cotizacion_items: Item[] } | null;
}

export async function FichaCuenta({ cuentaId, comoGerencia = false }: { cuentaId: string; comoGerencia?: boolean }) {
  const supabase = await createClient();

  const { data: cuenta } = await supabase
    .from("cuentas")
    .select(
      "id, razon_social, tipo_doc, num_doc, direccion, distrito, provincia, departamento, ultima_venta_at, cartera_desde, comercial_id, perfiles(nombre, codigo_comercial), contactos(id, nombre, cargo, telefono, email, es_principal)",
    )
    .eq("id", cuentaId)
    .maybeSingle();

  if (!cuenta) notFound();

  const dueno = cuenta.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;
  const contactos =
    (cuenta.contactos as unknown as {
      id: string;
      nombre: string;
      cargo: string | null;
      telefono: string | null;
      email: string | null;
      es_principal: boolean;
    }[]) ?? [];

  const { data: oportunidades } = await supabase.from("oportunidades").select("id").eq("cuenta_id", cuentaId);
  const opIds = (oportunidades ?? []).map((o) => o.id);

  const [{ data: actividades }, { data: cotizaciones }, { data: ventas }] =
    opIds.length === 0
      ? [{ data: [] }, { data: [] }, { data: [] }]
      : await Promise.all([
          supabase
            .from("actividades")
            .select("id, tipo, nota, realizada_at, oportunidad_id, catalogo_resultados_gestion(codigo, nombre)")
            .in("oportunidad_id", opIds)
            .order("realizada_at", { ascending: false })
            .limit(LIMITE_ACTIVIDADES),
          supabase
            .from("cotizaciones")
            .select("id, codigo, estado, estado_aprobacion, total, moneda, created_at, oportunidad_id")
            .in("oportunidad_id", opIds)
            .order("created_at", { ascending: false }),
          supabase
            .from("ventas")
            .select(
              "id, fecha_venta, monto_total, moneda, oportunidad_id, cotizacion_id, cotizaciones(codigo, serie, cotizacion_items(cantidad, precio_unitario, productos(marca, modelo, nombre)))",
            )
            .in("oportunidad_id", opIds)
            .order("fecha_venta", { ascending: false }),
        ]);

  const eventos: EventoTimeline[] = [
    ...(actividades ?? []).map((a): EventoTimeline => {
      const resultado = a.catalogo_resultados_gestion as unknown as { codigo: string; nombre: string } | null;
      return {
        tipo: "actividad",
        id: a.id,
        fecha: a.realizada_at,
        oportunidadId: a.oportunidad_id,
        tipoActividad: a.tipo,
        nota: a.nota,
        resultado,
      };
    }),
    ...(cotizaciones ?? []).map((c): EventoTimeline => {
      const { label, color } = etiquetaCotizacion(c.estado, c.estado_aprobacion);
      return {
        tipo: "cotizacion",
        id: c.id,
        fecha: c.created_at,
        oportunidadId: c.oportunidad_id,
        codigo: c.codigo,
        estadoLabel: label,
        color,
        monto: c.total,
        moneda: c.moneda,
      };
    }),
    ...(ventas ?? []).map(
      (v): EventoTimeline => ({
        tipo: "venta",
        id: v.id,
        fecha: v.fecha_venta,
        oportunidadId: v.oportunidad_id,
        monto: v.monto_total,
        moneda: v.moneda,
      }),
    ),
  ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  const ventasConDetalle = (ventas ?? []) as unknown as VentaConDetalle[];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">{cuenta.razon_social}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {cuenta.tipo_doc !== "SIN_DOC" && (
                <span className="inline-flex items-center gap-1">
                  <FileText className="size-3.5" />
                  {cuenta.tipo_doc}: {cuenta.num_doc}
                </span>
              )}
              {cuenta.direccion && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {cuenta.direccion}
                </span>
              )}
            </div>
          </div>
          {comoGerencia && (
            <Badge>Cartera de: {dueno?.nombre ?? "Sin asignar"}{dueno?.codigo_comercial ? ` (${dueno.codigo_comercial})` : ""}</Badge>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>
            Cliente desde{" "}
            <span className="font-medium text-foreground">
              {cuenta.cartera_desde ? new Date(cuenta.cartera_desde).toLocaleDateString("es-PE") : "—"}
            </span>
          </span>
          <span>
            Última venta{" "}
            <span className="font-medium text-foreground">
              {cuenta.ultima_venta_at ? new Date(cuenta.ultima_venta_at).toLocaleDateString("es-PE") : "Nunca"}
            </span>
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {ventasConDetalle.length > 0 && (
            <SeccionPanel titulo="Compras anteriores">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cotización</TableHead>
                    <TableHead>Equipos</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ventasConDetalle.map((v, i) => (
                    <TableRow key={v.id}>
                      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                        {new Date(v.fecha_venta).toLocaleDateString("es-PE")}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {v.cotizaciones?.codigo ?? "—"} · {v.cotizaciones?.serie}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {(v.cotizaciones?.cotizacion_items ?? [])
                          .map(
                            (it) =>
                              `${it.cantidad}× ${it.productos?.marca ?? ""} ${it.productos?.modelo ?? ""} — US$ ${it.precio_unitario.toLocaleString("es-PE")} c/u`,
                          )
                          .join(" · ")}
                      </TableCell>
                      <TableCell
                        className={cnTotal(i === 0)}
                      >
                        {v.moneda} {v.monto_total.toLocaleString("es-PE")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </SeccionPanel>
          )}

          <SeccionPanel titulo="Historial del cliente">
            <HistorialCuenta eventos={eventos} />
          </SeccionPanel>
        </div>

        <SeccionPanel titulo={`Contactos (${contactos.length})`}>
          {contactos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin contactos registrados.</p>
          ) : (
            <div className="space-y-3">
              {contactos.map((c) => (
                <div key={c.id} className="rounded-lg border border-border p-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <User className="size-3.5 text-muted-foreground" />
                    {c.nombre}
                    {c.es_principal && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        Principal
                      </span>
                    )}
                  </p>
                  {c.cargo && <p className="text-xs text-muted-foreground">{c.cargo}</p>}
                  <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                    {c.telefono && (
                      <p className="flex items-center gap-1">
                        <Phone className="size-3.5" />
                        {c.telefono}
                      </p>
                    )}
                    {c.email && (
                      <p className="flex items-center gap-1">
                        <Mail className="size-3.5" />
                        {c.email}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SeccionPanel>
      </div>
    </div>
  );
}

function cnTotal(masReciente: boolean): string {
  return masReciente
    ? "text-right font-bold tabular-nums text-foreground"
    : "text-right font-medium tabular-nums text-foreground";
}
