import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaLima } from "@/lib/fechas";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

/**
 * Informes de soporte técnico: videollamadas y visitas —puesta en marcha,
 * verificación de preinstalación—, tal como los lleva la hoja SOPORTE TECNICO
 * de su Excel.
 *
 * Es la parte más chica del área (4 informes cargados) y aun así vale su
 * pantalla: es el registro de que un técnico atendió una máquina concreta, por
 * su número de serie, y en qué fecha. Cuando el cliente reclama, esto es lo
 * único que dice qué se hizo y cuándo.
 */
export default async function SoportePostventaPage() {
  const supabase = await createClient();
  const { data: filas } = await supabase
    .from("soporte_tecnico")
    .select("*")
    .order("fecha_ejecutado", { ascending: false, nullsFirst: false })
    .limit(300);

  return (
    <SeccionPanel
      titulo="Informes de soporte técnico"
      accion={
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
          {filas?.length ?? 0}
        </span>
      }
    >
      {!filas || filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin informes cargados.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Equipo y serie</TableHead>
                <TableHead>Detalle</TableHead>
                <TableHead>Ejecutado</TableHead>
                <TableHead>Enviado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="max-w-[240px] text-xs font-medium">{s.cliente_texto ?? "—"}</TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">{s.equipo ?? "—"}</TableCell>
                  <TableCell className="text-xs">{s.detalle ?? "—"}</TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {s.fecha_ejecutado ? fechaLima(s.fecha_ejecutado) : "—"}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {s.fecha_envio ? fechaLima(s.fecha_envio) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </SeccionPanel>
  );
}
