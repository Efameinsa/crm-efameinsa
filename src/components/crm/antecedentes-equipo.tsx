"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Loader2, Paperclip, PencilLine, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { guardarAntecedentesEquipo } from "@/lib/acciones/equipos";
import {
  ETIQUETA_CLASE_DOCUMENTO,
  ETIQUETA_GARANTIA,
  ETIQUETA_SI_NO,
  type AntecedentesEquipo,
  type ClaseDocumento,
  type EstadoGarantiaAntecedente,
  type SiNo,
} from "@/lib/antecedentes-equipo";
import { fechaCalendario, fechaHoraLima } from "@/lib/fechas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * «Antecedentes e historial técnico del equipo» (buzón Brenda PV2, 20-10).
 * Antes de un trabajo en planta —revisión, preventivo o correctivo— el técnico
 * necesita saber de dónde salió la máquina, si tiene garantía y si ya la
 * tocaron. En las que no vendimos eso no estaba escrito en ningún lado. Se ve
 * en la ficha del equipo y en el caso; lo llena postventa.
 */
export function AntecedentesEquipoPanel({
  equipoId,
  antecedentes,
  puedeEditar,
  atencionId = null,
}: {
  equipoId: string;
  antecedentes: AntecedentesEquipo | null;
  puedeEditar: boolean;
  atencionId?: string | null;
}) {
  const a = antecedentes;
  const vacio =
    !a ||
    (!a.fecha_compra && !a.proveedor && !a.guia_remision && !a.factura_oc && !a.garantia && !a.mantenimiento && !a.repuestos && !a.fallas && a.documentos.length === 0);

  return (
    <div className="space-y-3">
      {vacio ? (
        <p className="max-w-prose text-sm text-muted-foreground">
          Todavía no se registraron los antecedentes de este equipo: de dónde y cuándo se compró, su garantía, y si ya tuvo
          mantenimiento, repuestos o fallas. Sirve sobre todo para equipos que no vendimos, antes de una revisión o un
          mantenimiento en planta.
          {!puedeEditar && " Los registra postventa."}
        </p>
      ) : (
        <>
          <Bloque titulo="A. Compra">
            <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
              <Dato etiqueta="Fecha de compra">{a!.fecha_compra ? fechaCalendario(a!.fecha_compra) : "—"}</Dato>
              <Dato etiqueta="Proveedor / empresa vendedora">{a!.proveedor ?? "—"}</Dato>
              <Dato etiqueta="Garantía">{a!.garantia ? ETIQUETA_GARANTIA[a!.garantia] : "—"}</Dato>
              <Dato etiqueta="Guía de remisión">{a!.guia_remision ?? "—"}</Dato>
              <Dato etiqueta="Factura u orden de compra">{a!.factura_oc ?? "—"}</Dato>
            </dl>
          </Bloque>
          <Bloque titulo="B-D. Historial">
            <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
              <Dato etiqueta="¿Recibió mantenimiento?">
                <SiNoValor valor={a!.mantenimiento} detalle={a!.mantenimiento_detalle} />
              </Dato>
              <Dato etiqueta="¿Se le compraron repuestos?">
                <SiNoValor valor={a!.repuestos} detalle={a!.repuestos_detalle} />
              </Dato>
              <Dato etiqueta="¿Presentó fallas antes?">
                <SiNoValor valor={a!.fallas} detalle={a!.fallas_detalle} />
              </Dato>
            </dl>
          </Bloque>
          <Bloque titulo={`E. Documentos y evidencias${a!.documentos.length ? ` · ${a!.documentos.length}` : ""}`}>
            {a!.documentos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin documentos todavía.</p>
            ) : (
              <ul className="space-y-1">
                {a!.documentos.map((d) => (
                  <li key={d.path} className="flex flex-wrap items-center gap-x-2 text-xs">
                    <FileText className="size-3.5 flex-none text-muted-foreground" />
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                        {d.nombre}
                      </a>
                    ) : (
                      <span className="font-medium">{d.nombre}</span>
                    )}
                    <span className="text-muted-foreground">· {ETIQUETA_CLASE_DOCUMENTO[d.clase] ?? d.clase}</span>
                  </li>
                ))}
              </ul>
            )}
          </Bloque>
          {a!.actualizado_at && (
            <p className="text-[11px] text-muted-foreground">
              Actualizado {fechaHoraLima(a!.actualizado_at)}
              {a!.actualizado_por_nombre ? ` por ${a!.actualizado_por_nombre}` : ""}
            </p>
          )}
        </>
      )}
      {puedeEditar && <EditarAntecedentes equipoId={equipoId} antecedentes={a} atencionId={atencionId} vacio={vacio} />}
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      {children}
    </div>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold text-muted-foreground">{etiqueta}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}

