import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function OportunidadesPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();

  const { data: oportunidades } = await supabase
    .from("oportunidades")
    .select("id, etapa, intencion, monto_estimado, moneda, cuentas(razon_social)")
    .eq("comercial_id", perfil.id)
    .order("updated_at", { ascending: false });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mis oportunidades</CardTitle>
      </CardHeader>
      <CardContent>
        {!oportunidades || oportunidades.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no tiene oportunidades asignadas.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cuenta</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Intención</TableHead>
                <TableHead>Monto estimado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {oportunidades.map((op) => (
                <TableRow key={op.id}>
                  <TableCell>
                    {(op.cuentas as unknown as { razon_social: string } | null)
                      ?.razon_social ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{op.etapa}</Badge>
                  </TableCell>
                  <TableCell>{op.intencion}</TableCell>
                  <TableCell>
                    {op.monto_estimado ? `${op.moneda} ${op.monto_estimado}` : "—"}
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
