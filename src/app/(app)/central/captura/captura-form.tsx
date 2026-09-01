"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { analizarCaptura, registrarContacto, type AnalisisCaptura, type CoincidenciaCartera } from "@/lib/acciones/leads";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CampoAdjuntos, useAdjuntos } from "@/components/crm/campo-adjuntos";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fechaHoraLima, fechaLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

const CANALES = [
  ["whatsapp", "WhatsApp"],
  ["llamada", "Llamada"],
  ["formulario_web", "Formulario web"],
  ["facebook", "Facebook"],
  ["instagram", "Instagram"],
  ["email", "Correo"],
  ["presencial", "Presencial"],
  ["referido", "Referido"],
  ["otro", "Otro"],
] as const;

// Lo que se puede adjuntar, cómo se pega y cómo sube al bucket vive en
// CampoAdjuntos: este formulario y el «Pasar contacto a Central» del comercial
// usan exactamente las mismas reglas.

const MOTIVO: Record<CoincidenciaCartera["motivo"], { etiqueta: string; fuerte: boolean }> = {
  documento: { etiqueta: "mismo RUC/DNI", fuerte: true },
  telefono: { etiqueta: "mismo teléfono", fuerte: true },
  correo: { etiqueta: "mismo correo", fuerte: true },
  nombre: { etiqueta: "nombre parecido", fuerte: false },
};

let temporizadorBusqueda: ReturnType<typeof setTimeout> | null = null;
// Cada búsqueda lleva número. La consulta de «EDGAR» puede volver DESPUÉS que la
// de «EDGAR LINO CUTIPA» —salen mientras se teclea y no tardan lo mismo— y sin
// esto la respuesta vieja pisaba a la nueva: la pantalla mostraba coincidencias
// que ya no correspondían a lo escrito, o el «buscando…» se quedaba prendido.
let ultimaBusqueda = 0;

