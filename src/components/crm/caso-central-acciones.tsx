"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  cerrarCasoCentral,
  contestarCasoCentral,
  insistirCasoCentral,
  pedirDatoCasoCentral,
  responderCasoCentral,
  tomarCasoCentral,
} from "@/lib/acciones/casos-central";
import type { EstadoCaso } from "@/lib/casos-central";
import { ElegirArchivos, subirArchivosCaso } from "@/components/crm/derivar-a-area-boton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Modo = null | "responder" | "pedir" | "contestar" | "cerrar" | "reabrir";

/**
 * Los botones del caso según quién mira y en qué estado está (0573). El
 * área: tomarlo, responder o pedir un dato. Central: contestar el dato,
 * volver a avisar, decir que no quedó resuelto o cerrarlo.
 */
export function CasoCentralAcciones({
  casoId,
  estado,
  lado,
  tomadoPorMi,
  areaEtiqueta,
}: {
  casoId: string;
  estado: EstadoCaso;
  lado: "central" | "area";
  tomadoPorMi: boolean;
  areaEtiqueta: string;
}) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>(null);
  const [texto, setTexto] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [problema, setProblema] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  function correr(fn: () => Promise<{ error: string | null }>, ok: string) {
    setProblema(null);
    iniciar(async () => {
      const r = await fn();
      if (r.error) {
        setProblema(r.error);
        return;
      }
      toast.success(ok);
      setModo(null);
      setTexto("");
      setArchivos([]);
      router.refresh();
    });
  }

  function enviarConArchivos(fn: (adj: Awaited<ReturnType<typeof subirArchivosCaso>>["adjuntos"]) => Promise<{ error: string | null }>, ok: string) {
    correr(async () => {
      const s = await subirArchivosCaso(archivos);
      if (s.error) return { error: s.error };
      return fn(s.adjuntos);
    }, ok);
  }

  if (estado === "cerrado") return null;

  const botones: React.ReactNode[] = [];
  if (lado === "area") {
    if (!tomadoPorMi && estado !== "respondido")
      botones.push(
        <Button key="tomar" size="sm" disabled={ocupado} onClick={() => correr(() => tomarCasoCentral(casoId), "Tomaste el caso: Central ya sabe que lo tienes")}>
          Tomar el caso
        </Button>,
      );
    if (estado !== "respondido") {
      botones.push(
        <Button key="resp" size="sm" variant={tomadoPorMi ? "default" : "outline"} disabled={ocupado} onClick={() => setModo("responder")}>
          Responder a Central
        </Button>,
      );
      if (estado !== "esperando_central")
        botones.push(
          <Button key="pedir" size="sm" variant="outline" disabled={ocupado} onClick={() => setModo("pedir")}>
            Pedir un dato a Central
          </Button>,
        );
    }
  } else {
    if (estado === "esperando_central")
      botones.push(
        <Button key="cont" size="sm" disabled={ocupado} onClick={() => setModo("contestar")}>
          Contestar
        </Button>,
      );
    if (estado === "nuevo" || estado === "tomado")
      botones.push(
        <Button
          key="ins"
          size="sm"
          variant="outline"
          disabled={ocupado}
          onClick={() => correr(() => insistirCasoCentral(casoId), `Volvimos a avisar a ${areaEtiqueta}`)}
        >
          Volver a avisar
        </Button>,
      );
    if (estado === "respondido") {
      botones.push(
        <Button key="cerrar-ok" size="sm" disabled={ocupado} onClick={() => correr(() => cerrarCasoCentral(casoId, ""), "Caso cerrado")}>
          Dar por cerrado
        </Button>,
        <Button key="reab" size="sm" variant="outline" disabled={ocupado} onClick={() => setModo("reabrir")}>
          No quedó resuelto
        </Button>,
      );
    } else {
      botones.push(
        <Button key="cerrar" size="sm" variant="ghost" disabled={ocupado} onClick={() => setModo("cerrar")}>
          Cerrar sin respuesta
        </Button>,
      );
    }
  }

  const formulario: Record<Exclude<Modo, null>, { etiqueta: string; ayuda: string; boton: string; archivos: boolean; enviar: () => void }> = {
    responder: {
      etiqueta: "Tu respuesta (le llega a Central)",
      ayuda: "Ej. Abono confirmado: S/ 4 820, BCP 20-10. / Factura F001-3392 emitida y enviada a compras@…",
      boton: "Enviar respuesta",
      archivos: true,
      enviar: () => enviarConArchivos((adj) => responderCasoCentral(casoId, texto, adj), "Respuesta enviada a Central"),
    },
    pedir: {
      etiqueta: "Qué dato te falta",
      ayuda: "Ej. ¿Cuál es la razón social correcta? En SUNAT figura con otra.",
      boton: "Pedir a Central",
      archivos: false,
      enviar: () => correr(() => pedirDatoCasoCentral(casoId, texto), "Le pediste el dato a Central"),
    },
    contestar: {
      etiqueta: `Tu respuesta (le llega a ${areaEtiqueta})`,
      ayuda: "Ej. La razón social correcta es … (adjunto la ficha RUC).",
      boton: "Contestar",
      archivos: true,
      enviar: () => enviarConArchivos((adj) => contestarCasoCentral(casoId, texto, adj), `Le contestaste a ${areaEtiqueta}`),
    },
    reabrir: {
      etiqueta: "Qué falta (vuelve al área)",
      ayuda: "Ej. El cliente dice que la factura todavía no le llega.",
      boton: "Devolver al área",
      archivos: true,
      enviar: () => enviarConArchivos((adj) => contestarCasoCentral(casoId, texto, adj), `El caso volvió a ${areaEtiqueta}`),
    },
    cerrar: {
      etiqueta: "Por qué lo cierras (lo lee el área)",
      ayuda: "Ej. El cliente ya pagó por otro medio; no hace falta.",
      boton: "Cerrar el caso",
      archivos: false,
      enviar: () => correr(() => cerrarCasoCentral(casoId, texto), "Caso cerrado"),
    },
  };
  const f = modo ? formulario[modo] : null;

  return (
    <div className="grid gap-3">
      {botones.length > 0 && <div className="flex flex-wrap gap-2">{botones}</div>}
      {f && (
        <div className="grid gap-2 rounded-lg border border-border bg-secondary/40 p-3">
          <label htmlFor={`caso-texto-${casoId}`} className="text-xs font-semibold">
            {f.etiqueta}
          </label>
          <Textarea id={`caso-texto-${casoId}`} rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={f.ayuda} />
          {f.archivos && <ElegirArchivos id={`caso-archivos-${casoId}`} archivos={archivos} onChange={setArchivos} />}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setModo(null)} disabled={ocupado}>
              Cancelar
            </Button>
            <Button size="sm" onClick={f.enviar} disabled={ocupado || texto.trim().length < 3}>
              {ocupado ? "Enviando…" : f.boton}
            </Button>
          </div>
        </div>
      )}
      {problema && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{problema}</p>}
    </div>
  );
}
