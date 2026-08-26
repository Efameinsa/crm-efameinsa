"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, MapPin, Pencil, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { actualizarIdentidadCuenta } from "@/lib/acciones/cuentas";
import { errorDocumento, type TipoDocumento } from "@/lib/documento";
import { nombrePropio } from "@/lib/texto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TIPOS: [TipoDocumento, string][] = [
  ["RUC", "RUC"],
  ["DNI", "DNI"],
  ["CE", "Carné de extranjería"],
  ["SIN_DOC", "Todavía sin documento"],
];

/**
 * El RUC, la razón social y la dirección del cliente, editables.
 *
 * Es lo que la cotización y el informe de cierre imprimen en el bloque del
 * cliente, y lo que contabilidad necesita para que cotización, orden de
 * compra, guía y factura cuadren. Un tercio de las cuentas está sin documento
 * porque el contacto entra por la web con el nombre de una persona y nada
 * más; el RUC aparece después, hablando, y hasta el 24-08 no había dónde
 * anotarlo. La dirección se sumó el 26-08: ya viajaba a los documentos, pero
 * no había forma de corregirla.
 *
 * El RUC se valida con el módulo 11 de SUNAT antes de guardarlo: un dígito
 * cambiado no lo nota nadie hasta que rebota el expediente.
 */
export function IdentidadCuenta({
  cuentaId,
  tipoDoc,
  numDoc,
  razonSocial,
  direccion,
}: {
  cuentaId: string;
  tipoDoc: TipoDocumento;
  numDoc: string | null;
  razonSocial: string;
  direccion: string | null;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [campos, setCampos] = useState({
    tipoDoc,
    numDoc: numDoc ?? "",
    razonSocial,
    direccion: direccion ?? "",
  });
  const [guardando, startTransition] = useTransition();

  const problema = editando ? errorDocumento(campos.tipoDoc, campos.numDoc) : null;

  function abrir() {
    setCampos({ tipoDoc, numDoc: numDoc ?? "", razonSocial, direccion: direccion ?? "" });
    setEditando(true);
  }

  function guardar() {
    startTransition(async () => {
      const r = await actualizarIdentidadCuenta({ cuentaId, ...campos });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Datos del cliente actualizados");
      // El duplicado no impide guardar, pero tiene que verse: son dos fichas
      // del mismo cliente y alguien debe unirlas.
      if (r.avisoDuplicado) toast.warning(r.avisoDuplicado, { duration: 12000 });
      setEditando(false);
      router.refresh();
    });
  }

  if (!editando) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{razonSocial}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <FileText className="size-3.5" />
            {tipoDoc === "SIN_DOC" ? (
              <span className="font-medium text-amber-700">
                Sin documento — la cotización sale sin RUC
              </span>
            ) : (
              `${tipoDoc}: ${numDoc}`
            )}
          </p>
          {direccion && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3.5" />
              {direccion}
            </p>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={abrir}>
          <Pencil className="size-3.5" />
          {tipoDoc === "SIN_DOC" ? "Vincular RUC" : "Corregir"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <div className="space-y-1.5">
        <Label htmlFor="ic-razon" className="text-xs">
          Razón social
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="ic-razon"
            value={campos.razonSocial}
            onChange={(e) => setCampos({ ...campos, razonSocial: e.target.value })}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Pasar de MAYÚSCULAS a Primera Letra Mayúscula"
            onClick={() => setCampos({ ...campos, razonSocial: nombrePropio(campos.razonSocial) })}
          >
            Aa
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Escríbala como debe salir en la factura. Se imprime en la cotización y en el informe de
          cierre.
        </p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ic-tipo" className="text-xs">
            Documento
          </Label>
          <Select
            value={campos.tipoDoc}
            onValueChange={(v) =>
              setCampos({ ...campos, tipoDoc: (typeof v === "string" ? v : "SIN_DOC") as TipoDocumento })
            }
          >
            <SelectTrigger id="ic-tipo" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS.map(([v, t]) => (
                <SelectItem key={v} value={v}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ic-num" className="text-xs">
            Número
          </Label>
          <Input
            id="ic-num"
            value={campos.numDoc}
            inputMode="numeric"
            disabled={campos.tipoDoc === "SIN_DOC"}
            onChange={(e) => setCampos({ ...campos, numDoc: e.target.value })}
            placeholder={campos.tipoDoc === "RUC" ? "20552956461" : ""}
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        El tipo y número de documento también se imprimen en la cotización, sin RUC/DNI si queda
        «Todavía sin documento».
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="ic-direccion" className="text-xs">
          Dirección
        </Label>
        <Input
          id="ic-direccion"
          value={campos.direccion}
          onChange={(e) => setCampos({ ...campos, direccion: e.target.value })}
          placeholder="Dirección física del cliente"
        />
        <p className="text-[11px] text-muted-foreground">
          Se imprime en la cotización y en el informe de cierre. Si queda vacía, esos documentos
          salen sin dirección.
        </p>
      </div>

      {problema && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
          <TriangleAlert className="size-3.5" />
          {problema}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={guardando || problema !== null} onClick={guardar}>
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
        <Button size="sm" variant="ghost" disabled={guardando} onClick={() => setEditando(false)}>
          Cancelar
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Las cotizaciones ya enviadas no cambian: cada una guardó los datos del día en que se emitió.
      </p>
    </div>
  );
}
