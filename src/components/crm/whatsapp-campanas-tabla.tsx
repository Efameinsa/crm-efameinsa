"use client";

// Administración de los códigos de campaña de WhatsApp (M1-A, M1-B…), fase 1
// sin API (14-09-2026). Quien administra marketing carga acá el código que va
// en el mensaje prellenado de cada anuncio; Central y los comerciales solo
// eligen de esta lista al registrar un contacto — nunca lo tipean.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Copy, Check } from "lucide-react";
import {
  crearCampaniaWhatsapp,
  actualizarCampaniaWhatsapp,
  type CampaniaWhatsapp,
} from "@/lib/acciones/whatsapp-campanas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fechaLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

const ETIQUETA_PLATAFORMA: Record<string, string> = { meta: "Meta Ads", google: "Google Ads", otro: "Otro" };

function FilaCampania({ campania }: { campania: CampaniaWhatsapp }) {
  const [editando, setEditando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [enviando, startTransition] = useTransition();

  function copiarMensaje() {
    if (!campania.mensaje_prellenado) return;
    navigator.clipboard?.writeText(campania.mensaje_prellenado).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  }

  function guardar(formData: FormData) {
    formData.set("activa", String(campania.activa));
    startTransition(async () => {
      const r = await actualizarCampaniaWhatsapp(campania.id, formData);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Actualizado");
      setEditando(false);
    });
  }

  function alternarActiva() {
    const fd = new FormData();
    fd.set("nombre", campania.nombre);
    fd.set("mensaje_prellenado", campania.mensaje_prellenado ?? "");
    fd.set("activa", String(!campania.activa));
    startTransition(async () => {
      const r = await actualizarCampaniaWhatsapp(campania.id, fd);
      if (r.error) toast.error(r.error);
    });
  }

  if (editando) {
    return (
      <TableRow>
        <TableCell colSpan={5} className="bg-secondary/30 p-3">
          <form action={guardar} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-xs font-semibold">{campania.codigo}</span>
              <Input name="nombre" defaultValue={campania.nombre} placeholder="Nombre de la campaña" className="max-w-sm" required />
            </div>
            <Textarea
              name="mensaje_prellenado"
              defaultValue={campania.mensaje_prellenado ?? ""}
              placeholder={`Hola, vi su anuncio y quiero información. [${campania.codigo}]`}
              rows={2}
              className="text-xs"
            />
            <div className="space-y-1">
              <Label htmlFor={`campaign_id_${campania.id}`} className="text-[11px] text-muted-foreground">
                Id del anuncio en Meta (opcional, pero es lo que hace que el origen se reconozca solo)
              </Label>
              <Input
                id={`campaign_id_${campania.id}`}
                name="campaign_id"
                defaultValue={campania.campaign_id ?? ""}
                placeholder="120251382125240751"
                inputMode="numeric"
                className="max-w-xs font-mono text-xs"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={enviando}>
                Guardar
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditando(false)} disabled={enviando}>
                Cancelar
              </Button>
            </div>
          </form>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow className={cn(!campania.activa && "opacity-50")}>
      <TableCell className="font-mono text-xs font-semibold">{campania.codigo}</TableCell>
      <TableCell>
        <p className="font-medium text-foreground">{campania.nombre}</p>
        {campania.mensaje_prellenado && (
          <button
            type="button"
            onClick={copiarMensaje}
            className="mt-0.5 flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            title="Copiar el mensaje prellenado"
          >
            {copiado ? <Check className="size-3 text-[#1E7F4F]" /> : <Copy className="size-3" />}
            <span className="max-w-xs truncate">{campania.mensaje_prellenado}</span>
          </button>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {ETIQUETA_PLATAFORMA[campania.plataforma]}
        <span className={cn("mt-0.5 block font-mono text-[10px]", campania.campaign_id ? "text-muted-foreground" : "text-amber-700")}>
          {campania.campaign_id ? `anuncio ${campania.campaign_id}` : "sin id de anuncio"}
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fechaLima(campania.created_at)}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
            Editar
          </Button>
          <Button size="sm" variant={campania.activa ? "outline" : "default"} onClick={alternarActiva} disabled={enviando}>
            {campania.activa ? "Dar de baja" : "Reactivar"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function NuevaCampania() {
  const [abierto, setAbierto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [enviando, startTransition] = useTransition();

  function crear(formData: FormData) {
    startTransition(async () => {
      const r = await crearCampaniaWhatsapp(formData);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`Código "${formData.get("codigo")}" creado`);
      setAbierto(false);
      setCodigo("");
    });
  }

  if (!abierto) {
    return (
      <Button size="sm" onClick={() => setAbierto(true)}>
        <Plus className="size-3.5" /> Nuevo código de campaña
      </Button>
    );
  }

  return (
    <form action={crear} className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="text-sm font-semibold text-foreground">Nuevo código de campaña de WhatsApp</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="nuevo-codigo">Código</Label>
          <Input
            id="nuevo-codigo"
            name="codigo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="M1-A"
            required
            className="bg-card font-mono"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="nuevo-nombre">Nombre de la campaña</Label>
          <Input id="nuevo-nombre" name="nombre" placeholder="Lavadoras semi industriales — Meta" required className="bg-card" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="nueva-plataforma">Plataforma</Label>
          <Select name="plataforma" defaultValue="meta">
            <SelectTrigger id="nueva-plataforma" className="w-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="meta">Meta Ads</SelectItem>
              <SelectItem value="google">Google Ads</SelectItem>
              <SelectItem value="otro">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nuevo-campaign-id">ID de campaña (opcional)</Label>
          <Input id="nuevo-campaign-id" name="campaign_id" placeholder="Si ya se conoce" className="bg-card" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nuevo-mensaje">Mensaje prellenado del anuncio</Label>
        <Textarea
          id="nuevo-mensaje"
          name="mensaje_prellenado"
          rows={2}
          placeholder={`Hola, vi su anuncio de lavadoras semi industriales y quiero información. [${codigo || "M1-A"}]`}
          className="bg-card text-xs"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={enviando}>
          Crear
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setAbierto(false)} disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function WhatsappCampanasTabla({ campanias }: { campanias: CampaniaWhatsapp[] }) {
  return (
    <div className="space-y-3">
      <NuevaCampania />
      {campanias.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay códigos cargados.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Campaña</TableHead>
                <TableHead>Plataforma</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campanias.map((c) => (
                <FilaCampania key={c.id} campania={c} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
