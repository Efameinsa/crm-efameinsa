import Link from "next/link";
import { Phone, PhoneMissed } from "lucide-react";

export interface LlamadaVista {
  id: string;
  hora: string;
  comercial: string;
  cuentaId: string | null;
  cliente: string | null;
  contacto: string | null;
  numero: string;
  duracion: string;
  contestada: boolean;
  origen: string;
  estadoAudio: string;
  estadoIa: string;
  resumen: string | null;
  proximaAccion: string | null;
  tono: string | null;
}

/** Qué pasó con el audio, dicho como lo entiende quien mira la lista (no como el código de la base). */
export function textoDeAudio(estadoAudio: string, origen: string, contestada: boolean): string {
  if (!contestada) return "Nadie contestó: no hay audio.";
  if (origen === "pwa" || estadoAudio === "sin_audio_pwa") return "Llamó desde el navegador: el CRM no puede grabar desde ahí.";
  switch (estadoAudio) {
    case "subido":
      return "";
    case "pendiente":
      return "El audio viene en camino desde el celular.";
    case "no_encontrado":
      return "El celular no encontró la grabación de esta llamada.";
    case "no_disponible":
      return "Esta llamada no tiene audio (el celular no grabó o esta copia del CRM no guarda audios).";
    default:
      return "";
  }
}

/** Una llamada en la lista: quién, a quién, cuánto, y el audio + transcripción + resumen si existen. */
export function FilaLlamada({ l }: { l: LlamadaVista }) {
  const aviso = textoDeAudio(l.estadoAudio, l.origen, l.contestada);
  const hayAudio = l.estadoAudio === "subido";
  const Icono = l.contestada ? Phone : PhoneMissed;
  return (
    <li className="space-y-1.5 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Icono className={`size-3.5 flex-none ${l.contestada ? "text-emerald-700" : "text-muted-foreground"}`} />
        <span className="tabular-nums font-semibold text-foreground">{l.hora}</span>
        <span className="text-muted-foreground">{l.comercial}</span>
        <span className="text-muted-foreground">→</span>
        {l.cuentaId ? (
          <Link href={`/gerencia/clientes/${l.cuentaId}`} className="font-semibold text-primary hover:underline">
            {l.cliente ?? "Ficha sin nombre"}
          </Link>
        ) : (
          <b className="font-semibold text-foreground">Número sin ficha</b>
        )}
        {l.contacto && <span className="text-muted-foreground">({l.contacto})</span>}
        <span className="tabular-nums text-muted-foreground">{l.numero}</span>
        <span className="tabular-nums text-muted-foreground">· {l.duracion}</span>
        {l.tono && <span className="rounded-full bg-secondary px-2 text-[10px] font-semibold text-muted-foreground">{l.tono}</span>}
      </div>

      {hayAudio && (
        <div className="flex flex-wrap items-center gap-2">
          <audio controls preload="none" src={`/api/llamadas/${l.id}/audio`} className="h-8 w-full max-w-md" />
          <a href={`/api/llamadas/${l.id}/audio?descargar=1`} className="font-semibold text-primary hover:underline">
            Descargar audio
          </a>
          {l.estadoIa === "listo" && (
            <>
              <a href={`/api/llamadas/${l.id}/transcripcion`} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
                Leer transcripción
              </a>
              <a href={`/api/llamadas/${l.id}/transcripcion?descargar=1`} className="font-semibold text-primary hover:underline">
                Descargar .txt
              </a>
            </>
          )}
          {(l.estadoIa === "pendiente" || l.estadoIa === "procesando") && <span className="text-muted-foreground">Transcribiendo…</span>}
          {l.estadoIa === "error" && <span className="text-destructive">No se pudo transcribir.</span>}
        </div>
      )}
      {aviso && <p className="text-muted-foreground">{aviso}</p>}

      {l.resumen && (
        <div className="rounded-lg bg-secondary/60 p-2.5 text-foreground">
          <p>{l.resumen}</p>
          {l.proximaAccion && (
            <p className="mt-1 text-muted-foreground">
              <b className="font-semibold text-foreground">Próxima acción:</b> {l.proximaAccion}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
