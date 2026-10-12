"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { responderInfocorp } from "@/lib/acciones/infocorp";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Central devuelve el Infocorp (0447): sube el reporte que sacó de Experian
 * (PDF o captura) y, si quiere, escribe lo que encontró. Al comercial le llega
 * a la campana y lo ve en su expediente.
 */
export function ResponderInfocorp({ id, respondido = false }: { id: string; respondido?: boolean }) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState("");
  const [abierto, setAbierto] = useState(!respondido);
  const [pendiente, iniciar] = useTransition();

  function enviar() {
    iniciar(async () => {
      let path: string | null = null;
      if (archivo) {
        path = `infocorp/${id}/${crypto.randomUUID()}-${archivo.name.replace(/[^\w.\-]+/g, "_").slice(0, 80)}`;
        const { error } = await createClient().storage.from("adjuntos").upload(path, archivo, { contentType: archivo.type || "application/pdf" });
        if (error) {
          toast.error(`No se pudo subir el archivo: ${error.message}`);
          return;
        }
      }
      const r = await responderInfocorp({ id, resultado, path, nombre: archivo?.name ?? null });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Listo: al comercial le llegó el aviso con el reporte.");
      setArchivo(null);
      setResultado("");
      setAbierto(false);
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setAbierto(true)}>
        Cambiar la respuesta
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label htmlFor={`archivo-${id}`} className="text-xs">
          Reporte de Infocorp (PDF o captura)
        </Label>
        <input
          id={`archivo-${id}`}
          type="file"
          accept="application/pdf,image/*"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          className="block w-full text-xs file:mr-2 file:rounded-md file:border file:border-border file:bg-muted file:px-2 file:py-1"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`resultado-${id}`} className="text-xs">
          Lo que encontró (opcional)
        </Label>
        <Textarea id={`resultado-${id}`} rows={2} value={resultado} onChange={(e) => setResultado(e.target.value)} placeholder="Ej.: calificación normal, sin deudas vencidas" />
      </div>
      <Button size="sm" onClick={enviar} disabled={pendiente || (!archivo && !resultado.trim())}>
        {pendiente ? "Enviando…" : "Enviar al comercial"}
      </Button>
    </div>
  );
}
