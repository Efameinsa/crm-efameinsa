import Link from "next/link";
import { Search, ShieldCheck, ShieldOff, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaCalendario } from "@/lib/fechas";
import { estadoGarantia } from "@/lib/postventa";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * El parque instalado: qué máquinas están en la calle y en qué estado.
 *
 * Es la pantalla que el área no tenía y que cambia su trabajo. Hasta hoy, cada
 * vez que un cliente llamaba diciendo «mi lavadora falla», había que ir a
 * buscar en un file de papel desde cuándo la tiene, si está en garantía y
 * cuánto la usó. El manual lo pide en cada procedimiento sin tenerlo: el
 * «formato de llamada» del ítem IV obliga a escribir a mano fecha de compra,
 * guía, garantía y último mantenimiento de un equipo que no estaba registrado
 * en ningún lado.
 *
 * Se busca por serie porque la serie es lo que el cliente lee en la placa.
 */

/** Cuántas máquinas se pintan de entrada; el resto, a un clic. */
const POR_PAGINA = 40;

interface FilaEquipo {
  id: string;
  serie: string;
  cliente_texto: string | null;
  modelo_texto: string | null;
  ubicacion: string | null;
  fecha_despacho: string | null;
  garantia_hasta: string | null;
  ciclos_ultimo: number | null;
  ultimo_mantenimiento: string | null;
  proximo_mantenimiento: string | null;
  cuentas: { razon_social: string } | null;
}

