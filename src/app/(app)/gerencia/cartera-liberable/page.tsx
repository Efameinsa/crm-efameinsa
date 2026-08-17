import { fechaLima } from "@/lib/fechas";
import { createClient } from "@/lib/supabase/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SeccionPanel } from "@/components/crm/seccion-panel";

export default async function CarteraLiberablePage() {
  const supabase = await createClient();
  // v_cuentas_liberables: cuentas sin venta hace 6+ meses (regla R3 de gerencia).
  const { data: cuentas } = await supabase
    .from("v_cuentas_liberables")
    .select("id, razon_social, comercial_id, ultima_venta_at, cartera_desde")
    .order("ultima_venta_at", { ascending: true, nullsFirst: true });

  return (
    <SeccionPanel titulo="Cartera liberable (6+ meses sin venta)">
      {!cuentas || cuentas.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay cuentas liberables por ahora.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Razón social</TableHead>
              <TableHead>Última venta</TableHead>
              <TableHead>Cartera desde</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cuentas.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium text-foreground">{c.razon_social}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {c.ultima_venta_at ? fechaLima(c.ultima_venta_at) : "Nunca"}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {c.cartera_desde ? fechaLima(c.cartera_desde) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SeccionPanel>
  );
}
