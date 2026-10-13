"use client";

// EL PROTOCOLO GUARDADO SE CORRIGE CON EL CÓDIGO DE LESLY (0450; Ariana,
// almacén, 13-10: «una vez generado y guardado deberá quedar bloqueado…
// para corregirlo, un PIN de autorización proporcionado por Lesly»). Con el
// código y el motivo, el informe del pedido queda abierto 30 minutos.
// Solo en pantalla: no sale al imprimir.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { abrirProtocoloConCodigo } from "@/lib/acciones/almacen";

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" });

export function CandadoProtocolo({ servicioId, abiertoHasta }: { servicioId: string; abiertoHasta: string | null }) {
  const router = useRouter();
  const [pidiendo, setPidiendo] = useState(false);
  const [pin, setPin] = useState("");
  const [motivo, setMotivo] = useState("");
  const [pendiente, startTransition] = useTransition();

  if (abiertoHasta && new Date(abiertoHasta) > new Date())
    return (
      <p className="no-imprimir mb-3 rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[12px] text-emerald-900">
        🔓 Abierto con código para corregir hasta las {hora(abiertoHasta)}. Después vuelve a quedar bloqueado.
      </p>
    );

  return (
    <div className="no-imprimir mb-3 rounded border border-neutral-300 bg-neutral-50 px-3 py-2 text-[12px]">
      <p>
        🔒 <b>Informe guardado.</b> Para corregir datos, fechas, fotos o documentos de una máquina ya probada, pida el código de autorización a Lesly.
        {!pidiendo && (
          <button type="button" className="ml-2 font-medium text-[#8B1510] hover:underline" onClick={() => setPidiendo(true)}>
            Corregir con código
          </button>
        )}
      </p>
      {pidiendo && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-[11px] font-semibold text-neutral-700">
            Código (4 dígitos)
            <input
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(x) => setPin(x.target.value.replace(/\D/g, ""))}
              className="mt-0.5 block h-8 w-24 rounded border border-neutral-400 bg-white px-2 font-mono text-[13px]"
            />
          </label>
          <label className="min-w-[14rem] flex-1 text-[11px] font-semibold text-neutral-700">
            Qué hay que corregir
            <input
              value={motivo}
              placeholder="La serie de la secadora estaba mal"
              onChange={(x) => setMotivo(x.target.value)}
              className="mt-0.5 block h-8 w-full rounded border border-neutral-400 bg-white px-2 text-[12px] font-normal"
            />
          </label>
          <button
            type="button"
            disabled={pendiente || pin.length !== 4 || motivo.trim().length < 5}
            className="h-8 rounded bg-[#8B1510] px-3 text-[12px] font-semibold text-white disabled:opacity-50"
            onClick={() =>
              startTransition(async () => {
                const r = await abrirProtocoloConCodigo(servicioId, pin, motivo);
                if (r.error) {
                  toast.error(r.error, { duration: 9000 });
                  return;
                }
                toast.success("Informe abierto para corregir por 30 minutos");
                setPidiendo(false);
                setPin("");
                router.refresh();
              })
            }
          >
            {pendiente ? <Loader2 className="inline size-3 animate-spin" /> : "Abrir para corregir"}
          </button>
          <button type="button" className="h-8 text-[12px] text-neutral-600 hover:underline" onClick={() => setPidiendo(false)}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
