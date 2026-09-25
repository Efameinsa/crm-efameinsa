import { createClient } from "@/lib/supabase/server";
import type { ServicioPostventa } from "@/lib/postventa";
import { ETIQUETA_TIPO_APERTURA, estadoApertura, type AperturaLlamada } from "@/lib/aperturas-llamada";
import type { PropsVista } from "@/lib/propuesta/vistas";
import { Chips, FilaTrabajo, Grupo, Vacio, haceCuanto, type DatosFila, type Tono } from "@/components/propuesta/kit";

/**
 * ESPERANDO A OTRAS ÁREAS (propuesta v2, 23-09).
 *
 * Lo que postventa ya pidió y está en manos de otro: la confirmación del abono
 * a Finanzas, la prueba y las aperturas al almacén, las series que pidió
 * Central. Antes eso se perseguía por teléfono; acá se ve a quién se espera y
 * desde cuándo. Arriba, lo que Finanzas le devolvió (el pago observado): eso
 * ya no espera a nadie, le toca a ella.
 */
type Cliente = Awaited<ReturnType<typeof createClient>>;
type Area = "devuelto" | "finanzas" | "almacen";
type Item = DatosFila & { id: string; area: Area; desde: string; urgente?: boolean };

const sinRuc = (s: string | null | undefined) => (s ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, "");
const primeraLinea = (s: string | null | undefined) => (s ?? "").split("\n")[0].trim();
const UN_DIA = 86_400_000;
const despues = (a: string | null | undefined, b: string | null | undefined) => Boolean(a) && (!b || (a as string) > b);

const GRUPOS: { area: Area; titulo: string; ayuda: string; tono: Tono }[] = [
  { area: "devuelto", titulo: "Le devolvieron", ayuda: "Finanzas observó el pago: hay que aclararlo con el comercial.", tono: "urgente" },
  { area: "finanzas", titulo: "Esperando a Finanzas", ayuda: "Pidió confirmar el abono y no hay respuesta.", tono: "atencion" },
  { area: "almacen", titulo: "Esperando al almacén", ayuda: "Llamadas derivadas, pruebas y códigos pedidos.", tono: "atencion" },
];

