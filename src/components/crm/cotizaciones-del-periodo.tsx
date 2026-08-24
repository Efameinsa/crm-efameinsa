import { FileDown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fechaLima, fechaCalendarioLarga } from "@/lib/fechas";
import { SeccionPanel } from "@/components/crm/seccion-panel";

// Las cotizaciones de un comercial en un período, abribles una por una.
//
// Pedido del ing. Carlos el 24-08: desde supervisión entraba al detalle del
// comercial y veía "3 cotizaciones" sin poder abrir ninguna. Un número no
// sirve para revisar precios; el documento sí.
//
// Se juntan las dos fuentes en una sola lista porque para gerencia son lo
// mismo — un presupuesto que salió al cliente: las del CRM (PDF generado al
// vuelo) y las del archivo de documentos de la empresa (PDF en el bucket
// privado, migración 0048). Las del archivo llevan su marca para que no
// parezca que se hicieron acá.

const TOPE = 60;

interface Fila {
  id: string;
  codigo: string | null;
  serie: string;
  cliente: string;
  fecha: string;
  monto: number | null;
  moneda: string;
  estado: string | null;
  href: string | null;
  delArchivo: boolean;
}

export async function CotizacionesDelPeriodo({
  comercialId,
  desde,
  hasta,
}: {
  comercialId: string;
  desde: string;
  hasta: string;
}) {
  const supabase = await createClient();

  const [{ data: crm }, { data: archivo }] = await Promise.all([
    supabase
      .from("cotizaciones")
      .select(
        "id, codigo, serie, total, moneda, estado, created_at, oportunidades!inner(comercial_id, cuentas(razon_social))",
      )
      .eq("oportunidades.comercial_id", comercialId)
      .gte("created_at", `${desde}T00:00:00-05:00`)
      .lte("created_at", `${hasta}T23:59:59-05:00`)
      .order("created_at", { ascending: false })
      .limit(TOPE),
    supabase
      .from("cotizaciones_historicas")
      .select("id, codigo, serie, cliente, fecha, monto_sin_igv, pdf_path")
      .eq("comercial_id", comercialId)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false })
      .limit(TOPE),
  ]);

  const filas: Fila[] = [
    ...(crm ?? []).map((c) => {
      const op = c.oportunidades as unknown as { cuentas: { razon_social: string } | null } | null;
      return {
        id: c.id,
        codigo: c.codigo,
        serie: c.serie as string,
        cliente: op?.cuentas?.razon_social ?? "Cliente sin nombre",
        fecha: fechaLima(c.created_at),
        monto: Number(c.total),
        moneda: c.moneda as string,
        estado: c.estado as string,
        href: `/api/cotizaciones/${c.id}/pdf`,
        delArchivo: false,
      };
    }),
    ...(archivo ?? []).map((c) => ({
      id: c.id,
      codigo: c.codigo,
      serie: c.serie as string,
      cliente: c.cliente ?? "Cliente sin nombre",
      fecha: fechaCalendarioLarga(String(c.fecha).slice(0, 10)),
      monto: c.monto_sin_igv != null ? Number(c.monto_sin_igv) : null,
      moneda: "USD",
      estado: null,
      // Sin PDF subido no hay nada que abrir: el presupuesto existe pero solo
      // en .doc dentro de la unidad de red.
      href: c.pdf_path ? `/api/cotizaciones-historicas/${c.id}/pdf` : null,
      delArchivo: true,
    })),
  ];

  return (
    <SeccionPanel
      titulo="Cotizaciones del período"
      accion={
        filas.length > 0 ? (
          <span className="text-xs text-muted-foreground">{filas.length}</span>
        ) : undefined
      }
    >
      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin cotizaciones en el período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 font-medium">Número</th>
                <th className="pb-2 pl-2 font-medium">Cliente</th>
                <th className="pb-2 pl-2 font-medium">Fecha</th>
                <th className="pb-2 pl-2 text-right font-medium">Monto</th>
                <th className="pb-2 pl-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-b border-border last:border-0">
                  <td className="py-1.5 whitespace-nowrap font-mono text-foreground">
                    {/* Sin número = borrador todavía sin enviar (migración 0064). */}
                    {f.codigo ?? <span className="text-muted-foreground">Borrador</span>}
                    <span className="ml-1.5 font-sans text-[10px] text-muted-foreground">{f.serie}</span>
                  </td>
                  <td className="max-w-[18rem] truncate py-1.5 pl-2 text-foreground" title={f.cliente}>
                    {f.cliente}
                    {f.delArchivo && (
                      <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        archivo
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pl-2 whitespace-nowrap text-muted-foreground">{f.fecha}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums text-foreground">
                    {f.monto != null ? `${f.moneda} ${f.monto.toLocaleString("es-PE")}` : "—"}
                  </td>
                  <td className="py-1.5 pl-2 text-right">
                    {f.href ? (
                      <a
                        href={f.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                      >
                        <FileDown className="size-3.5" />
                        Ver PDF
                      </a>
                    ) : (
                      <span className="text-muted-foreground/70">sin PDF</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Se listan hasta {TOPE} de cada fuente. Las marcadas &ldquo;archivo&rdquo; son presupuestos que la
        empresa emitía antes del CRM; las que no tienen PDF solo quedaron en .doc dentro de la unidad de red.
      </p>
    </SeccionPanel>
  );
}
