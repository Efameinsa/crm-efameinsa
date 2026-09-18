import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Wrench, Package, FileText, ShieldCheck, ShieldX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { estadoGarantia, etiquetaTipoServicio, etiquetaClaseAlmacen } from "@/lib/postventa";
import { fechaLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Un cliente, visto desde los informes técnicos del almacén (Carlos, 18-09):
 * sus máquinas —cada una lleva a su línea de tiempo—, sus pedidos en el
 * circuito, y todos sus informes. Sin precios.
 */
export default async function ClienteInformesAlmacenPage({ params }: { params: Promise<{ cuentaId: string }> }) {
  await requerirPerfil();
  const { cuentaId } = await params;
  const supabase = await createClient();
  const { data: cuenta } = await supabase.from("cuentas").select("id, razon_social, num_doc, departamento, distrito").eq("id", cuentaId).maybeSingle();
  if (!cuenta) notFound();

  const [{ data: maquinas }, { data: pedidos }, { data: informes }] = await Promise.all([
    supabase
      .from("equipos_instalados")
      .select("id, serie, modelo_texto, fecha_despacho, fecha_puesta_marcha, garantia_hasta, ultimo_mantenimiento, proximo_mantenimiento, servicio_id")
      .eq("cuenta_id", cuentaId)
      .order("fecha_despacho", { ascending: false, nullsFirst: false })
      .limit(100),
    supabase
      .from("servicios_postventa")
      .select("id, equipo, fecha_confirmacion, fecha_despacho, despachado_at, guia, puesta_en_marcha, completado, cerrado_at, prueba_lista_at")
      .eq("cuenta_id", cuentaId)
      .order("fecha_confirmacion", { ascending: false, nullsFirst: false })
      .limit(50),
    supabase
      .from("informes_servicio")
      .select("id, correlativo, anio, tipo, clase_almacen, ejecutado_at, tecnico, equipo_texto, equipo_id, servicio_id, elevado_a_postventa_at")
      .eq("cuenta_id", cuentaId)
      .not("emitido_at", "is", null)
      .order("ejecutado_at", { ascending: false })
      .limit(100),
  ]);
  const informesPorMaquina = new Map<string, number>();
  for (const i of informes ?? []) if (i.equipo_id) informesPorMaquina.set(i.equipo_id, (informesPorMaquina.get(i.equipo_id) ?? 0) + 1);

  return (
    <div className="space-y-4">
      <Link href="/almacen/informes/clientes" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Volver a los clientes
      </Link>
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h1 className="text-lg font-bold leading-tight text-foreground">{cuenta.razon_social}</h1>
        <p className="text-xs text-muted-foreground">
          {cuenta.num_doc ?? "sin RUC"}
          {cuenta.departamento ? ` · ${cuenta.departamento}${cuenta.distrito ? ` / ${cuenta.distrito}` : ""}` : ""}
        </p>
      </div>

      <SeccionPanel titulo={`Máquinas (${(maquinas ?? []).length})`}>
        {(maquinas ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este cliente no tiene máquinas en el parque.{" "}
            {(pedidos ?? []).some((p) => p.despachado_at)
              ? "Tiene pedidos que ya salieron: faltan registrar las series en el pedido (abajo)."
              : "Cuando un pedido salga con sus series, aparecen acá."}
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {(maquinas ?? []).map((m) => {
              const g = estadoGarantia(m.garantia_hasta);
              return (
                <li key={m.id}>
                  <Link href={`/almacen/informes/equipos/${m.id}`} className="flex h-full flex-col rounded-lg border border-border p-3 hover:bg-accent">
                    <span className="font-mono text-xs font-bold text-foreground">{m.serie ?? "Sin serie"}</span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">{m.modelo_texto ?? "Equipo sin modelo"}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px]">
                      <span className={cn("inline-flex items-center gap-1 font-semibold", g.vigente ? "text-[#1E7F4F]" : "text-destructive")}>
                        {g.vigente ? <ShieldCheck className="size-3" /> : <ShieldX className="size-3" />} {g.etiqueta}
                      </span>
                      {m.fecha_despacho && <span className="text-muted-foreground">salió {fechaLima(m.fecha_despacho)}</span>}
                      <span className="text-muted-foreground">
                        <FileText className="mr-0.5 inline size-3" />
                        {informesPorMaquina.get(m.id) ?? 0} informes
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </SeccionPanel>

      <SeccionPanel titulo={`Pedidos (${(pedidos ?? []).length})`}>
        {(pedidos ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin pedidos en el circuito.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(pedidos ?? []).map((p) => (
              <li key={p.id}>
                <Link href={`/almacen/pedidos/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 hover:bg-accent">
                  <Package className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-sm text-foreground">{p.equipo}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {p.fecha_confirmacion ? `confirmado ${fechaLima(p.fecha_confirmacion)}` : ""}
                      {p.prueba_lista_at ? ` · probado ${fechaLima(p.prueba_lista_at)}` : ""}
                      {p.despachado_at ? ` · salió ${fechaLima(p.despachado_at)}${p.guia ? ` (guía ${p.guia})` : ""}` : p.fecha_despacho ? ` · despacho programado ${p.fecha_despacho}` : ""}
                      {p.puesta_en_marcha ? ` · puesta en marcha ${fechaLima(p.puesta_en_marcha)}` : ""}
                    </span>
                  </span>
                  <span className={cn("text-xs font-semibold", p.completado || p.cerrado_at ? "text-muted-foreground" : "text-amber-700")}>
                    {p.completado || p.cerrado_at ? "cerrado" : "en curso"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SeccionPanel>

      <SeccionPanel titulo={`Informes (${(informes ?? []).length})`}>
        {(informes ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún informe emitido para este cliente todavía.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(informes ?? []).map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                <span className="w-24 flex-none font-mono text-xs text-muted-foreground">{i.correlativo != null ? `${String(i.correlativo).padStart(3, "0")}-${i.anio}` : "s/n"}</span>
                <span className="min-w-0 flex-1">
                  <Link href={`/postventa/informes/${i.id}`} className="block font-medium text-foreground hover:underline">
                    {etiquetaClaseAlmacen(i.clase_almacen) ?? etiquetaTipoServicio(i.tipo)}
                  </Link>
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {fechaLima(i.ejecutado_at)}
                    {i.tecnico ? ` · ${i.tecnico}` : ""}
                    {i.equipo_texto ? ` · ${i.equipo_texto}` : ""}
                  </span>
                </span>
                {i.equipo_id && (
                  <Link href={`/almacen/informes/equipos/${i.equipo_id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <Wrench className="size-3.5" /> La máquina
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </SeccionPanel>
    </div>
  );
}
