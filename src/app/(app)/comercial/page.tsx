import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ComercialPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const hoy = new Date().toISOString().slice(0, 10);

  const { data: oportunidades } = await supabase
    .from("oportunidades")
    .select("id, etapa, proxima_accion, proxima_accion_at, cuenta_id, cuentas(razon_social)")
    .eq("comercial_id", perfil.id)
    .not("etapa", "in", "(venta,rechazada,derivada)")
    .lte("proxima_accion_at", hoy)
    .order("proxima_accion_at", { ascending: true });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Mi día</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!oportunidades || oportunidades.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tiene acciones pendientes para hoy.
            </p>
          ) : (
            oportunidades.map((op) => (
              <div
                key={op.id}
                className="flex items-center justify-between rounded-md border border-border p-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {(op.cuentas as unknown as { razon_social: string } | null)
                      ?.razon_social ?? "Cuenta sin nombre"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {op.proxima_accion ?? "Sin acción definida"}
                  </p>
                </div>
                <Badge variant="secondary">{op.etapa}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
