"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheckBig, Copy, FileDown, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { duplicarCotizacion, eliminarCotizacion, registrarVenta } from "@/lib/acciones/cotizaciones";
import { CampoCodigo } from "@/components/crm/campo-codigo";
import { fechaHoraLima } from "@/lib/fechas";
import { Button } from "@/components/ui/button";
import { CorregirCotizacionBoton } from "@/components/crm/corregir-cotizacion-boton";
import { cn } from "@/lib/utils";

/**
 * Las cotizaciones del cliente, en la columna derecha de la oportunidad.
 *
 * POR QUÉ ES COMPACTA (27-08). Antes esta lista y el formulario del cotizador
 * compartían un mismo panel en la columna ancha: cuantas más cotizaciones tenía
 * el cliente, más abajo empezaba el formulario. Se separaron los dos oficios —
 * CONSULTAR lo que ya existe (acá) y PRODUCIR el documento (la pantalla
 * `/cotizar`)—, así que esta lista solo necesita decir, de un vistazo: cuánto,
 * en qué estado, y qué sigue.
 *
 * Cada tarjeta lleva UNA acción principal (la que corresponde a su estado) y el
 * resto como enlaces chicos. En 340 px una fila de cinco botones se rompía.
 */

export interface CotizacionResumen {
  id: string;
  codigo: string | null;
  serie: string;
  estado: string;
  estado_aprobacion: string;
  total: number;
  moneda: string;
  nota_gerencia: string | null;
  created_at: string;
  enviada_at: string | null;
}

const ESTADO_APROBACION: Record<string, { etiqueta: string; clases: string }> = {
  auto_aprobada: { etiqueta: "Aprobada", clases: "bg-[#1E7F4F]/10 text-[#1E7F4F]" },
  pendiente_gerencia: { etiqueta: "Espera a gerencia", clases: "bg-amber-500/10 text-amber-700" },
  aprobada_gerencia: { etiqueta: "Aprobada por gerencia", clases: "bg-[#1E7F4F]/10 text-[#1E7F4F]" },
  rechazada_gerencia: { etiqueta: "Rechazada", clases: "bg-destructive/10 text-destructive" },
};

const ESTADO_ENVIO: Record<string, string> = {
  borrador: "Borrador",
  enviada: "Confirmada",
  aceptada: "Aceptada",
  perdida: "Perdida",
  vencida: "Vencida",
};

