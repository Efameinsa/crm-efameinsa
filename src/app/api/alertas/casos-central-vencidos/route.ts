import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notificar } from "@/lib/notificaciones";

// CASOS DE CENTRAL QUE NADIE TOMÓ (0573, Santos 21-10). El urgente vence a
// las 2 horas: si sigue sin dueño, vuelve a sonar en el área y se enteran
// quien lo derivó y gerencia. De paso cierra los respondidos que Central no
// cerró en 2 días. Una vez por caso (la base marca escalado_at).
//
// La llama el temporizador de la VM cada 15 minutos
// (crm-casos-central.timer), con el mismo Bearer que los crons.

const AREA: Record<string, string> = { finanzas: "Finanzas", facturacion: "Facturación", rrhh: "RR. HH." };

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("casos_central_vencidos");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const vencidos = (data ?? []) as { id: string; codigo: string; area: string; motivo: string; cliente: string; creado_por: string; es_prueba: boolean }[];

  for (const c of vencidos) {
    const area = AREA[c.area] ?? c.area;
    const { data: delArea } = await admin
      .from("perfiles")
      .select("id")
      .eq("rol", c.area)
      .eq("activo", true)
      .eq("es_prueba", c.es_prueba)
      .is("espejo_de", null);
    await Promise.all(
      (delArea ?? []).map((p) =>
        notificar({
          userId: p.id as string,
          tipo: "caso_central_urgente",
          titulo: `Venció sin que nadie lo tome · ${c.motivo} · ${c.cliente}`,
          cuerpo: `${c.codigo}: Central lo pidió urgente hace 2 horas. Tómalo o pide un dato.`,
          url: `/${c.area}/casos?ver=${c.id}`,
        }),
      ),
    );
    await notificar({
      userId: c.creado_por,
      tipo: "caso_central_respuesta",
      titulo: `⚠️ Nadie tomó tu caso a tiempo · ${c.codigo}`,
      cuerpo: `${area} no lo tomó en 2 horas. Le volvimos a avisar${c.es_prueba ? "" : " y avisamos a gerencia"}.`,
      url: `/central/casos?ver=${c.id}`,
    });
    if (!c.es_prueba) {
      await notificar({
        rol: "gerencia",
        tipo: "urgencia",
        titulo: `${c.cliente}: ${area} no tomó un caso urgente de Central`,
        cuerpo: `${c.codigo} · ${c.motivo}. Venció el plazo de 2 horas sin que nadie lo tome.`,
        url: `/central/casos?ver=${c.id}`,
      });
    }
  }
  return NextResponse.json({ vencidos: vencidos.length });
}
