import { createClient } from "@/lib/supabase/server";
import { cargarSupervisionDiaria } from "@/lib/supervision";
import { hoyLima } from "@/lib/periodo";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// El consolidado del día de Central.
//
// Hasta el 24-08 Central armaba este conteo a mano: registraba cada prospecto
// en su Excel, contaba cuántos derivó y cuántas cotizaciones salieron, y se lo
// reportaba al ingeniero. El Excel dejó de usarse ese lunes, así que se quedó
// sin forma de armarlo — y el gerente lo pidió expresamente en la reunión:
// «¿cuántas cotizaciones y cuántos derivados durante el día?».
//
// Lee de supervision_diaria() (migración 0059), la misma fuente que usa
// gerencia. Que Central y gerencia miren números distintos del mismo día es
// justo lo que este CRM vino a terminar.

export async function ConsolidadoCentral() {
  const supabase = await createClient();
  const hoy = hoyLima();
  const datos = await cargarSupervisionDiaria(supabase, hoy);

  if (!datos) {
    return (
      <SeccionPanel titulo="Consolidado del día">
        <p className="text-sm text-muted-foreground">No se pudo cargar el consolidado.</p>
      </SeccionPanel>
    );
  }

  // Solo los que tuvieron movimiento: una tabla con cinco filas en cero no se
  // lee, se saltea.
  const conMovimiento = datos.comerciales.filter(
    (c) => c.derivados > 0 || c.cotizaciones > 0 || c.seguimientos_efectivos > 0 || c.ventas > 0,
  );

  const { count: sinAsignar } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("estado", "pendiente_triaje");

  // Sin botón de PDF a propósito: el reporte diario que existe es POR
  // COMERCIAL, y bajarlo desde acá le daría a Central un documento vacío. El
  // gerente pidió que Central le mande captura de esta pantalla.
  return (
    <SeccionPanel titulo="Consolidado del día">
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Dato etiqueta="Derivados hoy" valor={datos.totales.derivados} />
        <Dato etiqueta="Cotizaciones" valor={datos.totales.cotizaciones} />
        <Dato etiqueta="Informes de cierre" valor={datos.totales.informes_emitidos} />
        <Dato etiqueta="Sin asignar" valor={sinAsignar ?? 0} alerta={(sinAsignar ?? 0) > 0} />
      </div>

      {conMovimiento.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay movimiento hoy.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Comercial</TableHead>
                <TableHead className="text-right">Derivados</TableHead>
                <TableHead className="text-right">Gestiones</TableHead>
                <TableHead className="text-right">Cotizaciones</TableHead>
                <TableHead className="text-right">Informes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conMovimiento.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap">
                    <span className="font-medium text-foreground">{c.nombre}</span>
                    {c.codigo && <span className="ml-1.5 text-xs text-muted-foreground">{c.codigo}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.derivados}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.seguimientos_efectivos}</TableCell>
                  {/* El que le importa a Central: si derivó y no se cotizó, es
                      la pregunta que el cliente le va a hacer por teléfono. */}
                  <TableCell className="text-right tabular-nums font-semibold text-foreground">{c.cotizaciones}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.informes_emitidos}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="text-xs font-semibold text-foreground">Total del día</TableCell>
                <TableCell className="text-right font-bold tabular-nums">{datos.totales.derivados}</TableCell>
                <TableCell className="text-right font-bold tabular-nums">{datos.totales.seguimientos_efectivos}</TableCell>
                <TableCell className="text-right font-bold tabular-nums">{datos.totales.cotizaciones}</TableCell>
                <TableCell className="text-right font-bold tabular-nums">{datos.totales.informes_emitidos}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </SeccionPanel>
  );
}

function Dato({ etiqueta, valor, alerta = false }: { etiqueta: string; valor: number; alerta?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className={`mt-0.5 text-2xl font-bold tabular-nums ${alerta ? "text-amber-700" : "text-foreground"}`}>
        {valor.toLocaleString("es-PE")}
      </p>
    </div>
  );
}
