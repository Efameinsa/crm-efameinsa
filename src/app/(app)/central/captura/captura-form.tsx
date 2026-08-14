"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { buscarDuplicado, registrarContacto, type ResultadoDuplicado } from "@/lib/acciones/leads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CANALES = [
  ["whatsapp", "WhatsApp"],
  ["llamada", "Llamada"],
  ["formulario_web", "Formulario web"],
  ["facebook", "Facebook"],
  ["instagram", "Instagram"],
  ["email", "Correo"],
  ["presencial", "Presencial"],
  ["referido", "Referido"],
  ["otro", "Otro"],
] as const;

const AREAS = [
  ["comercial", "Comercial"],
  ["servicio_tecnico", "Servicio técnico"],
  ["postventa", "Postventa"],
  ["rrhh", "RR. HH."],
  ["proveedores", "Proveedores"],
  ["administracion", "Administración"],
  ["otros", "Otros"],
] as const;

let temporizadorBusqueda: ReturnType<typeof setTimeout> | null = null;

export function CapturaForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [area, setArea] = useState<string>("comercial");
  const [duplicado, setDuplicado] = useState<ResultadoDuplicado | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [enviando, startTransition] = useTransition();

  function campo(nombre: string): string {
    return (formRef.current?.elements.namedItem(nombre) as HTMLInputElement | null)?.value ?? "";
  }

  function onCambioContacto(telefono: string, numDoc: string) {
    if (temporizadorBusqueda) clearTimeout(temporizadorBusqueda);
    if (!telefono && !numDoc) {
      setDuplicado(null);
      return;
    }
    temporizadorBusqueda = setTimeout(async () => {
      setBuscando(true);
      const resultado = await buscarDuplicado({ telefono, numDoc });
      setDuplicado(resultado);
      setBuscando(false);
    }, 400);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const resultado = await registrarContacto(formData);
      if (resultado.error) {
        toast.error(resultado.error);
        return;
      }
      toast.success(
        area === "comercial"
          ? `Registrado ${resultado.codigo} — pasa a la bandeja de asignación.`
          : `Registrado ${resultado.codigo} — derivado al área correspondiente.`,
      );
      formRef.current?.reset();
      setArea("comercial");
      setDuplicado(null);
      formRef.current?.querySelector<HTMLInputElement>("#nombre_contacto")?.focus();
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4 max-w-xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="canal">Canal</Label>
          <Select name="canal" defaultValue="whatsapp" required>
            <SelectTrigger id="canal" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CANALES.map(([valor, etiqueta]) => (
                <SelectItem key={valor} value={valor}>
                  {etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="area_destino">Área destino</Label>
          <Select
            name="area_destino"
            value={area}
            onValueChange={(valor) => setArea(valor ?? "comercial")}
            required
          >
            <SelectTrigger id="area_destino" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AREAS.map(([valor, etiqueta]) => (
                <SelectItem key={valor} value={valor}>
                  {etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="nombre_contacto">Nombre del contacto</Label>
        <Input id="nombre_contacto" name="nombre_contacto" required autoFocus />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="telefono">Teléfono</Label>
          <Input
            id="telefono"
            name="telefono"
            onChange={(e) => onCambioContacto(e.target.value, campo("num_doc"))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="num_doc">RUC / DNI</Label>
          <Input
            id="num_doc"
            name="num_doc"
            onChange={(e) => onCambioContacto(campo("telefono"), e.target.value)}
          />
        </div>
      </div>

      {buscando && <p className="text-xs text-muted-foreground">Buscando coincidencias…</p>}

      {duplicado?.cuenta && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <p className="font-medium text-primary">Cliente existente: {duplicado.cuenta.razon_social}</p>
          <p className="text-muted-foreground">
            Cartera de:{" "}
            {duplicado.cuenta.comercial_nombre ?? "sin comercial asignado actualmente"}
          </p>
        </div>
      )}

      {duplicado?.leadPendiente && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Ya hay un contacto pendiente de asignar con estos mismos datos: {duplicado.leadPendiente.codigo}{" "}
          (recibido el {new Date(duplicado.leadPendiente.recibido_at).toLocaleString("es-PE")}).
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="razon_social">Razón social / empresa (si aplica)</Label>
        <Input id="razon_social" name="razon_social" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Correo</Label>
        <Input id="email" name="email" type="email" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="mensaje">Mensaje / consulta</Label>
        <Textarea id="mensaje" name="mensaje" rows={3} />
      </div>

      <Button type="submit" disabled={enviando}>
        {enviando ? "Registrando…" : "Registrar"}
      </Button>
    </form>
  );
}
