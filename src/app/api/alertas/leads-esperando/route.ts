import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CANAL_LABEL } from "@/lib/canal-contacto";
import { enlaceApp } from "@/lib/url-app";
import { traerPorLotes } from "@/lib/lotes";
import { inicioVentanaOtraFicha } from "@/lib/derivados-central";

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
    .select(
      "id, codigo, nombre_contacto, razon_social, recibido_at, asignado_at, asignado_a, cuenta_id, perfiles:asignado_a(nombre)",
    )
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

    // …SALVO QUE LA GESTIÓN ESTÉ EN OTRA FICHA DEL MISMO CLIENTE. El contacto
    // que entra dos veces (formulario web y WhatsApp) abre dos fichas sobre la
    // misma cuenta: el comercial atiende una y esta alerta escalaba la otra a
    // gerencia por correo cada 15 minutos. Es la misma regla que ya usan la
    // bandeja de Central y la ficha del comercial —la ventana arranca cuando
    // ENTRÓ la consulta, con un día de margen— y acá importa el doble, porque
    // esto no pinta un rótulo: manda un correo acusando a una persona.
    const candidatos = asignados.filter((l) => {
      const op = opPorLead.get(l.id);
      return op && !conActividad.has(op);
    });
    const cuentasCandidatas = [...new Set(candidatos.map((l) => l.cuenta_id).filter((x): x is string => Boolean(x)))];
    const arranqueDe = (l: { recibido_at: string | null; asignado_at: string | null }) =>
      inicioVentanaOtraFicha(l.recibido_at, l.asignado_at) ?? Infinity;
    const gestionadoAlLado = new Set<string>();
    if (cuentasCandidatas.length) {
      const desde = Math.min(...candidatos.map(arranqueDe));
      // Por lotes: `.in` con muchos ids muere en la URL y devuelve data:null,
      // que acá se leería como «no hay gestión» — el error que esto corrige.
      const { data: opsCuenta, error: e3 } = await traerPorLotes<{ id: string; cuenta_id: string }>(
        cuentasCandidatas,
        (lote) => admin.from("oportunidades").select("id, cuenta_id").in("cuenta_id", lote),
      );
      // Si esta consulta falla no se puede saber si hubo gestión al lado, y
      // callar el error escalaría acusaciones falsas: se devuelve el fallo y
      // n8n reintenta en quince minutos.
      if (e3) return NextResponse.json({ error: e3 }, { status: 500 });
      const opsPorCuenta = new Map<string, string[]>();
      for (const o of opsCuenta) opsPorCuenta.set(o.cuenta_id, [...(opsPorCuenta.get(o.cuenta_id) ?? []), o.id]);
      const { data: actsCuenta, error: e4 } = await traerPorLotes<{ oportunidad_id: string; realizada_at: string }>(
        opsCuenta.map((o) => o.id),
        (lote) =>
          admin
            .from("actividades")
            .select("oportunidad_id, realizada_at")
            .in("oportunidad_id", lote)
            .gte("realizada_at", new Date(desde).toISOString()),
      );
      if (e4) return NextResponse.json({ error: e4 }, { status: 500 });
      const actsPorOp = new Map<string, string[]>();
      for (const a of actsCuenta)
        actsPorOp.set(a.oportunidad_id, [...(actsPorOp.get(a.oportunidad_id) ?? []), a.realizada_at]);
      for (const l of candidatos) {
        if (!l.cuenta_id) continue;
        const propia = opPorLead.get(l.id);
        const arranque = arranqueDe(l);
        const atendido = (opsPorCuenta.get(l.cuenta_id) ?? []).some(
          (opId) =>
            opId !== propia && (actsPorOp.get(opId) ?? []).some((f) => new Date(f).getTime() >= arranque),
        );
        if (atendido) gestionadoAlLado.add(l.id);
      }
    }

    sinPrimeraGestion = candidatos
      .filter((l) => !gestionadoAlLado.has(l.id))
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
