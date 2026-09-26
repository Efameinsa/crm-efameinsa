import Link from "@/components/enlace";
import { Building2, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

// «ES EL MISMO CLIENTE» ARRIBA DE TODO (23-09). Katerine cotiza a INVERSIONES
// CRISOLITO y la segunda lavadora sale a KARINA SAAVEDRA HOSPEDAJE, otra
// empresa de la misma dueña. Santos: «serían como clientes nuevos, pero debe
// tener un aviso que indique que son el mismo cliente, para que postventa
// también lo considere y el resto».
//
// La sección «Grupo económico» (0052) ya existía, pero al fondo de la ficha y
// solo ahí: quien abre el caso de postventa, el pedido o el expediente no la
// ve. Este aviso va en la cabecera de todas esas pantallas y nombra las otras
// razones sociales con su RUC y su comercial. Lo lee `grupo_economico()`:
// Central, postventa, operaciones, finanzas y gerencia ven el grupo entero.
//
// Las sedes de un mismo RUC (0158) no pasan por acá: no son otra razón
// social, y el expediente ya dice «Sede de…».

interface Miembro {
  id: string;
  razon_social: string;
  num_doc: string | null;
  es_madre: boolean;
  es_esta: boolean;
  comercial: string | null;
}

export async function AvisoMismoCliente({
  cuentaId,
  baseHref = "/comercial/cartera",
  className,
}: {
  cuentaId: string | null | undefined;
  /** Adónde llevan las otras razones sociales (Central: /central/clientes; gerencia: /gerencia/clientes). */
  baseHref?: string;
  className?: string;
}) {
  if (!cuentaId) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("grupo_economico", { p_cuenta_id: cuentaId });
  const miembros = (data ?? []) as Miembro[];
  const otras = miembros.filter((m) => !m.es_esta);
  if (otras.length === 0) return null;
  if (miembros.every((m) => m.num_doc && m.num_doc === miembros[0].num_doc)) return null;

  return (
    <div
      className={
        "rounded-lg border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100 " +
        (className ?? "")
      }
    >
      <p className="font-semibold">
        Es el mismo cliente que {otras.length === 1 ? "esta otra empresa" : `estas ${otras.length} empresas`}:
      </p>
      <ul className="mt-1 space-y-0.5">
        {otras.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-x-2">
            {m.es_madre ? (
              <Star className="size-3.5 flex-none" aria-label="Empresa principal del grupo" />
            ) : (
              <Building2 className="size-3.5 flex-none" />
            )}
            <Link href={`${baseHref}/${m.id}`} className="font-medium underline-offset-2 hover:underline">
              {m.razon_social}
            </Link>
            <span className="font-mono text-xs opacity-80">{m.num_doc ? `RUC ${m.num_doc}` : "sin RUC"}</span>
            {m.comercial && <span className="text-xs opacity-80">· {m.comercial}</span>}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs opacity-80">
        Factura con otra razón social, pero es el mismo dueño: sus compras, equipos y reclamos pueden estar en cualquiera de las fichas.
      </p>
    </div>
  );
}
