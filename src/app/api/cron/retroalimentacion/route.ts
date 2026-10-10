import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarEventoMeta, type EventoMeta } from "@/lib/meta-capi";
import { googleAdsConfigurado, subirConversionesDeClic, type ConversionClic, type EventoGoogle } from "@/lib/google-ads";

// Cada hora (timer crm-retroalimentacion en la VM, 0435): le cuenta a Meta y a
// Google lo que pasó en el CRM —lead calificado, cotización enviada, venta—
// sin depender de la pantalla desde la que se hizo. Lo ya enviado no se repite
// (eventos_meta / eventos_google).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Candidato {
  lead_id: string;
  evento: EventoMeta;
  clave: string;
  ocurrio_at: string;
  valor: number | null;
  moneda: string | null;
  gclid: string | null;
  recibido_at: string;
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const admin = createAdminClient();
  const resumen: Record<string, unknown> = {};

  // ---- Meta: 7 días hacia atrás es lo que acepta ----
  if (process.env.META_CAPI_TOKEN) {
    const { data, error } = await admin.rpc("retroalimentacion_candidatos", { p_dias: 7 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const candidatos = (data ?? []) as Candidato[];
    // enviarEventoMeta salta lo ya enviado; un `.in` con cientos de claves
    // revienta la URL, así que el conteo sale de lo que se anotó en esta corrida.
    const desde = new Date().toISOString();
    for (const c of candidatos) {
      await enviarEventoMeta({ evento: c.evento, leadId: c.lead_id, eventId: c.clave, valor: c.valor, moneda: c.moneda ?? undefined, ocurrioAt: c.ocurrio_at });
    }
    const { count: enviados } = await admin.from("eventos_meta").select("id", { count: "exact", head: true }).gte("enviado_at", desde);
    const { count: conError } = await admin.from("eventos_meta").select("id", { count: "exact", head: true }).gte("enviado_at", desde).not("error", "is", null);
    resumen.meta = { candidatos: candidatos.length, enviados: enviados ?? 0, con_error: conError ?? 0 };
  } else {
    resumen.meta = "sin META_CAPI_TOKEN";
  }

  // ---- Google: 89 días desde el clic, solo con gclid ----
  if (googleAdsConfigurado()) {
    const { data, error } = await admin.rpc("retroalimentacion_candidatos", { p_dias: 89 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const conClic = ((data ?? []) as Candidato[]).filter(
      (c) => c.gclid && (c.evento === "SubmitApplication" || c.evento === "Purchase") && Date.parse(c.recibido_at) > Date.now() - 89 * 86_400_000,
    );
    const { data: hechos } = await admin.from("eventos_google").select("clave").is("error", null);
    const ya = new Set((hechos ?? []).map((h) => h.clave));
    const lote: (ConversionClic & { leadId: string })[] = conClic
      .filter((c) => !ya.has(c.clave))
      .map((c) => ({
        clave: c.clave,
        leadId: c.lead_id,
        evento: c.evento as EventoGoogle,
        gclid: c.gclid!,
        // La conversión no puede ser anterior al clic.
        ocurrioAt: new Date(Math.max(Date.parse(c.ocurrio_at), Date.parse(c.recibido_at) + 60_000)).toISOString(),
        valor: c.valor,
        moneda: c.moneda,
      }));
    if (lote.length) {
      try {
        const res = await subirConversionesDeClic(lote);
        const filas = lote.map((c) => ({
          lead_id: c.leadId, conversion: c.evento, clave: c.clave, gclid: c.gclid, valor: c.valor, moneda: c.moneda,
          conversion_at: c.ocurrioAt, error: res.get(c.clave) ?? null, enviado_at: new Date().toISOString(),
        }));
        await admin.from("eventos_google").upsert(filas, { onConflict: "clave" });
        resumen.google = { enviados: lote.length, con_error: filas.filter((f) => f.error).length };
      } catch (e) {
        resumen.google = { error: e instanceof Error ? e.message : String(e) };
      }
    } else {
      resumen.google = { enviados: 0 };
    }
  } else {
    resumen.google = "faltan credenciales de Google Ads";
  }

  return NextResponse.json(resumen);
}
