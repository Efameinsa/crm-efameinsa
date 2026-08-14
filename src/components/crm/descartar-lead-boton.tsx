"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { descartarLead } from "@/lib/acciones/leads";
import { Button } from "@/components/ui/button";

export function DescartarLeadBoton({ leadId }: { leadId: string }) {
  const [enviando, startTransition] = useTransition();

  function onClick() {
    if (!confirm("¿Descartar este contacto? No aparecerá más en la bandeja.")) return;
    startTransition(async () => {
      const resultado = await descartarLead(leadId);
      if (resultado.error) toast.error(resultado.error);
      else toast.success("Contacto descartado");
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={onClick} disabled={enviando}>
      Descartar
    </Button>
  );
}
