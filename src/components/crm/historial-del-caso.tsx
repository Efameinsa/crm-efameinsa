import { createAdminClient } from "@/lib/supabase/admin";
import { ETIQUETA_ETAPA, tituloDelTipo, type EtapaAtencion } from "@/lib/atenciones";
import { ETIQUETA_ACTIVIDAD } from "@/components/crm/etiquetas-actividad";
import { ETIQUETA_TIPO_APERTURA } from "@/lib/aperturas-llamada";
import { fechaHoraLima } from "@/lib/fechas";

/**
 * EL HISTORIAL DE ESTE CASO, PASO A PASO Y CON NOMBRE (reunión de gerencia
 * 20-10, Comercial Lernake): «¿no debería verse en la parte inferior todas
 * las gestiones que han realizado una a una de este caso, por etapas?». Sale
 * del registro de acciones (0513, desde el 16-10): cada cambio de etapa, de
 * responsable o del detalle, con quién y cuándo. Lo anterior al 16-10 queda
 * con lo que dicen las fechas de cada etapa (la línea de arriba).
 *
 * TODO, DENTRO DEL CIRCUITO (20-10, LINO ESPIRITU): «en el circuito debe
 * poder verse todo el historial de las gestiones que se hicieron en ese caso».
 * Además de los cambios del caso entran las gestiones del expediente (llamadas,
 * WhatsApp, notas) desde que se abrió el caso hasta que se cerró, las llamadas
 * derivadas al almacén y la apertura de servicio con su técnico.
 *
 * Se lee con la llave de servicio: el registro de acciones es de gerencia y
 * operaciones, y esta sección solo se monta en la página del caso.
 */
