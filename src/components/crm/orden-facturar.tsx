"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Receipt } from "lucide-react";
import { atenderOrdenFacturar, ordenarFacturar } from "@/lib/acciones/finanzas";
import { CampoCodigo } from "@/components/crm/campo-codigo";

/**
 * «OYE FINANZAS, AHORA SÍ FACTURA Y COBRA» (0460; reunión 13-10 11:20). El
 * último paso de los pedidos a crédito o con saldo: postventa terminó el
 * servicio y envió el informe; a Finanzas le llega el aviso con el cliente,
 * el cierre y lo que falta cobrar.
 */
export function OrdenFacturar({ servicioId, sinPuesta = false }: { servicioId: string; /** Falta la puesta en marcha: pide código y motivo (gerencia 20-10). */ sinPuesta?: boolean }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState("");
  const [pin, setPin] = useState("");

  function enviar() {
    startTransition(async () => {
      const r = await ordenarFacturar(servicioId, nota, sinPuesta ? pin : null);
      if (r.error) return void toast.error(r.error, { duration: 9000 });
      toast.success("Orden enviada: a Finanzas le llegó el aviso y el correo para facturar y cobrar.");
      setAbierto(false);
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10"
      >
        <Receipt className="size-3.5" />
        Ordenar a Finanzas facturar
      </button>
    );
  }
  return (
    <span className="flex w-full max-w-md flex-col gap-1.5">
      <span className="text-[11px] text-muted-foreground">Mándela cuando el servicio esté terminado y el informe enviado al cliente.</span>
      {sinPuesta && (
        <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
          Todavía no está la puesta en marcha. Lo normal es llenarla primero: desde la factura corren los días de crédito. Si de verdad se factura antes,
          escriba el motivo en la nota y el código de gerencia u operaciones.
          <span className="mt-1 block">
            <CampoCodigo id={`pin-facturar-${servicioId}`} tono="amber" valor={pin} onChange={setPin} />
          </span>
        </span>
      )}
      <textarea
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        rows={2}
        placeholder="Nota para Finanzas (opcional): ej. 2.ª visita de puesta en marcha, 2 secadoras"
        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
      />
      <span className="flex gap-1.5">
        <button
          type="button"
          onClick={enviar}
          disabled={pendiente}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Receipt className="size-3.5" />}
          Enviar la orden
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="rounded-md border border-border px-2 py-1 text-[11px]">
          Cancelar
        </button>
      </span>
    </span>
  );
}

/**
 * EL OK DE FINANZAS PARA FACTURAR (gerencia 20-10, Jhon: «o darle simplemente
 * un check para que le des la orden a que facture»). Desde la 0552, este OK
 * pone el pedido en «Por facturar» de Facturación sin subir otra liquidación.
 */
export function AtenderOrdenFacturar({ servicioId }: { servicioId: string }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() =>
        startTransition(async () => {
          const r = await atenderOrdenFacturar(servicioId);
          if (r.error) return void toast.error(r.error, { duration: 9000 });
          toast.success("OK dado: el pedido ya está en «Por facturar» de Facturación, y postventa lo ve.");
          router.refresh();
        })
      }
      className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-60"
    >
      {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Receipt className="size-3.5" />}
      Dar el OK para facturar
    </button>
  );
}
