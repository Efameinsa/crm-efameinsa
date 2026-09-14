"use client";

// Administración de los stickers de la empresa para el chat de WhatsApp
// (fase 2, 15-09-2026). Se sube cualquier imagen y se convierte sola a WebP
// 512×512 — quien carga esto no necesita saber nada de esos requisitos.

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { subirSticker, alternarSticker, borrarSticker, type Sticker } from "@/lib/acciones/whatsapp-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function FilaSticker({ sticker }: { sticker: Sticker & { url: string | null } }) {
  const [enviando, startTransition] = useTransition();

  function alternar() {
    startTransition(async () => {
      const r = await alternarSticker(sticker.id, !sticker.activo);
      if (r.error) toast.error(r.error);
    });
  }

  function borrar() {
    startTransition(async () => {
      const r = await borrarSticker(sticker.id, sticker.path);
      if (r.error) toast.error(r.error);
      else toast.success("Sticker borrado");
    });
  }

  return (
    <div className={cn("flex flex-col items-center gap-1.5 rounded-lg border border-border p-2", !sticker.activo && "opacity-50")}>
      {sticker.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- miniatura firmada de Storage
        <img src={sticker.url} alt={sticker.nombre} className="size-20 object-contain" />
      ) : (
        <div className="flex size-20 items-center justify-center text-[10px] text-muted-foreground">Sin vista previa</div>
      )}
      <p className="max-w-[80px] truncate text-center text-[11px] font-medium text-foreground" title={sticker.nombre}>
        {sticker.nombre}
      </p>
      <div className="flex gap-1">
        <Button size="icon-xs" variant="outline" onClick={alternar} disabled={enviando} title={sticker.activo ? "Dar de baja" : "Reactivar"}>
          {sticker.activo ? "❚❚" : "▶"}
        </Button>
        <Button size="icon-xs" variant="outline" onClick={borrar} disabled={enviando} title="Borrar">
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  );
}

function NuevoSticker() {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [enviando, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function subir(formData: FormData) {
    startTransition(async () => {
      const r = await subirSticker(formData);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`Sticker "${nombre}" cargado`);
      setAbierto(false);
      setNombre("");
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  if (!abierto) {
    return (
      <Button size="sm" onClick={() => setAbierto(true)}>
        <Plus className="size-3.5" /> Nuevo sticker
      </Button>
    );
  }

  return (
    <form action={subir} className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="text-sm font-semibold text-foreground">Nuevo sticker</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="nuevo-sticker-nombre">Nombre</Label>
          <Input
            id="nuevo-sticker-nombre"
            name="nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Logo Efameinsa"
            required
            className="bg-card"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nuevo-sticker-archivo">Imagen</Label>
          <input
            ref={inputRef}
            id="nuevo-sticker-archivo"
            name="archivo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            required
            className="block w-full rounded-md border border-border bg-card text-xs file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1.5"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={enviando}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : null} Convertir y cargar
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setAbierto(false)} disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function WhatsappStickersTabla({ stickers }: { stickers: (Sticker & { url: string | null })[] }) {
  return (
    <div className="space-y-3">
      <NuevoSticker />
      {stickers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay stickers cargados.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {stickers.map((s) => (
            <FilaSticker key={s.id} sticker={s} />
          ))}
        </div>
      )}
    </div>
  );
}
