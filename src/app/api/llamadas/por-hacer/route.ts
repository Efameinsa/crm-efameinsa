import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { acceso } from "@/lib/llamadas-servidor";
import { liberarLeadsSinTipificar } from "@/lib/setter-llamadas";

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
    .lt("disponible_desde", new Date(ahora - VIGENCIA_MS).toISOString());

  const { data: perfil } = await admin.from("perfiles").select("setter_llamadas, setter_visto_at").eq("id", a.quien.userId).maybeSingle();
  if (!perfil?.setter_llamadas) return NextResponse.json({ setter: false, llamadas: [] }, { headers: sinCache });

  // «En línea»: el CRM retiene los leads nuevos para este celular solo mientras responde.
  const visto = perfil.setter_visto_at ? new Date(perfil.setter_visto_at as string).getTime() : 0;
  if (ahora - visto > 30_000) await admin.from("perfiles").update({ setter_visto_at: new Date(ahora).toISOString() }).eq("id", a.quien.userId);
  // Un lead que el setter dejó sin tipificar (canceló, se apagó el celular) no puede quedar trabado.
  await liberarLeadsSinTipificar();

  // Se toman y se marcan en un solo paso para que dos consultas seguidas no entreguen la misma.
  const { data: tomadas } = await admin
    .from("llamadas_por_hacer")
    .update({ estado: "avisada", avisada_at: new Date().toISOString() })
    .eq("user_id", a.quien.userId)
    .eq("estado", "pendiente")
    .lte("disponible_desde", new Date(ahora).toISOString())
    .select("id, nombre, telefono, detalle, lead_id, creada_at, intento");
  return NextResponse.json({ setter: true, llamadas: tomadas ?? [] }, { headers: sinCache });
}
