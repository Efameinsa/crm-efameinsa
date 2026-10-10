"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";
import { anotarEmpresaDelPedido } from "@/lib/acciones/finanzas";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Empresa = "EFAMEINSA" | "OPEN";

const NOMBRE: Record<Empresa, { largo: string; corto: string }> = {
  OPEN: { largo: "OPEN INVESTMENTS S.A.C.", corto: "Open Investments" },
  EFAMEINSA: { largo: "CORPORACIÓN EFAMEINSA S.A.", corto: "Efameinsa" },
};

/**
 * DE QUÉ EMPRESA ES LA OPERACIÓN (buzón, Jhon 10-10): a la vista en el detalle
 * del pedido, para buscar el abono directo en la carpeta y el banco de esa
 * empresa. Con cierre manda la serie del cierre; sin cierre, la anotada en la
 * apertura o por Finanzas (0421, 0432), que se puede marcar o corregir aquí.
 */
export function EmpresaDelPedido({
  servicioId,
  serie,
  origen,
  codigoCierre,
}: {
  servicioId: string;
  serie: Empresa | null;
  origen: "cierre" | "anotada" | null;
  codigoCierre: string | null;
}) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [cambiando, setCambiando] = useState(false);
  const puedeAnotar = origen !== "cierre";

  function anotar(e: Empresa) {
    start(async () => {
      const r = await anotarEmpresaDelPedido(servicioId, e);
      if (r.error) return void toast.error(r.error);
      toast.success(`Pedido anotado como de ${NOMBRE[e].corto}`);
      setCambiando(false);
      router.refresh();
    });
  }

  const botones = (
    <div className="flex flex-wrap items-center gap-2">
      {(["OPEN", "EFAMEINSA"] as const).map((e) => (
        <Button key={e} size="sm" variant={e === serie ? "default" : "outline"} disabled={pendiente} onClick={() => anotar(e)}>
          {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Es de {NOMBRE[e].corto}
        </Button>
      ))}
      {cambiando && (
        <button type="button" onClick={() => setCambiando(false)} className="text-xs text-muted-foreground hover:underline">
          Cancelar
        </button>
      )}
    </div>
  );

  if (!serie) {
    return (
      <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-amber-900">
          <Building2 className="size-3.5" /> Empresa de la operación · sin dato
        </p>
        <p className="mt-1 text-xs text-amber-900">
          Este pedido viene del Excel de postventa y no tiene cierre en el CRM, así que no dice de qué empresa es. Cuando sepa en qué banco
          entró el abono, márquela y quedará anotada (la apertura sale con la misma empresa).
        </p>
        <div className="mt-2">{botones}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border-l-4 p-3",
        serie === "OPEN" ? "border-l-foreground/60 bg-secondary/60" : "border-l-primary bg-primary/5",
      )}
    >
      <div>
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Building2 className="size-3.5" /> Empresa de la operación
        </p>
        <p className={cn("text-base font-bold", serie === "OPEN" ? "text-foreground" : "text-primary")}>{NOMBRE[serie].largo}</p>
        <p className="text-xs text-muted-foreground">
          Busque el abono en la carpeta y la cuenta del banco de {NOMBRE[serie].corto}.{" "}
          {origen === "cierre" ? `Según el cierre ${codigoCierre ?? ""}`.trim() + "." : "Anotada en la apertura o por Finanzas (el pedido no tiene cierre)."}
        </p>
      </div>
      {puedeAnotar &&
        (cambiando ? (
          botones
        ) : (
          <button type="button" onClick={() => setCambiando(true)} className="text-xs font-medium text-primary hover:underline">
            Cambiar la empresa
          </button>
        ))}
    </div>
  );
}