export function ListaCotizaciones({
  cotizaciones,
  oportunidadId,
}: {
  cotizaciones: CotizacionResumen[];
  oportunidadId: string;
}) {
  const router = useRouter();
  const [ocupado, startTransition] = useTransition();
  // El código de supervisor que pide el servidor cuando quien borra es
  // postventa (reunión 07-09, punto 2.5). Guarda de qué cotización se trata:
  // el cuadro se abre en esa fila y no en todas.
  const [pidePin, setPidePin] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const rutaCotizar = `/comercial/oportunidades/${oportunidadId}/cotizar`;

  function onRegistrarVenta(id: string) {
    if (!confirm("¿Confirmar la venta con esta cotización?")) return;
    startTransition(async () => {
      const r = await registrarVenta(id);
      if (r.error) toast.error(r.error);
      else {
        // La cifra de la venta salió del informe de cierre y no de la
        // cotización (0148): se le dice ahora, con el número del informe.
        if (r.aviso) toast.warning("Venta registrada por lo que dice el informe de cierre", { description: r.aviso, duration: 12000 });
        else toast.success("Venta registrada");
        router.refresh();
      }
    });
  }

  // El servidor decide quién necesita código; acá no se adivina el rol.
  function borrar(c: CotizacionResumen, pin?: string) {
    startTransition(async () => {
      const r = await eliminarCotizacion(c.id, pin);
      if (r.pidePin) {
        setPidePin(c.id);
        setCodigo("");
        if (pin) toast.error(r.error ?? "Ese código no sirve");
        return;
      }
      if (r.error) toast.error(r.error);
      else {
        setPidePin(null);
        setCodigo("");
        toast.success("Borrador eliminado");
        router.refresh();
      }
    });
  }

  function onBorrar(c: CotizacionResumen) {
    // La base tampoco lo permite (migración 0065), pero conviene no ofrecer un
    // botón que va a fallar.
    if (c.estado !== "borrador" || c.codigo) return;
    if (
      !confirm(
        `¿Borrar este borrador del ${fechaHoraLima(c.created_at)}? No tiene número asignado, así que no deja hueco en la serie.`,
      )
    ) {
      return;
    }
    borrar(c);
  }

  function onDuplicar(id: string) {
    startTransition(async () => {
      const r = await duplicarCotizacion(id);
      if (r.error) toast.error(r.error);
      else {
        toast.success(
          `Copia de ${r.codigoViejo ?? "la cotización"} creada como borrador — recibe su número al confirmarla`,
        );
        router.refresh();
      }
    });
  }

  const enPin = pidePin ? cotizaciones.find((c) => c.id === pidePin) : null;

  return (
    <div className="space-y-3">
      {/* El código rotativo de gerencia, cuando el servidor lo pide (07-09,
          punto 2.5). Se anuncia el largo ANTES de escribir, no al fallar. */}
      {enPin && (
        <div className="rounded-lg border border-[var(--efameinsa-granate)]/40 bg-[var(--efameinsa-granate)]/5 p-3">
          <p className="text-sm font-semibold text-foreground">
            Para borrar este borrador hace falta el código de un supervisor
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Son 4 dígitos y los da gerencia. Se borra el borrador del {fechaHoraLima(enPin.created_at)}.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <CampoCodigo valor={codigo} onChange={setCodigo} autoFocus />
            <Button size="sm" disabled={codigo.length < 4 || ocupado} onClick={() => borrar(enPin, codigo)}>
              Borrar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={ocupado}
              onClick={() => {
                setPidePin(null);
                setCodigo("");
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
      <Button
        size="lg"
        className="w-full"
        render={
          <Link href={rutaCotizar}>
            <Plus className="size-4" />
            Nueva cotización
          </Link>
        }
      />

      {cotizaciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay cotizaciones.</p>
      ) : (
        cotizaciones.map((c, i) => {
          const puedeVender =
            c.estado === "enviada" &&
            (c.estado_aprobacion === "auto_aprobada" || c.estado_aprobacion === "aprobada_gerencia");
          const esBorrador = c.estado === "borrador";
          const esBorradorSinNumero = esBorrador && !c.codigo;
          const aprobacion = ESTADO_APROBACION[c.estado_aprobacion];
          // La lista viene de más nueva a más vieja. Katerine (C5) tenía varios
          // borradores del mismo cliente y no sabía cuál era el último.
          const esUltima = i === 0 && cotizaciones.length > 1;

          return (
            <div
              key={c.id}
              className={cn(
                "rounded-lg border p-3",
                puedeVender ? "border-[#1E7F4F]/40 bg-[#1E7F4F]/5" : "border-border bg-background",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                {/* Un borrador todavía no gastó número: el correlativo se asigna
                    al confirmarla (migración 0064). «Sin número» a secas se leía
                    como que algo falló —Katerine rehízo una cotización creyendo
                    que no se había guardado—, así que dice qué falta. */}
                <span
                  className={cn(
                    "font-mono text-xs font-semibold",
                    c.codigo ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {c.codigo ?? "Recibe número al confirmar"}
                </span>
                <span
                  className={cn(
                    "flex-none rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    esBorrador ? "bg-secondary text-muted-foreground" : aprobacion.clases,
                  )}
                >
                  {ESTADO_ENVIO[c.estado] ?? c.estado}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="text-base font-bold tabular-nums text-foreground">
                  {c.moneda} {c.total.toLocaleString("es-PE")}
                </span>
                <span className="text-[11px] text-muted-foreground">{c.serie}</span>
              </div>

              {/* "Aprobada · Borrador" se leía como una contradicción. Son dos
                  ejes: la aprobación del precio y el envío. El sello de
                  aprobación solo aparece cuando informa algo —espera, rechazo o
                  visto bueno a mano de gerencia—; la auto-aprobada no dice nada. */}
              {c.estado_aprobacion !== "auto_aprobada" && (
                <span
                  className={cn(
                    "mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    aprobacion.clases,
                  )}
                >
                  {aprobacion.etiqueta}
                </span>
              )}

              <p className="mt-1 text-[11px] text-muted-foreground">
                {fechaHoraLima(c.created_at)}
                {c.enviada_at ? ` · confirmada ${fechaHoraLima(c.enviada_at)}` : ""}
                {esUltima ? " · la más reciente" : ""}
              </p>

              {c.nota_gerencia && (
                <p className="mt-2 rounded-md bg-secondary px-2 py-1.5 text-[11px] text-muted-foreground">
                  &ldquo;{c.nota_gerencia}&rdquo;
                </p>
              )}

              {/* La acción que toca según el estado, una sola y bien visible. */}
              {puedeVender && (
                <Button
                  size="sm"
                  className="mt-2 w-full bg-[#1E7F4F] hover:bg-[#1E7F4F]/90"
                  disabled={ocupado}
                  onClick={() => onRegistrarVenta(c.id)}
                >
                  <CircleCheckBig className="size-3.5" />
                  Registrar venta
                </Button>
              )}
              {/* Un borrador se EDITA, sin código: el código es para lo que ya
                  tiene número (Santos, 03-09). Decía «Continuar y confirmar» y
                  no se leía como editar. */}
              {esBorrador && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full"
                  render={
                    <Link href={`${rutaCotizar}/${c.id}`}>
                      <Pencil className="size-3.5" />
                      Editar y confirmar
                    </Link>
                  }
                />
              )}

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                <a
                  href={`/api/cotizaciones/${c.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  <FileDown className="size-3" />
                  Ver PDF
                </a>
                {/* Duplicar NO se ofrece en un borrador: duplicar existe para
                    versionar un documento que ya está cerrado —una cotización
                    confirmada no se toca, se copia (regla de gerencia de
                    siempre, migración 0062)—. Un borrador todavía se edita, así
                    que copiarlo solo deja dos borradores casi iguales del mismo
                    cliente, que es justo el lío que reportó Katerine el 24-08. */}
                {!esBorrador && (
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => onDuplicar(c.id)}
                    className="inline-flex items-center gap-1 text-muted-foreground hover:underline"
                  >
                    <Copy className="size-3" />
                    Duplicar
                  </button>
                )}
                {/* Corregir conservando el número: para cuando duplicar NO
                    sirve porque el número ya salió al banco (migración 0123).
                    Va acá, junto a «Duplicar», porque es la misma decisión
                    tomada al revés y conviene verlas juntas. */}
                {!esBorrador && (
                  <CorregirCotizacionBoton
                    cotizacionId={c.id}
                    codigo={c.codigo}
                    volverHref={`/comercial/oportunidades/${oportunidadId}`}
                    variante="enlace"
                  />
                )}
                {/* Solo un borrador SIN número: uno que ya tiene número
                    comprometió su correlativo con contabilidad, y una enviada la
                    tiene el cliente. La base lo impide igual (migración 0065). */}
                {esBorradorSinNumero && (
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => onBorrar(c)}
                    className="ml-auto inline-flex items-center gap-1 text-destructive hover:underline"
                  >
                    <Trash2 className="size-3" />
                    Borrar
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
