import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AprobarCotizacionBotones } from "@/components/crm/aprobar-cotizacion-botones";

export default async function AprobacionesPage() {
  const supabase = await createClient();
  const { data: cotizaciones } = await supabase
    .from("cotizaciones")
    .select("id, codigo, serie, total, moneda, created_at")
    .eq("estado_aprobacion", "pendiente_gerencia")
    .order("created_at", { ascending: true });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cotizaciones pendientes de aprobación</CardTitle>
      </CardHeader>
      <CardContent>
        {!cotizaciones || cotizaciones.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay cotizaciones por debajo de lista pendientes.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Serie</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>PDF</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cotizaciones.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.codigo}</TableCell>
                  <TableCell>{c.serie}</TableCell>
                  <TableCell>{c.moneda} {c.total}</TableCell>
                  <TableCell>{new Date(c.created_at).toLocaleDateString("es-PE")}</TableCell>
                  <TableCell>
                    <a
                      href={`/api/cotizaciones/${c.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      Ver
                    </a>
                  </TableCell>
                  <TableCell>
                    <AprobarCotizacionBotones cotizacionId={c.id} />
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
