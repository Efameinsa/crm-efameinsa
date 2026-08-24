import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CANAL_LABEL } from "@/lib/canal-contacto";
import { enlaceApp } from "@/lib/url-app";

// Consultado por n8n cada 15 min (workflow "CRM · SLA leads esperando"):
// devuelve los leads que llevan demasiado esperando, para escalar por correo.
// Es la parte ACTIVA del semáforo de tiempos de atención que pidió gerencia
// (línea base medida 2026-08-19: mediana histórica llegada→asignación de un
// lead de publicidad = 36,6 horas; 83 % esperó más de 6 h).
//   - pendientes: en bandeja (pendiente_triaje) hace más de ?min minutos
//     (default 30).
//   - sin_primera_gestion: asignados hace más de ?horas horas (default 2)
//     cuya oportunidad no registra ninguna actividad.
// Protegido con el mismo Bearer que los crons (CRON_SECRET).

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const min = Math.max(5, parseInt(request.nextUrl.searchParams.get("min") ?? "30", 10) || 30);
  const horas = Math.max(1, parseInt(request.nextUrl.searchParams.get("horas") ?? "2", 10) || 2);

  const admin = createAdminClient();
  const ahora = Date.now();

  const { data: pendientesData, error: e1 } = await admin
    .from("leads")
    .select("id, codigo, nombre_contacto, razon_social, telefono, canal, fuente, recibido_at")
    .eq("estado", "pendiente_triaje")
    .lte("recibido_at", new Date(ahora - min * 60_000).toISOString())
    .order("recibido_at", { ascending: true })
    .limit(50);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  const pendientes = (pendientesData ?? []).map((l) => ({
    codigo: l.codigo,
    nombre: l.nombre_contacto ?? l.razon_social ?? "Sin nombre",
    telefono: l.telefono,
    canal: CANAL_LABEL[l.canal] ?? l.canal,
    es_publicidad: l.fuente === "google_ads" || l.fuente === "meta_ads",
    minutos_esperando: Math.round((ahora - new Date(l.recibido_at).getTime()) / 60_000),
  }));

  // Asignados sin primera gestión: lead → oportunidad sin actividades.
  const { data: asignadosData, error: e2 } = await admin
    .from("leads")
    .select("id, codigo, nombre_contacto, razon_social, asignado_at, asignado_a, perfiles:asignado_a(nombre)")
    .eq("estado", "asignado")
    .lte("asignado_at", new Date(ahora - horas * 3_600_000).toISOString())
    .gte("asignado_at", new Date(ahora - 14 * 86_400_000).toISOString()) // solo lo reciente; lo viejo lo cubre "Corresponde cerrar"
    .limit(100);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  let sinPrimeraGestion: { codigo: string | null; nombre: string; comercial: string; horas_desde_asignacion: number }[] = [];
  const asignados = asignadosData ?? [];
  if (asignados.length) {
    const { data: ops } = await admin
      .from("oportunidades")
      .select("id, lead_id")
      .in("lead_id", asignados.map((l) => l.id));
    const opPorLead = new Map((ops ?? []).map((o) => [o.lead_id, o.id]));
    const opIds = (ops ?? []).map((o) => o.id);
    const { data: acts } = opIds.length
      ? await admin.from("actividades").select("oportunidad_id").in("oportunidad_id", opIds)
      : { data: [] as { oportunidad_id: string }[] };
    const conActividad = new Set((acts ?? []).map((a) => a.oportunidad_id));
    sinPrimeraGestion = asignados
      .filter((l) => {
        const op = opPorLead.get(l.id);
        return op && !conActividad.has(op);
      })
      .map((l) => ({
        codigo: l.codigo,
        nombre: l.nombre_contacto ?? l.razon_social ?? "Sin nombre",
        comercial: (l.perfiles as unknown as { nombre: string } | null)?.nombre ?? "—",
        horas_desde_asignacion: Math.round((ahora - new Date(l.asignado_at!).getTime()) / 3_600_000),
      }));
  }

  return NextResponse.json({
    generado: new Date().toISOString(),
    umbrales: { pendiente_min: min, sin_gestion_horas: horas },
    total: pendientes.length + sinPrimeraGestion.length,
    pendientes,
    sin_primera_gestion: sinPrimeraGestion,
    url_bandeja: enlaceApp("/central"),
  });
}
