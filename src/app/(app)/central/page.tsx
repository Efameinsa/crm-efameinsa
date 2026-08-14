import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AsignarLeadDialog } from "@/components/crm/asignar-lead-dialog";
import { DescartarLeadBoton } from "@/components/crm/descartar-lead-boton";

export default async function CentralPage() {
  const supabase = await createClient();

  const [{ data: leads }, { data: comerciales }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, codigo, canal, nombre_contacto, razon_social, telefono, num_doc, recibido_at")
      .eq("estado", "pendiente_triaje")
      .order("recibido_at", { ascending: true })
      .limit(50),
    supabase
      .from("perfiles")
      .select("id, nombre, codigo_comercial")
      .eq("rol", "comercial")
      .eq("activo", true)
      .order("nombre"),
  ]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Bandeja de triaje</CardTitle>
        </CardHeader>
        <CardContent>
          {!leads || leads.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay contactos comerciales pendientes de asignar.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Recibido</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Razón social</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
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
                    <TableCell>{lead.nombre_contacto ?? "—"}</TableCell>
                    <TableCell>{lead.razon_social ?? "—"}</TableCell>
                    <TableCell className="flex justify-end gap-2">
                      <AsignarLeadDialog
                        leadId={lead.id}
                        telefono={lead.telefono}
                        numDoc={lead.num_doc}
                        comerciales={comerciales ?? []}
                      />
                      <DescartarLeadBoton leadId={lead.id} />
                    </TableCell>
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
