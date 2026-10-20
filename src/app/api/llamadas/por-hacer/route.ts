import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { acceso } from "@/lib/llamadas-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sinCache = { "cache-control": "no-store" };
/** Un lead que lleva más de esto en la cola ya no se llama solo: se vería raro llamar horas después. */
const VIGENCIA_MS = 30 * 60_000;

/**
 * LAS LLAMADAS QUE EL CELULAR DEBE HACER YA (modo setter, 20-10-2026).
 *
 * El celular (token de dispositivo) pregunta cada pocos segundos. Cada llamada
 * pendiente se entrega UNA sola vez: se marca «avisada» al entregarla. Las muy
 * viejas (cola atrasada, celular apagado) se descartan en vez de llamar tarde.
 */
export async function GET(request: Request) {
  const a = await acceso(request);
  if (!a.ok) return NextResponse.json({ error: a.estado === 429 ? "demasiadas_peticiones" : "no_autenticado" }, { status: a.estado, headers: sinCache });
  const admin = createAdminClient();
  const ahora = Date.now();

  await admin
    .from("llamadas_por_hacer")
    .update({ estado: "descartada", cerrada_at: new Date().toISOString() })
    .eq("user_id", a.quien.userId)
    .eq("estado", "pendiente")
    .lt("creada_at", new Date(ahora - VIGENCIA_MS).toISOString());

  const { data: perfil } = await admin.from("perfiles").select("setter_llamadas").eq("id", a.quien.userId).maybeSingle();
  if (!perfil?.setter_llamadas) return NextResponse.json({ setter: false, llamadas: [] }, { headers: sinCache });

  // Se toman y se marcan en un solo paso para que dos consultas seguidas no entreguen la misma.
  const { data: tomadas } = await admin
    .from("llamadas_por_hacer")
    .update({ estado: "avisada", avisada_at: new Date().toISOString() })
    .eq("user_id", a.quien.userId)
    .eq("estado", "pendiente")
    .select("id, nombre, telefono, detalle, lead_id, creada_at");
  return NextResponse.json({ setter: true, llamadas: tomadas ?? [] }, { headers: sinCache });
}