export async function HistorialDelCaso({ atencionId, creadoAt }: { atencionId: string; creadoAt: string | null }) {
  const admin = createAdminClient();
  const [{ data }, { data: caso }, { data: llamadas }] = await Promise.all([
    admin
      .from("registro_acciones")
      .select("id, operacion, campos, antes, despues, quien, cuando, deshecha_at")
      .eq("tabla", "atenciones")
      .eq("fila_id", atencionId)
      .order("cuando", { ascending: true })
      .limit(200),
    admin.from("atenciones").select("oportunidad_id, servicio_id, created_at, cerrado_at").eq("id", atencionId).maybeSingle(),
    admin
      .from("aperturas_llamada")
      .select("id, tipo, solicitada_at, solicitada_por, programada_para, tecnico, informe_at, informe_por, enviada_cliente_at, anulada_at, anulada_motivo")
      .eq("atencion_id", atencionId),
  ]);
  const desde = caso?.created_at ?? creadoAt;
  const [{ data: gestiones }, { data: pedido }] = await Promise.all([
    caso?.oportunidad_id && desde
      ? (() => {
          // 0567: lo que se anotó PARA ESTE CASO, más lo suelto del expediente
          // en sus fechas (lo anterior a la 0567 no sabe de qué caso es). Lo
          // anotado para OTRO caso del mismo cliente ya no se mezcla aquí.
          const ventana = [
            "atencion_id.is.null",
            `oportunidad_id.eq.${caso.oportunidad_id}`,
            `realizada_at.gte."${desde}"`,
            ...(caso.cerrado_at ? [`realizada_at.lte."${caso.cerrado_at}"`] : []),
          ].join(",");
          return admin
            .from("actividades")
            .select("id, tipo, nota, realizada_por, realizada_at")
            .or(`atencion_id.eq.${atencionId},and(${ventana})`)
            .order("realizada_at", { ascending: true })
            .limit(200);
        })()
      : Promise.resolve({ data: [] }),
    caso?.servicio_id
      ? admin
          .from("servicios_postventa")
          .select("apertura_despacho_at, apertura_despacho_por, apertura_fecha, apertura_hora, tecnico_asignado, tecnico_salio_at, tecnico_salio_por, tecnico_llego_at, tecnico_llego_por, cerrado_at, cerrado_por")
          .eq("id", caso.servicio_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
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
  const acts = (gestiones ?? []) as { id: string; tipo: string; nota: string | null; realizada_por: string | null; realizada_at: string }[];
  const derivadas = (llamadas ?? []) as {
    id: string;
    tipo: string;
    solicitada_at: string | null;
    solicitada_por: string | null;
    programada_para: string | null;
    tecnico: string | null;
    informe_at: string | null;
    informe_por: string | null;
    enviada_cliente_at: string | null;
    anulada_at: string | null;
    anulada_motivo: string | null;
  }[];
  const ped = pedido as {
    apertura_despacho_at: string | null;
    apertura_despacho_por: string | null;
    apertura_fecha: string | null;
    apertura_hora: string | null;
    tecnico_asignado: string | null;
    tecnico_salio_at: string | null;
    tecnico_salio_por: string | null;
    tecnico_llego_at: string | null;
    tecnico_llego_por: string | null;
    cerrado_at: string | null;
    cerrado_por: string | null;
  } | null;

  const ids = [
    ...new Set(
      [
        ...filas.flatMap((f) => [f.quien, f.despues?.asignado_a as string | undefined, f.despues?.tomada_por as string | undefined]),
        ...acts.map((g) => g.realizada_por),
        ...derivadas.flatMap((l) => [l.solicitada_por, l.informe_por]),
        ped?.apertura_despacho_por,
        ped?.tecnico_salio_por,
        ped?.tecnico_llego_por,
        ped?.cerrado_por,
      ].filter((x): x is string => typeof x === "string"),
    ),
  ];
  const { data: perfiles } = ids.length ? await admin.from("perfiles").select("id, nombre, codigo_comercial").in("id", ids) : { data: [] };
  const nombre = new Map(((perfiles ?? []) as { id: string; nombre: string; codigo_comercial: string | null }[]).map((p) => [p.id, `${p.nombre}${p.codigo_comercial ? ` (${p.codigo_comercial})` : ""}`]));
  const de = (id: string | null | undefined) => (id ? (nombre.get(id) ?? null) : null);

  const lineas: { cuando: string; quien: string | null; que: string; tipo: "caso" | "gestion" | "almacen" }[] = [];
  for (const f of filas) {
    if (f.deshecha_at) continue;
    const d = f.despues ?? {};
    const antes = f.antes ?? {};
    const que: string[] = [];
    if (f.operacion === "crear") que.push("Se abrió el caso");
    if ("tipo" in d && d.tipo && d.tipo !== antes.tipo && f.operacion !== "crear") que.push(`Tipo de caso: ${tituloDelTipo(String(d.tipo), (d.tipo_detalle as string | null) ?? null)}`);
    if ("etapa" in d && d.etapa !== antes.etapa) que.push(`Pasó a «${ETIQUETA_ETAPA[d.etapa as EtapaAtencion] ?? String(d.etapa)}»`);
    if ("asignado_a" in d && d.asignado_a) que.push(`Se le asignó a ${nombre.get(d.asignado_a as string) ?? "otra persona"}`);
    if ("tomada_por" in d && d.tomada_por) que.push(`Lo tomó ${nombre.get(d.tomada_por as string) ?? "otra persona"}`);
    if ("servicio_id" in d && d.servicio_id && !antes.servicio_id) que.push("Emitió la apertura de servicio");
    if ("tecnico" in d && d.tecnico) que.push(`Técnico: ${String(d.tecnico)}`);
    if ("programada_at" in d && d.programada_at) que.push(`Programado para el ${fechaHoraLima(String(d.programada_at))}`);
    if ("diagnostico" in d && d.diagnostico) que.push(`Diagnóstico: ${String(d.diagnostico).slice(0, 160)}`);
    if ("trabajo_realizado" in d && d.trabajo_realizado) que.push(`Trabajo realizado: ${String(d.trabajo_realizado).slice(0, 200)}`);
    if ("pruebas_detalle" in d && d.pruebas_detalle) que.push(`Pruebas: ${String(d.pruebas_detalle).slice(0, 200)}`);
    if ("detalle" in d && typeof d.detalle === "string" && typeof antes.detalle === "string" && d.detalle.length > antes.detalle.length) {
      que.push(d.detalle.slice(antes.detalle.length).trim().slice(0, 240));
    }
    if ("cerrado_at" in d && d.cerrado_at) que.push(`Se cerró${d.motivo_cierre ? `: ${String(d.motivo_cierre)}` : ""}`);
    if (que.length === 0) continue;
    lineas.push({ cuando: f.cuando, quien: de(f.quien), que: que.join(" · "), tipo: "caso" });
  }
  // Las notas «[Atención …]» las escribe el mismo caso al avanzar: con el
  // registro de acciones ya están arriba; sin él (antes del 16-10) son lo único.
  const conRegistro = lineas.length > 0;
  for (const g of acts) {
    const nota = (g.nota ?? "").trim();
    if (conRegistro && nota.startsWith("[Atención")) continue;
    lineas.push({
      cuando: g.realizada_at,
      quien: de(g.realizada_por),
      que: `${ETIQUETA_ACTIVIDAD[g.tipo] ?? g.tipo}${nota ? `: ${nota}` : ""}`,
      tipo: "gestion",
    });
  }
  for (const l of derivadas) {
    const tipo = ETIQUETA_TIPO_APERTURA[l.tipo as keyof typeof ETIQUETA_TIPO_APERTURA] ?? l.tipo;
    if (l.solicitada_at)
      lineas.push({
        cuando: l.solicitada_at,
        quien: de(l.solicitada_por),
        que: `Derivó al almacén: ${tipo}${l.programada_para ? ` para el ${fechaHoraLima(l.programada_para)}` : ""}${l.tecnico ? ` · ${l.tecnico}` : ""}`,
        tipo: "almacen",
      });
    if (l.informe_at) lineas.push({ cuando: l.informe_at, quien: de(l.informe_por), que: `El almacén respondió: ${tipo}`, tipo: "almacen" });
    if (l.enviada_cliente_at) lineas.push({ cuando: l.enviada_cliente_at, quien: null, que: "Se le envió el informe al cliente", tipo: "almacen" });
    if (l.anulada_at) lineas.push({ cuando: l.anulada_at, quien: null, que: `Se anuló la derivación${l.anulada_motivo ? `: ${l.anulada_motivo}` : ""}`, tipo: "almacen" });
  }
  if (ped) {
    if (ped.tecnico_salio_at) lineas.push({ cuando: ped.tecnico_salio_at, quien: de(ped.tecnico_salio_por), que: `Salió el técnico${ped.tecnico_asignado ? ` (${ped.tecnico_asignado})` : ""}`, tipo: "almacen" });
    if (ped.tecnico_llego_at) lineas.push({ cuando: ped.tecnico_llego_at, quien: de(ped.tecnico_llego_por), que: "El técnico llegó donde el cliente", tipo: "almacen" });
    if (ped.cerrado_at) lineas.push({ cuando: ped.cerrado_at, quien: de(ped.cerrado_por), que: "Se cerró la apertura de servicio", tipo: "almacen" });
  }
  lineas.sort((x, y) => x.cuando.localeCompare(y.cuando));

  const ROTULO = { caso: "Caso", gestion: "Gestión", almacen: "Almacén" } as const;
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
              <span className="ml-1.5 rounded bg-secondary px-1 py-px text-[10px] font-medium text-muted-foreground">{ROTULO[l.tipo]}</span>
              <p className="whitespace-pre-line text-foreground">{l.que}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
