import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { hoyLima } from "@/lib/periodo";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { BusquedaEnVivo } from "@/components/crm/busqueda-en-vivo";
import { ETIQUETA_TIPO_PEDIDO, circuitoDe, type ServicioPostventa } from "@/lib/postventa";
import { cn } from "@/lib/utils";

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
  probar: "Por probar y embalar",
  hoy: "Despachos de hoy",
  confirmar: "Programados sin confirmar",
  atrasados: "Atrasados",
  apertura: "Con apertura, sin salir",
  guia: "Salieron, sin guía",
  aprobados: "Aprobados sin pedido de prueba",
};
const cliente = (t: string | null) => (t ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, "");

export default async function AlmacenPedidosPage({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string }> }) {
  await requerirPerfil();
  const sp = await searchParams;
  const ver = sp.ver && sp.ver in VISTAS ? sp.ver : "";
  const q = (sp.q ?? "").trim();
  const supabase = await createClient();
  const hoy = hoyLima();

  let consulta = supabase
    .from("servicios_postventa")
    .select("id, cliente_texto, equipo, ubicacion, direccion_entrega, modalidad, fecha_despacho, despachado_at, apertura_despacho_at, prueba_solicitada_at, prueba_lista_at, prueba_embalaje, protocolo_prueba_ref, almacen_listo_at, agencia_at, guia, transportista, salida_fotos, completado, cerrado_at, informe_cierre_id, pedido_ejecutado_at, aprobado_at, tipo_pedido, entrega_en, con_instalacion, despacho_nota, updated_at")
    .eq("completado", false)
    .is("cerrado_at", null)
    .or("informe_cierre_id.is.null,pedido_ejecutado_at.not.is.null")
    .order("fecha_despacho", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(500);
  if (q) consulta = consulta.or(`cliente_texto.ilike.%${q}%,equipo.ilike.%${q}%,guia.ilike.%${q}%`);
  const { data } = await consulta;

  const todos = (data ?? []) as unknown as ServicioPostventa[];
  const probado = (s: ServicioPostventa) => s.prueba_lista_at != null || String(s.prueba_embalaje ?? "").toUpperCase() === "SI";
  const filas = todos.filter((s) => {
    switch (ver) {
      case "probar": return Boolean(s.prueba_solicitada_at) && !probado(s);
      case "hoy": return s.fecha_despacho === hoy && !s.despachado_at;
      case "confirmar": return Boolean(s.fecha_despacho) && !s.despachado_at && !s.almacen_listo_at;
      case "atrasados": return Boolean(s.fecha_despacho) && (s.fecha_despacho as string) < hoy && !s.despachado_at;
      case "apertura": return Boolean(s.apertura_despacho_at) && !s.despachado_at;
      case "guia": return Boolean(s.despachado_at) && !s.guia && !s.agencia_at;
      case "aprobados": return Boolean(s.aprobado_at) && !s.prueba_solicitada_at && !probado(s) && Boolean(s.informe_cierre_id);
      default: return true;
    }
  });

  function estado(s: ServicioPostventa): { texto: string; tono: string } {
    if (s.agencia_at || s.guia) return { texto: `Despachado · guía ${s.guia ?? "—"}`, tono: "text-[#1E7F4F]" };
    if (s.despachado_at) return { texto: "Salió del almacén · falta la guía", tono: "text-amber-700" };
    if (s.fecha_despacho && s.almacen_listo_at) return { texto: `Listo para el ${s.fecha_despacho}`, tono: "text-[#1E7F4F]" };
    if (s.fecha_despacho) return { texto: `Programado para el ${s.fecha_despacho} · confirmar que está listo`, tono: (s.fecha_despacho as string) < hoy ? "text-destructive" : "text-amber-700" };
    if (s.apertura_despacho_at) return { texto: "Con apertura · esperando fecha", tono: "text-foreground" };
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
      </div>
      <form method="get" className="mb-3 flex items-center gap-2">
        {ver && <input type="hidden" name="ver" value={ver} />}
        <BusquedaEnVivo inicial={q} placeholder="Cliente, equipo o guía" />
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
                  <span className="w-24 flex-none text-xs tabular-nums text-muted-foreground">{s.fecha_despacho ?? "sin fecha"}</span>
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
    </SeccionPanel>
  );
}
