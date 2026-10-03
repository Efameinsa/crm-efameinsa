"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Truck } from "lucide-react";
import { registrarVisitaPlanta } from "@/lib/acciones/visitas-planta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * LA VISITA DE UN PROVEEDOR (0386; Lesly, 03-10 08:36: «almacén no tiene para
 * registrar la visita de proveedores a planta»).
 *
 * La visita de un cliente se anuncia desde su ficha (0238). El proveedor no
 * tiene ficha: el almacén lo anota acá con lo que vigilancia pide en la
 * puerta —empresa, RUC, quién viene con su DNI, acompañantes, para qué y
 * cuándo—. Central recibe el aviso y lo imprime, como con un cliente.
 */
export function VisitaProveedorBoton() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const vacio = { empresa: "", ruc: "", persona: "", dni: "", telefono: "", motivo: "", fecha: hoy, hora: "09:00" };
  const [f, setF] = useState(vacio);
  const [acompanantes, setAcompanantes] = useState<{ nombre: string; dni: string }[]>([]);
  const campo = (k: keyof typeof f) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value })) });
  const listo = f.empresa.trim().length >= 2 && f.persona.trim().length >= 3 && f.motivo.trim().length >= 3 && !!f.fecha;

  function enviar() {
    startTransition(async () => {
      const r = await registrarVisitaPlanta({ cuentaId: null, ...f, acompanantes, proveedor: true });
      if (r.error) return void toast.error(r.error, { duration: 8000 });
      toast.success(
        r.correoEnviado
          ? "Visita del proveedor registrada. Central tiene el aviso para vigilancia y salió el correo de siempre."
          : "Visita del proveedor registrada. Central ya tiene el aviso para imprimirlo a vigilancia.",
      );
      setAbierto(false);
      setF(vacio);
      setAcompanantes([]);
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Truck className="size-3.5" />
            Registrar visita de proveedor
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Visita de un proveedor a la planta</DialogTitle>
          <DialogDescription>
            Lo que vigilancia necesita en la puerta. Central recibe el aviso y lo imprime; el correo sale a Central, Contabilidad, Logística, Almacén y
            gerencia, como el de las visitas de clientes.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-[1fr_9rem] gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">
                Empresa proveedora <span className="text-destructive">*</span>
              </Label>
              <Input {...campo("empresa")} placeholder="ej. Distribuidora de repuestos S.A.C." autoFocus />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">RUC</Label>
              <Input {...campo("ruc")} inputMode="numeric" />
            </div>
          </div>
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">
                Quién viene <span className="text-destructive">*</span>
              </Label>
              <Input {...campo("persona")} placeholder="Nombre y apellido" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">DNI</Label>
              <Input {...campo("dni")} inputMode="numeric" />
            </div>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Teléfono de contacto</Label>
            <Input {...campo("telefono")} inputMode="tel" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">¿Viene acompañado? Nombre y DNI de cada uno (vigilancia los pide)</Label>
            {acompanantes.map((a, i) => (
              <div key={i} className="grid grid-cols-[1fr_8rem_auto] gap-1.5">
                <Input value={a.nombre} onChange={(e) => setAcompanantes((xs) => xs.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} placeholder="Nombre y apellido" />
                <Input value={a.dni} onChange={(e) => setAcompanantes((xs) => xs.map((x, j) => (j === i ? { ...x, dni: e.target.value } : x)))} placeholder="DNI" inputMode="numeric" />
                <button type="button" onClick={() => setAcompanantes((xs) => xs.filter((_, j) => j !== i))} className="text-xs text-muted-foreground hover:text-destructive">
                  Quitar
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setAcompanantes((xs) => [...xs, { nombre: "", dni: "" }])} className="justify-self-start text-xs font-medium text-primary hover:underline">
              + Acompañante
            </button>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">
              Para qué viene <span className="text-destructive">*</span>
            </Label>
            <Input {...campo("motivo")} placeholder="ej. entrega de mercadería, servicio técnico, recojo de material" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">
                Fecha <span className="text-destructive">*</span>
              </Label>
              <Input type="date" min={hoy} {...campo("fecha")} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Hora</Label>
              <Input type="time" {...campo("hora")} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={pendiente || !listo}>
            {pendiente && <Loader2 className="size-4 animate-spin" />}
            Registrar la visita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