export function CapturaForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [analisis, setAnalisis] = useState<AnalisisCaptura | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [enviando, startTransition] = useTransition();
  const adjuntos = useAdjuntos();

  function campo(nombre: string): string {
    return (formRef.current?.elements.namedItem(nombre) as HTMLInputElement | null)?.value ?? "";
  }

  // Buscador automático (pedido de Central 25-08): nombre, teléfono y RUC/DNI
  // —y de paso razón social y correo— consultan la cartera mientras se
  // escribe, con el mismo pre-filtro del diálogo de asignar. Así Central sabe
  // ANTES de registrar si el contacto posiblemente le corresponde a un
  // comercial, no recién al derivar.
  function onCambioDatos() {
    if (temporizadorBusqueda) clearTimeout(temporizadorBusqueda);
    const datos = {
      nombre: campo("nombre_contacto"),
      razonSocial: campo("razon_social"),
      telefono: campo("telefono"),
      numDoc: campo("num_doc"),
      email: campo("email"),
    };
    const hayAlgo = Object.values(datos).some((v) => v.trim().length >= 3);
    if (!hayAlgo) {
      setAnalisis(null);
      setBuscando(false);
      return;
    }
    temporizadorBusqueda = setTimeout(async () => {
      const mia = ++ultimaBusqueda;
      setBuscando(true);
      const resultado = await analizarCaptura(datos);
      if (mia !== ultimaBusqueda) return; // llegó tarde: ya hay una más nueva en camino
      setAnalisis(resultado);
      setBuscando(false);
    }, 500);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      // Adjuntos primero, igual que en el registro de gestión: si una subida
      // falla, se avisa y NO se registra el contacto — mejor reintentar que
      // registrarlo sin la foto que el prospecto mandó.
      const subida = await adjuntos.subir();
      if (subida.error) {
        toast.error(subida.error);
        return;
      }
      formData.set("adjuntos", JSON.stringify(subida.adjuntos));
      // Todo contacto registrado acá es comercial (ver el comentario del
      // formulario): el área destino ya no se elige.
      formData.set("area_destino", "comercial");
      const resultado = await registrarContacto(formData);
      if (resultado.error) {
        toast.error(resultado.error);
        return;
      }
      toast.success(`Registrado ${resultado.codigo} — pasa a la bandeja de asignación.`);
      formRef.current?.reset();
      setAnalisis(null);
      adjuntos.limpiar();
      formRef.current?.querySelector<HTMLInputElement>("#nombre_contacto")?.focus();
    });
  }

  return (
    // El formulario a la izquierda y el análisis de coincidencias en columna
    // aparte a la derecha (pedido 25-08): cuando los avisos aparecían entre
    // los campos, empujaban hacia abajo justo lo que Central estaba llenando.
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
    <form ref={formRef} onSubmit={onSubmit} onPaste={adjuntos.onPaste} className="min-w-0 flex-1 space-y-4 lg:max-w-xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="canal">Canal</Label>
          <Select name="canal" defaultValue="whatsapp" required>
            <SelectTrigger id="canal" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CANALES.map(([valor, etiqueta]) => (
                <SelectItem key={valor} value={valor}>
                  {etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Acá había un selector de "Área destino". Lo quitó el ing. Carlos el
            24-08: «que no tenga la opción de otras áreas». Lo que no es
            comercial —servicio técnico, RR. HH., proveedores— sigue su camino
            en el ERP y no tiene nada que hacer en el CRM.

            No es solo simplificar la pantalla: elegir un área distinta sacaba
            al contacto de la cola comercial sin que se notara, y ese mismo día
            costó un prospecto que pedía cotización de equipos y se registró
            como "Otros". Todo lo que entra por acá va a la bandeja de triaje.
            El campo `area_destino` sigue existiendo en la base para el
            histórico importado; el formulario lo manda siempre en 'comercial'
            (ver registrarContacto). */}
      </div>

      <div className="space-y-2">
        <Label htmlFor="nombre_contacto">Nombre del contacto</Label>
        <Input id="nombre_contacto" name="nombre_contacto" required autoFocus onChange={onCambioDatos} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="telefono">Teléfono</Label>
          <Input id="telefono" name="telefono" onChange={onCambioDatos} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="num_doc">RUC / DNI</Label>
          <Input id="num_doc" name="num_doc" onChange={onCambioDatos} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="razon_social">Razón social / empresa (si aplica)</Label>
          <Input id="razon_social" name="razon_social" onChange={onCambioDatos} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Correo</Label>
          <Input id="email" name="email" type="email" onChange={onCambioDatos} />
        </div>
      </div>

      {/* Es el campo que decide a qué comercial conviene derivarlo y con qué
          preparación llama. Se rotuló como pregunta y con ejemplo porque
          "Mensaje / consulta" se leía como opcional y se dejaba vacío: el
          comercial recibía entonces un nombre y un teléfono, sin saber qué
          pidió. (Brenda, 24-08: «cada nuevo prospecto tiene diferente interés
          de compra».) */}
      <div className="space-y-2">
        <Label htmlFor="mensaje">¿Qué solicita?</Label>
        <Textarea
          id="mensaje"
          name="mensaje"
          rows={3}
          placeholder="Qué equipo pide, capacidad, para qué uso y cualquier dato que ayude al comercial. ej.: secadora 25 kg a vapor para lavandería en Surco; pregunta por precio y tiempo de entrega."
        />
        <p className="text-xs text-muted-foreground">
          Lo que escriba acá es lo primero que ve el comercial al abrir el contacto.
        </p>
      </div>

      {/* La foto o el PDF que el prospecto mandó por WhatsApp (pedido de
          Central 25-08). Tres caminos: elegir archivo, arrastrarlo acá, o
          pegar con Ctrl+V una captura de pantalla — este último es el caso
          real de todos los días. */}
      <div className="space-y-2">
        <Label>Fotos y archivos del prospecto</Label>
        <CampoAdjuntos ctl={adjuntos} />
      </div>

      <Button type="submit" disabled={enviando}>
        {adjuntos.progreso
          ? `Subiendo archivo ${adjuntos.progreso.hecho + 1} de ${adjuntos.progreso.total}…`
          : enviando
            ? "Registrando…"
            : "Registrar"}
      </Button>
    </form>

    {/* A quién pertenece —o podría pertenecer— lo que se está escribiendo.
        Documento/teléfono/correo son coincidencias fuertes; el nombre solo
        advierte (puede haber muchas "María Leguía"). El registro NO se
        bloquea: Central registra igual y decide en la derivación, ya
        sabiendo de quién es la cartera. En pantalla chica la columna cae
        debajo del formulario. */}
    <aside className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:w-96 lg:flex-none">
      <div className="rounded-md border border-border bg-secondary/30 p-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          <Search className="size-3.5" />
          Coincidencias en el sistema
        </p>
        {buscando && <p className="text-xs text-muted-foreground">Buscando en la cartera…</p>}
        {!buscando && (!analisis || analisis.coincidencias.length === 0) && (
          <p className="text-xs text-muted-foreground">
            Mientras escribe el nombre, teléfono o RUC/DNI, acá aparece si el contacto ya está en el
            sistema y de qué comercial es la cartera.
          </p>
        )}
        {!buscando && analisis && analisis.coincidencias.length > 0 && (
          <div className="space-y-2">
            {analisis.coincidencias.map((c) => {
              const m = MOTIVO[c.motivo];
              return (
                <div
                  key={c.cuentaId}
                  className={cn(
                    "rounded-md border p-2.5 text-sm",
                    m.fuerte ? "border-primary/30 bg-primary/5 text-foreground" : "border-border bg-background text-muted-foreground",
                  )}
                >
                  <p className="font-semibold">{c.razonSocial}</p>
                  <p className="text-xs">
                    {c.comercialNombre
                      ? `Cartera de ${c.comercialNombre}${c.codigoComercial ? ` (${c.codigoComercial})` : ""}`
                      : "Sin comercial asignado actualmente"}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px]", m.fuerte ? "bg-primary/10 font-semibold text-primary" : "bg-secondary")}>
                      {m.etiqueta}
                    </span>
                    {c.ultimaVentaAt && (
                      <span className="text-[11px] text-muted-foreground">última venta {fechaLima(c.ultimaVentaAt)}</span>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {analisis?.leadPendiente && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Ya hay un contacto pendiente de asignar con estos mismos datos: {analisis.leadPendiente.codigo}{" "}
          (recibido el {fechaHoraLima(analisis.leadPendiente.recibido_at)}).
        </div>
      )}
    </aside>
    </div>
  );
}
