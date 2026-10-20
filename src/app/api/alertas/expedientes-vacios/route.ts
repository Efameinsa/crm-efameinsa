import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notificar } from "@/lib/notificaciones";

// LIMPIEZA NOCTURNA DE EXPEDIENTES VACÍOS (gerencia 20-10, Beneficencia de
// Huancayo). «Registrar seguimiento» abre el expediente antes de que se anote
// nada; si la persona cierra la pestaña o vuelve atrás, queda vivo y vacío y
// en la ficha se lee «expediente vivo · sin gestión». La pantalla de «Anotar
// gestión» ya lo descarta al cerrarse (0550); esto atrapa lo que se escapó por
// otra puerta. Lo llama crm-expedientes-vacios.timer en la máquina virtual,
// una vez por noche, con el Bearer de los crons (CRON_SECRET).
// Un aviso por persona («se quitaron N expedientes vacíos suyos»), no uno por
// expediente.

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const horas = Number(request.nextUrl.searchParams.get("horas") ?? "24") || 24;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("limpiar_expedientes_vacios", { p_horas: horas });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const filas = (data ?? []) as { id: string; cuenta: string; dueno: string | null; creado: string }[];
  const porDueno = new Map<string, string[]>();
  for (const f of filas) {
    if (!f.dueno) continue;
    porDueno.set(f.dueno, [...(porDueno.get(f.dueno) ?? []), f.cuenta]);
  }
  await Promise.all(
    [...porDueno].map(([userId, cuentas]) =>
      notificar({
        userId,
        tipo: "otro",
        titulo:
          cuentas.length === 1
            ? "Se quitó un expediente vacío suyo"
            : `Se quitaron ${cuentas.length} expedientes vacíos suyos`,
        cuerpo: `Se abrieron para anotar una gestión y nunca se guardó nada: ${cuentas.slice(0, 5).join(", ")}${cuentas.length > 5 ? "…" : ""}. Si sí habló con el cliente, anótelo desde su ficha con «Anotar gestión».`,
      }),
    ),
  );
  return NextResponse.json({ ok: true, borrados: filas.length });
}
