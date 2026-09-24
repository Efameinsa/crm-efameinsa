"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { guardarInformeServicio } from "@/lib/acciones/postventa";
import { subirInformeApertura } from "@/lib/acciones/aperturas-llamada";
import type { TipoApertura } from "@/lib/aperturas-llamada";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TomarOSubirVarias } from "@/components/crm/tomar-o-subir";

/**
 * EL INFORME DE SOPORTE TÉCNICO DEL ALMACÉN (0297; Santos, 24-09, con la foto
 * del informe N.° 245-2026 de Open Investments).
 *
 * La cabecera es la del papel de siempre: asunto, fecha de ejecución y de
 * informe, hora de inicio y de culminación de la llamada y del informe,
 * técnico a cargo y quién lo elabora. Debajo, secciones que se pueden
 * renombrar, quitar o sumar —«a veces puede variar pero debe tener los campos
 * editables para amoldarlo al problema del cliente»—; cada línea sale como
 * viñeta. Y adjuntos: fotos y Word o PDF, «porque a veces es extenso».
 *
 * Se guarda como informe de servicio numerado (el mismo que se imprime desde
 * postventa) y queda ligado a la apertura; postventa recibe el aviso.
 */
type Seccion = { titulo: string; texto: string };

const PLANTILLAS: Record<TipoApertura, Seccion[]> = {
  videollamada_preinstalacion: [
    { titulo: "Detalle del problema", texto: "Corroborar preinstalación." },
    { titulo: "Verificación", texto: "Se revisaron los caños de suministro de agua fría y caliente.\nSe inspeccionaron las conexiones eléctricas.\nSe verificó el sistema de desagüe/desfogue de agua." },
    { titulo: "Capacitación", texto: "" },
  ],
  videollamada_puesta_marcha: [
    { titulo: "Detalle del problema", texto: "Puesta en marcha del equipo." },
    { titulo: "Verificación", texto: "" },
    {
      titulo: "Capacitación",
      texto:
        "Retiro de pernos: indicaciones para retirar los pernos de anclaje antes del uso.\nConexiones: uso correcto de las mangueras de agua y la conexión eléctrica.\nUso del equipo: carga máxima de ropa (kilos) y dosificación exacta de detergente.\nFuncionamiento: demostración con prueba sin carga, explicando las funciones de pausa y finalización del ciclo.",
    },
  ],
  soporte_videollamada: [
    { titulo: "Detalle del problema", texto: "" },
    { titulo: "Diagnóstico", texto: "" },
    { titulo: "Solución", texto: "" },
    { titulo: "Recomendaciones", texto: "" },
  ],
  atencion_in_situ: [
    { titulo: "Detalle del problema", texto: "" },
    { titulo: "Trabajo realizado", texto: "" },
    { titulo: "Observaciones", texto: "" },
  ],
  revision: [
    { titulo: "Detalle del problema", texto: "" },
    { titulo: "Revisión", texto: "" },
    { titulo: "Observaciones", texto: "" },
  ],
};

const TIPO_INFORME: Record<TipoApertura, string> = {
  videollamada_preinstalacion: "llamada",
  videollamada_puesta_marcha: "puesta_en_marcha",
  soporte_videollamada: "llamada",
  atencion_in_situ: "tecnico",
  revision: "revision",
};
const ASUNTO: Record<TipoApertura, string> = {
  videollamada_preinstalacion: "Video llamada",
  videollamada_puesta_marcha: "Video llamada · puesta en marcha",
  soporte_videollamada: "Video llamada · soporte técnico",
  atencion_in_situ: "Atención técnica en el local del cliente",
  revision: "Revisión del equipo",
};

const hoyLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const horaAhora = () => new Date().toLocaleTimeString("en-GB", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" });

export function InformeSoporteApertura({
  aperturaId,
  tipo,
  tecnico,
  cuentaId,
  servicioId,
  clienteTexto,
  equipos,
  programadaPara,
}: {
  aperturaId: string;
  tipo: TipoApertura;
  tecnico: string | null;
  cuentaId: string;
  servicioId: string | null;
  clienteTexto: string;
  equipos: string;
  programadaPara: string;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [asunto, setAsunto] = useState(ASUNTO[tipo]);
  const [fecha, setFecha] = useState(new Date(programadaPara).toLocaleDateString("en-CA", { timeZone: "America/Lima" }) || hoyLima());
  const [llamadaInicio, setLlamadaInicio] = useState(new Date(programadaPara).toLocaleTimeString("en-GB", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" }));
  const [llamadaFin, setLlamadaFin] = useState("");
  const [informeInicio, setInformeInicio] = useState(horaAhora());
  const [descripcion, setDescripcion] = useState(equipos);
  const [secciones, setSecciones] = useState<Seccion[]>(PLANTILLAS[tipo] ?? PLANTILLAS.soporte_videollamada);
  const [faltantes, setFaltantes] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [documentos, setDocumentos] = useState<File[]>([]);

  const cambiar = (i: number, campo: keyof Seccion, valor: string) => setSecciones((s) => s.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));
  const conTexto = secciones.filter((s) => s.titulo.trim() && s.texto.trim());

  async function subir(archivos: File[], carpeta: string) {
    const storage = createClient().storage.from("adjuntos");
    const subidas: { path: string; nombre: string; tipo: string; tamano: number }[] = [];
    for (const f of archivos) {
      if (f.size > 20 * 1024 * 1024) throw new Error(`«${f.name}» pasa de 20 MB`);
      const path = `aperturas/${aperturaId}/${carpeta}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, "_").slice(0, 80)}`;
      const { error } = await storage.upload(path, f, { contentType: f.type || "application/octet-stream" });
      if (error) throw new Error(`No se pudo subir «${f.name}»: ${error.message}`);
      subidas.push({ path, nombre: f.name, tipo: f.type, tamano: f.size });
    }
    return subidas;
  }

  function guardar() {
    if (conTexto.length === 0 && documentos.length === 0) return void toast.error("Escriba al menos una sección o adjunte el informe en Word o PDF");
    startTransition(async () => {
      let fotosSubidas, docsSubidos;
      try {
        fotosSubidas = await subir(fotos, "fotos");
        docsSubidos = await subir(documentos, "documentos");
      } catch (e) {
        return void toast.error(e instanceof Error ? e.message : "No se pudieron subir los archivos");
      }
      const r = await guardarInformeServicio({
        servicioId,
        cuentaId,
        clienteTexto,
        equipoTexto: descripcion,
        tipo: TIPO_INFORME[tipo],
        modalidad: tipo === "atencion_in_situ" || tipo === "revision" ? "in_situ" : "videollamada",
        ejecutadoAt: `${fecha}T${llamadaInicio || "12:00"}:00-05:00`,
        tecnico,
        asunto,
        horaInicio: llamadaInicio || null,
        horaFin: llamadaFin || null,
        horaInformeInicio: informeInicio || null,
        horaInformeFin: horaAhora(),
        secciones: conTexto,
        pendientes: faltantes.trim() || null,
        fotos: fotosSubidas,
        documentos: docsSubidos,
        aperturaId,
      });
      const idInforme = "id" in r ? r.id : undefined;
      if (r.error || !idInforme) return void toast.error(r.error ?? "No se pudo guardar el informe");
      // El texto que postventa corrige para el cliente: las secciones, tal cual.
      const texto = conTexto.map((s) => `${s.titulo.toUpperCase()}:\n${s.texto.trim()}`).join("\n\n") || "Informe adjunto en Word/PDF.";
      const r2 = await subirInformeApertura({ id: aperturaId, informe: texto, faltantes, fotos: fotosSubidas, informeServicioId: idInforme });
      if (r2.error) return void toast.error(r2.error);
      toast.success("Informe guardado y numerado: postventa recibe el aviso para revisarlo");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-3">
        <p className="mb-2 text-sm font-semibold text-foreground">Informe de soporte técnico</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Campo etiqueta="Asunto">
            <Input value={asunto} onChange={(e) => setAsunto(e.target.value)} />
          </Campo>
          <Campo etiqueta="Fecha de ejecución">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          <Campo etiqueta="Hora de inicio de la llamada">
            <Input type="time" value={llamadaInicio} onChange={(e) => setLlamadaInicio(e.target.value)} />
          </Campo>
          <Campo etiqueta="Hora de culminación de la llamada">
            <Input type="time" value={llamadaFin} onChange={(e) => setLlamadaFin(e.target.value)} />
          </Campo>
          <Campo etiqueta="Hora de inicio del informe">
            <Input type="time" value={informeInicio} onChange={(e) => setInformeInicio(e.target.value)} />
          </Campo>
          <Campo etiqueta="Técnico a cargo">
            <Input value={tecnico ?? "Postventa todavía no lo asignó"} readOnly className="bg-muted/40" />
          </Campo>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          La fecha del informe, la hora de culminación del informe y quién lo elabora se ponen solos al guardar. El número del informe también.
        </p>
      </div>

      <Campo etiqueta="Descripción del equipo">
        <Textarea rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </Campo>

      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">Secciones del informe</p>
        <p className="text-[11px] text-muted-foreground">Cambie el título, quite o sume secciones según el caso. Cada línea sale como una viñeta.</p>
        {secciones.map((s, i) => (
          <div key={i} className="rounded-lg border border-border p-2.5">
            <div className="flex items-center gap-2">
              <Input value={s.titulo} onChange={(e) => cambiar(i, "titulo", e.target.value)} className="h-8 font-semibold" placeholder="Título de la sección" />
              <button
                type="button"
                onClick={() => setSecciones((x) => x.filter((_, j) => j !== i))}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                aria-label={`Quitar la sección ${s.titulo}`}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            <Textarea rows={3} className="mt-1.5" value={s.texto} onChange={(e) => cambiar(i, "texto", e.target.value)} placeholder="Una línea por punto" />
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setSecciones((x) => [...x, { titulo: "", texto: "" }])}>
          <Plus className="size-3.5" /> Agregar una sección
        </Button>
      </div>

      <Campo etiqueta="Lo que le falta al cliente (para cotizar)">
        <Textarea rows={2} value={faltantes} onChange={(e) => setFaltantes(e.target.value)} placeholder="Uno por línea: válvula de gas, manguera, regulador…" />
      </Campo>

      <TomarOSubirVarias titulo="Fotos o capturas de la llamada" archivos={fotos} onChange={setFotos} maximo={20} />
      <Documentos archivos={documentos} onChange={setDocumentos} />

      <Button onClick={guardar} disabled={pendiente}>
        {pendiente && <Loader2 className="size-4 animate-spin" />}
        Guardar el informe y avisar a postventa
      </Button>
    </div>
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

/** Word o PDF: cuando el informe es extenso se adjunta completo. */
export function Documentos({ archivos, onChange, titulo = "Informe en Word o PDF (si es extenso)" }: { archivos: File[]; onChange: (f: File[]) => void; titulo?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{titulo}</Label>
      {archivos.map((f, i) => (
        <div key={i} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
          <span className="flex min-w-0 items-center gap-1.5">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{f.name}</span>
          </span>
          <button type="button" onClick={() => onChange(archivos.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground" aria-label={`Quitar ${f.name}`}>
            <X className="size-4" />
          </button>
        </div>
      ))}
      <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:bg-accent">
        <Upload className="size-3.5" /> Adjuntar Word o PDF
        <input
          type="file"
          multiple
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            onChange([...archivos, ...Array.from(e.target.files ?? [])].slice(0, 10));
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
