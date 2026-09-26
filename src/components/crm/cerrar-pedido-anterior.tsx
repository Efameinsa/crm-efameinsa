"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { History } from "lucide-react";
import { cerrarPedidoAnteriorEntregado } from "@/lib/acciones/postventa";
import { Button } from "@/components/ui/button";

/**
 * Un pedido del Excel que ya se entregó antes del CRM (0312).
 *
 * Rubí, 26-09, en Rojas Damián (venta de junio): el circuito le pedía el plano
 * de preinstalación de una lavadora que el cliente ya usa. Ella proponía un
 * paso «postventa no envió» con el nombre de quien lo atendió; el fondo es que
 * a ese pedido no le quedan pasos. Este recuadro lo cierra como entregado,
 * con la fecha y quién lo gestionó en su momento, sin inventar pasos.
 */
export function CerrarPedidoAnterior({ servicioId, fechaSugerida }: { servicioId: string; fechaSugerida: string | null }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(fechaSugerida ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }));
  const [quien, setQuien] = useState("");
  const [nota, setNota] = useState("");
  const [enviando, startTransition] = useTransition();

  function cerrar() {
    startTransition(async () => {
      const r = await cerrarPedidoAnteriorEntregado({ servicioId, fecha, quien, nota });
      if (r.error) {
        toast.error(r.error, { duration: 9000 });
        return;
      }
      toast.success("Pedido cerrado como entregado. Ya aparece en Pedidos › Cerrados.");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-amber-400/50 bg-amber-500/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-2.5">
          <History className="mt-0.5 size-4 flex-none text-amber-800" />
          <div>
            <p className="text-sm font-semibold text-foreground">Pedido anterior al CRM</p>
            <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">
              Si el equipo ya se entregó y el cliente lo está usando, no hace falta completar el plano, la apertura ni el despacho:
              ciérrelo como entregado y anote quién lo gestionó en su momento.
            </p>
          </div>
        </div>
        {!abierto && (
          <Button size="sm" variant="outline" onClick={() => setAbierto(true)}>
            Ya se entregó: cerrar
          </Button>
        )}
      </div>

      {abierto && (
        <div className="mt-3 grid gap-2.5 sm:grid-cols-[10rem_1fr]">
          <label className="text-xs font-medium text-foreground">
            Fecha de entrega
            <input
              type="date"
              value={fecha}
              max={new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" })}
              onChange={(e) => setFecha(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-foreground">
            Quién lo gestionó en su momento
            <input
              value={quien}
              onChange={(e) => setQuien(e.target.value)}
              placeholder="Nombre de la persona o área. Ej.: Brenda Taboada, postventa anterior"
              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm placeholder:text-muted-foreground"
            />
          </label>
          <label className="text-xs font-medium text-foreground sm:col-span-2">
            Lo que se sabe (opcional)
            <textarea
              rows={2}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej.: no se le envió plano de preinstalación; el cliente ya usa la lavadora sin problemas."
              className="mt-1 w-full rounded-md border border-border bg-background p-2.5 text-sm placeholder:text-muted-foreground"
            />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" disabled={enviando || quien.trim().length < 3 || !fecha} onClick={cerrar}>
              {enviando ? "Cerrando…" : "Cerrar como entregado"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
