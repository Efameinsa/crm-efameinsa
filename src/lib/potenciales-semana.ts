import { createClient } from "@/lib/supabase/server";

/**
 * Los datos del cuadro semanal de potenciales (reunión 25-08, ing. Carlos):
 * qué proyecta cerrar cada comercial esta semana, día a día, con el
 * presupuesto y su desglose por equipo.
 *
 * QUÉ ENTRA AL CUADRO:
 *  · toda oportunidad en etapa «potencial» (negociación) — con o sin fecha:
 *    las sin fecha van a la columna «Por ubicar», que es el reclamo natural
 *    («esto tiene que estar en la semana»);
 *  · más cualquier otra oportunidad abierta cuya fecha proyectada caiga en la
 *    semana visible (un «cotizada» que el comercial ya se comprometió a
 *    cerrar cuenta igual para el proyectado).
 *
 * EL MONTO: la última cotización ENVIADA de la oportunidad (código, total y
 * su desglose por ítems — «tenemos que permitirnos desglosar»). Si todavía no
 * hay cotización enviada, el monto estimado que puso el comercial.
 */

export interface ItemPotencial {
  nombre: string;
  cantidad: number;
  precio: number;
}

export interface Potencial {
  id: string;
  cliente: string;
  rubro: string | null;
  comercialId: string;
  comercialCodigo: string | null;
  comercialNombre: string;
  etapa: string;
  cierreProyectado: string | null;
  presupuesto: string | null;
  monto: number | null;
  moneda: string;
  montoUsd: number | null;
  items: ItemPotencial[];
}

const lunesDe = (d: Date): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};
export const iso = (d: Date): string => d.toISOString().slice(0, 10);

/** El lunes de la semana pedida (?semana=YYYY-MM-DD) o de la actual, en Lima. */
export function lunesSemana(param?: string): string {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) return iso(lunesDe(new Date(`${param}T12:00:00`)));
  const hoyLima = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
  return iso(lunesDe(hoyLima));
}

export async function cargarPotenciales(
  lunes: string,
  comercialId?: string | null,
): Promise<{ potenciales: Potencial[]; tc: number }> {
  const supabase = await createClient();
  const sabado = iso(new Date(new Date(`${lunes}T12:00:00`).getTime() + 5 * 86400000));

  const { data: tcFila } = await supabase.from("parametros").select("valor").eq("clave", "tc_usd_pen").maybeSingle();
  const tc = Number(tcFila?.valor) || 3.75;

  let q = supabase
    .from("oportunidades")
    .select(
      "id, etapa, cierre_proyectado, monto_estimado, moneda, comercial_id, cuentas(razon_social, catalogo_rubros(nombre)), perfiles(nombre, codigo_comercial)",
    )
    .not("etapa", "in", "(venta,rechazada,derivada)")
    .or(`etapa.eq.potencial,and(cierre_proyectado.gte.${lunes},cierre_proyectado.lte.${sabado})`);
  if (comercialId) q = q.eq("comercial_id", comercialId);
  const { data: ops } = await q.limit(500);

  const ids = (ops ?? []).map((o) => o.id);
  const { data: cots } = ids.length
    ? await supabase
        .from("cotizaciones")
        .select("id, oportunidad_id, codigo, total, moneda, enviada_at")
        .in("oportunidad_id", ids)
        .not("enviada_at", "is", null)
        .order("enviada_at", { ascending: false })
    : { data: [] };
  const cotPorOp = new Map<string, NonNullable<typeof cots>[number]>();
  for (const c of cots ?? []) if (!cotPorOp.has(c.oportunidad_id)) cotPorOp.set(c.oportunidad_id, c);

  const cotIds = [...cotPorOp.values()].map((c) => c.id);
  const { data: items } = cotIds.length
    ? await supabase
        .from("cotizacion_items")
        .select("cotizacion_id, descripcion, cantidad, precio_unitario, productos(marca, modelo, nombre)")
        .in("cotizacion_id", cotIds)
    : { data: [] };
  const itemsPorCot = new Map<string, ItemPotencial[]>();
  for (const i of items ?? []) {
    const p = i.productos as unknown as { marca: string; modelo: string; nombre: string } | null;
    const xs = itemsPorCot.get(i.cotizacion_id) ?? [];
    xs.push({
      nombre: p ? `${p.nombre} ${p.marca} ${p.modelo}` : (i.descripcion ?? "Equipo"),
      cantidad: i.cantidad,
      precio: Number(i.precio_unitario),
    });
    itemsPorCot.set(i.cotizacion_id, xs);
  }

  const enUsd = (monto: number | null, moneda: string): number | null =>
    monto == null ? null : moneda === "PEN" ? monto / tc : monto;

  const potenciales: Potencial[] = (ops ?? []).map((o) => {
    const cuenta = o.cuentas as unknown as { razon_social: string; catalogo_rubros: { nombre: string } | null } | null;
    const perfil = o.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;
    const cot = cotPorOp.get(o.id);
    const monto = cot ? Number(cot.total) : o.monto_estimado != null ? Number(o.monto_estimado) : null;
    const moneda = cot ? cot.moneda : (o.moneda ?? "USD");
    return {
      id: o.id,
      cliente: cuenta?.razon_social ?? "—",
      rubro: cuenta?.catalogo_rubros?.nombre ?? null,
      comercialId: o.comercial_id,
      comercialCodigo: perfil?.codigo_comercial ?? null,
      comercialNombre: perfil?.nombre ?? "—",
      etapa: o.etapa as string,
      cierreProyectado: o.cierre_proyectado as string | null,
      presupuesto: cot?.codigo ?? null,
      monto,
      moneda,
      montoUsd: enUsd(monto, moneda),
      items: cot ? (itemsPorCot.get(cot.id) ?? []) : [],
    };
  });

  return { potenciales, tc };
}

