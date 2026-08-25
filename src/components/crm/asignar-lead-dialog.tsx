"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { asignarLead, buscarCoincidencias, type CoincidenciaCartera } from "@/lib/acciones/leads";
import { fechaLima } from "@/lib/fechas";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SolicitudLead } from "@/components/crm/solicitud-lead";

interface Comercial {
  id: string;
  nombre: string;
  codigo_comercial: string | null;
  /** Post Venta usa el CRM como un comercial, pero lo que recibe son casos, no ventas (0075). */
  es_postventa?: boolean;
  // Código con el que operaba antes (Brenda: C1 hoy, C8 hasta junio 2026).
  // Central sigue teniendo papeles viejos con el código anterior — verlo aquí
  // evita la duda del ing. Carlos: "me sale C8, pero C8 ya no hay".
  codigo_anterior?: string | null;
}

interface Props {
  leadId: string;
  nombre: string | null;
  razonSocial: string | null;
  telefono: string | null;
  numDoc: string | null;
  email: string | null;
  /** Lo que pidió el prospecto: sin esto Central deriva a ciegas. */
  mensaje?: string | null;
  comerciales: Comercial[];
}

const MOTIVO: Record<CoincidenciaCartera["motivo"], { etiqueta: string; fuerte: boolean }> = {
  documento: { etiqueta: "Mismo RUC/DNI", fuerte: true },
  telefono: { etiqueta: "Mismo teléfono", fuerte: true },
  correo: { etiqueta: "Mismo correo", fuerte: true },
  nombre: { etiqueta: "Nombre similar", fuerte: false },
};

// Pre-filtro de derivación (pedido de Carlos 19-08): al abrir el diálogo se
// busca a quién pertenece —o podría pertenecer— el contacto en TODO el
// histórico (RUC/DNI, teléfono, correo, nombre). Un match fuerte preselecciona
// al comercial de esa cartera (regla R3); los de nombre solo advierten:
// puede haber muchas "María Leguía".
export function AsignarLeadDialog({ leadId, nombre, razonSocial, telefono, numDoc, email, mensaje, comerciales }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [coincidencias, setCoincidencias] = useState<CoincidenciaCartera[] | null>(null);
  const [comercialId, setComercialId] = useState<string>("");
  const [tipoPostventa, setTipoPostventa] = useState<string>("");
  const [enviando, startTransition] = useTransition();

  // Derivar a Post Venta es derivar un CASO, no entregar un cliente: hay que
  // decir de qué clase es, y la cartera del comercial no se toca (0080).
  const esPostventa = comerciales.find((c) => c.id === comercialId)?.es_postventa === true;

  useEffect(() => {
    if (!abierto) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCoincidencias(null);
    buscarCoincidencias({ nombre, razonSocial, telefono, numDoc, email }).then((r) => {
      setCoincidencias(r);
      const fuerte = r.find((c) => MOTIVO[c.motivo].fuerte && c.comercialId);
      if (fuerte) setComercialId(fuerte.comercialId!);
    });
  }, [abierto, nombre, razonSocial, telefono, numDoc, email]);

  function confirmar() {
    if (!comercialId) {
      toast.error("Seleccione un comercial");
      return;
    }
    if (esPostventa && !tipoPostventa) {
      toast.error("Indique de qué clase es el caso de postventa");
      return;
    }
    startTransition(async () => {
      const resultado = await asignarLead(leadId, comercialId, esPostventa ? tipoPostventa : null);
      if (resultado.error) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Lead asignado");
      setAbierto(false);
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button size="sm">Asignar</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asignar contacto</DialogTitle>
          <DialogDescription>Elija el comercial que va a atender este contacto.</DialogDescription>
        </DialogHeader>

        {/* Se repite acá a propósito: es el dato que decide a QUIÉN conviene
            derivarlo, y en este diálogo es donde se toma la decisión. */}
        <div className="rounded-md border border-border bg-secondary/40 p-2.5">
          <SolicitudLead mensaje={mensaje ?? null} compacto />
        </div>

        {coincidencias === null ? (
          <p className="text-xs text-muted-foreground">Buscando en el histórico (RUC, teléfono, correo y nombre)…</p>
        ) : coincidencias.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-2.5 text-xs text-muted-foreground">
            Sin coincidencias en el histórico: parece un contacto nuevo.
          </p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Posiblemente pertenece a
            </p>
            {coincidencias.map((c) => {
              const m = MOTIVO[c.motivo];
              const elegible = !!c.comercialId;
              return (
                <button
                  key={c.cuentaId}
                  type="button"
                  disabled={!elegible}
                  onClick={() => elegible && setComercialId(c.comercialId!)}
                  className={cn(
                    "w-full rounded-lg border p-2.5 text-left text-xs transition-colors",
                    elegible ? "cursor-pointer hover:bg-accent" : "cursor-default opacity-80",
                    comercialId && c.comercialId === comercialId ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <span className="flex flex-wrap items-center gap-1.5">
                    <b className="text-foreground">{c.razonSocial}</b>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        m.fuerte ? "bg-[#1E7F4F]/10 text-[#1E7F4F]" : "bg-amber-500/10 text-amber-700",
                      )}
                    >
                      {m.etiqueta}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-muted-foreground">
                    {c.comercialNombre
                      ? `Cartera de ${c.comercialNombre}${c.codigoComercial ? ` (${c.codigoComercial})` : ""}`
                      : "Sin comercial de cartera"}
                    {c.ultimaVentaAt ? ` · última venta ${fechaLima(c.ultimaVentaAt)}` : " · sin ventas registradas"}
                    {elegible && " — clic para asignarle a su cartera"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="comercial">Comercial</Label>
          <Select value={comercialId} onValueChange={(valor) => setComercialId(valor ?? "")}>
            <SelectTrigger id="comercial" className="w-full">
              <SelectValue placeholder="Seleccione…" />
            </SelectTrigger>
            <SelectContent>
              {comerciales.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nombre} {c.codigo_comercial ? `(${c.codigo_comercial}` : ""}
                  {c.codigo_comercial && c.codigo_anterior ? ` · antes ${c.codigo_anterior}` : ""}
                  {c.codigo_comercial ? ")" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {esPostventa && (
          <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <Label htmlFor="tipo-postventa">¿De qué clase es el caso?</Label>
            <Select value={tipoPostventa} onValueChange={(valor) => setTipoPostventa(valor ?? "")}>
              <SelectTrigger id="tipo-postventa" className="w-full bg-card">
                <SelectValue placeholder="Seleccione…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="garantia">Garantía — el equipo no está operativo</SelectItem>
                <SelectItem value="repuesto">Repuesto</SelectItem>
                <SelectItem value="mantenimiento">Mantenimiento preventivo</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              El cliente sigue en la cartera de su comercial: postventa recibe el caso, no el cliente.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button onClick={confirmar} disabled={enviando}>
            {enviando ? "Asignando…" : "Confirmar asignación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
