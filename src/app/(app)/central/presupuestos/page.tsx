import { FileDown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolverPeriodo } from "@/lib/periodo";
import { sumarDias } from "@/lib/calendario";
import { fechaHoraLima } from "@/lib/fechas";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { FiltroPeriodo } from "@/components/crm/filtro-periodo";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Los presupuestos que salieron al cliente, por período y por comercial.
 *
 * POR QUÉ EXISTE. Pedido del ing. Carlos (reuniones del 31-08 y 01-09, E1 de
 * docs/22): «filtros en el listado de cotizaciones: día, semana, mes y año.
 * Central ya puede verlas; lo que no puede es filtrarlas». Lo único que tenía
 * Central era la tabla de CANTIDADES de la bandeja («Presupuestos registrados
 * por comercial»: hoy / semana / 30 días), sin poder abrir cuáles son, de qué
 * cliente ni por cuánto.
 *
 * QUÉ ENTRA. Solo lo que ya tiene NÚMERO: cotizaciones enviadas o aceptadas,
 * con correlativo, y sin las de práctica (código `PRUEBA_…`, migración 0145).
 * Un borrador no es un presupuesto todavía y no le corresponde a Central. La
 * fecha que manda es la de ENVÍO, en hora de Lima, porque esa es la que el
 * cliente conoce y por la que pregunta cuando vuelve a llamar.
 *
 * FILTROS. El mismo `FiltroPeriodo` de «Lo que derivé» y de los paneles de
 * gerencia, con las escalas día / semana / mes / año y las flechas de
 * anterior / siguiente; los dos selectores de fecha siguen ahí para un rango a
 * mano, y el desplegable de comercial. Todo vive en la URL, así que la vista
 * se puede compartir y el botón «atrás» funciona.
 *
 * PERMISOS. Central lee `cotizaciones`, `oportunidades` y `cuentas` por las
 * políticas `*_central` de la 0001; gerencia y admin, por `*_backoffice`. Los
 * montos se ven: lo que Central controla acá es lo que se le mandó al
 * cliente, y el total es parte del documento.
 */

// Tope alto a propósito: recortar sin avisar es lo que dejaba invisibles los
// contactos de la bandeja. Si algún período se pasa, la pantalla lo dice.
const TOPE = 500;

interface FilaPresupuesto {
  id: string;
  codigo: string;
  serie: string;
  estado: "enviada" | "aceptada";
  total: number;
  moneda: string;
  enviadaAt: string | null;
  comercialId: string;
  cliente: string;
}

interface Comercial {
  id: string;
  nombre: string;
  codigo_comercial: string | null;
  activo: boolean;
  es_prueba: boolean;
}

const ETIQUETA_ESTADO: Record<FilaPresupuesto["estado"], string> = {
  enviada: "Enviada al cliente",
  aceptada: "Aceptada",
};

