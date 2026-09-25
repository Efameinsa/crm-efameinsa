import Link from "next/link";
import { FileText, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaHoraLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const sinRuc = (s: string | null) =>
  (s ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");
/** La hora del pedido de la página (una sola lectura del reloj por render del servidor). */
const ahoraMs = () => Date.now();
const primeraLinea = (s: string | null) =>
  (s ?? "").split("\n")[0].replace(/\s+/g, " ").trim();

type Fila = {
  id: string;
  cliente_texto: string | null;
  equipo: string | null;
  numero_pedido_erp: string | null;
  apertura_despacho_at: string;
  apertura_enviada_almacen_at: string | null;
  fecha_despacho: string | null;
  despacho_hora: string | null;
  despachado_at: string | null;
  almacen_listo_at: string | null;
  perfiles: { nombre: string } | null;
};

/**
 * LAS APERTURAS QUE ENVÍA POSTVENTA (Lesly, 25-09 13:58: «almacén no tiene
 * la opción para ver las aperturas que envía postventa»).
 *
 * Postventa emite la apertura de servicio del pedido —la hoja con equipos,
 * dirección, contacto y condiciones— y se la manda al almacén. Hasta hoy el
 * almacén solo leía «Apertura emitida el…» en el pedido, sin poder abrirla.
 * Acá están todas: primero las que esperan salir, con la hoja en PDF a un
 * clic; abajo, las que ya salieron en los últimos 30 días.
 */
export default async function AperturasDePostventaPage() {
  await requerirPerfil();
  const supabase = await createClient();
  const ahora = ahoraMs();
  const hace30 = new Date(ahora - 30 * 86400000).toISOString();
  const { data } = await supabase
    .from("servicios_postventa")
    .select(
      "id, cliente_texto, equipo, numero_pedido_erp, apertura_despacho_at, apertura_enviada_almacen_at, fecha_despacho, despacho_hora, despachado_at, almacen_listo_at, perfiles!servicios_postventa_apertura_despacho_por_fkey(nombre)",
    )
    .not("apertura_despacho_at", "is", null)
    .is("cerrado_at", null)
    .order("apertura_despacho_at", { ascending: false })
    .limit(200);
  const filas = (data ?? []) as unknown as Fila[];
  const porSalir = filas.filter((f) => !f.despachado_at);
  const salieron = filas.filter(
    (f) => f.despachado_at && f.despachado_at >= hace30,
  );

  return (
    <div className="space-y-4">
      <SeccionPanel
        titulo={`Aperturas de postventa por salir · ${porSalir.length}`}
      >
        <p className="mb-2 text-xs text-muted-foreground">
          La hoja que emite postventa para cada pedido: equipos, dirección,
          contacto y condiciones. Ábrala para preparar el despacho; las marcadas
          «Nueva» llegaron en las últimas 24 horas.
        </p>
        {porSalir.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No hay aperturas esperando salir: postventa todavía no emitió
            ninguna nueva.
          </p>
        ) : (
          <Lista lista={porSalir} ahora={ahora} />
        )}
      </SeccionPanel>
      {salieron.length > 0 && (
        <SeccionPanel
          titulo={`Ya salieron (últimos 30 días) · ${salieron.length}`}
        >
          <Lista lista={salieron} ahora={ahora} />
        </SeccionPanel>
      )}
    </div>
  );
}

function Lista({ lista, ahora }: { lista: Fila[]; ahora: number }) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {lista.map((f) => {
        const nueva =
          !f.despachado_at &&
          !f.almacen_listo_at &&
          ahora - new Date(f.apertura_despacho_at).getTime() < 24 * 3600 * 1000;
        return (
          <li
            key={f.id}
            className="flex flex-wrap items-center gap-3 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm font-semibold text-foreground">
                {sinRuc(f.cliente_texto)}
                {nueva && (
                  <span className="rounded bg-primary px-1.5 text-[10px] font-bold uppercase text-primary-foreground">
                    Nueva
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {primeraLinea(f.equipo)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Emitida el {fechaHoraLima(f.apertura_despacho_at)}
                {f.perfiles?.nombre ? ` por ${f.perfiles.nombre}` : ""}
                {f.numero_pedido_erp ? ` · Pedido ${f.numero_pedido_erp}` : ""}
                {" · "}
                <span
                  className={cn(
                    "font-medium",
                    f.despachado_at
                      ? "text-[#1E7F4F]"
                      : f.almacen_listo_at
                        ? "text-[#1E7F4F]"
                        : f.fecha_despacho
                          ? "text-amber-700"
                          : "text-foreground",
                  )}
                >
                  {f.despachado_at
                    ? `Salió el ${fechaHoraLima(f.despachado_at)}`
                    : f.fecha_despacho
                      ? `Sale el ${f.fecha_despacho}${f.despacho_hora ? ` ${String(f.despacho_hora).slice(0, 5)}` : ""}${f.almacen_listo_at ? " · listo" : " · falta confirmar que está listo"}`
                      : "Sin fecha de despacho"}
                </span>
              </p>
            </div>
            <a
              href={`/api/postventa/pedidos/${f.id}/apertura/pdf`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <FileText className="size-3.5" /> Ver la apertura
            </a>
            <Link
              href={`/almacen/pedidos/${f.id}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              <Package className="size-3.5" /> El pedido
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
