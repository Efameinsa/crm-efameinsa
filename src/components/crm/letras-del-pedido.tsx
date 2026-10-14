"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, FileSignature, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { entregarLetras, recibiLetras } from "@/lib/acciones/almacen";
import { TomarOSubir } from "@/components/crm/tomar-o-subir";
import type { EstadoLetras, FotoAlmacen } from "@/lib/postventa";

export interface DatosLetras {
  id: string;
  letras_estado?: EstadoLetras | null;
  letras_cantidad?: number | null;
  letras_recibidas_almacen_at?: string | null;
  letras_entregadas_at?: string | null;
  letras_entregadas_a?: string | null;
  salida_autorizada_at?: string | null;
  despachado_at?: string | null;
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * LAS LETRAS QUE VIAJAN CON EL EQUIPO (0470; Santos, 14-10: «pueden salir con
 * venta a crédito pero tienen que llevar sus letras… tiene que avisar que ya
 * se entregó»).
 *
 * 1. El almacén recoge las letras en Finanzas y lo marca: sin eso la salida no
 *    se registra.
 * 2. Al entregarlas, quien estuvo ahí dice quién las recibió (y foto del cargo
 *    si hay). Finanzas y postventa reciben el aviso; sin esto postventa no da
 *    el doble check del despacho.
 *
 * `puedeRecibir`: solo el almacén marca que las tiene en la mano.
 */
export function LetrasDelPedido({ s, cliente, puedeRecibir = false }: { s: DatosLetras; cliente: string; puedeRecibir?: boolean }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [recibio, setRecibio] = useState("");
  const [nota, setNota] = useState("");
  const [foto, setFoto] = useState<File | null>(null);

  const n = s.letras_cantidad ?? 0;
  const cuantas = n ? `${n} letra${n === 1 ? "" : "s"}` : "letras";
  const viajan = s.letras_estado === "van_con_el_equipo";
  const entregadas = s.letras_estado === "entregadas" || s.letras_estado === "firmadas";
  if (!viajan && !(entregadas && s.letras_entregadas_at)) return null;

  if (entregadas) {
    return (
      <p className="flex items-start gap-1.5 rounded-lg border border-[#1E7F4F]/30 bg-[#1E7F4F]/5 px-3 py-2 text-xs text-[#1E7F4F]">
        <Check className="mt-0.5 size-3.5 flex-none" />
        <span>
          Las {cuantas} de crédito se entregaron al cliente{s.letras_entregadas_at ? ` el ${fecha(s.letras_entregadas_at)}` : ""}
          {s.letras_entregadas_a ? ` · las recibió ${s.letras_entregadas_a}` : ""}
          {s.letras_estado === "firmadas" ? " · ya volvieron firmadas a Finanzas" : " · falta que vuelvan firmadas a Finanzas"}
        </span>
      </p>
    );
  }

  const antesDeSalir = !s.letras_recibidas_almacen_at && !s.despachado_at && !s.salida_autorizada_at;

  function correr(fn: () => Promise<{ error: string | null }>, exito: string) {
    startTransition(async () => {
      const r = await fn();
      if (r.error) return void toast.error(r.error, { duration: 10000 });
      toast.success(exito);
      router.refresh();
    });
  }

  async function subirFoto(): Promise<FotoAlmacen[] | null> {
    if (!foto) return [];
    const path = `pedidos/${s.id}/almacen/letras-${crypto.randomUUID()}-${foto.name.replace(/[^\w.\-]+/g, "_").slice(0, 60)}`;
    const { error } = await createClient().storage.from("adjuntos").upload(path, foto, { contentType: foto.type || "image/jpeg" });
    if (error) {
      toast.error(`No se pudo subir la foto: ${error.message}`);
      return null;
    }
    return [{ path, nombre: foto.name.slice(0, 120), tipo: foto.type.slice(0, 100), etiqueta: "letras" }];
  }

  return (
    <div className="space-y-2 rounded-xl border border-amber-500/50 bg-amber-50 p-4 dark:bg-amber-500/10">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900 dark:text-amber-300">
        <FileSignature className="size-4" />
        Este equipo sale a crédito: lleva {cuantas} que hay que entregar al cliente
      </p>

      {antesDeSalir ? (
        <>
          <p className="text-xs text-amber-900/80 dark:text-amber-300/80">
            Finanzas tiene las letras. El almacén las recoge y lo marca aquí: sin eso no se registra la salida.
          </p>
          {puedeRecibir && (
            <button
              type="button"
              disabled={pendiente}
              onClick={() => correr(() => recibiLetras(s.id, cliente), "Listo: Finanzas sabe que las letras están con el almacén")}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Recibí las {cuantas} de Finanzas
            </button>
          )}
        </>
      ) : (
        <>
          <p className="text-xs text-amber-900/80 dark:text-amber-300/80">
            {s.letras_recibidas_almacen_at ? `El almacén las recogió el ${fecha(s.letras_recibidas_almacen_at)}. ` : ""}
            Cuando se entreguen, diga quién las recibió. Finanzas y postventa reciben el aviso; sin esto no se cierra el despacho.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={recibio}
              onChange={(e) => setRecibio(e.target.value)}
              placeholder="Quién las recibió (nombre y DNI o cargo)"
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            />
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Nota (opcional): ej. las llevó el chofer del montacargas"
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            />
          </div>
          <div className="max-w-xs">
            <TomarOSubir titulo="Foto del cargo firmado (opcional)" archivo={foto} onChange={setFoto} compacto />
          </div>
          <button
            type="button"
            disabled={pendiente || recibio.trim().length < 3}
            onClick={() =>
              startTransition(async () => {
                const fotos = await subirFoto();
                if (!fotos) return;
                const r = await entregarLetras(s.id, { recibio, fotos, nota, cliente });
                if (r.error) return void toast.error(r.error, { duration: 10000 });
                toast.success("Letras entregadas: Finanzas y postventa ya recibieron el aviso");
                router.refresh();
              })
            }
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <FileSignature className="size-3.5" />}
            Letras entregadas al cliente
          </button>
        </>
      )}
    </div>
  );
}
