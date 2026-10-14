"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BadgeCheck, FileSignature, Loader2, Receipt, ShieldAlert } from "lucide-react";
import { anotarComprobanteDeLaGuia, darVistoBuenoSalida, marcarLetrasFirmadas } from "@/lib/acciones/finanzas";
import { ETIQUETA_LETRAS, type EstadoLetras } from "@/lib/postventa";
import { cn } from "@/lib/utils";

export interface DatosVistoBueno {
  servicioId: string;
  formaPago: string | null;
  pide: boolean;
  vbAt: string | null;
  vbNota: string | null;
  vbComision: number | null;
  letrasEstado: EstadoLetras | null;
  letrasCantidad: number | null;
  letrasFirmadasAt: string | null;
  salidaAutorizadaAt: string | null;
  salidaAutorizadaMotivo: string | null;
  despachadoAt: string | null;
  guiaConfirmadaAt: string | null;
  guiaComprobanteTipo: string | null;
  guiaComprobanteNumero: string | null;
  moneda: string | null;
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * EL VISTO BUENO DE FINANZAS PARA LA SALIDA (0469, caso COFACO 14-10).
 *
 * Jhon: «no salga el equipo porque falta entregarle la letra». En una venta a
 * crédito Finanzas revisa el adelanto, las letras y la comisión interplaza, y
 * recién con su visto bueno se emite la apertura, se autoriza la guía y el
 * almacén despacha. Después de la salida queda a la vista lo que falta: las
 * letras por volver firmadas y el comprobante si la guía salió sin él.
 */
export function VistoBuenoSalida({ d }: { d: DatosVistoBueno }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const diceLetras = /letra/i.test(d.formaPago ?? "");
  const [letras, setLetras] = useState<EstadoLetras>(diceLetras ? "van_con_el_equipo" : "no_lleva");
  const [cantidad, setCantidad] = useState(() => {
    const m = (d.formaPago ?? "").match(/(\d{1,2})\s*letras/i);
    return m ? m[1] : "";
  });
  const [comision, setComision] = useState("");
  const [nota, setNota] = useState("");
  const [notaFirmadas, setNotaFirmadas] = useState("");
  const [compTipo, setCompTipo] = useState<"factura" | "boleta">("factura");
  const [compNumero, setCompNumero] = useState("");

  function correr(fn: () => Promise<{ error: string | null }>, exito: string) {
    startTransition(async () => {
      const r = await fn();
      if (r.error) return void toast.error(r.error, { duration: 10000 });
      toast.success(exito);
      router.refresh();
    });
  }

  const sinComprobante = Boolean(d.guiaConfirmadaAt) && (d.guiaComprobanteTipo ?? "sin_comprobante") === "sin_comprobante";
  const letrasPendientes = d.letrasEstado === "van_con_el_equipo" || d.letrasEstado === "entregadas";
  if (!d.pide && !sinComprobante && !letrasPendientes) return null;

  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border p-4 shadow-sm",
        d.pide && !d.vbAt && !d.salidaAutorizadaAt && !d.despachadoAt ? "border-destructive/50 bg-destructive/5" : "border-border bg-card",
      )}
    >
      {d.pide && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            {d.vbAt ? <BadgeCheck className="size-4 text-[#1E7F4F]" /> : <ShieldAlert className="size-4 text-destructive" />}
            Visto bueno para la salida · crédito o pago sin confirmar
          </p>
          {d.formaPago && (
            <p className="text-xs text-muted-foreground">
              Forma de pago: <b className="text-foreground">{d.formaPago}</b>
            </p>
          )}

          {d.vbAt ? (
            <p className="text-xs text-[#1E7F4F]">
              Dado el {fecha(d.vbAt)}
              {d.letrasEstado ? ` · ${ETIQUETA_LETRAS[d.letrasEstado]}${d.letrasCantidad ? ` (${d.letrasCantidad})` : ""}` : ""}
              {d.vbComision ? ` · comisión descontada ${d.moneda ?? ""} ${d.vbComision}` : ""}
              {d.vbNota ? ` · ${d.vbNota}` : ""}
            </p>
          ) : d.despachadoAt ? (
            <p className="text-xs text-destructive">
              El equipo salió el {fecha(d.despachadoAt)} sin su visto bueno
              {d.salidaAutorizadaMotivo ? ` (autorizado con código: ${d.salidaAutorizadaMotivo})` : ""}. Regístrelo igual para dejar dicho qué pasa con las letras.
            </p>
          ) : d.salidaAutorizadaAt ? (
            <p className="text-xs text-amber-800">
              Gerencia u operaciones autorizó la salida con su código el {fecha(d.salidaAutorizadaAt)}: {d.salidaAutorizadaMotivo}
            </p>
          ) : (
            <p className="text-xs text-destructive">
              <b>El equipo no sale</b> hasta que usted lo dé: sin esto no se emite la apertura, Contabilidad no autoriza la guía y el almacén no registra la salida.
            </p>
          )}

          {!d.vbAt && (
            <div className="space-y-2 rounded-lg border border-border bg-background p-3">
              <p className="text-[11px] font-semibold text-muted-foreground">1. ¿El adelanto acordado ya está acreditado? Confírmelo arriba con el abono, si falta.</p>
              <p className="text-[11px] font-semibold text-muted-foreground">2. Las letras</p>
              <div className="flex flex-wrap gap-1.5">
                {(["no_lleva", "van_con_el_equipo", "entregadas", "firmadas"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setLetras(k)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[11px] font-medium",
                      letras === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary",
                    )}
                  >
                    {ETIQUETA_LETRAS[k]}
                  </button>
                ))}
              </div>
              {letras !== "no_lleva" && (
                <label className="flex items-center gap-2 text-xs">
                  Cuántas letras
                  <input
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    inputMode="numeric"
                    className="w-16 rounded-md border border-border bg-background px-2 py-1 text-xs"
                  />
                </label>
              )}
              {letras === "van_con_el_equipo" && (
                <p className="text-[11px] text-muted-foreground">El almacén recibe el aviso de que las letras viajan con el equipo y tienen que volver firmadas.</p>
              )}
              <p className="text-[11px] font-semibold text-muted-foreground">3. Comisión interplaza o bancaria (si el banco descontó algo)</p>
              <input
                value={comision}
                onChange={(e) => setComision(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                placeholder={`Monto en ${d.moneda ?? "la moneda del pedido"} (opcional)`}
                className="w-56 rounded-md border border-border bg-background px-2 py-1 text-xs"
              />
              <textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                rows={2}
                placeholder={diceLetras && letras === "no_lleva" ? "La forma de pago dice letras: explique por qué no lleva" : "Nota (opcional): ej. letras a 30, 60 y 90 días; OC firmada recibida"}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
              />
              <button
                type="button"
                disabled={pendiente || (letras !== "no_lleva" && !cantidad)}
                onClick={() =>
                  correr(
                    () =>
                      darVistoBuenoSalida({
                        servicioId: d.servicioId,
                        letras,
                        letrasCantidad: cantidad ? Number(cantidad) : null,
                        comision: comision ? Number(comision) : null,
                        nota,
                      }),
                    "Visto bueno dado: el almacén y postventa ya recibieron el aviso",
                  )
                }
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
              >
                {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <BadgeCheck className="size-3.5" />}
                Dar el visto bueno para la salida
              </button>
            </div>
          )}
        </div>
      )}

      {letrasPendientes && (
        <div className="space-y-1.5 border-t border-border pt-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <FileSignature className="size-4 text-amber-600" />
            Letras por volver firmadas{d.letrasCantidad ? ` (${d.letrasCantidad})` : ""}
          </p>
          <p className="text-xs text-muted-foreground">{d.letrasEstado ? ETIQUETA_LETRAS[d.letrasEstado] : ""}. Márquelas cuando estén firmadas en sus manos.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={notaFirmadas}
              onChange={(e) => setNotaFirmadas(e.target.value)}
              placeholder="Nota (opcional): ej. volvieron con el chofer el 15-10"
              className="w-72 max-w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
            />
            <button
              type="button"
              disabled={pendiente}
              onClick={() => correr(() => marcarLetrasFirmadas(d.servicioId, notaFirmadas), "Letras marcadas como firmadas")}
              className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-[11px] font-semibold text-primary disabled:opacity-60"
            >
              {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <FileSignature className="size-3.5" />}
              Ya están firmadas
            </button>
          </div>
        </div>
      )}

      {sinComprobante && (
        <div className="space-y-1.5 border-t border-border pt-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Receipt className="size-4 text-amber-600" />
            La guía salió sin comprobante
          </p>
          <p className="text-xs text-muted-foreground">El comprobante se le entrega al cliente igual. Anote cuál se emitió.</p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={compTipo}
              onChange={(e) => setCompTipo(e.target.value as "factura" | "boleta")}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              <option value="factura">Factura</option>
              <option value="boleta">Boleta</option>
            </select>
            <input
              value={compNumero}
              onChange={(e) => setCompNumero(e.target.value)}
              placeholder="Número (ej. F001-00123)"
              className="w-44 rounded-md border border-border bg-background px-2 py-1 text-xs"
            />
            <button
              type="button"
              disabled={pendiente || !compNumero.trim()}
              onClick={() => correr(() => anotarComprobanteDeLaGuia(d.servicioId, compTipo, compNumero), "Comprobante anotado")}
              className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-[11px] font-semibold text-primary disabled:opacity-60"
            >
              {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Receipt className="size-3.5" />}
              Anotar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