/* ------------------------------------------------------------------ */
/* El mismo cuadro, en datos: para la agenda y para el reporte diario  */
/* ------------------------------------------------------------------ */

/**
 * Pedido del ing. Carlos, reunión 27-08: «esto todos los días que se muestre
 * en tu agenda, acá abajo» — lunes a sábado, los clientes de cada día con su
 * monto, la suma del día y el total de la semana, que es lo que el comercial
 * dice que va a vender.
 *
 * Vive acá y no dentro de la pantalla porque ahora lo dibujan tres sitios —la
 * vista de potenciales, la agenda y el PDF del reporte— y tienen que dar el
 * MISMO número. Un total que no cuadra entre dos pantallas es peor que no
 * mostrarlo.
 *
 * Seis días, no cinco: acá se trabaja el sábado.
 */
const DIA_CORTO = ["lun", "mar", "mié", "jue", "vie", "sáb"];

export interface ClienteProyectado {
  cliente: string;
  presupuesto: string | null;
  monto: number;
}

export interface DiaProyectado {
  iso: string;
  etiqueta: string;
  total: number;
  clientes: ClienteProyectado[];
}

export interface ProyeccionSemana {
  lunes: string;
  dias: DiaProyectado[];
  /** En etapa «potencial» pero sin fecha: el reclamo natural del cuadro. */
  porUbicar: ClienteProyectado[];
  totalSemana: number;
  totalPorUbicar: number;
}

export function resumirSemana(lunes: string, potenciales: Potencial[]): ProyeccionSemana {
  const dias = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(`${lunes}T12:00:00`);
    d.setDate(d.getDate() + i);
    return { iso: d.toISOString().slice(0, 10), etiqueta: `${DIA_CORTO[i]} ${d.getDate()}` };
  });

  const aCliente = (p: Potencial): ClienteProyectado => ({
    cliente: p.cliente,
    presupuesto: p.presupuesto,
    monto: p.montoUsd ?? 0,
  });

  const porDia = new Map<string, ClienteProyectado[]>(dias.map((d) => [d.iso, []]));
  const porUbicar: ClienteProyectado[] = [];

  for (const p of potenciales) {
    const enSemana =
      p.cierreProyectado !== null && p.cierreProyectado >= dias[0].iso && p.cierreProyectado <= dias[5].iso;
    if (enSemana) porDia.get(p.cierreProyectado!)!.push(aCliente(p));
    // «Por ubicar» es SIN FECHA, literal. Antes caía acá también lo que tenía
    // fecha de otra semana, y eso es lo que hacía ilegible la columna —el ing.
    // Carlos, 27-08: «esto por ubicar dificulta un poco la vista, ¿qué es
    // esto?»—: el comercial abría una oportunidad a ponerle fecha y ya la
    // tenía, para otro día. Lo de otra semana simplemente no es de esta semana.
    else if (p.etapa === "potencial" && p.cierreProyectado === null) porUbicar.push(aCliente(p));
  }

  const suma = (xs: ClienteProyectado[]) => xs.reduce((s, x) => s + x.monto, 0);
  const detalle = dias.map((d) => {
    const clientes = porDia.get(d.iso)!.sort((a, b) => b.monto - a.monto);
    return { ...d, clientes, total: suma(clientes) };
  });

  return {
    lunes,
    dias: detalle,
    porUbicar: porUbicar.sort((a, b) => b.monto - a.monto),
    totalSemana: detalle.reduce((s, d) => s + d.total, 0),
    totalPorUbicar: suma(porUbicar),
  };
}
