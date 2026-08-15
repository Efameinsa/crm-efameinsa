import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esquemaLeadExterno } from "@/lib/validaciones/lead-externo";
import { CANAL_LABEL } from "@/lib/canal-contacto";
import { notificar } from "@/lib/notificaciones";

// Ingesta automática de leads: formularios de Lead Ads (Meta/Google) vía
// Make.com, y a futuro el formulario de la web. `recibido_por` queda null
// a propósito (columna pensada desde B1 para "ingesta automática") — cae en
// la misma bandeja `pendiente_triaje` que un registro manual de Central, así
// que el resto del flujo (dedup, asignación) no cambia.
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token || !process.env.LEADS_INGEST_TOKEN || token !== process.env.LEADS_INGEST_TOKEN) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const cuerpo = await request.json().catch(() => null);
  const datos = esquemaLeadExterno.safeParse(cuerpo);
  if (!datos.success) {
    return NextResponse.json({ error: datos.error.issues[0].message }, { status: 400 });
  }
  const d = datos.data;

  const admin = createAdminClient();
  const esComercial = d.area_destino === "comercial";

  const { data: lead, error } = await admin
    .from("leads")
    .insert({
      canal: d.canal,
      area_destino: d.area_destino,
      estado: esComercial ? "pendiente_triaje" : "derivado_area",
      nombre_contacto: d.nombre_contacto,
      telefono: d.telefono || null,
      num_doc: d.num_doc ? d.num_doc.replace(/\D/g, "") : null,
      razon_social: d.razon_social || null,
      email: d.email || null,
      mensaje: d.mensaje || null,
      fuente: d.fuente || null,
      gclid: d.gclid || null,
      fbclid: d.fbclid || null,
      utm_source: d.utm_source || null,
      utm_medium: d.utm_medium || null,
      utm_campaign: d.utm_campaign || null,
      utm_content: d.utm_content || null,
      recibido_por: null,
    })
    .select("id, codigo")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mismo evento que la captura manual de Central (B7.3): gerencia se entera
  // al momento de que entró un contacto comercial, antes de que se derive.
  if (esComercial) {
    const canalLegible = CANAL_LABEL[d.canal] ?? d.canal;
    const cuerpoNotif = d.razon_social
      ? `${d.nombre_contacto} · ${canalLegible} · ${d.razon_social}`
      : `${d.nombre_contacto} · ${canalLegible}`;
    await notificar({
      rol: "gerencia",
      tipo: "lead_registrado",
      titulo: "Nuevo contacto en Central",
      cuerpo: cuerpoNotif,
      url: "/gerencia",
    });
  }

  return NextResponse.json({ ok: true, id: lead.id, codigo: lead.codigo });
}
