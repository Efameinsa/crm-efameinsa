import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { hoyLima } from "@/lib/periodo";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ETIQUETA_TIPO_ATENCION } from "@/lib/atenciones";
import type { ServicioPostventa } from "@/lib/postventa";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * EL DÍA DEL ALMACÉN (0246).
 *
 * Carlos, 16-09: «el almacén, la primera ventana, tiene que ver así como lo
 * tenemos en macro: puesta en marcha, despachos, mantenimiento y soporte
 * técnico. Y también tiene que ver las visitas». Cada número abre la lista
 * con ese filtro; debajo, lo de hoy con nombre y hora, que es lo que se
 * contesta cuando alguien pregunta en la puerta.
 */
interface Cuadro { titulo: string; numero: number; ayuda: string; href: string; alerta?: boolean }
const cliente = (t: string | null) => (t ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, "");

function Tarjeta({ c }: { c: Cuadro }) {
  return (
    <Link href={c.href} className={cn("flex flex-col rounded-lg border p-3 transition-colors hover:bg-accent", c.alerta && c.numero > 0 ? "border-destructive/40 bg-destructive/5" : "border-border")}>
      <span className={cn("text-2xl font-bold leading-none tabular-nums", c.alerta && c.numero > 0 ? "text-destructive" : "text-foreground")}>{c.numero}</span>
      <span className="mt-1.5 text-xs font-semibold text-foreground">{c.titulo}</span>
      <span className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{c.ayuda}</span>
    </Link>
  );
}

