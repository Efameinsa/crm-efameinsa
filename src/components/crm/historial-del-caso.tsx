import { createAdminClient } from "@/lib/supabase/admin";
import { ETIQUETA_ETAPA, type EtapaAtencion } from "@/lib/atenciones";
import { fechaHoraLima } from "@/lib/fechas";

/**
 * EL HISTORIAL DE ESTE CASO, PASO A PASO Y CON NOMBRE (reunión de gerencia
 * 20-10, Comercial Lernake): «¿no debería verse en la parte inferior todas
 * las gestiones que han realizado una a una de este caso, por etapas?». Sale
 * del registro de acciones (0513, desde el 16-10): cada cambio de etapa, de
 * responsable o del detalle, con quién y cuándo. Lo anterior al 16-10 queda
 * con lo que dicen las fechas de cada etapa (la línea de arriba).
 *
 * Se lee con la llave de servicio: el registro de acciones es de gerencia y
 * operaciones, y esta sección solo se monta en la página del caso.
 */
export async function HistorialDelCaso({ atencionId, creadoAt }: { atencionId: string; creadoAt: string | null }) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("registro_acciones")
    .select("id, operacion, campos, antes, despues, quien, cuando, deshecha_at")
    .eq("tabla", "atenciones")
    .eq("fila_id", atencionId)
    .order("cuando", { ascending: true })
    .limit(200);
  const filas = (data ?? []) as {
    id: string;
    operacion: string;
    campos: string[] | null;
    antes: Record<string, unknown> | null;
    despues: Record<string, unknown> | null;
    quien: string | null;
    cuando: string;
    deshecha_at: string | null;
  }[];
  const ids = [
    ...new Set(
      filas.flatMap((f) => [f.quien, f.despues?.asignado_a as string | undefined, f.despues?.tomada_por as string | undefined]).filter((x): x is string => typeof x === "string"),
    ),
  ];
  const { data: perfiles } = ids.length ? await admin.from("perfiles").select("id, nombre, codigo_comercial").in("id", ids) : { data: [] };
  const nombre = new Map(((perfiles ?? []) as { id: string; nombre: string; codigo_comercial: string | null }[]).map((p) => [p.id, `${p.nombre}${p.codigo_comercial ? ` (${p.codigo_comercial})` : ""}`]));

  const lineas: { cuando: string; quien: string | null; que: string }[] = [];
  for (const f of filas) {
    if (f.deshecha_at) continue;
    const d = f.despues ?? {};
    const antes = f.antes ?? {};
    const que: string[] = [];
    if (f.operacion === "crear") que.push("Se abrió el caso");
    if ("etapa" in d && d.etapa !== antes.etapa) que.push(`Pasó a «${ETIQUETA_ETAPA[d.etapa as EtapaAtencion] ?? String(d.etapa)}»`);
    if ("asignado_a" in d && d.asignado_a) que.push(`Se le asignó a ${nombre.get(d.asignado_a as string) ?? "otra persona"}`);
    if ("tomada_por" in d && d.tomada_por) que.push(`Lo tomó ${nombre.get(d.tomada_por as string) ?? "otra persona"}`);
    if ("tecnico" in d && d.tecnico) que.push(`Técnico: ${String(d.tecnico)}`);
    if ("diagnostico" in d && d.diagnostico) que.push(`Diagnóstico: ${String(d.diagnostico).slice(0, 160)}`);
    if ("detalle" in d && typeof d.detalle === "string" && typeof antes.detalle === "string" && d.detalle.length > antes.detalle.length) {
      que.push(d.detalle.slice(antes.detalle.length).trim().slice(0, 240));
    }
    if ("cerrado_at" in d && d.cerrado_at) que.push(`Se cerró${d.motivo_cierre ? `: ${String(d.motivo_cierre)}` : ""}`);
    if (que.length === 0) continue;
    lineas.push({ cuando: f.cuando, quien: f.quien ? (nombre.get(f.quien) ?? null) : null, que: que.join(" · ") });
  }

  return (
    <div className="space-y-2 text-xs">
      {lineas.length === 0 ? (
        <p className="text-muted-foreground">
          {creadoAt
            ? `Abierto el ${fechaHoraLima(creadoAt)}. Los cambios con nombre se registran desde el 16-10; lo anterior está en las fechas de cada etapa, arriba.`
            : "Todavía no hay cambios registrados en este caso."}
        </p>
      ) : (
        <ol className="space-y-1.5 border-l border-border pl-3">
          {lineas.map((l, i) => (
            <li key={i}>
              <span className="font-medium text-foreground">{fechaHoraLima(l.cuando)}</span>
              <span className="text-muted-foreground"> · {l.quien ?? "el sistema"}</span>
              <p className="text-foreground">{l.que}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
