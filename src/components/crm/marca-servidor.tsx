import { HardDrive } from "lucide-react";

/**
 * La marca de origen «servidor»: celeste, distinta de todos los demás colores
 * del sistema (granate = marca, verde = éxito, ámbar = alerta, rojo = grave).
 *
 * Santos, 31-08, al autorizar la vinculación masiva: «que siempre diga en
 * donde corresponda que es info del servidor, con un color especial para
 * reconocerlo visualmente». Va en las listas de clientes, en el panel de la
 * ficha y en el botón por serie del equipo — siempre la misma, para que el
 * ojo la aprenda una sola vez.
 */
export function MarcaServidor({ texto = "servidor" }: { texto?: string }) {
  return (
    <span className="inline-flex flex-none items-center gap-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">
      <HardDrive className="size-3" /> {texto}
    </span>
  );
}
