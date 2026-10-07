"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CampoCodigo } from "@/components/crm/campo-codigo";
import { TablaParaCotizar, filasParaGuardar, type FilaCotizar } from "@/components/crm/tabla-para-cotizar";
import { corregirInformeServicio, type CambiosInforme } from "@/lib/acciones/informes-servicio";
import { cn } from "@/lib/utils";

const MOTIVO_MIN = 5;

export type InformeCorregible = {
  id: string;
  numero: string | null;
  asunto: string | null;
  tecnico: string | null;
  ejecutado_at: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  equipo_texto: string | null;
  detalle: string | null;
  verificacion: string | null;
  observaciones: string | null;
  accesorios: string | null;
  pendientes: string | null;
  secciones: { titulo: string; texto: string }[];
  repuestos: { codigo: string | null; descripcion: string; cantidad: number | null; unidad?: string | null; precio: number | null; igv?: string | null; stock: string | null }[];
  cliente_conforme_nombre: string | null;
  cliente_conforme_doc: string | null;
};

const TEXTOS: { campo: keyof InformeCorregible & keyof CambiosInforme; etiqueta: string; largo?: boolean }[] = [
  { campo: "asunto", etiqueta: "Asunto" },
  { campo: "tecnico", etiqueta: "Técnico" },
  { campo: "equipo_texto", etiqueta: "Equipo", largo: true },
  { campo: "detalle", etiqueta: "Trabajo realizado", largo: true },
  { campo: "verificacion", etiqueta: "Verificación", largo: true },
  { campo: "accesorios", etiqueta: "Accesorios necesarios para la instalación", largo: true },
  { campo: "observaciones", etiqueta: "Observaciones y recomendaciones", largo: true },
  { campo: "pendientes", etiqueta: "Pendientes con el cliente", largo: true },
  { campo: "cliente_conforme_nombre", etiqueta: "Conformidad: nombre" },
  { campo: "cliente_conforme_doc", etiqueta: "Conformidad: DNI" },
];

const fechaLima = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" }) : "");
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");
/** Lo guardado en el cuadro, como filas editables de la tabla del informe. */
const comoFilas = (r: InformeCorregible["repuestos"]): FilaCotizar[] =>
  r.map((x) => ({
    codigo: x.codigo ?? "",
    descripcion: x.descripcion ?? "",
    cantidad: x.cantidad != null ? String(x.cantidad) : "",
    unidad: x.unidad ?? "und",
    precio: x.precio != null ? String(x.precio) : "",
    igv: x.igv === "incluye" ? "incluye" : "no_incluye",
    stock: x.stock ?? "",
  }));

/**
 * «Corregir informe» (0383, Santos 02-10): cualquiera de postventa —y el
 * almacén en los suyos— corrige un informe ya emitido con el código de
 * operaciones o gerencia. Solo viaja lo que cambió; la base guarda lo que
 * había antes, quién lo cambió y quién autorizó.
 */
