import { NextResponse } from "next/server";
import { z } from "zod";
import { acceso } from "@/lib/llamadas-servidor";
import { RESULTADOS, esResultado, tipificarLlamada } from "@/lib/setter-tipificacion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const Cuerpo = z.object({
  resultado: z.string().refine(esResultado),
  nota: z.string().max(500).nullish(),
  duracion_s: z.number().int().min(0).max(86_400).nullish(),
});

/**
 * EL SETTER TIPIFICA LA LLAMADA A UN LEAD (Santos, 20-10-2026). Con el token del celular.
 * Un solo toque en la app: según el resultado, el lead pasa al comercial, se cierra con su
 * motivo, o vuelve a la cola para otro intento. Repetir la misma petición no hace nada más.
 */
export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const { id } = await contexto.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "datos" }, { status: 400 });
  const a = await acceso(request);
  if (!a.ok) return NextResponse.json({ error: "no_autenticado" }, { status: a.estado });
  const cuerpo = Cuerpo.safeParse(await request.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: "datos" }, { status: 400 });
  const resultado = cuerpo.data.resultado as keyof typeof RESULTADOS;
  const r = await tipificarLlamada({
    id,
    userId: a.quien.userId,
    resultado,
    nota: cuerpo.data.nota ?? null,
    duracionS: cuerpo.data.duracion_s ?? null,
  });
  if (!r.ok) return NextResponse.json({ error: r.error ?? "servidor" }, { status: r.error === "no_existe" ? 404 : 400 });
  return NextResponse.json(r);
}