async function esperas(supabase: Cliente): Promise<Item[]> {
  const ahora = Date.now();
  const [{ data: pedidos }, { data: aperturas }] = await Promise.all([
    supabase.from("servicios_postventa").select("*").eq("completado", false).is("cerrado_at", null).limit(2000),
    supabase.from("aperturas_llamada").select("*, cuentas(razon_social)").is("anulada_at", null).is("informe_at", null).limit(500),
  ]);
  const items: Item[] = [];
  const edad = (iso: string): Tono => (ahora - new Date(iso).getTime() > 3 * UN_DIA ? "urgente" : ahora - new Date(iso).getTime() > UN_DIA ? "atencion" : "neutro");

  const todos = (pedidos ?? []) as unknown as (ServicioPostventa & { series_pedidas_at?: string | null })[];
  const vivos = todos.filter((s) => !s.informe_cierre_id || s.pedido_ejecutado_at);
  for (const s of vivos) {
    const cliente = sinRuc(s.cliente_texto);
    const equipo = primeraLinea(s.equipo) || "Pedido";
    const href = `/postventa/pedidos/${s.id}`;
    const confirmado = s.pago_confirmado_at;
    // Finanzas observó y nadie volvió a pedir ni confirmó después.
    if (s.pago_observado_at && despues(s.pago_observado_at, confirmado) && !despues(s.pago_solicitado_at, s.pago_observado_at)) {
      items.push({
        id: `obs-${s.id}`, area: "devuelto", desde: s.pago_observado_at, titulo: cliente, href, sub: `${equipo} · «${s.pago_observado_motivo?.trim() || "sin detalle"}»`,
        estado: { texto: "Finanzas observó el pago", tono: "urgente" }, espera: "Le toca a usted: hable con el comercial",
        edad: `Observado ${haceCuanto(s.pago_observado_at)}`, edadTono: "urgente", tono: "urgente", accion: { etiqueta: "Ver el pedido", href },
      });
    } else if (s.pago_solicitado_at && despues(s.pago_solicitado_at, confirmado) && despues(s.pago_solicitado_at, s.pago_observado_at)) {
      const t = edad(s.pago_solicitado_at);
      items.push({
        id: `pag-${s.id}`, area: "finanzas", desde: s.pago_solicitado_at, titulo: cliente, href, sub: equipo,
        estado: { texto: "Confirmación del abono pedida", tono: "info" }, espera: "Esperando a Finanzas",
        edad: `Pedida ${haceCuanto(s.pago_solicitado_at)}`, edadTono: t, tono: t, accion: { etiqueta: "Ver el pedido", href },
      });
    }
    const probado = s.prueba_lista_at != null || String(s.prueba_embalaje ?? "").trim().toUpperCase() === "SI";
    if (s.prueba_solicitada_at && !probado && !s.despachado_at) {
      const t = edad(s.prueba_solicitada_at);
      items.push({
        id: `pru-${s.id}`, area: "almacen", desde: s.prueba_solicitada_at, titulo: cliente, href, sub: equipo,
        estado: { texto: "Prueba y embalaje pedidos", tono: "info" }, espera: "Esperando al almacén",
        edad: `Pedida ${haceCuanto(s.prueba_solicitada_at)}`, edadTono: t, tono: t, accion: { etiqueta: "Ver el pedido", href },
      });
    }
  }

  // Las series que pidió Central (0290): el pedido todavía no está lanzado,
  // por eso se miran sobre todos, no solo los vivos.
  const conSeries = todos.filter((s) => s.series_pedidas_at);
  if (conSeries.length) {
    const faltan = new Map<string, number>();
    for (let i = 0; i < conSeries.length; i += 100) {
      const { data } = await supabase.from("pedido_equipos").select("servicio_id").in("servicio_id", conSeries.slice(i, i + 100).map((s) => s.id)).is("serie", null);
      for (const r of (data ?? []) as { servicio_id: string }[]) faltan.set(r.servicio_id, (faltan.get(r.servicio_id) ?? 0) + 1);
    }
    for (const s of conSeries) {
      const n = faltan.get(s.id) ?? 0;
      if (!n) continue;
      const t = edad(s.series_pedidas_at as string);
      items.push({
        id: `ser-${s.id}`, area: "almacen", desde: s.series_pedidas_at as string, titulo: sinRuc(s.cliente_texto), href: `/postventa/pedidos/${s.id}`,
        sub: primeraLinea(s.equipo) || "Pedido", estado: { texto: `Faltan ${n} serie${n === 1 ? "" : "s"}`, tono: "info" },
        espera: "Esperando al almacén (las pidió Central)", edad: `Pedidas ${haceCuanto(s.series_pedidas_at)}`, edadTono: t, tono: t,
        accion: { etiqueta: "Ver el pedido", href: `/postventa/pedidos/${s.id}` },
      });
    }
  }

  for (const a of (aperturas ?? []) as unknown as (AperturaLlamada & { cuentas: { razon_social: string } | null })[]) {
    const e = estadoApertura(a);
    if (e !== "enviada" && e !== "en_gestion") continue;
    const tomada = e === "en_gestion";
    const urgente = Boolean(a.urgente);
    // La llamada ya pasó (o es hoy) y falta el informe; o nadie la tomó.
    const vencida = new Date(a.programada_para).getTime() < ahora;
    const t: Tono = urgente ? "urgente" : vencida ? "atencion" : edad(a.solicitada_at);
    const cuando = new Date(a.programada_para).toLocaleString("es-PE", { timeZone: "America/Lima", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    items.push({
      id: `ap-${a.id}`, area: "almacen", desde: a.solicitada_at, urgente, titulo: sinRuc(a.cuentas?.razon_social), href: `/aperturas/${a.id}`,
      sub: `${ETIQUETA_TIPO_APERTURA[a.tipo]} · ${primeraLinea(a.equipos)} · ${cuando}`,
      estado: { texto: tomada ? (vencida ? "Tomada · falta el informe" : "El almacén la tomó") : "Sin tomar", tono: tomada ? "info" : "atencion" },
      dato: urgente ? <span className="rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white">URGENTE</span> : null,
      espera: tomada ? "Esperando el informe del almacén" : "Esperando que el almacén la tome",
      edad: `Enviada ${haceCuanto(a.solicitada_at)}`, edadTono: t, tono: t,
      accion: { etiqueta: urgente ? "Ver la apertura urgente" : "Ver la llamada", href: `/aperturas/${a.id}` },
    });
  }

  // URGENTE primero; después lo más viejo.
  return items.sort((a, b) => Number(Boolean(b.urgente)) - Number(Boolean(a.urgente)) || a.desde.localeCompare(b.desde));
}

/** Lo que lleva más de un día esperando (lo devuelto cuenta siempre). */
export async function conteo(supabase: Cliente): Promise<number> {
  const ahora = Date.now();
  return (await esperas(supabase)).filter((i) => i.area === "devuelto" || i.urgente || ahora - new Date(i.desde).getTime() > UN_DIA).length;
}
export const alerta = true;

export default async function PostventaEsperando({ searchParams, base }: PropsVista) {
  const supabase = await createClient();
  const items = await esperas(supabase);
  const ver = GRUPOS.some((g) => g.area === searchParams.ver) ? (searchParams.ver as Area) : null;
  const url = (a: Area | null) => (a ? `${base}?ver=${a}` : base);

  if (items.length === 0) {
    return (
      <Vacio
        titulo="No espera a nadie"
        porque="Acá aparece lo que usted pidió a otra área y todavía no responde: la confirmación del abono a Finanzas, la prueba o una llamada derivada al almacén, los códigos que pidió Central."
        accion={{ etiqueta: "Ver los pedidos", href: "/postventa/control" }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Chips
        etiqueta="A quién se espera"
        opciones={[
          { etiqueta: "Todo", href: url(null), activa: !ver, conteo: items.length },
          ...GRUPOS.map((g) => ({ etiqueta: g.titulo, href: url(g.area), activa: ver === g.area, conteo: items.filter((i) => i.area === g.area).length })),
        ]}
      />
      {GRUPOS.filter((g) => !ver || g.area === ver).map((g) => {
        const lista = items.filter((i) => i.area === g.area);
        if (lista.length === 0) {
          return ver ? <Vacio key={g.area} titulo={`Nada en «${g.titulo}»`} porque={g.ayuda} accion={{ etiqueta: "Ver todo", href: url(null) }} /> : null;
        }
        return (
          <Grupo key={g.area} titulo={g.titulo} ayuda={g.ayuda} conteo={lista.length} tono={g.tono}>
            {lista.map((i) => (
              <FilaTrabajo key={i.id} f={i} />
            ))}
          </Grupo>
        );
      })}
    </div>
  );
}
