"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, MapPin, ShieldCheck } from "lucide-react";
import { TEXTO_CONSENTIMIENTO, VERSION_CONSENTIMIENTO } from "@/lib/campo-consentimiento";
import { AYUDA_PERMISO, permisoPendiente, plugin, type EstadoRastreo, type RastreoPlugin } from "@/lib/rastreo-nativo";

/**
 * EL GPS DE LA APP DE ANDROID: aceptación, permisos y estado.
 *
 * Santos (01-10-2026): el GPS en segundo plano lo hace la propia app (servicio nativo
 * de Android, repo Efameinsa/crm-app-movil), **las 24 horas** por regla de gerencia: es
 * el celular de la empresa y el vendedor atiende a clientes a cualquier hora. Esto es lo
 * que ve la persona. Solo existe dentro de la app y solo para quien gerencia marcó
 * (`perfiles.trabajo_de_campo`, el layout lo decide); en el navegador no hace nada.
 *
 * Orden de las cosas:
 *   1. Gerencia la marcó y la app lo confirma con el CRM.
 *   2. La persona ACEPTA el texto (queda escrito qué versión vio).
 *   3. La app se vincula sola (el CRM le entrega su token) y arranca el servicio.
 *   4. Android pide, una por una, las cuatro cosas sin las que el GPS se corta con la
 *      pantalla apagada: ubicación, «todo el tiempo», aviso fijo y sin ahorro de batería.
 *
 * Nunca bloquea el CRM: si algo falta, lo dice y deja trabajar.
 */

type Fase = "iniciando" | "oculto" | "consentimiento" | "trabajando" | "desactivado";

const SONDEO_MS = 3000;

function hora(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });
}

