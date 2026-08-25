"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { marcarLeadYaGestionado } from "@/lib/acciones/leads";
import { Button } from "@/components/ui/button";

export function YaEstaEnElSistemaBoton({
  leadId,
  cuentaId,
  razonSocial,
}: {
  leadId: string;
  cuentaId: string;
  razonSocial: string;
}) {
  const [enviando, startTransition] = useTransition();

  function onClick() {
    if (
      !confirm(
        `¿Este contacto ya está registrado como «${razonSocial}»?\n\n` +
          "Sale de la bandeja como repetido. NO se cuenta como descartado: " +
          "la campaña que lo trajo sigue figurando como que trajo un cliente.",
      )
    )
      return;
    startTransition(async () => {
      const resultado = await marcarLeadYaGestionado(leadId, cuentaId);
      if (resultado.error) toast.error(resultado.error);
      else toast.success("Marcado como repetido");
    });
  }

  return (
    <Button size="sm" variant="secondary" onClick={onClick} disabled={enviando}>
      Ya está en el sistema
    </Button>
  );
}
