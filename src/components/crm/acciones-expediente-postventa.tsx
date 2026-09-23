"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeft, FolderInput, Loader2 } from "lucide-react";
import { catalogarExpediente, pasarACompanera } from "@/lib/acciones/expediente-postventa";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ETIQUETA: Record<string, string> = {
  garantia: "Soporte técnico",
  repuesto: "Repuestos",
  mantenimiento: "Mantenimiento preventivo",
  seguimiento: "Seguimiento",
};

const boton =
  "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent";

/**
 * «ES UN CASO» Y «LO ATIENDE MI COMPAÑERA» (0284, reunión 23-09).
 *
 * Lo que entra como seguimiento y en realidad es un problema técnico se
 * cataloga como caso, y cuando lo está atendiendo la otra persona del área se
 * le pasa con el motivo escrito: «el CRM no sabe lo que hemos coordinado».
 */
export function AccionesExpedientePostventa({
  oportunidadId,
  tipo,
  duenoId,
  companeras,
}: {
  oportunidadId: string;
  tipo: string;
  duenoId: string | null;
  companeras: { id: string; nombre: string; codigo: string | null }[];
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [abierto, setAbierto] = useState<"caso" | "pasar" | null>(null);
  const [nuevoTipo, setNuevoTipo] = useState(tipo === "seguimiento" ? "garantia" : "seguimiento");
  const otras = companeras.filter((c) => c.id !== duenoId);
  const [destino, setDestino] = useState(otras[0]?.id ?? "");
  const [motivo, setMotivo] = useState("");

  function enviar() {
    startTransition(async () => {
      if (abierto === "caso") {
        const r = await catalogarExpediente(oportunidadId, nuevoTipo, motivo);
        if (r.error) return void toast.error(r.error);
        toast.success(`Catalogado como ${r.etiqueta}. Quedó escrito en el expediente.`);
      } else {
        const r = await pasarACompanera(oportunidadId, destino, motivo);
        if (r.error) return void toast.error(r.error);
        toast.success(`Ahora lo atiende ${r.quien}. Le llegó el aviso.`);
      }
      setAbierto(null);
      setMotivo("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-foreground">{ETIQUETA[tipo] ?? tipo}</span>
      <button type="button" className={boton} onClick={() => setAbierto("caso")}>
        <FolderInput className="size-3.5" /> {tipo === "seguimiento" ? "Es un caso" : "Cambiar el tipo"}
      </button>
      {otras.length > 0 && (
        <button type="button" className={boton} onClick={() => setAbierto("pasar")}>
          <ArrowRightLeft className="size-3.5" /> Lo atiende mi compañera
        </button>
      )}
      <Dialog open={abierto !== null} onOpenChange={(v) => !v && setAbierto(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{abierto === "pasar" ? "Lo atiende mi compañera" : "Catalogar el expediente"}</DialogTitle>
            <DialogDescription>
              {abierto === "pasar"
                ? "El expediente pasa a ella con todo su historial; le llega el aviso y queda escrito por qué."
                : "Si entró como seguimiento pero es un problema técnico, un repuesto o un mantenimiento, se cataloga como caso. Queda escrito por qué."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {abierto === "pasar" ? (
              <div className="grid gap-1">
                <Label className="text-xs">Quién lo atiende</Label>
                <select value={destino} onChange={(e) => setDestino(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                  {otras.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo ? `${c.codigo} · ` : ""}
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid gap-1">
                <Label className="text-xs">Qué es</Label>
                <select value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                  {Object.entries(ETIQUETA)
                    .filter(([k]) => k !== tipo)
                    .map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                </select>
              </div>
            )}
            <div className="grid gap-1">
              <Label className="text-xs">
                Por qué <span className="text-destructive">*</span>
              </Label>
              <Textarea
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={abierto === "pasar" ? "Ej.: es un pedido que ella ya está despachando" : "Ej.: la secadora no calienta: es soporte técnico, no seguimiento"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(null)}>
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={pendiente || motivo.trim().length < 5 || (abierto === "pasar" && !destino)}>
              {pendiente && <Loader2 className="size-4 animate-spin" />}
              {abierto === "pasar" ? "Pasárselo" : "Catalogar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
