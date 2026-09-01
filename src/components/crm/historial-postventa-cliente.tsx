import Link from "next/link";
import { Wrench, PackageSearch, FileText, ClipboardCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fechaLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

/**
 * Lo que ya se le hizo a este cliente, en una sola línea de tiempo por año.
 *
 * Pedido de la señorita de postventa el 01-09 (caso PERUVIAN NATURE): a un
 * cliente le hicieron preventivo y correctivo este año y en la ficha solo
 * salía lo del 2024. El trabajo de 2026 estaba en la base —los pedidos de la
 * cola del Excel— pero ninguna pantalla del área lo juntaba con lo demás.
 * Acá se juntan las cuatro fuentes que hablan de un servicio hecho o
 * vendido, cada una con su etiqueta, para que la pregunta «¿qué le hicimos y
 * cuándo?» tenga una sola respuesta:
 *
 *   · pedidos de servicio (`servicios_postventa`): la cola del Excel y los
 *     que nacen del cierre; con su estado (pendiente / despachado / cerrado);
 *   · informes de servicio del área (`informes_servicio`);
 *   · informes de cierre de venta (`informes_cierre`);
 *   · ventas de servicio del histórico (`ventas` de oportunidades de postventa).
 *
 * Los montos solo para quien puede ver precios (política del área).
 */
interface Item {
  clave: string;
  fecha: string;
  icono: typeof Wrench;
  etiqueta: string;
  texto: string;
  estado?: string;
  href?: string;
  monto?: string | null;
}

export async function HistorialPostventaCliente({ cuentaId, verPrecios }: { cuentaId: string; verPrecios: boolean }) {
  const supabase = await createClient();
  const [{ data: pedidos }, { data: informesServ }, { data: cierres }, { data: ventas }] = await Promise.all([
    supabase
      .from("servicios_postventa")
      .select("id, fecha_confirmacion, tipo_servicio, equipo, monto, moneda, completado, despachado_at, cerrado_at, fecha_despacho, informe_cierre_id, created_at")
      .eq("cuenta_id", cuentaId)
      .order("fecha_confirmacion", { ascending: false, nullsFirst: false })
      .limit(40),
    supabase
      .from("informes_servicio")
      .select("id, correlativo, anio, tipo, ejecutado_at, equipo_texto, tecnico")
      .eq("cuenta_id", cuentaId)
      .order("ejecutado_at", { ascending: false })
      .limit(40),
    supabase
      .from("informes_cierre")
      .select("id, codigo, fecha, asunto, monto_total, moneda, emitido_at")
      .eq("cuenta_id", cuentaId)
      .not("emitido_at", "is", null)
      .order("fecha", { ascending: false })
      .limit(40),
    supabase
      .from("ventas")
      .select("id, fecha_venta, monto_total, moneda, equipo_historico, referencia_historica, anulada_at, oportunidades!inner(cuenta_id, tipo_postventa)")
      .eq("oportunidades.cuenta_id", cuentaId)
      .not("oportunidades.tipo_postventa", "is", null)
      .is("anulada_at", null)
      .order("fecha_venta", { ascending: false })
      .limit(40),
  ]);

  const dinero = (monto: unknown, moneda: unknown) =>
    verPrecios && monto != null ? `${moneda ?? "USD"} ${Number(monto).toLocaleString("es-PE")}` : null;

  const items: Item[] = [];
  const cierresConPedido = new Set((pedidos ?? []).map((p) => p.informe_cierre_id as string | null).filter(Boolean));

  for (const p of pedidos ?? []) {
    const fecha = (p.fecha_confirmacion ?? p.created_at) as string;
    items.push({
      clave: `pedido-${p.id}`,
      fecha,
      icono: /repuesto/i.test(String(p.tipo_servicio)) ? PackageSearch : Wrench,
      etiqueta: String(p.tipo_servicio ?? "Servicio"),
      texto: String(p.equipo ?? "").trim() || "Pedido de servicio",
      estado: p.cerrado_at ? "cerrado" : p.despachado_at || p.completado ? "ejecutado" : "pendiente",
      href: `/postventa/pedidos/${p.id}`,
      monto: dinero(p.monto, p.moneda),
    });
  }
  for (const i of informesServ ?? []) {
    items.push({
      clave: `inf-${i.id}`,
      fecha: i.ejecutado_at as string,
      icono: ClipboardCheck,
      etiqueta: `Informe de servicio${i.correlativo != null ? ` N.º ${String(i.correlativo).padStart(3, "0")}-${i.anio}` : ""}`,
      texto: [i.tipo, i.equipo_texto, i.tecnico && `técnico ${i.tecnico}`].filter(Boolean).join(" · "),
      href: `/postventa/informes/${i.id}`,
    });
  }
  for (const c of cierres ?? []) {
    if (cierresConPedido.has(c.id as string)) continue;
    items.push({
      clave: `cierre-${c.id}`,
      fecha: (c.fecha ?? c.emitido_at) as string,
      icono: FileText,
      etiqueta: `Cierre ${c.codigo}`,
      texto: String(c.asunto ?? ""),
      monto: dinero(c.monto_total, c.moneda),
    });
  }
  for (const v of ventas ?? []) {
    const op = v.oportunidades as unknown as { tipo_postventa: string | null } | null;
    items.push({
      clave: `venta-${v.id}`,
      fecha: v.fecha_venta as string,
      icono: op?.tipo_postventa === "repuesto" ? PackageSearch : Wrench,
      etiqueta: `Venta de ${op?.tipo_postventa ?? "servicio"}${v.referencia_historica ? ` · ${v.referencia_historica}` : ""}`,
      texto: String(v.equipo_historico ?? "").trim() || "Del histórico",
      monto: dinero(v.monto_total, v.moneda),
    });
  }

  items.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay servicios, pedidos ni informes registrados para este cliente.</p>;
  }

  const porAnio = new Map<string, Item[]>();
  for (const it of items) {
    const anio = (it.fecha ?? "").slice(0, 4) || "Sin fecha";
    porAnio.set(anio, [...(porAnio.get(anio) ?? []), it]);
  }

  return (
    <div className="space-y-3">
      {[...porAnio.entries()].map(([anio, lista]) => (
        <div key={anio}>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {anio} <span className="font-normal tabular-nums opacity-70">· {lista.length}</span>
          </p>
          <div className="space-y-1">
            {lista.map((it) => {
              const Icono = it.icono;
              const cuerpo = (
                <>
                  <Icono className="mt-0.5 size-3.5 flex-none text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-foreground">
                      {it.etiqueta}
                      {it.estado && (
                        <span
                          className={cn(
                            "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                            it.estado === "pendiente" ? "bg-amber-500/15 text-amber-800" : "bg-secondary text-muted-foreground",
                          )}
                        >
                          {it.estado}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">{it.texto}</span>
                  </span>
                  <span className="flex-none text-right text-[11px] tabular-nums text-muted-foreground">
                    {fechaLima(it.fecha)}
                    {it.monto && <span className="block">{it.monto}</span>}
                  </span>
                </>
              );
              return it.href ? (
                <Link key={it.clave} href={it.href} className="flex items-start gap-2 rounded-md border border-border p-2 hover:bg-accent">
                  {cuerpo}
                </Link>
              ) : (
                <div key={it.clave} className="flex items-start gap-2 rounded-md border border-border p-2">
                  {cuerpo}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
