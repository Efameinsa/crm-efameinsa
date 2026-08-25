import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaLima } from "@/lib/fechas";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * La agenda de postventa completa: las mismas columnas de
 * `RESUMEN AGENDA DE POST VENTA 25-08-2026.xlsx`, que es el documento con el
 * que el área trabaja hoy.
 *
 * No se "mejoró" el modelo al traerlo: se respetó su vocabulario —confirmación
 * de abono, prueba y embalaje, planos de preinstalación, puesta en marcha—
 * porque es el procedimiento que ya siguen y la pantalla tiene que servirles el
 * primer día, no obligarlos a traducir su trabajo a otro idioma.
 *
 * Lo único que cambia respecto del Excel es el orden: primero lo pendiente y
 * dentro de eso lo más cercano, en vez del orden de captura.
 */

const FILTROS = [
  { clave: "pendientes", etiqueta: "Pendientes" },
  { clave: "completados", etiqueta: "Completados" },
  { clave: "todos", etiqueta: "Todos" },
] as const;

export default async function AgendaPostventaPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>;
}) {
  const { ver } = await searchParams;
  const filtro = FILTROS.find((f) => f.clave === ver)?.clave ?? "pendientes";
  const supabase = await createClient();

  let q = supabase.from("servicios_postventa").select("*", { count: "exact" });
  if (filtro === "pendientes") q = q.eq("completado", false);
  if (filtro === "completados") q = q.eq("completado", true);
  const { data: filas, count } = await q
    .order("completado")
    .order("fecha_despacho", { ascending: true, nullsFirst: false })
    .order("fecha_confirmacion", { ascending: false, nullsFirst: false })
    .limit(400);

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  return (
    <SeccionPanel
      titulo="Agenda de postventa"
      accion={
        <div className="flex items-center gap-2">
          {FILTROS.map((f) => (
            <Link
              key={f.clave}
              href={`/postventa/agenda?ver=${f.clave}`}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
                filtro === f.clave
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {f.etiqueta}
            </Link>
          ))}
          <span className="text-xs text-muted-foreground">{count ?? 0}</span>
        </div>
      }
    >
      {!filas || filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay servicios que mostrar.</p>
      ) : (
        // La tabla es ancha a propósito: son las columnas del procedimiento
        // real. Se desplaza dentro de su caja para que la página no lo haga.
        <div className="overflow-x-auto">
          <Table className="min-w-[1200px]">
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Equipo</TableHead>
                <TableHead>Servicio</TableHead>
                <TableHead>Ubicación</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Abono</TableHead>
                <TableHead>Prueba y embalaje</TableHead>
                <TableHead>Despacho</TableHead>
                <TableHead>Planos</TableHead>
                <TableHead>Puesta en marcha</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((s) => {
                const atrasado = !s.completado && s.fecha_despacho && s.fecha_despacho < hoy;
                return (
                  <TableRow key={s.id} className={cn(atrasado && "bg-amber-50")}>
                    <TableCell className="max-w-[200px] align-top text-xs font-medium">
                      {s.cliente_texto ?? "—"}
                      {s.fecha_confirmacion && (
                        <span className="block text-[11px] font-normal text-muted-foreground">
                          compra {fechaLima(s.fecha_confirmacion)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[260px] align-top text-[11px] text-muted-foreground">
                      {/* Las series van dentro de la descripción, como las
                          escriben ellos: identifican la máquina concreta. */}
                      <span className="line-clamp-4 whitespace-pre-line">{s.equipo ?? "—"}</span>
                    </TableCell>
                    <TableCell className="align-top text-xs">{s.tipo_servicio}</TableCell>
                    <TableCell className="max-w-[160px] align-top text-[11px] text-muted-foreground">
                      {s.ubicacion ?? "—"}
                    </TableCell>
                    <TableCell className="align-top text-right text-xs tabular-nums">
                      {s.monto != null ? `${s.moneda} ${Number(s.monto).toLocaleString("es-PE")}` : "—"}
                      {s.forma_pago && (
                        <span className="block text-[11px] font-normal text-muted-foreground">{s.forma_pago}</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top text-xs">{s.confirmacion_abono ?? "—"}</TableCell>
                    <TableCell className="align-top text-xs">{s.prueba_embalaje ?? "—"}</TableCell>
                    <TableCell className="align-top text-xs">
                      {s.fecha_despacho ? (
                        <span className={cn("tabular-nums", atrasado && "font-bold text-amber-800")}>
                          {fechaLima(s.fecha_despacho)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{s.despacho_nota ?? "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top text-xs">{s.planos_preinstalacion ?? "—"}</TableCell>
                    <TableCell className="align-top text-xs">
                      {s.puesta_en_marcha ? fechaLima(s.puesta_en_marcha) : (s.puesta_nota ?? "—")}
                    </TableCell>
                    <TableCell className="align-top">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          s.completado
                            ? "bg-[#1E7F4F]/10 text-[#1E7F4F]"
                            : "bg-amber-500/15 text-amber-800",
                        )}
                      >
                        {s.completado ? "Completado" : "Pendiente"}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </SeccionPanel>
  );
}
