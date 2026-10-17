import { Suspense } from "react";
import { PackagePlus } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { listarPedidosCatalogo } from "@/lib/acciones/pedidos-catalogo";
import { FormularioPedidoCatalogo, ListaPedidosCatalogo } from "@/components/crm/pedidos-catalogo";
import { SeccionPanel } from "@/components/crm/seccion-panel";

// PEDIDOS AL CATÁLOGO (0523, Santos 17-10): un producto que no está, un
// precio, el stock o una ficha que corregir se le piden a Lesly, no al buzón
// del CRM. Ella, gerencia y administración ven los de todos y contestan.
export const dynamic = "force-dynamic";

export default async function PedidosCatalogoPage() {
  const perfil = await requerirPerfil();
  const pedidos = await listarPedidosCatalogo();
  const atiende = ["operaciones", "gerencia", "admin"].includes(perfil.rol) || Boolean(perfil.es_operaciones);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-[linear-gradient(135deg,rgb(139_21_16/0.07),transparent_60%)] p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#8B1510] text-white">
          <PackagePlus className="size-5" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Pedir a Lesly · catálogo</h1>
          <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
            ¿Falta un producto, un precio está mal, necesita saber el stock o corregir una ficha técnica o una foto? Eso lo
            actualiza Lesly (Administración de operaciones), no el CRM. Pídaselo aquí: le llega a ella y la respuesta le
            llega a su campana.
          </p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <SeccionPanel titulo="Nuevo pedido">
          <Suspense>
            <FormularioPedidoCatalogo userId={perfil.id} />
          </Suspense>
        </SeccionPanel>
        <SeccionPanel titulo={atiende ? "Pedidos de todos" : "Mis pedidos"}>
          <Suspense>
            <ListaPedidosCatalogo pedidos={pedidos} atiende={atiende} userId={perfil.id} />
          </Suspense>
        </SeccionPanel>
      </div>
    </div>
  );
}
