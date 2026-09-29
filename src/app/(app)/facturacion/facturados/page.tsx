import Link from "@/components/enlace";
import { Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { Input } from "@/components/ui/input";
import { FacturaEnviada } from "@/components/crm/acciones-facturacion";

export const dynamic = "force-dynamic";

const sinRuc = (s: string | null) => (s ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");
const diaDe = (fecha: string) => new Date(`${fecha}T12:00:00-05:00`).toLocaleDateString("es-PE", { timeZone: "America/Lima" });

/**
 * FACTURADOS (0306): lo que Facturación ya registró, lo más nuevo arriba. Con
 * buscador por cliente, número de factura o de pedido; el PDF se abre para
 * reimprimir. Desde el 29-09 (0331) también dice si ya se le envió al cliente.
 */
export default async function FacturadosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requerirPerfil();
  const { q } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("facturas_pedido")
    .select("id, servicio_id, numero, fecha_emision, path, nota, created_at, enviada_cliente_at, perfiles!facturas_pedido_registrada_por_fkey(nombre), enviador:perfiles!facturas_pedido_enviada_cliente_por_fkey(nombre), servicios_postventa(cliente_texto, numero_pedido_erp, monto, moneda)")
    .order("created_at", { ascending: false })
    .limit(300);
  type Fila = {
    id: string; servicio_id: string; numero: string; fecha_emision: string; path: string | null; nota: string | null; created_at: string;
    enviada_cliente_at: string | null;
    perfiles: { nombre: string } | null;
    enviador: { nombre: string } | null;
    servicios_postventa: { cliente_texto: string | null; numero_pedido_erp: string | null; monto: number | null; moneda: string | null } | null;
  };
  let filas = (data ?? []) as unknown as Fila[];
  const texto = q?.trim().toLowerCase();
  if (texto) {
    filas = filas.filter((f) =>
      [f.numero, f.servicios_postventa?.cliente_texto, f.servicios_postventa?.numero_pedido_erp].some((v) => String(v ?? "").toLowerCase().includes(texto)),
    );
  }
  const conPdf = filas.filter((f) => f.path);
  const { data: firmadas } = conPdf.length ? await supabase.storage.from("adjuntos").createSignedUrls(conPdf.map((f) => f.path!), 3600) : { data: [] };
  const url = new Map((firmadas ?? []).filter((x) => x.path && x.signedUrl).map((x) => [x.path!, x.signedUrl]));

  return (
    <SeccionPanel titulo={`Facturados · ${filas.length}`}>
      <form className="mb-3 flex max-w-md gap-2" method="get">
        <Input name="q" defaultValue={q ?? ""} placeholder="Cliente, N.º de factura o de pedido" />
      </form>
      {filas.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">{texto ? "Nada coincide con esa búsqueda." : "Todavía no hay facturas registradas."}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Factura</th>
                <th className="px-3 py-2">Emitida</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Pedido</th>
                <th className="px-3 py-2">Registró</th>
                <th className="px-3 py-2">Enviada al cliente</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map((f) => (
                <tr key={f.id}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono font-semibold">{f.numero}</td>
                  <td className="whitespace-nowrap px-3 py-2">{diaDe(f.fecha_emision)}</td>
                  <td className="px-3 py-2">
                    {sinRuc(f.servicios_postventa?.cliente_texto ?? null)}
                    {f.nota && <span className="block text-[11px] text-muted-foreground">{f.nota}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link href={`/pedidos/${f.servicio_id}/imprimir`} target="_blank" className="font-mono text-primary hover:underline">
                      {f.servicios_postventa?.numero_pedido_erp ?? "ver"}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{f.perfiles?.nombre ?? "—"}</td>
                  <td className="px-3 py-2">
                    <FacturaEnviada facturaId={f.id} servicioId={f.servicio_id} enviadaAt={f.enviada_cliente_at} enviadaPor={f.enviador?.nombre ?? null} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {f.path && url.get(f.path) ? (
                      <a href={url.get(f.path) ?? undefined} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                        <Printer className="size-3.5" /> PDF
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">sin PDF</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SeccionPanel>
  );
}
