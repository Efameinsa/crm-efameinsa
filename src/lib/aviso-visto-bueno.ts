import { createAdminClient } from "@/lib/supabase/admin";
import { notificarFinanzas } from "@/lib/notificaciones";
import { correoAlArea } from "@/lib/correo-al-area";
import { faltaVistoBuenoFinanzas, type ServicioPostventa } from "@/lib/postventa";

/**
 * «EL EQUIPO ESTÁ LISTO Y FALTA SU VISTO BUENO» (0469, caso COFACO 14-10).
 *
 * Se llama cuando el almacén deja el pedido probado y embalado, y cuando
 * postventa intenta emitir la apertura: si es una venta a crédito sin el visto
 * bueno, a Finanzas le llega la campana y el correo con la forma de pago, para
 * que revise letras, adelanto y comisiones ANTES de que el camión espere.
 */
export async function avisarFinanzasSiFaltaVistoBueno(servicioId: string, motivo: "listo" | "apertura"): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("servicios_postventa")
    .select("cliente_texto, forma_pago, pct_antes_despacho, origen, letras_cantidad, tipo_pedido, confirmacion_abono, informe_cierre_id, pago_confirmado_at, finanzas_vb_at, salida_autorizada_at, despachado_at, es_prueba")
    .eq("id", servicioId)
    .maybeSingle();
  if (!data) return;
  const s = data as unknown as ServicioPostventa;
  if (!faltaVistoBuenoFinanzas(s)) return;
  const cliente = (s.cliente_texto ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");
  const titulo = `Falta su visto bueno para la salida · ${cliente}`;
  const cuerpo = `${motivo === "listo" ? "El equipo ya está probado y embalado" : "Postventa quiere emitir la apertura de despacho"}, pero es una venta a crédito o con el pago sin confirmar${
    s.forma_pago ? ` (${s.forma_pago})` : ""
  }. Revise adelanto, letras y comisiones y dé el visto bueno: sin él no sale.`;
  await Promise.all([
    notificarFinanzas({ titulo, cuerpo, url: `/finanzas/pedidos/${servicioId}`, esPrueba: s.es_prueba === true }),
    correoAlArea({ areas: ["finanzas"], servicioId, titulo, cuerpo, url: `/finanzas/pedidos/${servicioId}`, esPrueba: s.es_prueba === true }),
  ]);
}
