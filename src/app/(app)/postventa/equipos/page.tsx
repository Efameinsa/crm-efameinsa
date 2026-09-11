import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { PestanasClientes } from "@/components/crm/pestanas-clientes";
import { FicharMaquina } from "@/components/crm/fichar-maquina";
import { ListaEquipos, type FilaEquipo } from "@/components/crm/lista-equipos";

export const dynamic = "force-dynamic";

/**
 * El parque instalado: qué máquinas están en la calle y en qué estado.
 *
 * Es la pantalla que el área no tenía y que cambia su trabajo. Hasta hoy, cada
 * vez que un cliente llamaba diciendo «mi lavadora falla», había que ir a
 * buscar en un file de papel desde cuándo la tiene, si está en garantía y
 * cuánto la usó. El manual lo pide en cada procedimiento sin tenerlo: el
 * «formato de llamada» del ítem IV obliga a escribir a mano fecha de compra,
 * guía, garantía y último mantenimiento de un equipo que no estaba registrado
 * en ningún lado.
 *
 * Se busca por serie porque la serie es lo que el cliente lee en la placa.
 */

/**
 * 11-09: EL SERVIDOR BAJA EL PARQUE ENTERO; LA BÚSQUEDA Y LOS FILTROS VIVEN EN
 * EL NAVEGADOR (lista-equipos.tsx). Antes cada filtro era una vuelta acá, sin
 * «cargando» porque era la misma pantalla.
 */
export default async function EquiposPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; ver?: string; todos?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  // EL ORDEN. Manda el preventivo: arriba lo que ya venció, después lo que
  // vence antes. Es la lista con la que se llama. Se trae el parque entero
  // (550 máquinas hoy; el tope está lejos y, si un día se pasa, la pantalla
  // dice cuántas hay).
  const { data, count } = await supabase
    .from("equipos_instalados")
    .select(
      "id, serie, cliente_texto, modelo_texto, ubicacion, fecha_despacho, garantia_hasta, ciclos_ultimo, ultimo_mantenimiento, proximo_mantenimiento, cuentas(razon_social, num_doc, perfiles(codigo_comercial, nombre))",
      { count: "exact" },
    )
    .order("proximo_mantenimiento", { ascending: true, nullsFirst: false })
    .order("fecha_despacho", { ascending: false, nullsFirst: false })
    .limit(2000);
  const equipos = (data ?? []) as unknown as FilaEquipo[];
  const ver = (["mantenimiento", "garantia", "vencida"].includes(sp.ver ?? "") ? sp.ver : "") as "" | "mantenimiento" | "garantia" | "vencida";

  return (
    <div className="space-y-4">
      {/* La vuelta a los clientes, que es la otra mitad de la misma pregunta. */}
      <PestanasClientes activa="maquinas" maquinas={count ?? 0} />

      <SeccionPanel titulo="Equipos instalados">
        {/* DAR DE ALTA UNA MÁQUINA A MANO (0181). Plegado: la pantalla es para
            consultar el parque; el alta es la excepción. */}
        <details className="mb-3 rounded-lg border border-border bg-card">
          <summary className="cursor-pointer list-none p-3 text-xs font-semibold text-primary hover:underline">
            + Registrar una máquina que no está en la lista
          </summary>
          <div className="border-t border-border p-3">
            <FicharMaquina />
          </div>
        </details>

        <ListaEquipos equipos={equipos} hoy={hoy} inicial={{ q: (sp.q ?? "").trim(), ver }} />
      </SeccionPanel>
    </div>
  );
}
