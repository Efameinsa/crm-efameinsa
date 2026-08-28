import Link from "next/link";
import { CheckCircle2, Clock, FileText, MinusCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirRol } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { BotonReporteDiario } from "@/components/crm/boton-reporte-diario";
import { hoyLima } from "@/lib/periodo";
import { fechaCalendario } from "@/lib/fechas";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Quién cerró su día y a qué hora.
 *
 * Hasta hoy el reporte diario se generaba al vuelo y viajaba por correo: si el
 * correo no llegaba, no había dónde mirarlo, y gerencia no tenía forma de saber
 * quién lo hizo y quién no sin revisar su bandeja. Carlos, 28-08: «la última,
 * la que se genere al cierre del día, debería ser la que queda grabada, así
 * como los presupuestos… no necesitamos que envíen por correo, que esté todo
 * ahí».
 *
 * Lo que esta pantalla responde, y el correo no respondía: **quién no cerró**.
 * Por eso los que faltan salen listados igual, y no solo los que sí.
 *
 * El contador de veces no es adorno: Carlos describió al comercial que genera
 * su reporte seis veces al día «para ir viendo psicológicamente cuántos
 * seguimientos voy». Una generación a las 11 de la mañana no es un cierre.
 */

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

interface FilaReporte {
  comercial_id: string;
  generado_at: string;
  veces: number;
}

export default async function ReportesDiariosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  await requerirRol(["gerencia", "admin"]);
  const sp = await searchParams;
  const hoy = hoyLima();
  const fecha = sp.fecha && RE_FECHA.test(sp.fecha) ? sp.fecha : hoy;

  const supabase = await createClient();
  const [{ data: comerciales }, { data: reportes }] = await Promise.all([
    supabase
      .from("perfiles")
      .select("id, nombre, codigo_comercial, es_postventa")
      .eq("rol", "comercial")
      .eq("activo", true)
      .eq("es_prueba", false)
      // La cuenta de soporte (0101) no vende: medirle el cierre del día sería
      // ponerle a gerencia una fila en rojo todos los días para siempre.
      .eq("es_soporte", false)
      .order("codigo_comercial"),
    supabase.from("reportes_diarios").select("comercial_id, generado_at, veces").eq("fecha", fecha),
  ]);

  const porComercial = new Map((reportes ?? []).map((r) => [r.comercial_id as string, r as unknown as FilaReporte]));
  const lista = comerciales ?? [];
  const cerraron = lista.filter((c) => porComercial.has(c.id as string)).length;

  const dia = (delta: number) =>
    new Date(new Date(`${fecha}T12:00:00`).getTime() + delta * 864e5).toLocaleDateString("en-CA");

  return (
    <SeccionPanel
      titulo="Cierre del día"
      accion={
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link href={`/gerencia/reportes?fecha=${dia(-1)}`} className="rounded-md border border-border px-2 py-0.5 hover:bg-accent">
            ◂ día anterior
          </Link>
          <span className="font-semibold text-foreground">{fechaCalendario(fecha)}</span>
          {fecha < hoy && (
            <Link href={`/gerencia/reportes?fecha=${dia(1)}`} className="rounded-md border border-border px-2 py-0.5 hover:bg-accent">
              día siguiente ▸
            </Link>
          )}
          {fecha !== hoy && (
            <Link href="/gerencia/reportes" className="font-medium text-primary hover:underline">
              hoy
            </Link>
          )}
        </div>
      }
    >
      <p className="mb-3 max-w-prose text-xs text-muted-foreground">
        {cerraron} de {lista.length} generaron su reporte {fecha === hoy ? "hoy" : "ese día"}. Queda grabada la última
        generación de cada uno: es el cierre. Desde acá se abre el mismo PDF que antes llegaba por correo.
      </p>

      <div className="space-y-1.5">
        {lista.map((c) => {
          const r = porComercial.get(c.id as string);
          const hora = r
            ? new Date(r.generado_at).toLocaleTimeString("es-PE", {
                timeZone: "America/Lima",
                hour: "2-digit",
                minute: "2-digit",
              })
            : null;
          return (
            <div
              key={c.id as string}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-md border p-2.5",
                r ? "border-border" : "border-dashed border-amber-300 bg-amber-50/50",
              )}
            >
              <span
                className={cn(
                  "flex size-8 flex-none items-center justify-center rounded-full",
                  r ? "bg-[#1E7F4F]/10 text-[#1E7F4F]" : "bg-amber-100 text-amber-700",
                )}
              >
                {r ? <CheckCircle2 className="size-4" /> : <MinusCircle className="size-4" />}
              </span>
              <div className="min-w-[180px] flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {(c.nombre as string) ?? "—"}
                  {c.codigo_comercial && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">{c.codigo_comercial as string}</span>
                  )}
                  {c.es_postventa && <span className="ml-1.5 text-xs font-normal text-muted-foreground">· postventa</span>}
                </p>
                {r ? (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    cerró a las {hora}
                    {r.veces > 1 && ` · lo generó ${r.veces} veces en el día`}
                  </p>
                ) : (
                  <p className="text-xs font-medium text-amber-800">todavía no generó su reporte</p>
                )}
              </div>
              {r ? (
                <BotonReporteDiario fecha={fecha} comercialId={c.id as string} etiqueta="Ver el reporte" compacto />
              ) : (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <FileText className="size-3.5" /> sin reporte
                </span>
              )}
            </div>
          );
        })}
      </div>
    </SeccionPanel>
  );
}
