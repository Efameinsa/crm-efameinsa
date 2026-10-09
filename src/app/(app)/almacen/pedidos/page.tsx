import Link from "@/components/enlace";
import { Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { hoyLima } from "@/lib/periodo";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { BusquedaEnVivo } from "@/components/crm/busqueda-en-vivo";
import { ETIQUETA_TIPO_PEDIDO, circuitoDe, faltanFotosDeCarga, textoComprobante, type ServicioPostventa } from "@/lib/postventa";
import { cn } from "@/lib/utils";
import { torresSinSegundaSerie } from "@/lib/torres";

export const dynamic = "force-dynamic";

/**
 * Los pedidos vistos desde el almacén (0246): «el mismo pedido que tengo yo
 * en postventa tengo que verlo en el almacén, porque ese pedido, ¿quién te
 * va a dar la orden para que lo pruebes? Postventa» (Carlos, 16-09). Sin
 * cifras: el área no ve precios. Cada fila dice en qué está la parte de
 * almacén: probar, listo, salida, guía.
 */
const VISTAS: Record<string, string> = {
  "": "Todos los pedidos en curso",
  // Lo que Central le pide (0290, reunión 23-09 14:58): «darle clic… se lo pide
  // al almacén; el almacén ingresa la serie, está bloqueada».
  // «Generación de código» (Lesly, 25-09): así lo llama el almacén.
  series: "Generación de código",
  probar: "Por probar y embalar",
  hoy: "Despachos de hoy",
  confirmar: "Programados sin confirmar",
  atrasados: "Atrasados",
  apertura: "Con apertura, sin salir",
  // Reunión de gerencia 06-10 11:01: «tiene que tener acá en la vista de
  // almacén que diga emisión de guía, para que me llegue la alerta».
  guias: "Guías autorizadas por Finanzas",
  guia: "Salieron, sin guía",
  aprobados: "Aprobados sin pedido de prueba",
  // Lo que ya salió, para seguirlo y controlarlo (almacén, 23-09: «Se requiere
  // contar con un apartado de "Despachados", donde puedan visualizarse los
  // pedidos o gestiones que ya hayan finalizado»). Las demás vistas son solo
  // lo que está en curso; esta incluye también los pedidos ya cerrados.
  despachados: "Despachados",
};
const cliente = (t: string | null) => (t ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, "");

const esFecha = (s: string | undefined) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

export default async function AlmacenPedidosPage({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string; desde?: string; hasta?: string }> }) {
  await requerirPerfil();
  const sp = await searchParams;
  const ver = sp.ver && sp.ver in VISTAS ? sp.ver : "";
  const q = (sp.q ?? "").trim();
  // Rango de fechas de despacho (Santos, 18-09): «en pedidos agregar rangos
  // de fechas para el filtrado». Sobre la fecha programada; los sin fecha
  // quedan fuera cuando hay rango.
  const desde = esFecha(sp.desde) ? sp.desde! : "";
  const hasta = esFecha(sp.hasta) ? sp.hasta! : "";
  const supabase = await createClient();
  const hoy = hoyLima();

  const despachados = ver === "despachados";
  const porSeries = ver === "series";
  let consulta = supabase
    .from("servicios_postventa")
    .select("id, cliente_texto, equipo, ubicacion, direccion_entrega, modalidad, fecha_despacho, despachado_at, apertura_despacho_at, prueba_solicitada_at, prueba_lista_at, prueba_embalaje, protocolo_prueba_ref, almacen_listo_at, agencia_at, guia, guia_confirmada_at, guia_comprobante_tipo, guia_comprobante_numero, transportista, salida_fotos, completado, cerrado_at, informe_cierre_id, pedido_ejecutado_at, aprobado_at, tipo_pedido, entrega_en, con_instalacion, despacho_nota, updated_at, series_pedidas_at");
  // Las series las pide Central ANTES de lanzar el pedido: esa cola no pasa por
  // el filtro de «ya lanzado» que usan las demás.
  consulta = porSeries ? consulta.not("series_pedidas_at", "is", null) : consulta.or("informe_cierre_id.is.null,pedido_ejecutado_at.not.is.null");
  consulta = despachados
    ? // Lo último que salió arriba; con o sin pedido cerrado.
      consulta.not("despachado_at", "is", null).order("despachado_at", { ascending: false }).limit(300)
    : consulta
        .eq("completado", false)
        .is("cerrado_at", null)
        .order("fecha_despacho", { ascending: true, nullsFirst: false })
        .order("updated_at", { ascending: false })
        .limit(500);
  if (q) consulta = consulta.or(`cliente_texto.ilike.%${q}%,equipo.ilike.%${q}%,guia.ilike.%${q}%`);
  // En «Despachados» el rango es sobre el día en que salió; en las demás,
  // sobre la fecha programada.
  if (desde) consulta = despachados ? consulta.gte("despachado_at", `${desde}T00:00:00-05:00`) : consulta.gte("fecha_despacho", desde);
  if (hasta) consulta = despachados ? consulta.lte("despachado_at", `${hasta}T23:59:59-05:00`) : consulta.lte("fecha_despacho", hasta);
  const { data } = await consulta;

  const todos = (data ?? []) as unknown as (ServicioPostventa & { series_pedidas_at?: string | null })[];
  // Cuántas series le faltan a cada pedido que Central pidió (0290).
  const faltanSeries = new Map<string, number>();
  // Qué y cuántos (Lesly, 25-09: «no me sale la cantidad»): «4 × COCHE DE TRANSPORTE DE ROPA».
  const queFaltaCodificar = new Map<string, Map<string, number>>();
  if (porSeries && todos.length) {
    const { data: sinSerie } = await supabase.from("pedido_equipos").select("servicio_id, descripcion").in("servicio_id", todos.map((t) => t.id)).is("serie", null);
    for (const r of (sinSerie ?? []) as { servicio_id: string; descripcion: string }[]) {
      faltanSeries.set(r.servicio_id, (faltanSeries.get(r.servicio_id) ?? 0) + 1);
      const t = r.descripcion.split("\n")[0].trim();
      const m = queFaltaCodificar.get(r.servicio_id) ?? new Map<string, number>();
      m.set(t, (m.get(t) ?? 0) + 1);
      queFaltaCodificar.set(r.servicio_id, m);
    }
    // La torre con una sola serie sigue pendiente: falta la de la secadora (0359).
    for (const [id, n] of await torresSinSegundaSerie(supabase)) {
      faltanSeries.set(id, (faltanSeries.get(id) ?? 0) + n);
      const m = queFaltaCodificar.get(id) ?? new Map<string, number>();
      m.set("serie de la secadora (torre)", n);
      queFaltaCodificar.set(id, m);
    }
  }
  // LO YA RESPONDIDO (Lesly, 01-10: «cuando doy código y salgo de la página ya
  // no tengo la opción de ver lo que respondí para imprimir»). Al completar las
  // series el pedido sale de la cola; queda abajo, con su hoja de respuesta.
  const respondidos: { s: (typeof todos)[number]; at: string }[] = [];
  if (porSeries) {
    const candidatos = todos.filter((t) => (faltanSeries.get(t.id) ?? 0) === 0).map((t) => t.id);
    const ultima = new Map<string, string>();
    for (let i = 0; i < candidatos.length; i += 100) {
      const { data: filas } = await supabase
        .from("pedido_equipos")
        .select("servicio_id, serie_registrada_at")
        .in("servicio_id", candidatos.slice(i, i + 100))
        .not("serie", "is", null);
      for (const f of (filas ?? []) as { servicio_id: string; serie_registrada_at: string | null }[]) {
        const at = f.serie_registrada_at ?? "";
        if (at > (ultima.get(f.servicio_id) ?? "")) ultima.set(f.servicio_id, at);
      }
    }
    const hace30 = new Date(new Date(`${hoy}T00:00:00-05:00`).getTime() - 30 * 86_400_000).toISOString();
    for (const t of todos) {
      const at = ultima.get(t.id);
      if (at && at >= hace30) respondidos.push({ s: t, at });
    }
    respondidos.sort((a, b) => b.at.localeCompare(a.at));
  }
  // Un servicio (revisión o mantenimiento) no se prueba ni se embala: para el
  // almacén solo sale el técnico (Lesly, 09-10).
  const probado = (s: ServicioPostventa) => circuitoDe(s).esServicio || s.prueba_lista_at != null || String(s.prueba_embalaje ?? "").toUpperCase() === "SI";
  const filas = todos.filter((s) => {
    switch (ver) {
      case "probar": return Boolean(s.prueba_solicitada_at) && !probado(s);
      case "hoy": return s.fecha_despacho === hoy && !s.despachado_at;
      case "confirmar": return Boolean(s.fecha_despacho) && !s.despachado_at && !s.almacen_listo_at;
      case "atrasados": return Boolean(s.fecha_despacho) && (s.fecha_despacho as string) < hoy && !s.despachado_at;
      case "apertura": return Boolean(s.apertura_despacho_at) && !s.despachado_at;
      case "guias": return Boolean(s.apertura_despacho_at) && Boolean(s.guia_confirmada_at) && !s.despachado_at && !s.guia;
      case "guia": return Boolean(s.despachado_at) && !s.guia && !s.agencia_at && !circuitoDe(s).esServicio;
      case "aprobados": return Boolean(s.aprobado_at) && !s.prueba_solicitada_at && !probado(s) && Boolean(s.informe_cierre_id);
      case "series": return (faltanSeries.get(s.id) ?? 0) > 0;
      default: return true;
    }
  });

  function estado(s: ServicioPostventa & { series_pedidas_at?: string | null }): { texto: string; tono: string } {
    if (porSeries) {
      const n = faltanSeries.get(s.id) ?? 0;
      const que = [...(queFaltaCodificar.get(s.id) ?? new Map<string, number>()).entries()].map(([t, k]) => `${k} × ${t}`).join(" · ");
      return { texto: `Central pide el código de ${n} unidad${n === 1 ? "" : "es"}${que ? ` (${que})` : ""}${s.series_pedidas_at ? ` desde el ${new Date(s.series_pedidas_at).toLocaleDateString("es-PE", { timeZone: "America/Lima" })}` : ""}`, tono: "text-destructive" };
    }
    // Salió, pero el almacén no dejó la evidencia de la carga (postventa
    // registró la salida desde su pantalla): que se vea para completarla.
    if (faltanFotosDeCarga(s) && !s.cerrado_at && !s.completado)
      return { texto: `Salió${s.guia ? ` · guía ${s.guia}` : ""} · faltan las fotos de la carga`, tono: "text-amber-700" };
    if (s.cerrado_at || s.completado) return { texto: `Entregado · pedido cerrado${s.guia ? ` · guía ${s.guia}` : ""}`, tono: "text-[#1E7F4F]" };
    if (circuitoDe(s).esServicio) {
      if (s.despachado_at)
        return { texto: `El técnico salió el ${new Date(s.despachado_at).toLocaleDateString("en-CA", { timeZone: "America/Lima" })} · lo cierra postventa con el informe`, tono: "text-[#1E7F4F]" };
      if (s.fecha_despacho && !s.apertura_despacho_at) return { texto: `Servicio para el ${s.fecha_despacho} · postventa no ha cumplido`, tono: "text-destructive" };
      if (s.fecha_despacho) return { texto: `Servicio para el ${s.fecha_despacho} · registrar la salida del técnico`, tono: (s.fecha_despacho as string) < hoy ? "text-destructive" : "text-amber-700" };
      return { texto: "Servicio · sin fecha todavía", tono: "text-muted-foreground" };
    }
    if (s.agencia_at || s.guia) return { texto: `Despachado · guía ${s.guia ?? "—"}`, tono: "text-[#1E7F4F]" };
    if (s.despachado_at) return { texto: "Salió del almacén · falta la guía", tono: "text-amber-700" };
    if (s.fecha_despacho && s.almacen_listo_at) return { texto: `Listo para el ${s.fecha_despacho}`, tono: "text-[#1E7F4F]" };
    // EL DOBLE FILTRO (Carlos, 22-09): programado no es lo mismo que
    // postventa ya cumplió. Sin apertura, todavía no hay nada que confirmar.
    if (s.fecha_despacho && !s.apertura_despacho_at) return { texto: `Programado para el ${s.fecha_despacho} · postventa no ha cumplido`, tono: "text-destructive" };
    if (s.fecha_despacho) return { texto: `Programado para el ${s.fecha_despacho} · confirmar que está listo`, tono: (s.fecha_despacho as string) < hoy ? "text-destructive" : "text-amber-700" };
    if (s.apertura_despacho_at && s.guia_confirmada_at)
      return { texto: `Finanzas autorizó la guía${textoComprobante(s.guia_comprobante_tipo, s.guia_comprobante_numero) ? ` · ${textoComprobante(s.guia_comprobante_tipo, s.guia_comprobante_numero)}` : ""} · esperando fecha`, tono: "text-[#1E7F4F]" };
    if (s.apertura_despacho_at) return { texto: "Con apertura · esperando fecha y que Finanzas autorice la guía", tono: "text-foreground" };
    if (probado(s)) return { texto: `Probado y embalado${s.protocolo_prueba_ref ? ` · protocolo ${s.protocolo_prueba_ref}` : ""}`, tono: "text-foreground" };
    if (s.prueba_solicitada_at) return { texto: "Postventa pidió la prueba", tono: "text-destructive" };
    return { texto: "En preparación", tono: "text-muted-foreground" };
  }

  return (
    <SeccionPanel titulo={VISTAS[ver]}>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {Object.entries(VISTAS).map(([k, v]) => (
          <Link
            key={k}
            href={`/almacen/pedidos${k ? `?ver=${k}` : ""}`}
            className={cn("rounded-full px-2.5 py-1 text-xs font-medium", ver === k ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}
          >
            {v}
          </Link>
        ))}
        {/* Para anotar en el almacén y pasarlo después (Lesly, 25-09). */}
        {porSeries && (
          <Link href="/almacen/pedidos/codigos" className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent">
            <Printer className="size-3.5" /> Imprimir / PDF
          </Link>
        )}
      </div>
      <form method="get" className="mb-3 flex flex-wrap items-center gap-2">
        {ver && <input type="hidden" name="ver" value={ver} />}
        <BusquedaEnVivo inicial={q} placeholder="Cliente, equipo o guía" />
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          {despachados ? "Salió desde" : "Despacho desde"}
          <input type="date" name="desde" defaultValue={desde} className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground" />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          hasta
          <input type="date" name="hasta" defaultValue={hasta} className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground" />
        </label>
        <button type="submit" className="h-8 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-secondary">Filtrar</button>
        {(desde || hasta) && (
          <Link href={`/almacen/pedidos${ver ? `?ver=${ver}` : ""}`} className="text-xs text-muted-foreground hover:underline">
            Quitar fechas
          </Link>
        )}
      </form>
      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nada en esta lista{q ? ` con «${q}»` : ""}.</p>
      ) : (
        <ul className="divide-y divide-border">
          {filas.map((s) => {
            const e = estado(s);
            const c = circuitoDe(s);
            return (
              <li key={s.id}>
                <Link href={`/almacen/pedidos/${s.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 hover:bg-accent">
                  <span className="w-24 flex-none text-xs tabular-nums text-muted-foreground">
                    {despachados && s.despachado_at
                      ? new Date(s.despachado_at).toLocaleDateString("en-CA", { timeZone: "America/Lima" })
                      : (s.fecha_despacho ?? "sin fecha")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{cliente(s.cliente_texto)}</span>
                    <span className="line-clamp-1 break-words text-xs text-muted-foreground">{s.equipo}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {ETIQUETA_TIPO_PEDIDO[c.tipo]}{c.entregaEnPlanta ? " · recoge en planta" : s.modalidad === "provincia" ? " · provincia" : ""}
                      {!s.informe_cierre_id ? " · anterior al circuito" : ""}
                    </span>
                  </span>
                  <span className={cn("text-xs font-semibold", e.tono)}>{e.texto}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {porSeries && respondidos.length > 0 && (
        <div className="mt-5 border-t border-border pt-3">
          <h3 className="text-sm font-semibold text-foreground">Ya respondidos · últimos 30 días</h3>
          <p className="mb-2 text-[11px] text-muted-foreground">El código ya se dio: queda acá para volver a imprimir la respuesta.</p>
          <ul className="divide-y divide-border">
            {respondidos.slice(0, 40).map(({ s, at }) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <span className="w-24 flex-none text-xs tabular-nums text-muted-foreground">
                  {new Date(at).toLocaleDateString("en-CA", { timeZone: "America/Lima" })}
                </span>
                <Link href={`/almacen/pedidos/${s.id}`} className="min-w-0 flex-1 hover:underline">
                  <span className="block text-sm font-semibold text-foreground">{cliente(s.cliente_texto)}</span>
                  <span className="line-clamp-1 break-words text-xs text-muted-foreground">{s.equipo}</span>
                </Link>
                <a
                  href={`/almacen/pedidos/${s.id}/solicitud?que=respuesta`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-primary bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  <Printer className="size-3.5" /> Imprimir la respuesta
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SeccionPanel>
  );
}