function SiNoValor({ valor, detalle }: { valor: SiNo | null; detalle: string | null }) {
  if (!valor) return <>—</>;
  return (
    <>
      <span className={cn("font-medium", valor === "si" ? "text-amber-800" : valor === "no" ? "text-foreground" : "text-muted-foreground")}>
        {ETIQUETA_SI_NO[valor]}
      </span>
      {detalle && <span className="block whitespace-pre-wrap text-muted-foreground">{detalle}</span>}
    </>
  );
}

type Pendiente = { archivo: File; clase: ClaseDocumento };

function EditarAntecedentes({
  equipoId,
  antecedentes,
  atencionId,
  vacio,
}: {
  equipoId: string;
  antecedentes: AntecedentesEquipo | null;
  atencionId: string | null;
  vacio: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, empezar] = useTransition();
  const a = antecedentes;
  const [fechaCompra, setFechaCompra] = useState(a?.fecha_compra ?? "");
  const [proveedor, setProveedor] = useState(a?.proveedor ?? "");
  const [guia, setGuia] = useState(a?.guia_remision ?? "");
  const [factura, setFactura] = useState(a?.factura_oc ?? "");
  const [garantia, setGarantia] = useState<EstadoGarantiaAntecedente | "">(a?.garantia ?? "");
  const [mant, setMant] = useState<SiNo | "">(a?.mantenimiento ?? "");
  const [mantDet, setMantDet] = useState(a?.mantenimiento_detalle ?? "");
  const [rep, setRep] = useState<SiNo | "">(a?.repuestos ?? "");
  const [repDet, setRepDet] = useState(a?.repuestos_detalle ?? "");
  const [fallas, setFallas] = useState<SiNo | "">(a?.fallas ?? "");
  const [fallasDet, setFallasDet] = useState(a?.fallas_detalle ?? "");
  const [nuevos, setNuevos] = useState<Pendiente[]>([]);
  const [quitar, setQuitar] = useState<string[]>([]);
  const [claseNueva, setClaseNueva] = useState<ClaseDocumento>("guia_factura_oc");

  function guardar() {
    empezar(async () => {
      const storage = createClient().storage.from("adjuntos");
      const subidos: { path: string; nombre: string; tipo: string; clase: string }[] = [];
      for (const n of nuevos) {
        const path = `equipos/${equipoId}/${crypto.randomUUID()}-${n.archivo.name.replace(/[^\w.\-]+/g, "_").slice(0, 80)}`;
        const tipo = n.archivo.type || "application/octet-stream";
        const { error } = await storage.upload(path, n.archivo, { contentType: tipo });
        if (error) return void toast.error(`No se pudo subir «${n.archivo.name}»: ${error.message}`);
        subidos.push({ path, nombre: n.archivo.name, tipo, clase: n.clase });
      }
      const r = await guardarAntecedentesEquipo({
        equipoId,
        atencionId,
        campos: {
          fecha_compra: fechaCompra || null,
          proveedor,
          guia_remision: guia,
          factura_oc: factura,
          garantia: garantia || null,
          mantenimiento: mant || null,
          mantenimiento_detalle: mant === "si" ? mantDet : null,
          repuestos: rep || null,
          repuestos_detalle: rep === "si" ? repDet : null,
          fallas: fallas || null,
          fallas_detalle: fallas === "si" ? fallasDet : null,
        },
        documentosNuevos: subidos,
        quitar,
      });
      if (r.error) return void toast.error(r.error);
      toast.success("Antecedentes del equipo guardados.");
      setNuevos([]);
      setQuitar([]);
      setAbierto(false);
      router.refresh();
    });
  }

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
      >
        <PencilLine className="size-3.5" /> {vacio ? "Registrar antecedentes" : "Editar antecedentes"}
      </button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Antecedentes del equipo</DialogTitle>
            <DialogDescription>
              Llene lo que sepa; lo que no, déjelo en «Por verificar». Puede volver a editarlo cuando el cliente mande los papeles.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <section className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">A. Antecedentes de compra</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo etiqueta="Fecha de compra">
                  <Input type="date" max={hoy} value={fechaCompra} onChange={(e) => setFechaCompra(e.target.value)} />
                </Campo>
                <Campo etiqueta="Proveedor / empresa vendedora">
                  <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Ej.: EFAMEINSA u otra empresa" />
                </Campo>
                <Campo etiqueta="N.º de guía de remisión">
                  <Input value={guia} onChange={(e) => setGuia(e.target.value.toUpperCase())} className="font-mono" />
                </Campo>
                <Campo etiqueta="N.º de factura u orden de compra">
                  <Input value={factura} onChange={(e) => setFactura(e.target.value.toUpperCase())} className="font-mono" />
                </Campo>
              </div>
              <Campo etiqueta="Garantía del equipo">
                <Opciones valor={garantia} onChange={(v) => setGarantia(v as EstadoGarantiaAntecedente)} opciones={ETIQUETA_GARANTIA} />
              </Campo>
            </section>

            <PreguntaSiNo
              titulo="B. Historial de mantenimiento"
              pregunta="¿El equipo recibió mantenimiento anteriormente?"
              valor={mant}
              onValor={setMant}
              detalle={mantDet}
              onDetalle={setMantDet}
              ayuda="Cuándo, quién lo hizo y qué se hizo"
            />
            <PreguntaSiNo
              titulo="C. Historial de repuestos"
              pregunta="¿Se compraron repuestos para este equipo?"
              valor={rep}
              onValor={setRep}
              detalle={repDet}
              onDetalle={setRepDet}
              ayuda="Qué repuestos, cuándo y a quién"
            />
            <PreguntaSiNo
              titulo="D. Historial de fallas"
              pregunta="¿El equipo presentó fallas anteriormente?"
              valor={fallas}
              onValor={setFallas}
              detalle={fallasDet}
              onDetalle={setFallasDet}
              ayuda="Qué falla, cuándo y cómo se resolvió"
            />

            <section className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">E. Documentos y evidencias</p>
              {(a?.documentos ?? []).length > 0 && (
                <ul className="space-y-1">
                  {a!.documentos.map((d) => {
                    const sale = quitar.includes(d.path);
                    return (
                      <li key={d.path} className={cn("flex items-center gap-2 text-xs", sale && "text-muted-foreground line-through")}>
                        <FileText className="size-3.5 flex-none" />
                        <span className="min-w-0 flex-1 truncate">
                          {d.nombre} · {ETIQUETA_CLASE_DOCUMENTO[d.clase] ?? d.clase}
                        </span>
                        <button
                          type="button"
                          className="text-[11px] font-medium text-primary hover:underline"
                          onClick={() => setQuitar(sale ? quitar.filter((p) => p !== d.path) : [...quitar, d.path])}
                        >
                          {sale ? "Dejarlo" : "Quitar"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {nuevos.length > 0 && (
                <ul className="space-y-1">
                  {nuevos.map((n, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs">
                      <Paperclip className="size-3.5 flex-none text-primary" />
                      <span className="min-w-0 flex-1 truncate">
                        {n.archivo.name} · {ETIQUETA_CLASE_DOCUMENTO[n.clase]}
                      </span>
                      <button type="button" aria-label="Sacar" onClick={() => setNuevos(nuevos.filter((_, j) => j !== i))}>
                        <X className="size-3.5 text-muted-foreground hover:text-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border p-2">
                <select
                  value={claseNueva}
                  onChange={(e) => setClaseNueva(e.target.value as ClaseDocumento)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  {(Object.keys(ETIQUETA_CLASE_DOCUMENTO) as ClaseDocumento[]).map((c) => (
                    <option key={c} value={c}>
                      {ETIQUETA_CLASE_DOCUMENTO[c]}
                    </option>
                  ))}
                </select>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                  <Paperclip className="size-3.5" /> Adjuntar archivos
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                    className="hidden"
                    onChange={(e) => {
                      const lista = Array.from(e.target.files ?? []).map((archivo) => ({ archivo, clase: claseNueva }));
                      setNuevos([...nuevos, ...lista].slice(0, 30));
                      e.target.value = "";
                    }}
                  />
                </label>
                <span className="text-[11px] text-muted-foreground">Elija primero qué es y luego adjunte (PDF, foto, Word o Excel).</span>
              </div>
            </section>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={pendiente}>
              {pendiente && <Loader2 className="size-4 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs">{etiqueta}</Label>
      {children}
    </div>
  );
}

function Opciones({ valor, onChange, opciones }: { valor: string; onChange: (v: string) => void; opciones: Record<string, string> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(opciones).map(([v, etiqueta]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(valor === v ? "" : v)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            valor === v ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent",
          )}
        >
          {etiqueta}
        </button>
      ))}
    </div>
  );
}

function PreguntaSiNo({
  titulo,
  pregunta,
  valor,
  onValor,
  detalle,
  onDetalle,
  ayuda,
}: {
  titulo: string;
  pregunta: string;
  valor: SiNo | "";
  onValor: (v: SiNo | "") => void;
  detalle: string;
  onDetalle: (v: string) => void;
  ayuda: string;
}) {
  return (
    <section className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <Campo etiqueta={pregunta}>
        <Opciones valor={valor} onChange={(v) => onValor(v as SiNo | "")} opciones={ETIQUETA_SI_NO} />
      </Campo>
      {valor === "si" && <Textarea rows={2} value={detalle} onChange={(e) => onDetalle(e.target.value)} placeholder={ayuda} />}
    </section>
  );
}
