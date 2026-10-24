import { MessagesSquare } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { misChats } from "@/lib/acciones/chat";
import { ListaDeChats } from "@/components/crm/lista-de-chats";

// LOS CHATS (0599, Santos 23-10): «debería quedarse en su sidebar como chats
// abiertos». Todos los canales de casos y pedidos donde está quien mira: los
// abiertos para seguir coordinando y los cerrados, que quedan guardados de
// solo lectura. Cada fila dice quién escribió último y quiénes ya lo vieron.
export const dynamic = "force-dynamic";

export default async function ChatsPage() {
  await requerirPerfil();
  const chats = await misChats();
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-[linear-gradient(135deg,rgb(139_21_16/0.07),transparent_60%)] p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#8B1510] text-white">
          <MessagesSquare className="size-5" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Chats de casos y pedidos</h1>
          <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
            Los canales donde usted está: lleva el caso, movió un paso, escribió, lo agregaron o lo nombraron con «@». Cada uno se
            abre encima de la pantalla. Cuando el caso o el pedido se cierra, la conversación queda guardada aquí, de solo lectura.
          </p>
        </div>
      </div>
      <ListaDeChats inicial={chats} />
    </div>
  );
}