export function CorregirInformeServicio({ informe }: { informe: InformeCorregible }) {
  const router = useRouter();
  const params = useSearchParams();
  // Desde el paso del pedido se llega con ?corregir=1: el cuadro ya abierto.
  const [abierto, setAbierto] = useState(() => params.get("corregir") === "1");
  const [pendiente, startTransition] = useTransition();
  const inicial = () => ({
    ...Object.fromEntries(TEXTOS.map((t) => [t.campo, (informe[t.campo] as string | null) ?? ""])),
    fecha: fechaLima(informe.ejecutado_at),
    hora_inicio: hhmm(informe.hora_inicio),
    hora_fin: hhmm(informe.hora_fin),
  }) as Record<string, string>;
  const [valores, setValores] = useState<Record<string, string>>(inicial);
  const [secciones, setSecciones] = useState(informe.secciones);
  // El cuadro para cotizar (buzón del almacén, 06-10): tras una segunda
  // videollamada aparece qué cotizar y se agrega corrigiendo el informe.
  const [paraCotizar, setParaCotizar] = useState(() => comoFilas(informe.repuestos));
  const [motivo, setMotivo] = useState("");
  const [pin, setPin] = useState("");

  function abrir(v: boolean) {
    if (v) {
      setValores(inicial());
      setSecciones(informe.secciones);
      setParaCotizar(comoFilas(informe.repuestos));
      setMotivo("");
      setPin("");
    }
    setAbierto(v);
  }

  function cambios(): CambiosInforme {
    const c: Record<string, unknown> = {};
    for (const t of TEXTOS) {
      const antes = ((informe[t.campo] as string | null) ?? "").trim();
      const ahora = (valores[t.campo] ?? "").trim();
      if (antes !== ahora) c[t.campo] = ahora || null;
    }
    if (valores.hora_inicio !== hhmm(informe.hora_inicio)) c.hora_inicio = valores.hora_inicio ? `${valores.hora_inicio}:00` : null;
    if (valores.hora_fin !== hhmm(informe.hora_fin)) c.hora_fin = valores.hora_fin ? `${valores.hora_fin}:00` : null;
    if (valores.fecha && valores.fecha !== fechaLima(informe.ejecutado_at)) {
      c.ejecutado_at = `${valores.fecha}T${valores.hora_inicio || "09:00"}:00-05:00`;
    }
    const limpias = secciones.map((s) => ({ titulo: s.titulo.trim(), texto: s.texto.trim() })).filter((s) => s.titulo || s.texto);
    if (JSON.stringify(limpias) !== JSON.stringify(informe.secciones)) c.secciones = limpias;
    const cuadro = filasParaGuardar(paraCotizar);
    if (JSON.stringify(cuadro) !== JSON.stringify(filasParaGuardar(comoFilas(informe.repuestos)))) c.repuestos = cuadro;
    return c as CambiosInforme;
  }

  const hayCambios = Object.keys(cambios()).length > 0;
  const listo = hayCambios && motivo.trim().length >= MOTIVO_MIN && pin.length === 4;

  function guardar() {
    const c = cambios();
    startTransition(async () => {
      const r = await corregirInformeServicio(informe.id, c, motivo.trim(), pin);
      if (r.error) {
        toast.error(r.error);
        if (/código/i.test(r.error)) setPin("");
        return;
      }
      toast.success(`Informe corregido (versión ${r.version}). Queda guardado lo que había antes.`);
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => abrir(true)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent"
      >
        <Pencil className="size-3.5" /> Corregir informe
      </button>
      <Dialog open={abierto} onOpenChange={abrir}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Corregir el informe{informe.numero ? ` N.º ${informe.numero}` : ""}</DialogTitle>
            <DialogDescription>
              Cambie lo que haga falta. Para guardar, diga qué se corrige y pida el código de cuatro dígitos a operaciones o a gerencia.
              El número del informe no cambia y lo que había antes queda guardado con su nombre.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo etiqueta="Fecha del servicio">
                <Input type="date" value={valores.fecha} onChange={(e) => setValores((v) => ({ ...v, fecha: e.target.value }))} />
              </Campo>
              <Campo etiqueta="Hora de inicio">
                <Input type="time" value={valores.hora_inicio} onChange={(e) => setValores((v) => ({ ...v, hora_inicio: e.target.value }))} />
              </Campo>
              <Campo etiqueta="Hora de fin">
                <Input type="time" value={valores.hora_fin} onChange={(e) => setValores((v) => ({ ...v, hora_fin: e.target.value }))} />
              </Campo>
            </div>

            {/* El cuerpo del informe del almacén vive en sus secciones (0297). */}
            {secciones.length > 0 && (
              <div className="space-y-2">
                {secciones.map((s, i) => (
                  <div key={i} className="rounded-lg border border-border p-2.5">
                    <div className="flex items-center gap-2">
                      <Input
                        value={s.titulo}
                        onChange={(e) => setSecciones((l) => l.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))}
                        className="h-8 text-xs font-semibold"
                        aria-label="Título de la sección"
                      />
                      <button
                        type="button"
                        onClick={() => setSecciones((l) => l.filter((_, j) => j !== i))}
                        className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Quitar esta sección"
                        aria-label="Quitar esta sección"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <Textarea
                      rows={3}
                      value={s.texto}
                      onChange={(e) => setSecciones((l) => l.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))}
                      className="mt-1.5 text-xs"
                      aria-label={`Texto de ${s.titulo || "la sección"}`}
                    />
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setSecciones((l) => [...l, { titulo: "", texto: "" }])}
              className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              <Plus className="size-3" /> Agregar una sección
            </button>

            <TablaParaCotizar filas={paraCotizar} onChange={setParaCotizar} />

            <div className="grid gap-3 sm:grid-cols-2">
              {TEXTOS.map((t) => (
                <Campo key={t.campo} etiqueta={t.etiqueta} ancho={t.largo}>
                  {t.largo ? (
                    <Textarea rows={2} value={valores[t.campo]} onChange={(e) => setValores((v) => ({ ...v, [t.campo]: e.target.value }))} className="text-xs" />
                  ) : (
                    <Input value={valores[t.campo]} onChange={(e) => setValores((v) => ({ ...v, [t.campo]: e.target.value }))} />
                  )}
                </Campo>
              ))}
            </div>

            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <Campo etiqueta="Qué se corrige y por qué">
                <Textarea
                  rows={2}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="ej. El técnico era otro; se completó la verificación de la preinstalación"
                />
              </Campo>
              <p className="mb-1 mt-3 text-xs font-medium text-foreground">Código de operaciones o gerencia</p>
              <CampoCodigo valor={pin} onChange={setPin} enmascarar />
            </div>
          </div>

          <DialogFooter>
            <p className={cn("mr-auto self-center text-[11px]", hayCambios ? "text-muted-foreground" : "text-amber-700")}>
              {hayCambios ? `${Object.keys(cambios()).length} campo(s) cambiado(s)` : "Todavía no cambió nada"}
            </p>
            <Button variant="outline" onClick={() => abrir(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={!listo || pendiente}>
              {pendiente && <Loader2 className="size-3.5 animate-spin" />} Guardar la corrección
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Campo({ etiqueta, ancho, children }: { etiqueta: string; ancho?: boolean; children: React.ReactNode }) {
  return (
    <label className={cn("block", ancho && "sm:col-span-2")}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{etiqueta}</span>
      {children}
    </label>
  );
}
