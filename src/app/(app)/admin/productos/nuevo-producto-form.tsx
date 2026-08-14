"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { crearProducto } from "@/lib/acciones/productos";
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

const TIERS_SEMI = [
  ["optimo", "Óptimo"],
  ["medio", "Medio"],
  ["deseado", "Deseado (piso)"],
] as const;

export function NuevoProductoForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [segmento, setSegmento] = useState<"industrial" | "semi_industrial">("semi_industrial");
  const [enviando, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const resultado = await crearProducto(formData);
      if (resultado.error) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Producto creado");
      formRef.current?.reset();
      setSegmento("semi_industrial");
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="marca">Marca</Label>
          <Input id="marca" name="marca" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="modelo">Modelo</Label>
          <Input id="modelo" name="modelo" required />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre</Label>
        <Input id="nombre" name="nombre" required />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="segmento">Segmento</Label>
          <Select
            name="segmento"
            value={segmento}
            onValueChange={(v) => setSegmento((v as typeof segmento) ?? "semi_industrial")}
            required
          >
            <SelectTrigger id="segmento" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semi_industrial">Semi-industrial</SelectItem>
              <SelectItem value="industrial">Industrial</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="categoria">Categoría</Label>
          <Input id="categoria" name="categoria" placeholder="Lavadora, secadora…" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="capacidad">Capacidad</Label>
          <Input id="capacidad" name="capacidad" placeholder="10.5 kg" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Precios</Label>
        {segmento === "semi_industrial" ? (
          <div className="grid grid-cols-3 gap-4">
            {TIERS_SEMI.map(([valor, etiqueta]) => (
              <div key={valor} className="space-y-1">
                <Label htmlFor={`precio_${valor}`} className="text-xs text-muted-foreground">
                  {etiqueta}
                </Label>
                <Input id={`precio_${valor}`} name={`precio_${valor}`} type="number" min="0" step="0.01" />
              </div>
            ))}
          </div>
        ) : (
          <div className="w-1/3 space-y-1">
            <Label htmlFor="precio_base" className="text-xs text-muted-foreground">
              Base
            </Label>
            <Input id="precio_base" name="precio_base" type="number" min="0" step="0.01" />
          </div>
        )}
      </div>

      <Button type="submit" disabled={enviando}>
        {enviando ? "Guardando…" : "Crear producto"}
      </Button>
    </form>
  );
}
