import { createAdminClient } from "@/lib/supabase/admin";
import { formatoMonto } from "@/lib/pagos-finanzas";
import type { ConsultaPago } from "@/components/crm/consultas-pago";

/**
 * Las consultas del pago de un pedido (0520), listas para pintar: nombres y
 * enlaces firmados. Se leen con la cuenta de servicio porque el pantallazo de
 * Finanzas vive en finanzas/, que el comercial no abre por RLS; quien llama
 * ya comprobó que la persona es parte del pedido.
 */
export async function consultasDelPedido(servicioId: string, moneda: string): Promise<ConsultaPago[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("consultas_pago")
    .select("id, tipo, nota, voucher_path, creado_por, created_at, respondida_at, respondida_por, respuesta, comision_monto, respuesta_adjunto")
    .eq("servicio_id", servicioId)
    .order("created_at", { ascending: false });
  const filas = data ?? [];
  if (!filas.length) return [];

  const personas = [...new Set(filas.flatMap((f) => [f.creado_por, f.respondida_por]).filter(Boolean))] as string[];
  const rutas = filas.flatMap((f) => [f.voucher_path, f.respuesta_adjunto]).filter(Boolean) as string[];
  const [{ data: perfiles }, { data: firmadas }] = await Promise.all([
    admin.from("perfiles").select("id, nombre").in("id", personas),
    admin.storage.from("adjuntos").createSignedUrls(rutas, 3600),
  ]);
  const nombre = new Map((perfiles ?? []).map((p) => [p.id as string, p.nombre as string | null]));
  const url = new Map((firmadas ?? []).filter((x) => x.path && x.signedUrl).map((x) => [x.path as string, x.signedUrl as string]));

  return filas.map((f) => ({
    id: f.id,
    tipo: f.tipo as ConsultaPago["tipo"],
    nota: f.nota,
    createdAt: f.created_at,
    creadoPorNombre: nombre.get(f.creado_por) ?? null,
    voucherUrl: url.get(f.voucher_path) ?? null,
    respondidaAt: f.respondida_at,
    respondidaPorNombre: f.respondida_por ? (nombre.get(f.respondida_por) ?? null) : null,
    respuesta: f.respuesta,
    comision: f.comision_monto != null ? formatoMonto(moneda, Number(f.comision_monto)) : null,
    respuestaAdjuntoUrl: f.respuesta_adjunto ? (url.get(f.respuesta_adjunto) ?? null) : null,
  }));
}