export default async function EquiposPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; ver?: string; todos?: string }>;
}) {
  const sp = await searchParams;
  const busqueda = (sp.q ?? "").trim();
  const ver = sp.ver ?? "";
  const supabase = await createClient();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  let q = supabase
    .from("equipos_instalados")
    .select(
      "id, serie, cliente_texto, modelo_texto, ubicacion, fecha_despacho, garantia_hasta, ciclos_ultimo, ultimo_mantenimiento, proximo_mantenimiento, cuentas(razon_social)",
      { count: "exact" },
    );

  if (busqueda) {
    const patron = `%${busqueda}%`;
    q = q.or(`serie.ilike.${patron},cliente_texto.ilike.${patron},modelo_texto.ilike.${patron}`);
  }
  if (ver === "garantia") q = q.gte("garantia_hasta", hoy);
  if (ver === "vencida") q = q.lt("garantia_hasta", hoy);
  if (ver === "mantenimiento") q = q.lte("proximo_mantenimiento", hoy);

  // EL ORDEN. Ordenaba por fecha de despacho, y eso servía cuando el parque
  // eran diez máquinas recién despachadas. Con las 226 que entraron de los
  // cierres de 2024-2026 —que no tienen despacho registrado, porque el informe
  // era de un servicio, no de la venta— lo primero que se veía era lo único que
  // no hacía falta mirar. Ahora manda el preventivo: arriba lo que ya venció,
  // después lo que vence antes. Es la lista con la que se llama.
  const { data, count } = await q
    .order("proximo_mantenimiento", { ascending: true, nullsFirst: false })
    .order("fecha_despacho", { ascending: false, nullsFirst: false })
    .limit(400);
  const equipos = (data ?? []) as unknown as FilaEquipo[];
  const todos = sp.todos === "1";
  const mostrados = todos ? equipos : equipos.slice(0, POR_PAGINA);
  const vencidos = equipos.filter((e) => e.proximo_mantenimiento != null && e.proximo_mantenimiento <= hoy).length;

  // Los filtros conservan la búsqueda: filtrar «en garantía» después de buscar
  // un cliente borraba la búsqueda y devolvía el parque entero.
  const conBusqueda = (clave: string) => {
    const p = new URLSearchParams();
    if (clave) p.set("ver", clave);
    if (busqueda) p.set("q", busqueda);
    const cola = p.toString();
    return `/postventa/equipos${cola ? `?${cola}` : ""}`;
  };

  const filtros = [
    { clave: "", etiqueta: "Todos" },
    { clave: "mantenimiento", etiqueta: "Mantenimiento vencido" },
    { clave: "garantia", etiqueta: "En garantía" },
    { clave: "vencida", etiqueta: "Fuera de garantía" },
  ];

  return (
    <SeccionPanel
      titulo="Equipos instalados"
      accion={
        <div className="flex items-center gap-2 text-xs">
          {vencidos > 0 && ver !== "mantenimiento" && (
            <Link
              href={conBusqueda("mantenimiento")}
              className="rounded-full bg-amber-100 px-2.5 py-0.5 font-semibold text-amber-900 hover:bg-amber-200"
            >
              {vencidos} con el mantenimiento vencido
            </Link>
          )}
          <span className="text-muted-foreground">{count ?? 0} máquinas</span>
        </div>
      }
    >
      <form method="get" className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
          <Search className="size-3.5 flex-none text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={busqueda}
            placeholder="Serie, cliente o modelo"
            className="w-full min-w-[160px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        {filtros.map((f) => (
          <Link
            key={f.clave || "todos"}
            href={conBusqueda(f.clave)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              ver === f.clave
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f.etiqueta}
          </Link>
        ))}
      </form>

      {equipos.length === 0 ? (
        <div className="max-w-prose space-y-2 text-sm text-muted-foreground">
          {busqueda || ver ? (
            <p>Nada que coincida con esa búsqueda.</p>
          ) : (
            <>
              <p>Todavía no hay equipos registrados en el parque instalado.</p>
              <p>
                Cada máquina entra acá con su serie cuando se cierra un pedido de despacho. Desde ese momento el sistema
                sabe hasta cuándo tiene garantía, cuántos ciclos lleva y cuándo le toca el próximo mantenimiento
                preventivo — que es lo que hoy solo pasa si el cliente llama.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {mostrados.map((e) => {
            const garantia = estadoGarantia(e.garantia_hasta);
            const mantenimientoVencido = e.proximo_mantenimiento != null && e.proximo_mantenimiento <= hoy;
            return (
              <Link
                key={e.id}
                href={`/postventa/equipos/${e.id}`}
                className="flex flex-wrap items-start gap-3 rounded-md border border-border p-2.5 transition-colors hover:bg-accent"
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-8 flex-none items-center justify-center rounded-full",
                    garantia.vigente ? "bg-[#1E7F4F]/10 text-[#1E7F4F]" : "bg-secondary text-muted-foreground",
                  )}
                >
                  {garantia.vigente ? <ShieldCheck className="size-4" /> : <ShieldOff className="size-4" />}
                </span>
                <div className="min-w-[220px] flex-1">
                  <p className="font-mono text-xs font-bold text-foreground">{e.serie}</p>
                  <p className="line-clamp-1 text-sm text-foreground">{e.modelo_texto ?? "Equipo sin describir"}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.cuentas?.razon_social ?? e.cliente_texto ?? "—"}
                    {e.ubicacion && ` · ${e.ubicacion}`}
                  </p>
                </div>
                <div className="text-right text-[11px]">
                  <span
                    className={cn(
                      "font-semibold",
                      garantia.vigente ? "text-[#1E7F4F]" : "text-muted-foreground",
                    )}
                  >
                    {garantia.etiqueta}
                  </span>
                  <br />
                  {/* De estas máquinas casi ninguna tiene despacho —entraron
                      por un informe de servicio, no por la venta del equipo—:
                      repetir «sin despacho registrado» 200 veces era ruido. Lo
                      que sí se sabe, y es lo que se usa para llamar, es cuándo
                      fue el último mantenimiento. */}
                  <span className="text-muted-foreground">
                    {e.fecha_despacho
                      ? `despachado ${fechaCalendario(e.fecha_despacho)}`
                      : e.ultimo_mantenimiento
                        ? `último mantenimiento ${fechaCalendario(e.ultimo_mantenimiento)}`
                        : "sin historial de servicio"}
                    {e.ciclos_ultimo != null && ` · ${e.ciclos_ultimo.toLocaleString("es-PE")} ciclos`}
                  </span>
                  {mantenimientoVencido && (
                    <span className="mt-0.5 flex items-center justify-end gap-1 font-semibold text-amber-700">
                      <Wrench className="size-3" /> mantenimiento vencido
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
          {mostrados.length < equipos.length && (
            <Link
              href={`${conBusqueda(ver)}${conBusqueda(ver).includes("?") ? "&" : "?"}todos=1`}
              className="block rounded-md border border-dashed border-border p-2.5 text-center text-xs font-medium text-primary hover:bg-accent"
            >
              Ver las {equipos.length - mostrados.length} restantes
            </Link>
          )}
        </div>
      )}
    </SeccionPanel>
  );
}
