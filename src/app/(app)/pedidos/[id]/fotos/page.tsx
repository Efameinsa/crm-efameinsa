import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { GaleriaAlmacen } from "@/components/crm/galeria-almacen";
import type { FotoAlmacen } from "@/lib/postventa";

export const dynamic = "force-dynamic";

/**
 * LAS FOTOS DEL DESPACHO, EN SU PROPIA PÁGINA (20-10, LINO ESPIRITU): en la
 * vista del pedido salían abiertas, ángulo por ángulo (frente, laterales,
 * posterior…), y tapaban el resto. Ahora el pedido dice «Ver fotos» y aquí se
 * ven las de la carga en planta y las de la agencia, como el protocolo.
 */
export default async function FotosDelPedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requerirPerfil();
  const supabase = await createClient();
  const { data: s } = await supabase.from("servicios_postventa").select("id, cliente_texto, salida_fotos, agencia_fotos").eq("id", id).maybeSingle();
  if (!s) notFound();

  const limpias = (lista: unknown) => ((lista ?? []) as (FotoAlmacen | null)[]).filter((f): f is FotoAlmacen => Boolean(f && typeof f.path === "string" && f.path));
  const planta = limpias(s.salida_fotos);
  const agencia = limpias(s.agencia_fotos);
  const todas = [...planta, ...agencia];
  const { data: firmadas } = todas.length ? await supabase.storage.from("adjuntos").createSignedUrls(todas.map((f) => f.path), 3600) : { data: null };
  const conUrl = todas.map((f, i) => ({ ...f, url: firmadas?.[i]?.signedUrl ?? null }));
  const cliente = (s.cliente_texto ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <a href={`/postventa/pedidos/${id}`} className="text-xs text-muted-foreground hover:underline">
        ← Volver al pedido
      </a>
      <h1 className="text-base font-bold text-foreground">Fotos del pedido · {cliente}</h1>
      {todas.length === 0 && <p className="text-sm text-muted-foreground">El almacén todavía no ha subido fotos del despacho.</p>}
      {planta.length > 0 && (
        <div id="planta" className="scroll-mt-4">
          <GaleriaAlmacen fotos={conUrl.slice(0, planta.length)} titulo="Fotos del despacho en planta" />
        </div>
      )}
      {agencia.length > 0 && (
        <div id="agencia" className="scroll-mt-4">
          <GaleriaAlmacen fotos={conUrl.slice(planta.length)} titulo="Fotos en la agencia (con la guía)" />
        </div>
      )}
    </div>
  );
}