export default async function AlmacenPage() {
  await requerirPerfil();
  const supabase = await createClient();
  const hoy = hoyLima();
  const enUnaSemana = new Date(new Date(hoy + "T12:00:00-05:00").getTime() + 7 * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  const [{ data: pedidos }, { data: atenciones }, { data: visitas }] = await Promise.all([
    supabase
      .from("servicios_postventa")
      .select("id, cliente_texto, equipo, fecha_despacho, despachado_at, apertura_despacho_at, prueba_solicitada_at, prueba_lista_at, prueba_embalaje, almacen_listo_at, agencia_at, guia, salida_fotos, completado, cerrado_at, informe_cierre_id, pedido_ejecutado_at, aprobado_at, tipo_pedido, entrega_en")
      .eq("completado", false)
      .is("cerrado_at", null)
      .or("informe_cierre_id.is.null,pedido_ejecutado_at.not.is.null")
      .limit(2000),
    supabase
      .from("atenciones")
      .select("id, tipo, programada_at, tecnico, cliente_texto, equipo_texto, cuentas(razon_social)")
      .not("programada_at", "is", null)
      .is("cerrado_at", null)
      .gte("programada_at", `${hoy}T00:00:00-05:00`)
      .order("programada_at")
      .limit(300),
    supabase
      .from("visitas_planta")
      .select("id, empresa, persona, motivo, fecha, hora, showroom")
      .gte("fecha", hoy)
      .lte("fecha", enUnaSemana)
      .is("cancelada_at", null)
      .order("fecha")
      .order("hora", { nullsFirst: false }),
  ]);

  const vivos = (pedidos ?? []) as unknown as ServicioPostventa[];
  const probado = (s: ServicioPostventa) => s.prueba_lista_at != null || String(s.prueba_embalaje ?? "").toUpperCase() === "SI";
  const porProbar = vivos.filter((s) => s.prueba_solicitada_at && !probado(s));
  const sinPedirPrueba = vivos.filter((s) => s.aprobado_at && !s.prueba_solicitada_at && !probado(s) && s.informe_cierre_id);
  const conApertura = vivos.filter((s) => s.apertura_despacho_at && !s.despachado_at);
  const programados = vivos.filter((s) => s.fecha_despacho && !s.despachado_at);
  const programadosHoy = programados.filter((s) => s.fecha_despacho === hoy);
  const atrasados = programados.filter((s) => (s.fecha_despacho as string) < hoy);
  const porConfirmar = programados.filter((s) => !s.almacen_listo_at);
  // EL DOBLE FILTRO (Carlos, 22-09): de los programados, cuántos NO tienen
  // apertura todavía — «si no ha cumplido, no puedo hacer nada» — para que
  // el almacén no confunda «tiene fecha» con «ya se puede preparar».
  const sinApertura = programados.filter((s) => !s.apertura_despacho_at);
  const salidosSinGuia = vivos.filter((s) => s.despachado_at && !s.guia && !s.agencia_at && (s.salida_fotos?.length ?? 0) > 0);

  const at = (atenciones ?? []) as unknown as { id: string; tipo: string; programada_at: string; tecnico: string | null; cliente_texto: string | null; equipo_texto: string | null; cuentas: { razon_social: string } | null }[];
  const atHoy = at.filter((a) => a.programada_at.startsWith(hoy) || new Date(a.programada_at).toLocaleDateString("en-CA", { timeZone: "America/Lima" }) === hoy);
  const porTipo = (t: string) => at.filter((a) => a.tipo === t).length;

  const cuadrosPedidos: Cuadro[] = [
    { titulo: "Por probar y embalar", numero: porProbar.length, ayuda: "Postventa pidió la prueba; falta el protocolo y el check.", href: "/almacen/pedidos?ver=probar", alerta: true },
    { titulo: "Despachos de hoy", numero: programadosHoy.length, ayuda: "Programados para hoy y sin salir.", href: "/almacen/pedidos?ver=hoy", alerta: true },
    { titulo: "Programados sin confirmar", numero: porConfirmar.length, ayuda: "Postventa puso fecha; falta decir que el almacén está listo.", href: "/almacen/pedidos?ver=confirmar" },
    { titulo: "De esos, sin apertura", numero: sinApertura.length, ayuda: "Postventa todavía no cumplió: no hay nada que preparar todavía.", href: "/almacen/pedidos?ver=confirmar", alerta: true },
    { titulo: "Atrasados", numero: atrasados.length, ayuda: "Tenían fecha y no salieron.", href: "/almacen/pedidos?ver=atrasados", alerta: true },
    { titulo: "Con apertura, sin salir", numero: conApertura.length, ayuda: "Ya se puede despachar.", href: "/almacen/pedidos?ver=apertura" },
    { titulo: "Salieron, sin guía", numero: salidosSinGuia.length, ayuda: "Falta la foto de la guía en la agencia.", href: "/almacen/pedidos?ver=guia", alerta: true },
    { titulo: "Aprobados sin pedido de prueba", numero: sinPedirPrueba.length, ayuda: "Postventa todavía no pidió la prueba; se puede adelantar.", href: "/almacen/pedidos?ver=aprobados" },
  ];
  const cuadrosAtenciones: Cuadro[] = [
    { titulo: "Puestas en marcha programadas", numero: porTipo("puesta_en_marcha"), ayuda: "Con día, hora y técnico.", href: "/almacen/atenciones?tipo=puesta_en_marcha" },
    { titulo: "Mantenimientos programados", numero: porTipo("solicitud_mantenimiento"), ayuda: "En planta o en el cliente.", href: "/almacen/atenciones?tipo=solicitud_mantenimiento" },
    { titulo: "Soporte técnico programado", numero: porTipo("problema_tecnico"), ayuda: "Problemas técnicos con técnico asignado.", href: "/almacen/atenciones?tipo=problema_tecnico" },
    { titulo: "Visitas a planta esta semana", numero: (visitas ?? []).length, ayuda: "Clientes que vienen; algunos a recoger repuestos.", href: "/almacen/visitas" },
  ];

  return (
    <div className="space-y-4">
      <SeccionPanel titulo="Pedidos">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {cuadrosPedidos.map((c) => <Tarjeta key={c.titulo} c={c} />)}
        </div>
      </SeccionPanel>
      <SeccionPanel titulo="Atenciones y visitas">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {cuadrosAtenciones.map((c) => <Tarjeta key={c.titulo} c={c} />)}
        </div>
      </SeccionPanel>

      <SeccionPanel titulo="Hoy">
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-foreground">Despachos de hoy</p>
            {programadosHoy.length === 0 ? <p className="text-xs text-muted-foreground">Ninguno programado para hoy.</p> : (
              <ul className="space-y-1">
                {programadosHoy.map((s) => (
                  <li key={s.id}>
                    <Link href={`/almacen/pedidos/${s.id}`} className="block rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent">
                      <span className="font-semibold text-foreground">{cliente(s.cliente_texto)}</span>
                      <span className="line-clamp-1 break-words text-muted-foreground">{s.equipo}</span>
                      {/* EL DOBLE FILTRO (Carlos, 22-09): sin apertura no hay
                          nada que confirmar todavía, aunque tenga fecha. */}
                      <span
                        className={cn(
                          "text-[11px] font-semibold",
                          !s.apertura_despacho_at ? "text-destructive" : s.almacen_listo_at ? "text-[#1E7F4F]" : "text-amber-700",
                        )}
                      >
                        {!s.apertura_despacho_at ? "Postventa no ha cumplido" : s.almacen_listo_at ? "Listo" : "Falta confirmar que está listo"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-foreground">Técnicos que salen hoy</p>
            {atHoy.length === 0 ? <p className="text-xs text-muted-foreground">Ninguna atención programada para hoy.</p> : (
              <ul className="space-y-1">
                {atHoy.map((a) => (
                  <li key={a.id} className="rounded-md border border-border px-2.5 py-1.5 text-xs">
                    <span className="font-semibold tabular-nums text-foreground">{new Date(a.programada_at).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" })}</span>
                    {" · "}{ETIQUETA_TIPO_ATENCION[a.tipo as keyof typeof ETIQUETA_TIPO_ATENCION] ?? a.tipo} · {a.cuentas?.razon_social ?? a.cliente_texto}
                    {a.tecnico && <span className="text-muted-foreground"> · {a.tecnico}</span>}
                    {a.equipo_texto && <span className="line-clamp-1 break-words text-muted-foreground">{a.equipo_texto}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-foreground">Visitas de hoy</p>
            {(visitas ?? []).filter((v) => v.fecha === hoy).length === 0 ? <p className="text-xs text-muted-foreground">Nadie anunciado para hoy.</p> : (
              <ul className="space-y-1">
                {(visitas ?? []).filter((v) => v.fecha === hoy).map((v) => (
                  <li key={v.id} className="rounded-md border border-border px-2.5 py-1.5 text-xs">
                    <span className="font-semibold tabular-nums text-foreground">{v.hora ? String(v.hora).slice(0, 5) : "s/h"}</span> · {v.persona} · {v.empresa}
                    <span className="line-clamp-1 break-words text-muted-foreground">{v.motivo}{v.showroom ? " · abrir la lavandería" : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SeccionPanel>
    </div>
  );
}
