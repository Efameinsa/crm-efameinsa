import type { SupabaseClient } from "@supabase/supabase-js";
import { estimarSaldo, type EstadoSaldo, type MovimientoSaldo } from "@/lib/saldo-ads";

export const TOPE_DIARIO_POR_DEFECTO = 250;

export interface SaldoGoogleAds {
  tope: number;
  estado: EstadoSaldo;
  /** Lo último anotado, lo más reciente primero. */
  movimientos: (MovimientoSaldo & { nota: string | null })[];
  alertaMovimientoId: string | null;
}

// Sirve con el cliente de la sesión (RLS: solo admin y gerencia) y con el de
// servicio (el temporizador de la VM que manda la alerta).
export async function cargarSaldoGoogleAds(supabase: SupabaseClient): Promise<SaldoGoogleAds> {
  const [{ data: config }, { data: movs }] = await Promise.all([
    supabase.from("ads_saldo_config").select("tope_diario, alerta_movimiento_id").eq("plataforma", "google").maybeSingle(),
    supabase
      .from("ads_saldo_movimientos")
      .select("id, tipo, monto, fecha, nota")
      .eq("plataforma", "google")
      .order("fecha", { ascending: false })
      .limit(500),
  ]);
  const tope = Number(config?.tope_diario ?? TOPE_DIARIO_POR_DEFECTO);
  const movimientos = (movs ?? []).map((m) => ({
    id: m.id as string,
    tipo: m.tipo as MovimientoSaldo["tipo"],
    monto: Number(m.monto),
    fecha: m.fecha as string,
    nota: (m.nota as string | null) ?? null,
  }));
  return {
    tope,
    estado: estimarSaldo(movimientos, tope),
    movimientos,
    alertaMovimientoId: (config?.alerta_movimiento_id as string | null) ?? null,
  };
}