export function RastreoNativo() {
  const [fase, setFase] = useState<Fase>("iniciando");
  const [estado, setEstado] = useState<EstadoRastreo | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const rastreo = useRef<RastreoPlugin | null>(null);

  /** Vincula este celular (el CRM le da su token) y arranca el servicio. */
  const vincular = useCallback(async (p: RastreoPlugin, e: EstadoRastreo, acepta: boolean): Promise<EstadoRastreo | null> => {
    const r = await fetch("/api/campo/dispositivo", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instalacion_id: e.instalacionId,
        version_app: e.version,
        modelo: navigator.userAgent.match(/;\s*([^;)]+)\s+Build\//)?.[1]?.slice(0, 60),
        ...(acepta ? { consentimiento: { version: VERSION_CONSENTIMIENTO, aceptado: true } } : {}),
      }),
    });
    if (r.status === 409) return null; // falta aceptar
    if (!r.ok) throw new Error(`El CRM no pudo vincular el celular (${r.status}).`);
    const j = (await r.json()) as { token: string; intervalo_s: number; distancia_m: number };
    return p.iniciar({ url: `${window.location.origin}/api/campo/osmand`, token: j.token, intervaloSeg: j.intervalo_s, distanciaM: j.distancia_m });
  }, []);

  const revisar = useCallback(async () => {
    try {
      const p = rastreo.current ?? (rastreo.current = await plugin());
      if (!p) return setFase("oculto");
      let e = await p.estado();
      const r = await fetch(`/api/campo/dispositivo?instalacion_id=${encodeURIComponent(e.instalacionId)}`, { credentials: "include", cache: "no-store" });
      if (!r.ok) return; // sin sesión o sin red: no se cambia nada
      const s = (await r.json()) as { marcado: boolean; consentimiento: boolean; dispositivo: { activo: boolean } | null };
      // Gerencia la desmarcó: el servicio se apaga solo.
      if (!s.marcado) {
        if (e.activo) await p.detener();
        return setFase("oculto");
      }
      // Gerencia desactivó ESTE celular desde «Trabajo de campo».
      if (s.dispositivo && !s.dispositivo.activo) {
        if (e.activo) await p.detener();
        setEstado(await p.estado());
        return setFase("desactivado");
      }
      if (!s.consentimiento) return setFase("consentimiento");
      // Aceptó y no hay servicio configurado (instalación nueva): se vincula sin molestarla.
      if (!e.activo) {
        const nuevo = await vincular(p, e, false);
        if (nuevo) e = nuevo;
        else return setFase("consentimiento");
      }
      setEstado(await p.estado());
      setFase("trabajando");
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "No se pudo revisar el GPS.");
    }
  }, [vincular]);

  useEffect(() => {
    // En un temporizador y no directo: la revisión pregunta al celular y al CRM, y guarda el resultado.
    const t = setTimeout(() => void revisar(), 0);
    return () => clearTimeout(t);
  }, [revisar]);

  // Mientras falte algo, se sigue mirando (la persona vuelve de los ajustes de Android) y al volver a la app.
  useEffect(() => {
    if (fase !== "trabajando") return;
    const mirar = async () => {
      try {
        if (rastreo.current) setEstado(await rastreo.current.estado());
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
    if (!rastreo.current || ocupado) return;
    setOcupado(true);
    setAviso(null);
    try {
      const e = await rastreo.current.estado();
      const nuevo = await vincular(rastreo.current, e, true);
      if (!nuevo) throw new Error("No se pudo guardar la aceptación.");
      setEstado(nuevo);
      setFase("trabajando");
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "No se pudo activar el GPS.");
    } finally {
      setOcupado(false);
    }
  }

  async function pedir(cual: Parameters<RastreoPlugin["pedirPermiso"]>[0]["cual"]) {
    if (!rastreo.current || ocupado) return;
    setOcupado(true);
    try {
      setEstado(await rastreo.current.pedirPermiso({ cual }));
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "No se pudo pedir el permiso.");
    } finally {
      setOcupado(false);
    }
  }

  if (fase === "iniciando" || fase === "oculto") return null;

  if (fase === "desactivado") {
    return (
      <div role="status" className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm sm:px-4">
        <MapPin className="mt-0.5 size-4 flex-none text-muted-foreground" aria-hidden />
        <p className="text-foreground">
          <span className="font-semibold">Gerencia desactivó el GPS de este celular.</span>{" "}
          <span className="text-muted-foreground">Ya no se registra la ubicación.</span>
        </p>
      </div>
    );
  }

  if (fase === "consentimiento") {
    return (
      <div role="dialog" aria-label={TEXTO_CONSENTIMIENTO.titulo} className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
        <p className="flex items-center gap-2 font-semibold text-foreground">
          <ShieldCheck className="size-4 text-primary" aria-hidden /> {TEXTO_CONSENTIMIENTO.titulo}
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground">
          {TEXTO_CONSENTIMIENTO.puntos.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{TEXTO_CONSENTIMIENTO.pie}</p>
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

  // fase === "trabajando"
  const falta = estado ? permisoPendiente(estado.permisos) : null;
  if (falta) {
    const ayuda = AYUDA_PERMISO[falta];
    return (
      <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
        <p className="flex items-center gap-2 font-semibold text-amber-950">
          <AlertTriangle className="size-4" aria-hidden /> Falta un permiso para que el GPS siga con la pantalla apagada
        </p>
        <p className="mt-1 font-medium text-foreground">{ayuda.titulo}</p>
        <p className="text-muted-foreground">{ayuda.texto}</p>
        {aviso && <p className="mt-1 text-xs font-medium text-amber-800">{aviso}</p>}
        <button
          type="button"
          disabled={ocupado}
          onClick={() => void pedir(falta)}
          className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {ayuda.boton}
        </button>
      </div>
    );
  }

  if (!estado) return null;
  const guardando = estado.pendientes > 0;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm sm:px-4">
      <MapPin className="size-4 flex-none text-primary" aria-hidden />
      <p className="min-w-0 flex-1 basis-56 text-foreground">
        <span className="font-semibold">GPS activo, las 24 horas.</span>{" "}
        <span className="text-muted-foreground">
          {estado.ultimoError === "desactivado"
            ? "Gerencia lo desactivó."
            : guardando
              ? `Sin señal con el CRM: ${estado.pendientes} punto${estado.pendientes === 1 ? "" : "s"} guardado${estado.pendientes === 1 ? "" : "s"} en el celular. Último envío ${hora(estado.ultimoEnvio)}.`
              : `Último envío ${hora(estado.ultimoEnvio)}.`}
        </span>
      </p>
    </div>
  );
}
