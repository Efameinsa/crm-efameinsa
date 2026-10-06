"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Pencil, Phone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guardarPersonaDirectorio, guardarTecnico } from "@/lib/acciones/directorio";
import { AREAS_DE_AVISO } from "@/lib/directorio";
import { cn } from "@/lib/utils";

export interface PersonaDirectorio {
  id: string;
  orden: number;
  nombre: string;
  area: string;
  correo_efameinsa: string | null;
  correo_open: string | null;
  telefono: string | null;
  avisos: string[] | null;
  activo: boolean;
}

export interface Tecnico {
  id: string;
  orden: number;
  nombre: string;
  dni: string | null;
  activo: boolean;
}

const etiquetaAviso = (a: string) => AREAS_DE_AVISO.find((x) => x.clave === a)?.etiqueta ?? a;

function Correo({ v }: { v: string | null }) {
  if (!v) return <span className="text-muted-foreground">—</span>;
  return (
    <a href={`mailto:${v}`} className="inline-flex items-center gap-1 break-all text-foreground hover:text-primary hover:underline">
      <Mail className="size-3 shrink-0 text-muted-foreground" />
      {v}
    </a>
  );
}

function Telefono({ v }: { v: string | null }) {
  if (!v) return <span className="text-muted-foreground">—</span>;
  const digitos = v.replace(/\D/g, "");
  // Los celulares peruanos son de 9 dígitos y empiezan con 9; el resto (Karen, en el extranjero) va como está.
  const visible = /^9\d{8}$/.test(digitos) ? `${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6)}` : v;
  const tel = /^9\d{8}$/.test(digitos) ? `+51${digitos}` : `+${digitos}`;
  return (
    <a href={`tel:${tel}`} className="inline-flex items-center gap-1 whitespace-nowrap text-foreground hover:text-primary hover:underline">
      <Phone className="size-3 shrink-0 text-muted-foreground" />
      {visible}
    </a>
  );
}

