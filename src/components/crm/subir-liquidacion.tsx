"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { subirLiquidacion } from "@/lib/acciones/pedido-central";
import { Button } from "@/components/ui/button";

/**
 * FINANZAS SUBE LA LIQUIDACIÓN (0290). Carlos, 23-09: «que la liquidación
 * adjunte su PDF y lo muestre acá… ella lo va a ver, le da clic y ya está».
 * Se acaba el papel de ida y vuelta: Central recibe el aviso, la abre y marca.
 */
export function SubirLiquidacion({ servicioId, yaSubida }: { servicioId: string; yaSubida: boolean }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);
  const [nombre, setNombre] = useState<string | null>(null);

  function subir(f: File) {
    if (f.size > 10 * 1024 * 1024) return void toast.error("El archivo pasa de 10 MB");
    setNombre(f.name);
    startTransition(async () => {
      const path = `liquidaciones/${servicioId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, "_").slice(0, 80)}`;
      const { error } = await createClient().storage.from("adjuntos").upload(path, f, { contentType: f.type || "application/pdf" });
      if (error) return void toast.error(`No se pudo subir: ${error.message}`);
      const r = await subirLiquidacion(servicioId, path, f.name);
      if (r.error) return void toast.error(r.error);
      toast.success("Liquidación subida: Central ya recibió el aviso para marcarla");
      router.refresh();
    });
  }

  return (
    <>
      <input
        ref={entrada}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) subir(f);
          e.target.value = "";
        }}
      />
      <Button size="sm" variant={yaSubida ? "outline" : "default"} disabled={pendiente} onClick={() => entrada.current?.click()}>
        {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <FileUp className="size-3.5" />}
        {pendiente && nombre ? `Subiendo ${nombre}…` : yaSubida ? "Reemplazar la liquidación" : "Subir la liquidación (PDF)"}
      </Button>
    </>
  );
}
