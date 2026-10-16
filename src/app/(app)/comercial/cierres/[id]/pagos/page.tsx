import Link from "@/components/enlace";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requerirPerfil } from "@/lib/auth";
import { puedeVerPrecios } from "@/lib/postventa";

export const dynamic = "force-dynamic";

/**
 * «Pagos» de un cierre: lleva a los abonos del pedido que salió de él.
 *
 * Katerine, 16-10 (buzón): «¿por qué parte del CRM consulto algún abono que
 * haya tenido comisión?». La página de pagos del pedido (23-09) existía, pero
 * el comercial solo llegaba desde el aviso de Finanzas en la campana. Ahora
 * cada cierre emitido tiene su botón «Pagos», en la ficha y en el cierre.
 *
 * El cierre se lee con la sesión (RLS: solo los de su cartera, 0049); el
 * pedido, con la cuenta de servicio, porque servicios_postventa no se abre al
 * comercial. Un cierre puede tener más de un pedido (otro circuito, 0501).
 */
export default async function PagosDelCierrePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { data: informe } = await supabase
    .from("informes_cierre")
    .select("id, codigo, creado_por, cliente_nombre")
    .eq("id", id)
    .maybeSingle();
  if (!informe) notFound();
  if (!puedeVerPrecios(perfil) && informe.creado_por !== perfil.id) notFound();

  const { data: pedidos } = await createAdminClient()
    .from("servicios_postventa")
    .select("id, numero_pedido_erp, created_at")
    .eq("informe_cierre_id", id)
    .order("created_at");
  const lista = (pedidos ?? []) as { id: string; numero_pedido_erp: string | null }[];
  if (lista.length === 1) redirect(`/pedidos/${lista[0].id}/pagos`);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/comercial/cierres/${id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Volver al cierre
      </Link>
      <h1 className="text-xl font-bold text-foreground">Pagos del cierre {informe.codigo ?? ""}</h1>
      {lista.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          Este cierre todavía no tiene pedido. Los abonos aparecen aquí cuando Central genera el pedido y Finanzas confirma cada pago
          (con lo que el banco haya descontado de comisión, si lo hubo).
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {lista.map((p) => (
            <li key={p.id} className="px-4 py-3 text-sm">
              <Link href={`/pedidos/${p.id}/pagos`} className="font-semibold text-primary hover:underline">
                Pedido {p.numero_pedido_erp ?? "sin número todavía"}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
