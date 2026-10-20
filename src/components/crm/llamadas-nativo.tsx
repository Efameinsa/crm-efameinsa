"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Mic } from "lucide-react";
import { TEXTO_CONSENTIMIENTO_LLAMADAS } from "@/lib/llamadas-consentimiento";
import { plugin, type EstadoLlamadas, type LlamadasPlugin } from "@/lib/llamadas-nativo";

/**
 * LA GRABACIÓN DE LLAMADAS DENTRO DE LA APP DE ANDROID: aceptación y lo que falta.
 *
 * Santos (19-10-2026). Solo existe dentro de la app y solo desde la versión que trae el
 * plugin «Llamadas». Orden de las cosas:
 *   1. La persona ACEPTA el aviso de grabación (queda escrito qué texto vio).
 *   2. Se le piden los permisos de teléfono de Android.
 *   3. Para grabar las dos voces hace falta Shizuku, encendido y autorizado.
 * Nunca bloquea el CRM: llamar con el botón funciona siempre; si algo falta, la llamada se
 * anota igual y solo queda sin audio. Con todo en orden NO SE VE NADA.
 */

type Fase = "iniciando" | "oculto" | "consentimiento" | "pendiente" | "listo";

const SONDEO_MS = 3000;

export function LlamadasNativo() {
  const [fase, setFase] = useState<Fase>("iniciando");
  const [estado, setEstado] = useState<EstadoLlamadas | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cerrado, setCerrado] = useState(false);
  const llamadas = useRef<LlamadasPlugin | null>(null);

  const revisar = useCallback(async () => {
    try {
      const p = llamadas.current ?? (llamadas.current = await plugin());
      if (!p) return setFase("oculto"); // versión de la app sin botón de llamadas
      const e = await p.estado();
      const r = await fetch("/api/llamadas/consentimiento", { credentials: "include", cache: "no-store" });
      if (!r.ok) return; // sin sesión o sin red: no se cambia nada
      const { consentimiento } = (await r.json()) as { consentimiento: boolean };
      // El CRM manda: si ya aceptó, el celular lo recuerda; si no, hay que pedirlo.
      if (consentimiento !== e.consentimiento) await p.aceptarGrabacion({ acepto: consentimiento });
      const nuevo = consentimiento === e.consentimiento ? e : await p.estado();
      setEstado(nuevo);
      if (!consentimiento) return setFase("consentimiento");
      setFase(nuevo.grabacion === "lista" ? "listo" : "pendiente");
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "No se pudo revisar la grabación de llamadas.");
      setFase((f) => (f === "iniciando" ? "oculto" : f));
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void revisar(), 0);
    return () => clearTimeout(t);
  }, [revisar]);

  // Mientras falte algo, se sigue mirando (la persona vuelve de Shizuku o de los ajustes) y al volver a la app.
  useEffect(() => {
    if (fase !== "pendiente") return;
    const mirar = async () => {
      try {
        if (!llamadas.current) return;
        const e = await llamadas.current.estado();
        setEstado(e);
        if (e.grabacion === "lista") setFase("listo");
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

  async function aceptar() {
    if (!llamadas.current || ocupado) return;
    setOcupado(true);
    setAviso(null);
    try {
      const e = await llamadas.current.estado();
      const r = await fetch("/api/llamadas/consentimiento", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instalacion_id: e.instalacionId }),
      });
      if (!r.ok) throw new Error("No se pudo guardar la aceptación.");
      setEstado(await llamadas.current.aceptarGrabacion({ acepto: true }));
      // Los permisos de teléfono se piden ahora, con la aceptación fresca.
      setEstado(await llamadas.current.pedirPermiso());
      await revisar();
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "No se pudo activar la grabación.");
    } finally {
      setOcupado(false);
    }
  }

  async function ejecutar(accion: "permisos" | "shizuku") {
    if (!llamadas.current || ocupado) return;
    setOcupado(true);
    try {
      setEstado(await (accion === "permisos" ? llamadas.current.pedirPermiso() : llamadas.current.pedirShizuku()));
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "No se pudo completar.");
    } finally {
      setOcupado(false);
    }
  }

  if (fase === "iniciando" || fase === "oculto" || fase === "listo" || cerrado) return null;

  if (fase === "consentimiento") {
    return (
      <div role="dialog" aria-label={TEXTO_CONSENTIMIENTO_LLAMADAS.titulo} className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
        <p className="flex items-center gap-2 font-semibold text-foreground">
          <Mic className="size-4 text-primary" aria-hidden /> {TEXTO_CONSENTIMIENTO_LLAMADAS.titulo}
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground">
          {TEXTO_CONSENTIMIENTO_LLAMADAS.puntos.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{TEXTO_CONSENTIMIENTO_LLAMADAS.pie}</p>
        {aviso && <p className="mt-2 text-xs font-medium text-amber-800">{aviso}</p>}
        <button
          type="button"
          disabled={ocupado}
          onClick={() => void aceptar()}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {ocupado && <Loader2 className="size-4 animate-spin" />} Acepto
        </button>
      </div>
    );
  }

  // fase === "pendiente": falta algo para grabar. Se explica qué y se ofrece el botón que corresponde.
  if (!estado) return null;
  const faltaTelefono = estado.motivo?.startsWith("Permita a la app");
  const faltaShizukuInstalado = estado.grabacion === "no_disponible";
  return (
    <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
      <p className="flex items-center gap-2 font-semibold text-amber-950">
        <AlertTriangle className="size-4" aria-hidden /> Falta un paso para grabar sus llamadas
      </p>
      <p className="mt-1 text-foreground">{estado.motivo}</p>
      <p className="text-xs text-muted-foreground">Mientras tanto puede llamar con el botón igual: la llamada se anota, solo que sin audio.</p>
      {estado.ultimoMotivo && <p className="mt-1 text-xs text-muted-foreground">Último intento: {estado.ultimoMotivo}</p>}
      {aviso && <p className="mt-1 text-xs font-medium text-amber-800">{aviso}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {faltaTelefono ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void ejecutar("permisos")}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            Permitir llamadas
          </button>
        ) : faltaShizukuInstalado ? (
          <a
            href="https://play.google.com/store/apps/details?id=moe.shizuku.privileged.api"
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white"
          >
            Instalar Shizuku
          </a>
        ) : (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void ejecutar("shizuku")}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            Abrir Shizuku / autorizar
          </button>
        )}
        <button type="button" onClick={() => setCerrado(true)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm">
          Ahora no
        </button>
      </div>
    </div>
  );
}
