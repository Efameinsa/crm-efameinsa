import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esquemaGastoCampania } from "@/lib/validaciones/gasto-campania";

// Ingesta de gasto de campañas (Google Ads, Meta Ads) vía POST desde un
// orquestador externo (Make.com) que ya autenticó con la plataforma de
// anuncios del lado de ellos — este endpoint solo confía en el bearer token
// propio (GASTO_INGEST_TOKEN), no vuelve a hablar con Google/Meta.
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token || !process.env.GASTO_INGEST_TOKEN || token !== process.env.GASTO_INGEST_TOKEN) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const cuerpo = await request.json().catch(() => null);
  const datos = esquemaGastoCampania.safeParse(cuerpo);
  if (!datos.success) {
    return NextResponse.json({ error: datos.error.issues[0].message }, { status: 400 });
  }

  const admin = createAdminClient();
  let actualizados = 0;

  for (const registro of datos.data.registros) {
    const { data: campania, error: errorCampania } = await admin
      .from("campanias")
      .upsert(
        {
          plataforma: datos.data.plataforma,
          campaign_id: registro.campaign_id,
          nombre: registro.nombre,
          activa: true,
        },
        { onConflict: "plataforma,campaign_id" },
      )
      .select("id")
      .single();
    if (errorCampania) {
      return NextResponse.json({ error: errorCampania.message }, { status: 500 });
    }

    const { error: errorGasto } = await admin.from("gasto_campania").upsert(
      {
        campania_id: campania.id,
        fecha: registro.fecha,
        gasto: registro.gasto,
        impresiones: registro.impresiones,
        clics: registro.clics,
        leads_reportados: registro.leads_reportados,
        moneda: registro.moneda,
      },
      { onConflict: "campania_id,fecha" },
    );
    if (errorGasto) {
      return NextResponse.json({ error: errorGasto.message }, { status: 500 });
    }

    actualizados++;
  }

  return NextResponse.json({ ok: true, actualizados });
}
