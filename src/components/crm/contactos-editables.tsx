"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, MapPin, Phone, Pencil, Plus, Trash2, User, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { eliminarContacto, guardarContacto } from "@/lib/acciones/contactos";
import { nombrePropio } from "@/lib/texto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ContactoEditable {
  id: string;
  nombre: string;
  cargo: string | null;
  telefono: string | null;
  email: string | null;
  documento: string | null;
  direccion: string | null;
  es_principal: boolean;
}

const VACIO = {
  nombre: "",
  cargo: "",
  telefono: "",
  email: "",
  documento: "",
  direccion: "",
  esPrincipal: false,
};
type Campos = typeof VACIO;

/**
 * Contactos del cliente, editables en el sitio.
 *
 * Es lo que se imprime en la cotización: el "Atención:", el teléfono, el
 * correo y la dirección salen del contacto marcado como principal — la
 * dirección se sumó el 26-08, porque un mismo cliente puede tener varias
 * sedes y cada una debería llevar la dirección de a quién se le está
 * cotizando, no una sola dirección fija por cliente. Hasta el 24-08 nada de
 * esto se podía corregir, y casi todos los nombres vienen del histórico
 * escritos enteros en MAYÚSCULAS — por eso el botón de la varita, que los pasa
 * a "Primera Letra Mayúscula" de una vez.
 *
 * Cambiar esto NO altera una cotización ya emitida: esa se congeló con los
 * datos del día en que se creó.
 */
export function ContactosEditables({
  cuentaId,
  contactos,
}: {
  cuentaId: string;
  contactos: ContactoEditable[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<string | null>(null);
  const [campos, setCampos] = useState<Campos>(VACIO);
  const [guardando, startTransition] = useTransition();

  function abrir(c: ContactoEditable | null) {
    if (c) {
      setEditando(c.id);
      setCampos({
        nombre: c.nombre,
        cargo: c.cargo ?? "",
        telefono: c.telefono ?? "",
        email: c.email ?? "",
        documento: c.documento ?? "",
        direccion: c.direccion ?? "",
        esPrincipal: c.es_principal,
      });
    } else {
      setEditando("nuevo");
      // El primero que se agrega a un cliente sin contactos es el principal.
      setCampos({ ...VACIO, esPrincipal: contactos.length === 0 });
    }
  }

  function guardar() {
    startTransition(async () => {
      const r = await guardarContacto({
        contactoId: editando === "nuevo" ? undefined : (editando ?? undefined),
        cuentaId,
        ...campos,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(editando === "nuevo" ? "Contacto agregado" : "Contacto actualizado");
      setEditando(null);
      router.refresh();
    });
  }

  function borrar(c: ContactoEditable) {
    if (!confirm(`¿Borrar a ${c.nombre}?`)) return;
    startTransition(async () => {
      const r = await eliminarContacto({ contactoId: c.id, cuentaId });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Contacto borrado");
        router.refresh();
      }
    });
  }

  const formulario = (
    <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <div className="space-y-1.5">
        <Label htmlFor="c-nombre" className="text-xs">
          Nombre
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="c-nombre"
            value={campos.nombre}
            onChange={(e) => setCampos({ ...campos, nombre: e.target.value })}
            placeholder="Juan Pérez Gonzales"
          />
          {/* Casi todo el histórico vino en MAYÚSCULAS y así se imprimía en la
              cotización. Un clic lo arregla; igual queda editable a mano. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Pasar de MAYÚSCULAS a Primera Letra Mayúscula"
            onClick={() => setCampos({ ...campos, nombre: nombrePropio(campos.nombre) })}
          >
            <WandSparkles className="size-3.5" />
            Aa
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="c-cargo" className="text-xs">
            Cargo
          </Label>
          <Input
            id="c-cargo"
            value={campos.cargo}
            onChange={(e) => setCampos({ ...campos, cargo: e.target.value })}
            placeholder="Jefe de mantenimiento"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-telefono" className="text-xs">
            Teléfono
          </Label>
          <Input
            id="c-telefono"
            value={campos.telefono}
            onChange={(e) => setCampos({ ...campos, telefono: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="c-email" className="text-xs">
            Correo
          </Label>
          <Input
            id="c-email"
            type="email"
            value={campos.email}
            onChange={(e) => setCampos({ ...campos, email: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-documento" className="text-xs">
            DNI / CE
          </Label>
          <Input
            id="c-documento"
            value={campos.documento}
            onChange={(e) => setCampos({ ...campos, documento: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="c-direccion" className="text-xs">
          Dirección
        </Label>
        <Input
          id="c-direccion"
          value={campos.direccion}
          onChange={(e) => setCampos({ ...campos, direccion: e.target.value })}
          placeholder="Dirección física de este contacto"
        />
        <p className="text-[11px] text-muted-foreground">
          Se imprime en la cotización y el informe de cierre solo si este es el contacto principal.
        </p>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
        <input
          type="checkbox"
          checked={campos.esPrincipal}
          onChange={(e) => setCampos({ ...campos, esPrincipal: e.target.checked })}
          className="size-3.5 accent-primary"
        />
        Es el contacto principal — su nombre, teléfono, correo y dirección son los que salen en la
        cotización
      </label>

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={guardando} onClick={guardar}>
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
        <Button size="sm" variant="ghost" disabled={guardando} onClick={() => setEditando(null)}>
          Cancelar
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {contactos.length === 0 && editando !== "nuevo" && (
        <p className="text-sm text-muted-foreground">Sin contactos registrados.</p>
      )}

      {contactos.map((c) =>
        editando === c.id ? (
          <div key={c.id}>{formulario}</div>
        ) : (
          <div key={c.id} className="rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-foreground">
                  <User className="size-3.5 shrink-0 text-muted-foreground" />
                  {c.nombre}
                  {c.es_principal && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      Principal · sale en la cotización
                    </span>
                  )}
                </p>
                {c.cargo && <p className="text-xs text-muted-foreground">{c.cargo}</p>}
                <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                  {c.telefono && (
                    <p className="flex items-center gap-1">
                      <Phone className="size-3.5" />
                      {c.telefono}
                    </p>
                  )}
                  {c.email && (
                    <p className="flex items-center gap-1">
                      <Mail className="size-3.5" />
                      {c.email}
                    </p>
                  )}
                  {c.documento && <p>DNI/CE: {c.documento}</p>}
                  {c.direccion && (
                    <p className="flex items-center gap-1">
                      <MapPin className="size-3.5" />
                      {c.direccion}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="ghost" disabled={guardando} onClick={() => abrir(c)}>
                  <Pencil className="size-3.5" />
                  Corregir
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={guardando}
                  onClick={() => borrar(c)}
                  aria-label={`Borrar a ${c.nombre}`}
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          </div>
        ),
      )}

      {editando === "nuevo" ? (
        formulario
      ) : (
        <Button size="sm" variant="outline" disabled={guardando} onClick={() => abrir(null)}>
          <Plus className="size-3.5" />
          Agregar contacto
        </Button>
      )}
    </div>
  );
}
