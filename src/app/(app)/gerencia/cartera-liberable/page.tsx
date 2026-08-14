import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function CarteraLiberablePage() {
  const supabase = await createClient();
  // v_cuentas_liberables: cuentas sin venta hace 6+ meses (regla R3 de gerencia).
  const { data: cuentas } = await supabase
    .from("v_cuentas_liberables")
    .select("id, razon_social, comercial_id, ultima_venta_at, cartera_desde")
    .order("ultima_venta_at", { ascending: true, nullsFirst: true });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cartera liberable (6+ meses sin venta)</CardTitle>
      </CardHeader>
      <CardContent>
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
                  <TableCell>{c.razon_social}</TableCell>
                  <TableCell>
                    {c.ultima_venta_at
                      ? new Date(c.ultima_venta_at).toLocaleDateString("es-PE")
                      : "Nunca"}
                  </TableCell>
                  <TableCell>
                    {c.cartera_desde
                      ? new Date(c.cartera_desde).toLocaleDateString("es-PE")
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