function dinero(monto: number): string {
  return monto.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function PresupuestosCentralPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; comercial?: string }>;
}) {
  const sp = await searchParams;
  // Arranca en la semana: es la unidad en la que la empresa se mira a sí
  // misma (potenciales semanales, cierre del sábado).
  const periodo = resolverPeriodo(sp, "semana");
  const comercialId = sp.comercial?.trim() || null;
  const supabase = await createClient();

  // Las ventanas cortan en hora de Lima (offset -05:00 explícito), como en la
  // tabla de cantidades: una cotización de las 8 pm no cae en «mañana».
  let consulta = supabase
    .from("cotizaciones")
    .select("id, codigo, serie, estado, total, moneda, enviada_at, oportunidades!inner(comercial_id, cuentas(razon_social))", {
      count: "exact",
    })
    .not("correlativo", "is", null)
    .in("estado", ["enviada", "aceptada"])
    .not("codigo", "like", "PRUEBA%")
    .gte("enviada_at", `${periodo.desde}T00:00:00-05:00`)
    .lt("enviada_at", `${sumarDias(periodo.hasta, 1)}T00:00:00-05:00`);
  if (comercialId) consulta = consulta.eq("oportunidades.comercial_id", comercialId);

  const [{ data: cotizaciones, count: total, error }, { data: perfiles }] = await Promise.all([
    consulta.order("enviada_at", { ascending: false }).limit(TOPE),
    // Todos los comerciales, activos o no: una cotización de alguien que ya
    // no está sigue teniendo dueño en la lista. El desplegable ofrece solo a
    // los activos que no son de práctica.
    supabase
      .from("perfiles")
      .select("id, nombre, codigo_comercial, activo, es_prueba")
      .eq("rol", "comercial")
      .order("codigo_comercial"),
  ]);

  const comerciales = (perfiles ?? []) as Comercial[];
  const comercialPorId = new Map(comerciales.map((c) => [c.id, c]));
  const opcionesComercial = comerciales
    .filter((c) => c.activo && !c.es_prueba)
    .map((c) => ({ id: c.id, nombre: c.codigo_comercial ? `${c.codigo_comercial} · ${c.nombre}` : c.nombre }));

  const filas: FilaPresupuesto[] = (cotizaciones ?? []).map((c) => {
    const op = c.oportunidades as unknown as { comercial_id: string; cuentas: { razon_social: string } | null } | null;
    return {
      id: c.id as string,
      codigo: (c.codigo as string | null) ?? "—",
      serie: c.serie as string,
      estado: c.estado as FilaPresupuesto["estado"],
      total: Number(c.total),
      moneda: c.moneda as string,
      enviadaAt: c.enviada_at as string | null,
      comercialId: op?.comercial_id ?? "",
      cliente: op?.cuentas?.razon_social ?? "Cliente sin nombre",
    };
  });

  // Suma por moneda: un total que mezcle soles con dólares no dice nada.
  const sumaPorMoneda = new Map<string, number>();
  for (const f of filas) sumaPorMoneda.set(f.moneda, (sumaPorMoneda.get(f.moneda) ?? 0) + f.total);
  const monedas = [...sumaPorMoneda.keys()].sort();
  const aceptados = filas.filter((f) => f.estado === "aceptada").length;

  const nombreComercial = (id: string) => {
    const c = comercialPorId.get(id);
    if (!c) return "—";
    return c.codigo_comercial ? `${c.codigo_comercial} · ${c.nombre}` : c.nombre;
  };

  return (
    <SeccionPanel
      titulo="Presupuestos enviados"
      accion={
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
          {(total ?? filas.length).toLocaleString("es-PE")} presupuesto{(total ?? filas.length) === 1 ? "" : "s"}
        </span>
      }
    >
      <FiltroPeriodo
        {...periodo}
        presetActivo={periodo.preset}
        presets={[]}
        escalas
        comerciales={opcionesComercial}
        comercialId={comercialId}
      />

      {error ? (
        <p className="mt-3 text-sm text-destructive">No se pudo cargar la lista: {error.message}</p>
      ) : filas.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {comercialId
            ? `${nombreComercial(comercialId)} no envió ningún presupuesto en este período.`
            : "No se envió ningún presupuesto en este período."}
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <TableHead className="h-8">Código</TableHead>
                <TableHead className="h-8">Enviado</TableHead>
                <TableHead className="h-8">Comercial</TableHead>
                <TableHead className="h-8">Cliente</TableHead>
                <TableHead className="h-8">Serie</TableHead>
                <TableHead className="h-8 text-right">Total</TableHead>
                <TableHead className="h-8">Estado</TableHead>
                <TableHead className="h-8 w-8" aria-label="PDF" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="py-1.5">
                    <a
                      href={`/api/cotizaciones/${f.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono font-semibold text-foreground hover:text-primary hover:underline"
                    >
                      {f.codigo}
                    </a>
                  </TableCell>
                  <TableCell className="py-1.5 tabular-nums text-muted-foreground">{fechaHoraLima(f.enviadaAt)}</TableCell>
                  <TableCell className="py-1.5 text-foreground">{nombreComercial(f.comercialId)}</TableCell>
                  <TableCell className="min-w-[200px] max-w-[360px] py-1.5 text-foreground">
                    <span className="line-clamp-1" title={f.cliente}>
                      {f.cliente}
                    </span>
                  </TableCell>
                  <TableCell className="py-1.5">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        f.serie === "EFAMEINSA" ? "bg-primary/10 text-primary" : "bg-secondary text-foreground",
                      )}
                    >
                      {f.serie}
                    </span>
                  </TableCell>
                  <TableCell className="py-1.5 text-right tabular-nums text-foreground">
                    {f.moneda} {dinero(f.total)}
                  </TableCell>
                  <TableCell className="py-1.5">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        f.estado === "aceptada" ? "bg-emerald-100 text-emerald-900" : "bg-sky-100 text-sky-900",
                      )}
                    >
                      {ETIQUETA_ESTADO[f.estado]}
                    </span>
                  </TableCell>
                  <TableCell className="py-1.5">
                    <a
                      href={`/api/cotizaciones/${f.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-primary"
                      title="Ver el PDF"
                      aria-label={`Ver el PDF de ${f.codigo}`}
                    >
                      <FileDown className="size-3.5" />
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter className="text-xs">
              <TableRow>
                <TableCell colSpan={5} className="py-2 font-semibold text-foreground">
                  {filas.length.toLocaleString("es-PE")} presupuesto{filas.length === 1 ? "" : "s"}
                  {comercialId ? ` de ${nombreComercial(comercialId)}` : ""}
                </TableCell>
                <TableCell className="py-2 text-right tabular-nums font-semibold text-foreground">
                  {monedas.map((m) => (
                    <span key={m} className="block">
                      {m} {dinero(sumaPorMoneda.get(m) ?? 0)}
                    </span>
                  ))}
                </TableCell>
                <TableCell colSpan={2} className="py-2 text-muted-foreground">
                  {aceptados > 0 && `${aceptados} aceptado${aceptados === 1 ? "" : "s"}`}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {total != null && total > filas.length && (
        <p className="mt-3 text-xs text-amber-700">
          Se muestran los {filas.length} más recientes de {total.toLocaleString("es-PE")}. Achique el período o
          elija un comercial para ver el resto.
        </p>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        Solo presupuestos con número, enviados o aceptados, por su fecha de envío en hora de Lima. Los borradores y
        las prácticas no aparecen; los presupuestos anteriores al CRM viven en «Mis cotizaciones» de cada comercial.
      </p>
    </SeccionPanel>
  );
}
