import { Search } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { normalizarTelefono } from "@/lib/telefono";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { TablaCartera } from "@/components/crm/tabla-cartera";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface CuentaFila {
  id: string;
  razon_social: string;
  tipo_doc: string;
  num_doc: string | null;
  distrito: string | null;
  ultima_venta_at: string | null;
  contactos: { id: string }[];
  oportunidades: { etapa: string }[];
}

const CAMPOS_CUENTA =
  "id, razon_social, tipo_doc, num_doc, distrito, ultima_venta_at, contactos(id), oportunidades(etapa)";

export default async function CarteraPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const perfil = await requerirPerfil();
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const supabase = await createClient();

  let cuentas: CuentaFila[] = [];

  if (query) {
    const digitos = query.replace(/\D/g, "");
    const mapa = new Map<string, CuentaFila>();

    const { data: porTexto } = await supabase
      .from("cuentas")
      .select(CAMPOS_CUENTA)
      .eq("comercial_id", perfil.id)
      .or(`razon_social.ilike.%${query}%,num_doc.ilike.%${query}%`)
      .order("razon_social");
    for (const c of (porTexto ?? []) as unknown as CuentaFila[]) mapa.set(c.id, c);

    if (digitos.length >= 6) {
      const telNorm = normalizarTelefono(digitos);
      // La RLS de `contactos` ya restringe esto a las cuentas de este comercial.
      const { data: porTelefono } = await supabase
        .from("contactos")
        .select(`cuentas(${CAMPOS_CUENTA})`)
        .ilike("telefono_normalizado", `%${telNorm}%`);
      for (const fila of porTelefono ?? []) {
        const c = fila.cuentas as unknown as CuentaFila | null;
        if (c) mapa.set(c.id, c);
      }
    }

    cuentas = Array.from(mapa.values()).sort((a, b) => a.razon_social.localeCompare(b.razon_social));
  } else {
    const { data } = await supabase
      .from("cuentas")
      .select(CAMPOS_CUENTA)
      .eq("comercial_id", perfil.id)
      .order("razon_social");
    cuentas = (data ?? []) as unknown as CuentaFila[];
  }

  return (
    <div className="space-y-4">
      <form className="flex gap-2" action="/comercial/cartera">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Buscar por nombre, RUC/DNI o teléfono…"
            className="pl-9"
          />
        </div>
        <Button type="submit">Buscar</Button>
      </form>

      <SeccionPanel
        titulo={query ? `Resultados — ${cuentas.length} cliente${cuentas.length === 1 ? "" : "s"}` : "Mi cartera"}
        accion={
          !query && cuentas.length > 0 ? (
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
              {cuentas.length} cliente{cuentas.length === 1 ? "" : "s"}
            </span>
          ) : undefined
        }
      >
        {cuentas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {query ? "Sin resultados para esa búsqueda." : "Todavía no tiene clientes en su cartera."}
          </p>
        ) : (
          <TablaCartera
            filas={cuentas.map((c) => {
              const contactos = c.contactos ?? [];
              const oportunidades = c.oportunidades ?? [];
              const activas = oportunidades.filter((o) => !["venta", "rechazada", "derivada"].includes(o.etapa)).length;
              return {
                id: c.id,
                razonSocial: c.razon_social,
                documento: c.tipo_doc !== "SIN_DOC" ? `${c.tipo_doc}: ${c.num_doc}` : "—",
                distrito: c.distrito,
                contactos: contactos.length,
                oportunidadesTotal: oportunidades.length,
                oportunidadesActivas: activas,
                ultimaVentaAt: c.ultima_venta_at,
              };
            })}
          />
        )}
      </SeccionPanel>
    </div>
  );
}
