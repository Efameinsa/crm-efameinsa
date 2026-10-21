"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus } from "lucide-react";
import { agregarAdjuntosAGestion } from "@/lib/acciones/oportunidades";
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
import { CampoAdjuntos, useAdjuntos } from "@/components/crm/campo-adjuntos";

// Una captura de pantalla de celular o una foto de cámara pesa 3-6 MB y en el
// historial se ve en miniatura de 64 px: se achica a 1600 px de lado y JPEG
// antes de subirla. Las chicas y los PNG con transparencia se dejan como están.
const LADO_MAXIMO = 1600;
const ACHICAR_DESDE = 600 * 1024;

async function achicarSiPesa(f: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size < ACHICAR_DESDE) return f;
  try {
    const bitmap = await createImageBitmap(f);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return f;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.82));
    if (!blob || blob.size >= f.size) return f;
    return new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return f;
  }
}

/**
 * El «+» de cada gestión en el historial del expediente (Santos, 21-10): para
 * pegarle (Ctrl+V) o subirle la imagen que completa lo que ya se anotó, sin
 * registrar una gestión nueva. La nota y el resultado no se tocan.
 */
export function AgregarFotosGestion({ actividadId, gestion }: { actividadId: string; gestion: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [guardando, startTransition] = useTransition();
  const adjuntos = useAdjuntos();

  async function agregarAchicados(files: File[], desdePortapapeles = false) {
    adjuntos.agregarArchivos(await Promise.all(files.map(achicarSiPesa)), desdePortapapeles);
  }

  function guardar() {
    startTransition(async () => {
      const subida = await adjuntos.subir();
      if (subida.adjuntos === null) {
        toast.error(subida.error);
        return;
      }
      const res = await agregarAdjuntosAGestion({ actividadId, adjuntos: subida.adjuntos });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(subida.adjuntos.length === 1 ? "Imagen agregada a la gestión" : `${subida.adjuntos.length} archivos agregados a la gestión`);
      adjuntos.limpiar();
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        if (guardando) return;
        setAbierto(v);
        if (!v) adjuntos.limpiar();
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            title="Agregar una foto o captura a esta gestión"
            aria-label="Agregar una foto o captura a esta gestión"
            className="inline-flex size-6 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <ImagePlus className="size-3.5" />
          </button>
        }
      />
      <DialogContent
        className="sm:max-w-lg"
        // El diálogo vive en un portal, pero los eventos de React igual suben
        // a la fila del historial, que navega al hacer clic o Enter.
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData?.files ?? []);
          if (files.length === 0) return;
          e.preventDefault();
          void agregarAchicados(files, true);
        }}
      >
        <DialogHeader>
          <DialogTitle>Agregar imagen a la gestión</DialogTitle>
          <DialogDescription>
            <b>{gestion}</b>. Pega una captura con <b>Ctrl+V</b>, arrástrala o súbela. Se suma a esta misma gestión, con tu nombre;
            no se registra una gestión nueva ni cambia lo anotado.
          </DialogDescription>
        </DialogHeader>
        <CampoAdjuntos
          ctl={{ ...adjuntos, agregarArchivos: (files, desde) => void agregarAchicados(files, desde) }}
          ayuda="Fotos, capturas, PDF o videos · hasta 5 por vez"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setAbierto(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando || adjuntos.archivos.length === 0}>
            {guardando
              ? adjuntos.progreso
                ? `Subiendo ${adjuntos.progreso.hecho + 1} de ${adjuntos.progreso.total}…`
                : "Guardando…"
              : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
