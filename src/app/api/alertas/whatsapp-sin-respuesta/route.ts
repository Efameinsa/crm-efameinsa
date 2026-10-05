import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notificar } from "@/lib/notificaciones";

// LA ALERTA DE ATENCIÓN PARA LOS COMERCIALES (Central con el ingeniero,
// 05-10): «hasta el momento el prospecto no es atendido». Miguel Quispe
// Peñaloza escribió el 02-10 a las 16:19 por M3-PERU y tres días después
// seguía sin respuesta; ese día eran 101 chats así.
//
// La llama un temporizador de la VM cada 15 minutos en horario de oficina
// (crm-whatsapp-sin-respuesta.timer). UN aviso por comercial, no uno por
// chat —con 44 chats pendientes serían 44 campanadas—, y como mucho uno por
// hora: dice cuántos clientes esperan y quiénes son los que más esperan.
// Protegido con el mismo Bearer que los crons (CRON_SECRET).

const ESPERA_MINUTOS = 30;
const CADA_MINUTOS = 60;

function enHorarioDeOficina(ahora: Date): boolean {
  const lima = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Lima" }));
  const dia = lima.getDay(); // 0 domingo
  const hora = lima.getHours();
  return dia >= 1 && dia <= 6 && hora >= 8 && hora < 19;
}

function hace(desde: string, ahora: number): string {
  const min = Math.round((ahora - new Date(desde).getTime()) / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h` : `${Math.round(h / 24)} d`;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const ahora = new Date();
  const forzar = request.nextUrl.searchParams.get("forzar") === "1";
  const soloContar = request.nextUrl.searchParams.get("contar") === "1";
  if (!forzar && !soloContar && !enHorarioDeOficina(ahora)) return NextResponse.json({ fuera_de_horario: true });

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("whatsapp_sin_respuesta", { p_minutos: ESPERA_MINUTOS });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const filas = (data ?? []) as { conversacion_id: string; asignado_a: string; cliente: string; esperando_desde: string }[];

  const porComercial = new Map<string, typeof filas>();
  for (const f of filas) porComercial.set(f.asignado_a, [...(porComercial.get(f.asignado_a) ?? []), f]);
  if (soloContar) return NextResponse.json({ chats: filas.length, comerciales: Object.fromEntries([...porComercial].map(([k, v]) => [k, v.length])) });

  const desde = new Date(ahora.getTime() - CADA_MINUTOS * 60_000).toISOString();
  const avisados: { comercial: string; chats: number }[] = [];
  for (const [comercial, chats] of porComercial) {
    const { count } = await admin
      .from("notificaciones")
      .select("id", { count: "exact", head: true })
      .eq("user_id", comercial)
      .eq("tipo", "whatsapp_sin_respuesta")
      .gte("created_at", desde);
    if ((count ?? 0) > 0) continue;
    // Los que más esperan, primero (la función ya los trae así).
    const primeros = chats.slice(0, 3).map((c) => `${c.cliente} (hace ${hace(c.esperando_desde, ahora.getTime())})`);
    await notificar({
      userId: comercial,
      tipo: "whatsapp_sin_respuesta",
      titulo: chats.length === 1 ? "Un cliente espera su respuesta en WhatsApp" : `${chats.length} clientes esperan su respuesta en WhatsApp`,
      cuerpo: `${primeros.join(" · ")}${chats.length > 3 ? ` y ${chats.length - 3} más` : ""}`,
      url: chats.length === 1 ? `/whatsapp/${chats[0].conversacion_id}?filtro=mias` : "/whatsapp?filtro=mias",
    });
    avisados.push({ comercial, chats: chats.length });
  }
  return NextResponse.json({ chats: filas.length, avisados });
}
