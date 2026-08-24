"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { crearProducto } from "@/lib/acciones/productos";
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

const TIERS_SEMI = [
  ["optimo", "Óptimo"],
  ["medio", "Medio"],
  ["deseado", "Deseado (piso)"],
] as const;

export interface ProductoPlantilla {
  id: string;
  etiqueta: string;
  segmento: "industrial" | "semi_industrial";
  categoria: string | null;
  capacidad: string | null;
  caracteristicas: string[];
  dimensiones: string[];
  medidas: string[];
  calentamiento: string | null;
  panel: string | null;
  controles: string | null;
}

/**
 * Alta de un equipo con su ficha técnica, copiando la de uno parecido.
 *
 * Es lo que acordó el ing. Carlos el 24-08 en reemplazo del equipo escrito a
 * mano dentro de la cotización: «el administrador lo crea copiando la ficha de
 * uno similar». El equipo entra UNA vez al catálogo y desde ahí lo cotiza
 * cualquiera, así la descripción que recibe el cliente es siempre la misma y el
 * expediente de contabilidad cuadra.
 *
 * Las listas van una viñeta por línea porque así se pegan desde el .docx de
 * Lesly sin tener que reformatear nada.
 */
export function NuevoProductoForm({ plantillas }: { plantillas: ProductoPlantilla[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [segmento, setSegmento] = useState<"industrial" | "semi_industrial">("semi_industrial");
  const [ficha, setFicha] = useState({
    caracteristicas: "",
    dimensiones: "",
    medidas: "",
    calentamiento: "",
    panel: "",
    controles: "",
  });
  const [copiadaDe, setCopiadaDe] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  function copiarFicha(id: string | null) {
    const p = plantillas.find((x) => x.id === id);
    if (!p) return;
    setFicha({
      caracteristicas: p.caracteristicas.join("\n"),
      dimensiones: p.dimensiones.join("\n"),
      medidas: p.medidas.join("\n"),
      calentamiento: p.calentamiento ?? "",
      panel: p.panel ?? "",
      controles: p.controles ?? "",
    });
    setSegmento(p.segmento);
    setCopiadaDe(p.etiqueta);
    toast.success(`Ficha copiada de ${p.etiqueta} — corrija lo que cambie`);
  }

  function limpiar() {
    formRef.current?.reset();
    setSegmento("semi_industrial");
    setFicha({ caracteristicas: "", dimensiones: "", medidas: "", calentamiento: "", panel: "", controles: "" });
    setCopiadaDe(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const resultado = await crearProducto(formData);
      if (resultado.error) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Equipo creado — ya se puede cotizar");
      limpiar();
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <div className="rounded-lg border border-dashed border-border p-3">
        <Label htmlFor="plantilla">Copiar la ficha de un equipo parecido</Label>
        <div className="mt-2 flex items-center gap-3">
          <Select name="plantilla" onValueChange={(v) => copiarFicha(typeof v === "string" ? v : null)}>
            <SelectTrigger id="plantilla" className="w-full max-w-md">
              <SelectValue placeholder="Elija el equipo del que copiar…" />
            </SelectTrigger>
            <SelectContent>
              {plantillas.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {copiadaDe && <span className="text-xs text-muted-foreground">copiada de {copiadaDe}</span>}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Trae características, dimensiones y medidas para que solo haya que corregir lo que cambia. También se
          puede pegar directo desde la ficha en Word: una viñeta por línea.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="marca">Marca</Label>
          <Input id="marca" name="marca" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="modelo">Modelo</Label>
          <Input id="modelo" name="modelo" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sku">Código / SKU</Label>
          <Input id="sku" name="sku" placeholder="SECFDEE" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre</Label>
        <Input id="nombre" name="nombre" required placeholder="SECADORA ELECTRICA FDE SEMI INDUSTRIAL 10.2 kg" />
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
          <Input id="categoria" name="categoria" placeholder="lavadora, secadora…" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="capacidad">Capacidad</Label>
          <Input id="capacidad" name="capacidad" placeholder="10.5 kg" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="calentamiento">Calentamiento</Label>
          <Input
            id="calentamiento"
            name="calentamiento"
            value={ficha.calentamiento}
            onChange={(e) => setFicha({ ...ficha, calentamiento: e.target.value })}
            placeholder="ELÉCTRICO, GAS, VAPOR"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="panel">Panel</Label>
          <Input
            id="panel"
            name="panel"
            value={ficha.panel}
            onChange={(e) => setFicha({ ...ficha, panel: e.target.value })}
            placeholder="HEC ELECTRONIC"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="controles">Controles</Label>
          <Input
            id="controles"
            name="controles"
            value={ficha.controles}
            onChange={(e) => setFicha({ ...ficha, controles: e.target.value })}
            placeholder="220V/60Hz/1Ph"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="caracteristicas">Características (una por línea)</Label>
        <Textarea
          id="caracteristicas"
          name="caracteristicas"
          rows={8}
          value={ficha.caracteristicas}
          onChange={(e) => setFicha({ ...ficha, caracteristicas: e.target.value })}
          placeholder={"Tambor galvanizado de gran capacidad\nControl electrónico programable\n…"}
        />
        <p className="text-xs text-muted-foreground">
          Es lo que se imprime en la hoja técnica de la cotización. Sin esto, el cliente recibe esa hoja en blanco.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dimensiones">Dimensiones de la máquina (una por línea)</Label>
          <Textarea
            id="dimensiones"
            name="dimensiones"
            rows={5}
            value={ficha.dimensiones}
            onChange={(e) => setFicha({ ...ficha, dimensiones: e.target.value })}
            placeholder={"Volumen del tambor: 207 litros\nVelocidad de centrifugado: 900 rpm"}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="medidas">Medidas generales (una por línea)</Label>
          <Textarea
            id="medidas"
            name="medidas"
            rows={5}
            value={ficha.medidas}
            onChange={(e) => setFicha({ ...ficha, medidas: e.target.value })}
            placeholder={"Ancho: 686 mm\nAlto: 1225 mm\nFondo: 750 mm"}
          />
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

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={enviando}>
          {enviando ? "Guardando…" : "Crear equipo"}
        </Button>
        <Button type="button" variant="ghost" disabled={enviando} onClick={limpiar}>
          Limpiar
        </Button>
      </div>
    </form>
  );
}
