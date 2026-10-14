import Link from "@/components/enlace";
import { Fragment, type ReactNode } from "react";

/**
 * LA RESPUESTA DEL ASISTENTE, CON FORMATO (14-10).
 *
 * Claude contesta con negritas y listas en markdown, y la burbuja las mostraba
 * con asteriscos: «**Pago parcial**». Esto entiende lo poco que el asistente
 * usa —párrafos, listas, títulos, **negrita**, `código` y enlaces— y nada más.
 * No se usa una librería de markdown a propósito: lo que no se reconoce queda
 * como texto, y nada de lo que escriba el modelo se convierte en HTML.
 *
 * ENLACES: solo los internos del CRM («/nuevo/pedido/…»). Un enlace a otro
 * sitio se muestra como texto: el asistente no tiene por qué mandar a nadie
 * fuera del CRM, y si alguna vez lo intentara (un documento adjunto que se lo
 * pida, por ejemplo), no queda un clic a mano.
 */

function enLinea(texto: string, clave: string): ReactNode[] {
  const partes: ReactNode[] = [];
  const patron = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = patron.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    const k = `${clave}-${i++}`;
    if (m[1] != null) partes.push(<strong key={k} className="font-semibold">{m[1]}</strong>);
    else if (m[2] != null) partes.push(<code key={k} className="rounded bg-muted px-1 font-mono text-[12px]">{m[2]}</code>);
    else if (m[4]?.startsWith("/") && !m[4].startsWith("//")) {
      partes.push(
        <Link key={k} href={m[4]} className="font-medium text-primary underline underline-offset-2 hover:text-primary/80">
          {m[3]}
        </Link>,
      );
    } else partes.push(m[3]);
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

export function TextoAsistente({ texto }: { texto: string }) {
  const bloques: ReactNode[] = [];
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  let lista: { ordenada: boolean; items: string[] } | null = null;
  let parrafo: string[] = [];

  const cerrarParrafo = () => {
    if (parrafo.length) {
      const k = `p${bloques.length}`;
      bloques.push(
        <p key={k}>
          {parrafo.map((l, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {enLinea(l, `${k}-${i}`)}
            </Fragment>
          ))}
        </p>,
      );
      parrafo = [];
    }
  };
  const cerrarLista = () => {
    if (lista) {
      const k = `l${bloques.length}`;
      const Etiqueta = lista.ordenada ? "ol" : "ul";
      bloques.push(
        <Etiqueta key={k} className={lista.ordenada ? "list-decimal space-y-0.5 pl-5" : "list-disc space-y-0.5 pl-5"}>
          {lista.items.map((it, i) => (
            <li key={i}>{enLinea(it, `${k}-${i}`)}</li>
          ))}
        </Etiqueta>,
      );
      lista = null;
    }
  };

  for (const cruda of lineas) {
    const l = cruda.trimEnd();
    const vineta = /^\s*[-*•]\s+(.*)$/.exec(l);
    const numero = /^\s*\d+[.)]\s+(.*)$/.exec(l);
    const titulo = /^#{1,4}\s+(.*)$/.exec(l);
    if (!l.trim()) {
      cerrarParrafo();
      cerrarLista();
    } else if (vineta || numero) {
      cerrarParrafo();
      const ordenada = Boolean(numero);
      if (lista && lista.ordenada !== ordenada) cerrarLista();
      lista ??= { ordenada, items: [] };
      lista.items.push((vineta ?? numero)![1]);
    } else if (titulo) {
      cerrarParrafo();
      cerrarLista();
      bloques.push(
        <p key={`t${bloques.length}`} className="font-semibold">
          {enLinea(titulo[1], `t${bloques.length}`)}
        </p>,
      );
    } else {
      cerrarLista();
      parrafo.push(l);
    }
  }
  cerrarParrafo();
  cerrarLista();
  return <div className="space-y-2">{bloques}</div>;
}
