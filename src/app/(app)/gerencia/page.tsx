import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EtapaOportunidad } from "@/types/database";

const ETAPAS: EtapaOportunidad[] = [
  "asignada",
  "filtrada",
  "cotizada",
  "seguimiento",
  "potencial",
  "venta",
  "rechazada",
];

export default async function GerenciaPage() {
  const supabase = await createClient();
  const { data: oportunidades } = await supabase.from("oportunidades").select("etapa");

  const conteos = ETAPAS.map((etapa) => ({
    etapa,
    total: oportunidades?.filter((o) => o.etapa === etapa).length ?? 0,
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Embudo comercial</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {conteos.map((c) => (
              <div key={c.etapa} className="rounded-md border border-border p-4">
                <p className="text-2xl font-semibold text-primary">{c.total}</p>
                <p className="text-xs capitalize text-muted-foreground">{c.etapa}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
