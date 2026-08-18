import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Vercel Cron dispara esto todos los días (ver vercel.json) para traer el
// gasto de AYER de Meta Ads. El backfill histórico y el catch-up manual van
// por scripts/sync-meta-ads.mjs — acá solo el día más reciente, para que el
// panel de gerencia nunca tenga más de un día de atraso.
//
// Google Ads queda pendiente (faltan credenciales, ver .env.example) — esta
// ruta hoy solo trae Meta; cuando se agregue Google se suma acá mismo.

const API_VERSION = "v21.0";
const ACCIONES_LEAD = new Set(["lead", "onsite_conversion.messaging_conversation_started_7d"]);

interface AccionMeta {
  action_type: string;
  value: string;
}
interface FilaInsightMeta {
  campaign_id: string;
  campaign_name: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: AccionMeta[];
}

function leadsDeAcciones(actions?: AccionMeta[]): number {
  if (!actions) return 0;
  return actions.filter((a) => ACCIONES_LEAD.has(a.action_type)).reduce((s, a) => s + Number(a.value || 0), 0);
}

function ayer(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function traerGastoMetaDeAyer(): Promise<{ moneda: string; filas: FilaInsightMeta[] }> {
  const token = process.env.META_ACCESS_TOKEN;
  const cuenta = process.env.META_AD_ACCOUNT_ID;
  if (!token || !cuenta) throw new Error("Faltan META_ACCESS_TOKEN / META_AD_ACCOUNT_ID");

  const cuentaResp = await fetch(
    `https://graph.facebook.com/${API_VERSION}/act_${cuenta}?fields=currency&access_token=${token}`,
  );
  const cuentaData = await cuentaResp.json();
  if (cuentaData.error) throw new Error(`Meta (cuenta): ${cuentaData.error.message}`);

  const fecha = ayer();
  const params = new URLSearchParams({
    fields: "spend,impressions,clicks,actions,campaign_id,campaign_name,date_start",
    time_range: JSON.stringify({ since: fecha, until: fecha }),
    time_increment: "1",
    level: "campaign",
    limit: "500",
    access_token: token,
  });

  const filas: FilaInsightMeta[] = [];
  let url = `https://graph.facebook.com/${API_VERSION}/act_${cuenta}/insights?${params}`;
  while (url) {
    const r = await fetch(url);
    const d = await r.json();
    if (d.error) throw new Error(`Meta (insights): ${d.error.message}`);
    filas.push(...(d.data ?? []));
    url = d.paging?.next ?? null;
  }
  return { moneda: cuentaData.currency, filas };
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { moneda, filas } = await traerGastoMetaDeAyer();
    const admin = createAdminClient();
    let actualizados = 0;

    for (const f of filas) {
      const { data: campania, error: errorCampania } = await admin
        .from("campanias")
        .upsert(
          { plataforma: "meta", campaign_id: f.campaign_id, nombre: f.campaign_name, activa: true },
          { onConflict: "plataforma,campaign_id" },
        )
        .select("id")
        .single();
      if (errorCampania) throw new Error(`campanias: ${errorCampania.message}`);

      const { error: errorGasto } = await admin.from("gasto_campania").upsert(
        {
          campania_id: campania.id,
          fecha: f.date_start,
          gasto: Number(f.spend || 0),
          impresiones: Number(f.impressions || 0),
          clics: Number(f.clicks || 0),
          leads_reportados: Math.round(leadsDeAcciones(f.actions)),
          moneda,
        },
        { onConflict: "campania_id,fecha" },
      );
      if (errorGasto) throw new Error(`gasto_campania: ${errorGasto.message}`);
      actualizados++;
    }

    console.log(`gasto-diario: ${actualizados} filas de Meta Ads sincronizadas`);
    return NextResponse.json({ ok: true, plataforma: "meta", actualizados });
  } catch (e) {
    console.error("gasto-diario:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error desconocido" }, { status: 500 });
  }
}
