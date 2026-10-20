"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Headset, Loader2 } from "lucide-react";
import { plugin, type EstadoSetter, type LlamadasPlugin } from "@/lib/llamadas-nativo";

/**
 * EL MODO SETTER DENTRO DE LA APP (Santos, 20-10-2026).
 *
 * «Cada vez que llegue un lead a un Google Sheets… se llame inmediatamente a la persona
 * (quiero hacer el papel de setter)». Solo existe dentro de la app, con el plugin
 * «Llamadas», y solo para la cuenta que gerencia marcó (`perfiles.setter_llamadas`).
 *
 * La persona lo enciende una vez; la app queda mirando el CRM y, al llegar un lead con
 * teléfono, avisa y marca. Esta tarjeta también le dice qué permiso falta y le da el
 * botón para darlo. Con todo en orden y encendido, solo queda una línea discreta.
 */

type Fase = "iniciando" | "oculto" | "listo";

const SONDEO_MS = 3000;

function falta(e: EstadoSetter): { texto: string; boton: string; cual: "telefono" | "notificaciones" | "sobreOtrasApps" | "bateria" } | null {
  if (!e.telefono) return { texto: "Permita a la app hacer llamadas: sin eso no puede marcar.", boton: "Permitir llamadas", cual: "telefono" };
  if (!e.notificaciones) return { texto: "Permita los avisos: ahí verá el nombre y el número del lead.", boton: "Permitir avisos", cual: "notificaciones" };
  if (!e.sobreOtrasApps)
    return {
      texto: "Para que marque SOLA apenas llega el lead, active «Mostrar sobre otras apps» para esta app. Sin eso le llega el aviso y marca con un toque.",
      boton: "Activar marcado automático",
      cual: "sobreOtrasApps",
    };
  if (!e.bateriaLibre) return { texto: "Quite el ahorro de batería para esta app: si no, el celular la duerme y se pierden leads.", boton: "Quitar el ahorro", cual: "bateria" };
  return null;
}

export function SetterNativo() {
  const [fase, setFase] = useState<Fase>("iniciando");
  const [estado, setEstado] = useState<EstadoSetter | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const llamadas = useRef<LlamadasPlugin | null>(null);

  const revisar = useCallback(async () => {
    try {
      const p = llamadas.current ?? (llamadas.current = await plugin());
      if (!p?.setterEstado) return setFase("oculto"); // versión de la app sin modo setter
      const r = await fetch("/api/llamadas/setter", { credentials: "include", cache: "no-store" });
      if (!r.ok) return;
      const { setter } = (await r.json()) as { setter: boolean };
      if (!setter) {
        const e = await p.setterEstado();
        if (e.activo) await p.setterActivar({ activo: false }); // ya no es setter: se apaga
        return setFase("oculto");
      }
      setEstado(await p.setterEstado());
      setFase("listo");
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "No se pudo revisar el modo setter.");
      setFase((f) => (f === "iniciando" ? "oculto" : f));
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void revisar(), 0);
    return () => clearTimeout(t);
  }, [revisar]);

  // La persona vuelve de los ajustes de Android: se mira de nuevo seguido.
  useEffect(() => {
    if (fase !== "listo") return;
    const mirar = async () => {
      try {
        if (llamadas.current) setEstado(await llamadas.current.setterEstado());
      } catch {
        /* se reintenta */
      }
    };
    const t = setInterval(mirar, SONDEO_MS);
    const alVolver = () => document.visibilityState === "visible" && void mirar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [fase]);

  async function encender() {
    const p = llamadas.current;
    if (!p || ocupado) return;
    setOcupado(true);
    setAviso(null);
    try {
      const e = await p.estado();
      const r = await fetch("/api/llamadas/setter", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instalacion_id: e.instalacionId,
          version_app: e.version,
          modelo: navigator.userAgent.match(/;\s*([^;)]+)\s+Build\//)?.[1]?.slice(0, 60),
        }),
      });
      if (!r.ok) throw new Error("El CRM no pudo vincular este celular.");
      const { token } = (await r.json()) as { token: string };
      await p.configurar({ urlBase: window.location.origin, token });
      setEstado(await p.setterActivar({ activo: true }));
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "No se pudo encender el modo setter.");
    } finally {
      setOcupado(false);
    }
  }

  async function apagar() {
    if (!llamadas.current || ocupado) return;
    setOcupado(true);
    try {
      setEstado(await llamadas.current.setterActivar({ activo: false }));
    } finally {
      setOcupado(false);
    }
  }

  async function dar(cual: "telefono" | "notificaciones" | "sobreOtrasApps" | "bateria") {
    if (!llamadas.current || ocupado) return;
    setOcupado(true);
    try {
      setEstado(await llamadas.current.setterPermiso({ cual }));
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "No se pudo pedir el permiso.");
    } finally {
      setOcupado(false);
    }
  }

  if (fase === "iniciando" || fase === "oculto" || !estado) return null;

  const pendiente = falta(estado);
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
      <p className="flex items-center gap-2 font-semibold text-foreground">
        <Headset className="size-4 text-primary" aria-hidden /> Modo setter
        <span className={`rounded-full px-2 text-[11px] font-semibold ${estado.activo ? "bg-emerald-100 text-emerald-800" : "bg-secondary text-muted-foreground"}`}>
          {estado.activo ? "encendido" : "apagado"}
        </span>
      </p>
      <p className="mt-1 text-muted-foreground">
        {estado.activo
          ? "Cada lead nuevo con teléfono le llega como aviso y esta app lo llama. Al colgar se abre sola una pantalla para tipificarlo con un toque; el lead pasa al vendedor solo cuando usted lo tipifica."
          : "Encienda el modo setter para que esta app llame a cada lead nuevo apenas llega, para validarlo."}
      </p>
      {estado.activo && pendiente && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-amber-950">{pendiente.texto}</p>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void dar(pendiente.cual)}
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pendiente.boton}
          </button>
        </div>
      )}
      {estado.activo && (estado.porTipificar ?? 0) > 0 && (
        <button
          type="button"
          disabled={ocupado}
          onClick={() => void llamadas.current?.setterTipificar?.()}
          className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {estado.porTipificar === 1 ? "Tipificar el lead que falta" : `Tipificar los ${estado.porTipificar} leads que faltan`}
        </button>
      )}
      {(aviso || estado.ultimoError) && <p className="mt-2 text-xs font-medium text-amber-800">{aviso ?? estado.ultimoError}</p>}
      <button
        type="button"
        disabled={ocupado}
        onClick={() => void (estado.activo ? apagar() : encender())}
        className={`mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-60 ${
          estado.activo ? "border border-border bg-background text-foreground" : "bg-primary text-primary-foreground"
        }`}
      >
        {ocupado && <Loader2 className="size-4 animate-spin" />} {estado.activo ? "Apagar el modo setter" : "Encender el modo setter"}
      </button>
    </div>
  );
}
