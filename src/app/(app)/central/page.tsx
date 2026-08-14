import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function CentralPage() {
  const supabase = await createClient();
  const { data: leads } = await supabase
    .from("leads")
    .select("id, codigo, canal, area_destino, nombre_contacto, razon_social, recibido_at")
    .eq("estado", "pendiente_triaje")
    .order("recibido_at", { ascending: true })
    .limit(50);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Bandeja de triaje</CardTitle>
        </CardHeader>
        <CardContent>
          {!leads || leads.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay contactos pendientes de triaje.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Recibido</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Razón social</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-mono text-xs">{lead.codigo}</TableCell>
                    <TableCell>{new Date(lead.recibido_at).toLocaleString("es-PE")}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{lead.canal}</Badge>
                    </TableCell>
                    <TableCell>{lead.area_destino}</TableCell>
                    <TableCell>{lead.nombre_contacto ?? "—"}</TableCell>
                    <TableCell>{lead.razon_social ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
