import Link from "@/components/enlace";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, BadgeCheck, Paperclip } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { puedeVerPrecios } from "@/lib/postventa";
import { formatoMonto } from "@/lib/pagos-finanzas";
import { fechaHoraLima } from "@/lib/fechas";

export const dynamic = "force-dynamic";

/**
 * LOS PAGOS DEL PEDIDO Y SU EVIDENCIA (revisión 23-09).
 *
 * Carlos, 23-09 17:48: cuando el banco cobra comisión «le adjuntamos nosotros
 * normalmente la evidencia, porque el cliente dice: ¿cómo me vas a cobrar
 * esto?». El comercial es quien cobra la diferencia, así que necesita ver esa
 * evidencia; el aviso de Finanzas lo trae acá. Postventa entra solo para
 * estar informada: ve la observación y la evidencia, sin montos (no ve
 * precios, Carlos 27-08).
 *
 * pagos_pedido no se abre por RLS al comercial ni a postventa: se lee con la
 * cuenta de servicio DESPUÉS de comprobar que quien mira es parte del pedido.
 */
export default async function PagosDelPedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await requerirPerfil();
  const admin = createAdminClient();

  const { data: s } = await admin
    .from("servicios_postventa")
    .select("id, cliente_texto, numero_pedido_erp, moneda, es_prueba, informe_cierre_id, pago_observado_at, pago_observado_motivo, pago_observado_adjunto, informes_cierre!servicios_postventa_informe_cierre_id_fkey(codigo, creado_por)")
    .eq("id", id)
    .maybeSingle();
  if (!s) notFound();
  const inf = s.informes_cierre as unknown as { codigo: string | null; creado_por: string | null } | null;

  const conCifras = puedeVerPrecios(perfil) || inf?.creado_por === perfil.id;
  const puedeVer = conCifras || perfil.es_postventa === true;
  // Lo de práctica solo para práctica, como en el resto del CRM.
  if (!puedeVer || (s.es_prueba === true) !== (perfil.es_prueba === true)) notFound();

  const { data: pagos } = await admin
    .from("pagos_pedido")
    .select("id, monto, moneda, fecha_abono, operacion, medio, nota, descuento_monto, descuento_motivo, descuento_adjunto, created_at")
    .eq("servicio_id", id)
    .order("created_at", { ascending: false });
  const filas = (pagos ?? []) as {
    id: string; monto: number; moneda: string; fecha_abono: string; operacion: string; medio: string; nota: string | null;
    descuento_monto: number | null; descuento_motivo: string | null; descuento_adjunto: string | null; created_at: string;
  }[];
  const rutas = [s.pago_observado_adjunto as string | null, ...filas.map((f) => f.descuento_adjunto)].filter(Boolean) as string[];
  const { data: firmadas } = rutas.length ? await admin.storage.from("adjuntos").createSignedUrls(rutas, 3600) : { data: [] };
  const url = new Map((firmadas ?? []).filter((x) => x.path && x.signedUrl).map((x) => [x.path as string, x.signedUrl as string]));
  const cliente = (s.cliente_texto ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");
  const volver = perfil.es_postventa ? `/postventa/pedidos/${id}` : "/comercial/cierres";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={volver} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Volver
      </Link>
      <div>
        <h1 className="text-xl font-bold text-foreground">Pagos de {cliente}</h1>
        <p className="text-sm text-muted-foreground">
          {inf?.codigo ? `Cierre ${inf.codigo}` : ""}
          {s.numero_pedido_erp ? ` · Pedido ${s.numero_pedido_erp}` : ""}
          {conCifras ? "" : " · Postventa ve lo que Finanzas informó, sin montos."}
        </p>
      </div>

      {s.pago_observado_at && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 flex-none" />
          <div>
            <p>
              <b>Finanzas observó el pago</b> el {fechaHoraLima(s.pago_observado_at as string)}: {s.pago_observado_motivo}
            </p>
            {s.pago_observado_adjunto && url.get(s.pago_observado_adjunto as string) && (
              <a href={url.get(s.pago_observado_adjunto as string)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-semibold underline">
                <Paperclip className="size-3.5" /> Ver la evidencia del banco
              </a>
            )}
          </div>
        </div>
      )}

      <section className="rounded-xl border border-border bg-card">
        <h2 className="border-b border-border px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-foreground">Abonos confirmados por Finanzas</h2>
        {filas.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Finanzas todavía no confirmó abonos en este pedido.</p>
        ) : (
          <ul className="divide-y divide-border">
            {filas.map((f) => (
              <li key={f.id} className="px-4 py-3 text-sm">
                <p className="flex items-center gap-1.5 font-semibold text-foreground">
                  <BadgeCheck className="size-4 text-[#1E7F4F]" />
                  {conCifras ? formatoMonto(f.moneda, Number(f.monto)) : "Abono acreditado"}
                  <span className="font-normal text-muted-foreground">
                    · {new Date(`${f.fecha_abono}T12:00:00-05:00`).toLocaleDateString("es-PE", { timeZone: "America/Lima" })} · {f.medio}
                    {conCifras ? ` · op. ${f.operacion}` : ""}
                  </span>
                </p>
                {f.descuento_monto != null && Number(f.descuento_monto) > 0 && (
                  <p className="mt-1 text-xs text-amber-800">
                    El banco descontó {conCifras ? formatoMonto(f.moneda, Number(f.descuento_monto)) : "una comisión"}
                    {f.descuento_motivo ? ` (${f.descuento_motivo})` : ""}.{conCifras ? " Esa diferencia la cobra el comercial." : ""}
                    {f.descuento_adjunto && url.get(f.descuento_adjunto) && (
                      <>
                        {" "}
                        <a href={url.get(f.descuento_adjunto)} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
                          Ver la evidencia
                        </a>
                      </>
                    )}
                  </p>
                )}
                {conCifras && f.nota && <p className="mt-0.5 text-xs text-muted-foreground">{f.nota}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
