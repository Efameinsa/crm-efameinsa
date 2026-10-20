import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { acceso } from "@/lib/llamadas-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const Cuerpo = z.object({ estado: z.enum(["llamada", "descartada"]) });

/** El celular avisa qué pasó con la llamada: se hizo, o se canceló. Solo la propia. */
export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const { id } = await contexto.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "datos" }, { status: 400 });
  const a = await acceso(request);
  if (!a.ok) return NextResponse.json({ error: "no_autenticado" }, { status: a.estado });
  const cuerpo = Cuerpo.safeParse(await request.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: "datos" }, { status: 400 });
  const { error } = await createAdminClient()
    .from("llamadas_por_hacer")
    .update({ estado: cuerpo.data.estado, cerrada_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", a.quien.userId);
  if (error) return NextResponse.json({ error: "servidor" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
