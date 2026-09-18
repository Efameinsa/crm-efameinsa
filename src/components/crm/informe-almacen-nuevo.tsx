"use client";

// El informe que escribe el almacén (0252, Santos 18-09 con la lista de
// Lesly): puesta en marcha (todo OK / con observaciones / faltan accesorios
// para instalar, con su lista de materiales y costos), soporte técnico por
// videollamada, y el mantenimiento en planta en tres informes. Al guardar, el
// check «subir a postventa» avisa al área; también se puede subir después,
// desde la lista.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileCheck2, Loader2, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { guardarInformeServicio } from "@/lib/acciones/postventa";
import { elevarInformeAPostventa, type AtencionParaInforme, type PedidoParaInforme } from "@/lib/acciones/almacen";
import { CLASES_INFORME_ALMACEN, type ClaseInformeAlmacen } from "@/lib/postventa";
import { ETIQUETA_TIPO_ATENCION } from "@/lib/atenciones";
import { TomarOSubirVarias } from "@/components/crm/tomar-o-subir";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Material = { descripcion: string; cantidad: string; costo: string };

const norm = (s: string) => s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function InformeAlmacenNuevo({ pedidos, atenciones }: { pedidos: PedidoParaInforme[]; atenciones: AtencionParaInforme[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [clase, setClase] = useState<ClaseInformeAlmacen>("puesta_en_marcha_ok");
  const [busqueda, setBusqueda] = useState("");
  const [pedidoId, setPedidoId] = useState<string | null>(null);
  const [atencionId, setAtencionId] = useState<string | null>(null);
  const [fecha, setFecha] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }));
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [tecnico, setTecnico] = useState("");
  const [detalle, setDetalle] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [pendientes, setPendientes] = useState("");
  const [conforme, setConforme] = useState("");
  const [materiales, setMateriales] = useState<Material[]>([{ descripcion: "", cantidad: "1", costo: "" }]);
  const [fotos, setFotos] = useState<File[]>([]);
  const [subir, setSubir] = useState(true);

  const def = CLASES_INFORME_ALMACEN.find((c) => c.clave === clase)!;
  const dePedido = def.de === "pedido";
  const elegido = dePedido ? pedidos.find((p) => p.id === pedidoId) : atenciones.find((a) => a.id === atencionId);

  const candidatos = useMemo(() => {
    const q = norm(busqueda.trim());
    const filtra = (t: string) => !q || q.split(/\s+/).every((w) => norm(t).includes(w));
    return dePedido
      ? pedidos.filter((p) => filtra(`${p.cliente} ${p.equipo ?? ""}`)).slice(0, 12)
      : atenciones.filter((a) => filtra(`${a.cliente} ${a.equipo ?? ""} ${ETIQUETA_TIPO_ATENCION[a.tipo as keyof typeof ETIQUETA_TIPO_ATENCION] ?? a.tipo}`)).slice(0, 12);
  }, [busqueda, dePedido, pedidos, atenciones]);

  const totalMateriales = materiales.reduce((t, m) => t + (Number(m.costo) || 0) * (Number(m.cantidad) || 1), 0);

  function guardar() {
    if (!elegido) {
      toast.error(dePedido ? "Elija de qué pedido es la puesta en marcha" : "Elija de qué atención es el informe");
      return;
    }
    if (!detalle.trim()) {
      toast.error("Escriba qué se hizo: es lo que lee postventa y lo que queda dos años después");
      return;
    }
    if (clase === "puesta_en_marcha_observaciones" && !observaciones.trim()) {
      toast.error("Escriba las observaciones: son el motivo de este informe");
      return;
    }
    if (clase === "puesta_en_marcha_accesorios" && !materiales.some((m) => m.descripcion.trim())) {
      toast.error("Liste los accesorios o materiales que faltan para la instalación");
      return;
    }
    startTransition(async () => {
      const subidas: { path: string; nombre: string; tipo: string; tamano: number }[] = [];
      if (fotos.length) {
        const storage = createClient().storage.from("adjuntos");
        for (const f of fotos) {
          const path = `informes/almacen/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, "_").slice(0, 80)}`;
          const { error } = await storage.upload(path, f, { contentType: f.type || "image/jpeg" });
          if (error) {
            toast.error(`No se pudo subir «${f.name}»: ${error.message}`);
            return;
          }
          subidas.push({ path, nombre: f.name, tipo: f.type, tamano: f.size });
        }
      }
      const pedido = dePedido ? (elegido as PedidoParaInforme) : null;
      const atencion = !dePedido ? (elegido as AtencionParaInforme) : null;
      const r = await guardarInformeServicio({
        servicioId: pedido?.id ?? null,
        atencionId: atencion?.id ?? null,
        equipoId: atencion?.equipoId ?? null,
        cuentaId: elegido.cuentaId,
        clienteTexto: elegido.cliente,
        equipoTexto: elegido.equipo,
        tipo: def.tipo,
        modalidad: def.modalidad,
        claseAlmacen: clase,
        ejecutadoAt: new Date(`${fecha}T${horaInicio || "12:00"}:00-05:00`).toISOString(),
        tecnico: tecnico || null,
        detalle,
        observaciones: observaciones || null,
        pendientes: pendientes || null,
        conformeNombre: conforme || null,
        horaInicio: horaInicio || null,
        horaFin: horaFin || null,
        fotos: subidas,
        listaMateriales:
          clase === "puesta_en_marcha_accesorios"
            ? materiales.map((m) => ({ descripcion: m.descripcion, cantidad: m.cantidad ? Number(m.cantidad) : null, costo: m.costo ? Number(m.costo) : null }))
            : [],
      });
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      const nuevoId = "id" in r ? r.id : undefined;
      if (subir && nuevoId) {
        const e = await elevarInformeAPostventa(nuevoId);
        if (e.error) toast.error(`Informe guardado, pero no se pudo subir a postventa: ${e.error}`);
        else toast.success(`Informe guardado y subido a postventa (${e.avisados ?? 0} avisados)`);
      } else {
        toast.success("Informe guardado. Puede subirlo a postventa desde la lista.");
      }
      setAbierto(false);
      setDetalle("");
      setObservaciones("");
      setPendientes("");
      setFotos([]);
      setMateriales([{ descripcion: "", cantidad: "1", costo: "" }]);
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <Button size="sm" onClick={() => setAbierto(true)}>
        <Plus className="size-3.5" /> Nuevo informe
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Nuevo informe del almacén</p>
        <button type="button" onClick={() => setAbierto(false)} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar">
          <X className="size-4" />
        </button>
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2">
        {CLASES_INFORME_ALMACEN.map((c) => (
          <button
            key={c.clave}
            type="button"
            onClick={() => {
              setClase(c.clave);
              setPedidoId(null);
              setAtencionId(null);
            }}
            className={cn("rounded-md border px-2.5 py-1.5 text-left text-xs", clase === c.clave ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-secondary")}
          >
            {c.etiqueta}
          </button>
        ))}
      </div>

      <div className="grid gap-1">
        <Label className="text-xs">{dePedido ? "¿De qué pedido es?" : "¿De qué atención es?"}</Label>
        {elegido ? (
          <div className="flex items-center justify-between rounded-md border border-[#1E7F4F]/50 bg-[#1E7F4F]/5 px-2.5 py-1.5 text-sm">
            <span className="min-w-0">
              <span className="block font-medium">{elegido.cliente}</span>
              <span className="line-clamp-1 text-xs text-muted-foreground">{elegido.equipo ?? "—"}</span>
            </span>
            <button type="button" onClick={() => (dePedido ? setPedidoId(null) : setAtencionId(null))} className="text-xs text-muted-foreground hover:text-destructive">
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Busque por cliente o equipo" className="h-8 text-sm" />
            <ul className="max-h-48 overflow-y-auto rounded-md border border-border">
              {candidatos.length === 0 && <li className="px-2.5 py-2 text-xs text-muted-foreground">Nada coincide.</li>}
              {candidatos.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => (dePedido ? setPedidoId(c.id) : setAtencionId(c.id))} className="flex w-full flex-col px-2.5 py-1.5 text-left hover:bg-secondary">
                    <span className="text-sm font-medium">{c.cliente}</span>
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {"tipo" in c ? `${ETIQUETA_TIPO_ATENCION[c.tipo as keyof typeof ETIQUETA_TIPO_ATENCION] ?? c.tipo} · ` : ""}
                      {c.equipo ?? "—"}
                      {"fecha" in c && c.fecha ? ` · ${String(c.fecha).slice(0, 10)}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <div className="grid gap-1">
          <Label className="text-xs">Fecha</Label>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Hora de inicio</Label>
          <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Hora de culminación</Label>
          <Input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Técnico</Label>
          <Input value={tecnico} onChange={(e) => setTecnico(e.target.value)} className="h-8 text-sm" placeholder="Quién lo hizo" />
        </div>
      </div>

      <div className="grid gap-1">
        <Label className="text-xs">Detalle del trabajo realizado</Label>
        <Textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={4} placeholder={dePedido ? "Qué se instaló, qué se probó, con qué resultado" : "Qué reportó el cliente, qué se revisó, qué se hizo"} />
      </div>

      <div className="grid gap-1">
        <Label className="text-xs">Observaciones{clase === "puesta_en_marcha_observaciones" ? " (obligatorias en este informe)" : ""}</Label>
        <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} />
      </div>

      {clase === "puesta_en_marcha_accesorios" && (
        <div className="space-y-1.5 rounded-md border border-amber-400/50 bg-amber-500/5 p-2.5">
          <Label className="text-xs font-semibold">Accesorios y materiales que faltan para instalar, con costo estimado</Label>
          {materiales.map((m, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_6rem_auto] gap-1.5">
              <Input value={m.descripcion} onChange={(e) => setMateriales((xs) => xs.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)))} placeholder="ej. Manguera de vapor 1/2” x 3 m" className="h-8 text-sm" />
              <Input value={m.cantidad} onChange={(e) => setMateriales((xs) => xs.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))} placeholder="Cant." inputMode="numeric" className="h-8 text-sm" />
              <Input value={m.costo} onChange={(e) => setMateriales((xs) => xs.map((x, j) => (j === i ? { ...x, costo: e.target.value } : x)))} placeholder="Costo $" inputMode="decimal" className="h-8 text-sm" />
              <button type="button" onClick={() => setMateriales((xs) => xs.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive" aria-label="Quitar">
                <X className="size-4" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setMateriales((xs) => [...xs, { descripcion: "", cantidad: "1", costo: "" }])} className="text-xs font-medium text-primary hover:underline">
              + Otro material
            </button>
            <span className="text-xs text-muted-foreground">Total estimado: ${totalMateriales.toFixed(2)} (sin IGV)</span>
          </div>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label className="text-xs">Pendiente</Label>
          <Input value={pendientes} onChange={(e) => setPendientes(e.target.value)} className="h-8 text-sm" placeholder="Qué queda por hacer, si algo" />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Conformidad del cliente (nombre)</Label>
          <Input value={conforme} onChange={(e) => setConforme(e.target.value)} className="h-8 text-sm" placeholder="Quién dio la conformidad" />
        </div>
      </div>

      <TomarOSubirVarias titulo="Registro fotográfico" archivos={fotos} onChange={setFotos} />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={subir} onChange={(e) => setSubir(e.target.checked)} className="size-4" />
        Al guardar, subir a postventa (les llega el aviso)
      </label>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={guardar} disabled={pendiente}>
          {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <FileCheck2 className="size-3.5" />}
          {subir ? "Guardar y subir a postventa" : "Guardar informe"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAbierto(false)} disabled={pendiente}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
