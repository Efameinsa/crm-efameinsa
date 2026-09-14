import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esquemaLeadExterno } from "@/lib/validaciones/lead-externo";
import { CANAL_LABEL } from "@/lib/canal-contacto";
import { notificarLeadEntrante } from "@/lib/notificaciones";
import { avisarLeadNuevoN8n } from "@/lib/avisos-n8n";

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
      // «s/n», «-», «no tiene»: un teléfono sin dígitos entra como nulo. Con
      // texto, se normalizaba a cadena vacía y empataba con cualquier contacto
      // que también quedó vacío (caso Edwin Paredes Flores, 14-09; 0230).
      telefono: d.telefono && (d.telefono.match(/\d/g) ?? []).length >= 6 ? d.telefono : null,
      num_doc: d.num_doc ? d.num_doc.replace(/\D/g, "") : null,
      razon_social: d.razon_social || null,
      email: d.email || null,
      mensaje: d.mensaje || null,
      fuente: d.fuente || null,
      gclid: d.gclid || null,
      gbraid: d.gbraid || null,
      wbraid: d.wbraid || null,
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

  // LOS ADJUNTOS DE LA WEB (Carlos, 14-09): el PDF del dimensionamiento o de
  // la cotización del carrito, guardado igual que lo que Central adjunta al
  // registrar (leads/<id>/…), para que se vea en la bandeja y en el expediente.
  // Best-effort: si un archivo no se puede guardar, el contacto entra igual.
  if (d.adjuntos && d.adjuntos.length > 0) {
    const guardados: { path: string; nombre: string; tipo: string; tamano: number }[] = [];
    for (const a of d.adjuntos) {
      try {
        const bytes = Buffer.from(a.contenido_base64.replace(/^data:[^;]+;base64,/, ""), "base64");
        if (bytes.length === 0 || bytes.length > 6 * 1024 * 1024) continue;
        const limpio = a.nombre.replace(/[^\w.\-() ]+/g, "_").slice(0, 120);
        const path = `leads/${lead.id}/${Date.now()}-${limpio}`;
        const { error: eSubida } = await admin.storage.from("adjuntos").upload(path, bytes, { contentType: a.tipo, upsert: false });
        if (eSubida) {
          console.error("leads: adjunto no guardado", eSubida.message);
          continue;
        }
        guardados.push({ path, nombre: a.nombre, tipo: a.tipo, tamano: bytes.length });
      } catch (e) {
        console.error("leads: adjunto inválido", e instanceof Error ? e.message : e);
      }
    }
    if (guardados.length > 0) await admin.from("leads").update({ adjuntos: guardados }).eq("id", lead.id);
  }

  // A diferencia de la captura manual (donde Central es quien registra y por
  // tanto ya lo sabe), acá el lead entra solo: hay que avisarle a Central para
  // que lo asigne, y a gerencia para su visibilidad (evento de B7.3).
  if (esComercial) {
    const canalLegible = CANAL_LABEL[d.canal] ?? d.canal;
    const cuerpoNotif = d.razon_social
      ? `${d.nombre_contacto} · ${canalLegible} · ${d.razon_social}`
      : `${d.nombre_contacto} · ${canalLegible}`;
    await notificarLeadEntrante({ titulo: "Nuevo contacto automático", cuerpo: cuerpoNotif });
    await avisarLeadNuevoN8n({
      titulo: "Nuevo contacto automático",
      codigo: lead.codigo,
      nombre: d.nombre_contacto,
      telefono: d.telefono || null,
      email: d.email || null,
      canal: d.canal,
      razonSocial: d.razon_social || null,
      mensaje: d.mensaje || null,
    });
  }

  return NextResponse.json({ ok: true, id: lead.id, codigo: lead.codigo });
}
