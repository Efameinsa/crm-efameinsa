import Link from "next/link";
import { PackageSearch, ShieldCheck, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fechaCalendario } from "@/lib/fechas";
import { etiquetaEtapaPostventa, slaCaso, veTodoPostventa } from "@/lib/postventa";
import { cn } from "@/lib/utils";
import type { Perfil } from "@/types/database";

/**
 * «Casos anteriores»: los casos técnicos que existían ANTES de la pista de
 * `atenciones` (0131/0132) — oportunidades con `tipo_postventa`, `origen =
 * crm`, abiertas.
 *
 * Es lo que hasta el 31-08 se veía en `/postventa/casos` bajo «Casos
 * abiertos». Se extrae tal cual a un componente compartido (regla del repo:
 * no copiar) porque el plan 23 decidió NO migrar estas filas a `atenciones`
 * —mover producción apurado es como terminaron las fichas partidas y los
 * fósiles del Excel— así que van a convivir en su propia pestaña hasta que
 * se cierren solas o gerencia pida una migración con ensayo.
 */

const ETIQUETA_TIPO: Record<string, string> = {
  garantia: "Garantía",
  repuesto: "Repuesto",
  mantenimiento: "Mantenimiento",
};

interface CasoAbierto {
  id: string;
  etapa: string;
  intencion: string | null;
  tipo_postventa: string | null;
  serie_texto: string | null;
  codigo_error: string | null;
  created_at: string;
  proxima_accion: string | null;
  proxima_accion_at: string | null;
  equipo_id: string | null;
  cuentas: { razon_social: string } | null;
}

export async function CasosAnteriores({ perfil }: { perfil: Perfil }) {
  const supabase = await createClient();
  // El área ve todos los casos, estén en la cartera de quien estén (01-09).
  const verTodo = veTodoPostventa(perfil);

  // UN CASO ES UN CASO: lo que llegó por Central o se registró acá mismo
  // (origen = crm). Las campañas de mantenimiento y los tres años de cierres
  // importados también tienen `tipo_postventa`, y sin este filtro llenaban
  // esta lista con 145 clientes por llamar que no son casos abiertos — esos
  // viven en la ruta de mantenimiento, que es otra pregunta y otra pantalla.
  let consultaCasos = supabase
    .from("oportunidades")
    .select(
      "id, etapa, intencion, tipo_postventa, serie_texto, codigo_error, created_at, proxima_accion, proxima_accion_at, equipo_id, cuentas(razon_social)",
    )
    .not("tipo_postventa", "is", null)
    .eq("origen", "crm")
    .not("etapa", "in", "(venta,rechazada)")
    .order("created_at", { ascending: false })
    .limit(60);
  if (!verTodo) consultaCasos = consultaCasos.eq("comercial_id", perfil.id);

  const [{ data: casos }, { data: equipos }] = await Promise.all([
    consultaCasos,
    supabase.from("equipos_instalados").select("id, serie"),
  ]);

  const fichaPorSerie = new Map((equipos ?? []).map((e) => [String(e.serie).toUpperCase(), e.id as string]));
  const abiertos = (casos ?? []) as unknown as CasoAbierto[];

  if (abiertos.length === 0) {
    return (
      <p className="max-w-prose text-sm text-muted-foreground">
        No hay casos anteriores abiertos. Eran los que llegaban antes de la pista de Atenciones (31-08); lo nuevo entra
        directo por ahí. Los clientes a los que hay que ofrecerles el mantenimiento no son casos: están en{" "}
        <Link href="/comercial/ruta" className="font-medium text-primary hover:underline">
          la ruta de mantenimiento
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {abiertos.map((c) => {
        const atendido = c.etapa !== "asignada";
        const sla = slaCaso(c.tipo_postventa, c.created_at, atendido);
        const serie = c.serie_texto;
        const fichaEquipo = c.equipo_id ?? (serie ? fichaPorSerie.get(serie.toUpperCase()) : undefined);
        return (
          <Link
            key={c.id}
            href={`/comercial/oportunidades/${c.id}`}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent"
          >
            <span
              className={cn(
                "flex size-9 flex-none items-center justify-center rounded-full",
                sla.estado === "rojo"
                  ? "bg-destructive/10 text-destructive"
                  : sla.estado === "ambar"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-secondary text-foreground",
              )}
            >
              {c.tipo_postventa === "garantia" ? (
                <ShieldCheck className="size-4" />
              ) : c.tipo_postventa === "repuesto" ? (
                <PackageSearch className="size-4" />
              ) : (
                <Wrench className="size-4" />
              )}
            </span>
            <div className="min-w-[220px] flex-1">
              <p className="break-words text-sm font-semibold text-foreground">
                {c.cuentas?.razon_social ?? "Cliente sin nombre"}
              </p>
              <p className="line-clamp-1 text-xs text-muted-foreground">
                {c.tipo_postventa ? (ETIQUETA_TIPO[c.tipo_postventa] ?? c.tipo_postventa) : "Sin clasificar"}
                {c.proxima_accion && ` · ${c.proxima_accion}`}
                {c.proxima_accion_at && ` · ${fechaCalendario(c.proxima_accion_at)}`}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {serie ? (
                  <span className="font-mono font-semibold text-foreground">
                    {fichaEquipo ? "" : "⚠ "}
                    serie {serie}
                  </span>
                ) : (
                  <span className="text-amber-800">⚠ equipo sin identificar</span>
                )}
                {c.codigo_error && <span className="ml-1.5 font-mono">· error {c.codigo_error}</span>}
              </p>
            </div>
            <div className="text-right text-xs">
              <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-foreground">
                {etiquetaEtapaPostventa(c.etapa)}
              </span>
              <br />
              {!atendido && (
                <span
                  className={cn(
                    "text-[11px] font-semibold",
                    sla.estado === "rojo"
                      ? "text-destructive"
                      : sla.estado === "ambar"
                        ? "text-amber-700"
                        : "text-muted-foreground",
                  )}
                >
                  {sla.horas < 1 ? "recién llegado" : `${Math.round(sla.horas)} h sin atender · límite ${sla.limite} h`}
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
