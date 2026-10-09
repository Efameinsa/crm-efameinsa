"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { anotarMovimientoSaldo, borrarMovimientoSaldo, cambiarTopeDiarioAds } from "@/lib/acciones/saldo-ads";
import type { SaldoGoogleAds } from "@/lib/saldo-ads-datos";
import { cn } from "@/lib/utils";

// La tarjeta «Saldo de Google Ads» (0421, gerencia 07-10). Google Ads es
// prepago y el CRM no lo ve: se anota cada recarga y el CRM descuenta el tope
// diario. A menos de un día de saldo, admin recibe campana y correo.

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Ahora en hora de Lima, para el valor por defecto de <input type="datetime-local">. */
function ahoraLocal(): string {
  const d = new Date(Date.now() - 5 * 3_600_000);
  return d.toISOString().slice(0, 16);
}
/** «2026-10-09T10:30» en hora de Lima → ISO. */
const deLima = (v: string) => (v ? new Date(`${v}:00-05:00`).toISOString() : null);

export function SaldoGoogleAdsTarjeta({ datos }: { datos: SaldoGoogleAds }) {
  const { tope, estado, movimientos } = datos;
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [modo, setModo] = useState<null | "recarga" | "calibracion" | "tope">(null);
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState("");
  const [nota, setNota] = useState("");

  function abrir(m: typeof modo) {
    setModo(m);
    setMonto(m === "tope" ? String(tope) : "");
    setFecha(ahoraLocal());
    setNota("");
  }

  function guardar() {
    const n = Number(monto.replace(",", "."));
    startTransition(async () => {
      const { error } =
        modo === "tope"
          ? await cambiarTopeDiarioAds(n)
          : await anotarMovimientoSaldo({ tipo: modo as "recarga" | "calibracion", monto: n, fecha: deLima(fecha), nota });
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(modo === "recarga" ? "Recarga anotada" : modo === "tope" ? "Tope diario actualizado" : "Saldo corregido según Google");
      setModo(null);
      router.refresh();
    });
  }

  function borrar(id: string) {
    if (!confirm("¿Borrar este movimiento? El saldo estimado se recalcula sin él.")) return;
    startTransition(async () => {
      const { error } = await borrarMovimientoSaldo(id);
      if (error) toast.error(error);
      else router.refresh();
    });
  }

  const color = estado.sinDatos
    ? "text-muted-foreground"
    : estado.menosDeUnDia
      ? "text-[#b42318]"
      : estado.diasRestantes < 2
        ? "text-[#b54708]"
        : "text-[#1E7F4F]";

  return (
    <div className="space-y-4">
      {estado.sinDatos ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay ninguna recarga anotada, por eso el CRM no puede estimar el saldo ni avisar. Cuando recargue la
          cuenta de Google Ads, anote aquí el monto con «Registrar recarga» (o, si ya tiene saldo, ponga el que muestra
          Google con «Corregir saldo según Google»). Desde ahí el CRM descuenta {soles(tope)} por día —el tope diario— y,
          cuando quede menos de un día, avisa por la campana a admin y por correo a gestion1@efameinsa.com.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Saldo estimado</p>
            <p className={cn("text-2xl font-bold tabular-nums", color)}>{soles(estado.saldo)}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Alcanza para</p>
            <p className={cn("text-2xl font-bold tabular-nums", color)}>
              {estado.diasRestantes.toLocaleString("es-PE", { maximumFractionDigits: 1 })} día{estado.diasRestantes === 1 ? "" : "s"}
            </p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Se acabaría</p>
            <p className={cn("text-base font-semibold", color)}>{estado.agotamientoAt ? fechaHora(estado.agotamientoAt) : "Ya se acabó: recargue"}</p>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Tope diario: <span className="font-semibold text-foreground tabular-nums">{soles(tope)}</span>
        {" "}· Es un estimado pesimista: Google puede gastar menos que el tope, y entonces sobra saldo. Para afinarlo,
        corrija con el saldo real que muestra Google cuando quiera.
      </p>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["recarga", "Registrar recarga"],
            ["calibracion", "Corregir saldo según Google"],
            ["tope", "Cambiar tope diario"],
          ] as const
        ).map(([m, texto]) => (
          <button
            key={m}
            type="button"
            onClick={() => abrir(m)}
            className={cn(
              "cursor-pointer rounded-md border px-3 py-1.5 text-xs font-semibold",
              m === "recarga" ? "border-[#7e1210] bg-[#7e1210] text-white hover:opacity-90" : "border-border bg-background hover:bg-secondary",
            )}
          >
            {texto}
          </button>
        ))}
      </div>

      {modo && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-secondary/40 p-3">
          <label className="flex flex-col gap-1 text-xs">
            {modo === "recarga" ? "Monto recargado (S/)" : modo === "calibracion" ? "Saldo que muestra Google (S/)" : "Tope diario (S/)"}
            <input
              type="number"
              step="0.01"
              min="0"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              autoFocus
              className="h-8 w-32 rounded border border-input bg-background px-2 text-sm tabular-nums"
            />
          </label>
          {modo !== "tope" && (
            <>
              <label className="flex flex-col gap-1 text-xs">
                {modo === "recarga" ? "Cuándo se recargó" : "A qué hora lo vio"}
                <input
                  type="datetime-local"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="h-8 rounded border border-input bg-background px-2 text-sm"
                />
              </label>
              <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs">
                Nota (opcional)
                <input
                  type="text"
                  maxLength={300}
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Ej. tarjeta de la empresa"
                  className="h-8 rounded border border-input bg-background px-2 text-sm"
                />
              </label>
            </>
          )}
          <button
            type="button"
            onClick={guardar}
            disabled={pendiente}
            className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md bg-[#1E7F4F] px-3 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {pendiente && <Loader2 className="size-3.5 animate-spin" />} Guardar
          </button>
          <button type="button" onClick={() => setModo(null)} className="h-8 cursor-pointer rounded-md px-3 text-xs text-muted-foreground hover:bg-accent">
            Cancelar
          </button>
        </div>
      )}

      {movimientos.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Fecha</th>
                <th className="py-1.5 pr-3 font-medium">Movimiento</th>
                <th className="py-1.5 pr-3 text-right font-medium">Monto</th>
                <th className="py-1.5 pr-3 font-medium">Nota</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {movimientos.slice(0, 10).map((m) => (
                <tr key={m.id} className="border-b border-border/60">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{fechaHora(m.fecha)}</td>
                  <td className="py-1.5 pr-3">{m.tipo === "recarga" ? "Recarga" : "Saldo según Google"}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{soles(m.monto)}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{m.nota ?? ""}</td>
                  <td className="py-1.5 text-right">
                    <button type="button" onClick={() => borrar(m.id)} disabled={pendiente} className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Borrar (si se anotó por error)">
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