export function TablaDirectorio({ personas, puedeEditar }: { personas: PersonaDirectorio[]; puedeEditar: boolean }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const f = filtro.trim().toLowerCase();
  const visibles = f
    ? personas.filter((p) => [p.nombre, p.area, p.correo_efameinsa, p.correo_open, p.telefono].some((x) => x?.toLowerCase().includes(f)))
    : personas;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar por nombre, área o correo" className="h-9 max-w-xs" />
        {puedeEditar && editando !== "nuevo" && (
          <Button size="sm" variant="outline" onClick={() => setEditando("nuevo")}>
            <Plus className="size-4" /> Agregar persona
          </Button>
        )}
      </div>
      {editando === "nuevo" && <FormularioPersona persona={null} alTerminar={() => setEditando(null)} />}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3 font-semibold">Persona</th>
              <th className="py-2 pr-3 font-semibold">Correo EFAMEINSA</th>
              <th className="py-2 pr-3 font-semibold">Correo OPEN</th>
              <th className="py-2 pr-3 font-semibold">Teléfono</th>
              <th className="py-2 pr-3 font-semibold">Recibe por correo</th>
              {puedeEditar && <th className="py-2" />}
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) =>
              editando === p.id ? (
                <tr key={p.id}>
                  <td colSpan={puedeEditar ? 6 : 5} className="py-2">
                    <FormularioPersona persona={p} alTerminar={() => setEditando(null)} />
                  </td>
                </tr>
              ) : (
                <tr key={p.id} className={cn("border-b border-border/60 align-top", !p.activo && "opacity-50")}>
                  <td className="py-2 pr-3">
                    <p className="font-medium text-foreground">{p.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.area}
                      {!p.activo && " · ya no está"}
                    </p>
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    <Correo v={p.correo_efameinsa} />
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    <Correo v={p.correo_open} />
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    <Telefono v={p.telefono} />
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-1">
                      {(p.avisos ?? []).length ? (
                        (p.avisos ?? []).map((a) => (
                          <span key={a} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                            Avisos de {etiquetaAviso(a)}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                  {puedeEditar && (
                    <td className="py-2 text-right">
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditando(p.id)} aria-label={`Editar a ${p.nombre}`}>
                        <Pencil className="size-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ),
            )}
            {!visibles.length && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                  {f ? `Nadie coincide con «${filtro.trim()}».` : "El directorio está vacío."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FormularioPersona({ persona, alTerminar }: { persona: PersonaDirectorio | null; alTerminar: () => void }) {
  const router = useRouter();
  const [guardando, empezar] = useTransition();
  const [v, setV] = useState({
    nombre: persona?.nombre ?? "",
    area: persona?.area ?? "",
    correoEfameinsa: persona?.correo_efameinsa ?? "",
    correoOpen: persona?.correo_open ?? "",
    telefono: persona?.telefono ?? "",
    avisos: persona?.avisos ?? [],
    activo: persona?.activo ?? true,
  });
  const campo = (k: "nombre" | "area" | "correoEfameinsa" | "correoOpen" | "telefono") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Input value={v.nombre} onChange={campo("nombre")} placeholder="Nombre" className="h-9" />
        <Input value={v.area} onChange={campo("area")} placeholder="Área" className="h-9" />
        <Input value={v.correoEfameinsa} onChange={campo("correoEfameinsa")} placeholder="…@efameinsa.com" className="h-9" type="email" />
        <Input value={v.correoOpen} onChange={campo("correoOpen")} placeholder="…@openinvestments.com.pe" className="h-9" type="email" />
        <Input value={v.telefono} onChange={campo("telefono")} placeholder="Teléfono" className="h-9" inputMode="tel" />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Le llegan por correo los avisos de:</span>
        {AREAS_DE_AVISO.map((a) => {
          const marcado = v.avisos.includes(a.clave);
          return (
            <button
              key={a.clave}
              type="button"
              onClick={() => setV((x) => ({ ...x, avisos: marcado ? x.avisos.filter((y) => y !== a.clave) : [...x.avisos, a.clave] }))}
              className={cn(
                "rounded-full border px-2.5 py-1 font-medium",
                marcado ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:border-primary/50",
              )}
              aria-pressed={marcado}
            >
              {a.etiqueta}
            </button>
          );
        })}
        <label className="ml-auto flex items-center gap-1.5 text-muted-foreground">
          <input type="checkbox" checked={v.activo} onChange={(e) => setV((x) => ({ ...x, activo: e.target.checked }))} />
          Sigue en la empresa
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={alTerminar} disabled={guardando}>
          Cancelar
        </Button>
        <Button
          size="sm"
          disabled={guardando}
          onClick={() =>
            empezar(async () => {
              const r = await guardarPersonaDirectorio({ id: persona?.id ?? null, ...v });
              if (r.error) return void toast.error(r.error);
              toast.success(persona ? "Guardado" : "Persona agregada");
              alTerminar();
              router.refresh();
            })
          }
        >
          Guardar
        </Button>
      </div>
    </div>
  );
}

export function TablaTecnicos({ tecnicos, puedeEditar }: { tecnicos: Tecnico[]; puedeEditar: boolean }) {
  const [editando, setEditando] = useState<string | null>(null);
  const visibles = puedeEditar ? tecnicos : tecnicos.filter((t) => t.activo);
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border/60 rounded-lg border border-border">
        {visibles.map((t) =>
          editando === t.id ? (
            <li key={t.id} className="p-2">
              <FormularioTecnico tecnico={t} alTerminar={() => setEditando(null)} />
            </li>
          ) : (
            <li key={t.id} className={cn("flex items-center gap-3 px-3 py-2 text-sm", !t.activo && "opacity-50")}>
              <span className="flex-1 font-medium text-foreground">
                {t.nombre}
                {!t.activo && <span className="ml-2 text-xs font-normal text-muted-foreground">ya no está</span>}
              </span>
              <span className="tabular-nums text-muted-foreground">{t.dni ? `DNI ${t.dni}` : "sin DNI"}</span>
              {puedeEditar && (
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditando(t.id)} aria-label={`Editar a ${t.nombre}`}>
                  <Pencil className="size-3.5" />
                </Button>
              )}
            </li>
          ),
        )}
        {!visibles.length && <li className="px-3 py-4 text-sm text-muted-foreground">Todavía no hay técnicos en la relación.</li>}
      </ul>
      {puedeEditar &&
        (editando === "nuevo" ? (
          <FormularioTecnico tecnico={null} alTerminar={() => setEditando(null)} />
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditando("nuevo")}>
            <Plus className="size-4" /> Agregar técnico
          </Button>
        ))}
    </div>
  );
}

function FormularioTecnico({ tecnico, alTerminar }: { tecnico: Tecnico | null; alTerminar: () => void }) {
  const router = useRouter();
  const [guardando, empezar] = useTransition();
  const [nombre, setNombre] = useState(tecnico?.nombre ?? "");
  const [dni, setDni] = useState(tecnico?.dni ?? "");
  const [activo, setActivo] = useState(tecnico?.activo ?? true);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/30 p-2">
      <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" className="h-8 min-w-[180px] flex-1" />
      <Input value={dni} onChange={(e) => setDni(e.target.value.replace(/\D/g, "").slice(0, 9))} placeholder="DNI" className="h-8 w-28" inputMode="numeric" />
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
        Activo
      </label>
      <Button size="sm" variant="ghost" className="h-8" onClick={alTerminar} disabled={guardando}>
        Cancelar
      </Button>
      <Button
        size="sm"
        className="h-8"
        disabled={guardando}
        onClick={() =>
          empezar(async () => {
            const r = await guardarTecnico({ id: tecnico?.id ?? null, nombre, dni, activo });
            if (r.error) return void toast.error(r.error);
            toast.success(tecnico ? "Guardado" : "Técnico agregado");
            alTerminar();
            router.refresh();
          })
        }
      >
        Guardar
      </Button>
    </div>
  );
}
