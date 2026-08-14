"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { actualizarResumenCuenta } from "@/lib/acciones/cuentas";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ResumenCuenta({ cuentaId, notasIniciales }: { cuentaId: string; notasIniciales: string | null }) {
  const [editando, setEditando] = useState(false);
  const [notas, setNotas] = useState(notasIniciales ?? "");
  const [borrador, setBorrador] = useState(notasIniciales ?? "");
  const [enviando, startTransition] = useTransition();

  function guardar() {
    startTransition(async () => {
      const resultado = await actualizarResumenCuenta(cuentaId, borrador);
      if (resultado.error) {
        toast.error(resultado.error);
        return;
      }
      setNotas(borrador);
      setEditando(false);
      toast.success("Resumen actualizado");
    });
  }

  function cancelar() {
    setBorrador(notas);
    setEditando(false);
  }

  return (
    <SeccionPanel
      titulo="Resumen del cliente"
      accion={
        !editando && (
          <Button variant="ghost" size="sm" onClick={() => setEditando(true)}>
            <Pencil className="size-3.5" />
            Editar
          </Button>
        )
      }
    >
      {editando ? (
        <div className="space-y-3">
          <Textarea
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            rows={6}
            placeholder="Anote el contexto clave del cliente: cuántos locales tiene, presupuesto, quién decide, fechas importantes…"
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={guardar} disabled={enviando}>
              {enviando ? "Guardando…" : "Guardar"}
            </Button>
            <Button size="sm" variant="outline" onClick={cancelar} disabled={enviando}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : notas ? (
        <p className="whitespace-pre-wrap text-sm text-foreground">{notas}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Sin resumen todavía. Anote el contexto clave del cliente: cuántos locales tiene, presupuesto, quién
            decide, fechas importantes…
          </p>
          <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
            Agregar resumen
          </Button>
        </div>
      )}
    </SeccionPanel>
  );
}
