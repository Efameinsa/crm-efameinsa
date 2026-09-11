"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserRoundPen } from "lucide-react";
import { corregirDatosLead } from "@/lib/acciones/leads";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * CORREGIR LOS DATOS DEL CONTACTO sin salir de la bandeja.
 *
 * Central, reunión de gerencia del 11-09: «quería poder editar, por ejemplo,
 * de un prospecto su nombre. Solamente la parte del nombre, no la
 * descripción» — registró a alguien de Topitop y en el nombre puso «Topitop»
 * donde iba «Carlos». Y del teléfono: «no te permite corregir, solamente
 * descripción». Hasta hoy lo único editable desde acá era «qué solicita».
 *
 * Misma regla que ese botón (0199/0224): sin código —son los datos con los
 * que se atiende, no con los que se audita— y sin borrar lo que entró, que
 * queda guardado y a la vista debajo de la tarjeta. Solo mientras el contacto
 * está en la bandeja: derivado, la ficha del cliente ya nació con esos datos
 * y es del comercial.
 */
export function EditarDatosLeadBoton({
  leadId,
  nombre,
  razonSocial,
  telefono,
  email,
  numDoc,
}: {
  leadId: string;
  nombre: string | null;
  razonSocial: string | null;
  telefono: string | null;
  email: string | null;
  numDoc: string | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [enviando, startTransition] = useTransition();
  const inicial = {
    nombre: nombre ?? "",
    razonSocial: razonSocial ?? "",
    telefono: telefono ?? "",
    email: email ?? "",
    numDoc: numDoc ?? "",
  };
  const [d, setD] = useState(inicial);

  const cambio = (Object.keys(inicial) as (keyof typeof inicial)[]).some((k) => d[k].trim() !== inicial[k].trim());
  const listo = d.nombre.trim().length >= 2 && cambio;

  function abrir(v: boolean) {
    setAbierto(v);
    if (v) setD(inicial);
  }

  function guardar() {
    if (!listo) return;
    startTransition(async () => {
      const r = await corregirDatosLead(leadId, d);
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      toast.success("Datos corregidos. Lo que entró queda guardado debajo.");
      setAbierto(false);
      router.refresh();
    });
  }

  const campo = (k: keyof typeof inicial) => ({
    value: d[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value }),
  });

  return (
    <Dialog open={abierto} onOpenChange={abrir}>
      <DialogTrigger
        render={
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs">
            <UserRoundPen className="size-3.5" />
            Corregir los datos
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Datos del contacto</DialogTitle>
          <DialogDescription>
            Con esto se deriva y nace la ficha del cliente. Lo que entró no se borra: queda guardado debajo de la
            tarjeta.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ed-nombre">Persona que se contactó</Label>
            <Input id="ed-nombre" placeholder="ej.: Carlos Quispe" {...campo("nombre")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ed-razon">Empresa o razón social</Label>
            <Input id="ed-razon" placeholder="ej.: TOPITOP S.A." {...campo("razonSocial")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-tel">Teléfono</Label>
            <Input id="ed-tel" inputMode="tel" placeholder="ej.: 987 654 321" {...campo("telefono")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-doc">RUC o DNI</Label>
            <Input id="ed-doc" inputMode="numeric" placeholder="11 u 8 dígitos, o vacío" {...campo("numDoc")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ed-email">Correo</Label>
            <Input id="ed-email" type="email" placeholder="ej.: compras@empresa.pe" {...campo("email")} />
          </div>
        </div>

        <DialogFooter className="sm:flex-col sm:items-stretch sm:gap-2">
          {!listo && (
            <p className="text-[11px] text-muted-foreground">
              {d.nombre.trim().length < 2 ? "El nombre de la persona es obligatorio." : "Todavía no cambió nada."}
            </p>
          )}
          <Button onClick={guardar} disabled={!listo || enviando}>
            {enviando ? "Guardando…" : "Guardar los datos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
