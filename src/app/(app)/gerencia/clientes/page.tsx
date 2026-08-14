import Link from "next/link";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { normalizarTelefono } from "@/lib/telefono";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const LIMITE = 50;

interface CuentaFila {
  id: string;
  razon_social: string;
  tipo_doc: string;
  num_doc: string | null;
  distrito: string | null;
  comercial_id: string | null;
  ultima_venta_at: string | null;
  perfiles: { nombre: string; codigo_comercial: string | null } | null;
}

const CAMPOS_CUENTA =
  "id, razon_social, tipo_doc, num_doc, distrito, comercial_id, ultima_venta_at, perfiles(nombre, codigo_comercial)";

export default async function ClientesGerenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const supabase = await createClient();

  const { count: totalClientes } = await supabase.from("cuentas").select("id", { count: "exact", head: true });

  let cuentas: CuentaFila[] = [];
  let truncado = false;

  if (query) {
    const digitos = query.replace(/\D/g, "");
    const mapa = new Map<string, CuentaFila>();

    const { data: porTexto } = await supabase
      .from("cuentas")
      .select(CAMPOS_CUENTA)
      .or(`razon_social.ilike.%${query}%,num_doc.ilike.%${query}%`)
      .limit(LIMITE);
    for (const c of (porTexto ?? []) as unknown as CuentaFila[]) mapa.set(c.id, c);

    if (digitos.length >= 6) {
      const telNorm = normalizarTelefono(digitos);
      const { data: porTelefono } = await supabase
        .from("contactos")
        .select(`cuentas(${CAMPOS_CUENTA})`)
        .ilike("telefono_normalizado", `%${telNorm}%`)
        .limit(LIMITE);
      for (const fila of porTelefono ?? []) {
        const c = fila.cuentas as unknown as CuentaFila | null;
        if (c) mapa.set(c.id, c);
      }
    }

    cuentas = Array.from(mapa.values()).slice(0, LIMITE);
    truncado = mapa.size > LIMITE;
  } else {
    const { data } = await supabase
      .from("cuentas")
      .select(CAMPOS_CUENTA)
      .order("created_at", { ascending: false })
      .limit(30);
    cuentas = (data ?? []) as unknown as CuentaFila[];
  }

  const ids = cuentas.map((c) => c.id);
  const { data: oportunidadesAbiertas } = ids.length
    ? await supabase.from("oportunidades").select("cuenta_id, etapa").in("cuenta_id", ids)
    : { data: [] };
  const conteoAbiertas = new Map<string, number>();
  for (const o of oportunidadesAbiertas ?? []) {
    if (o.etapa === "venta" || o.etapa === "rechazada" || o.etapa === "derivada") continue;
    conteoAbiertas.set(o.cuenta_id, (conteoAbiertas.get(o.cuenta_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      <form className="flex gap-2" action="/gerencia/clientes">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            name="q"
            defaultValue={query}
            autoFocus
            placeholder="Buscar por nombre, RUC/DNI o teléfono…"
            className="pl-9"
          />
        </div>
        <Button type="submit">Buscar</Button>
      </form>

      <SeccionPanel
        titulo={
          query
            ? `Resultados${truncado ? ` — mostrando ${LIMITE} de más` : ""}`
            : `Clientes recientes${totalClientes ? ` — ${totalClientes.toLocaleString("es-PE")} clientes registrados` : ""}`
        }
      >
        {cuentas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {query ? "Sin resultados para esa búsqueda." : "Todavía no hay clientes registrados."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Comercial dueño</TableHead>
                <TableHead>Zona</TableHead>
                <TableHead className="text-right">Oport. abiertas</TableHead>
                <TableHead>Última venta</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cuentas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <p className="font-medium text-foreground">{c.razon_social}</p>
                    {c.tipo_doc !== "SIN_DOC" && (
                      <p className="text-xs text-muted-foreground">
                        {c.tipo_doc}: {c.num_doc}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.perfiles ? (
                      <span className="text-foreground">
                        {c.perfiles.nombre}
                        {c.perfiles.codigo_comercial ? ` (${c.perfiles.codigo_comercial})` : ""}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Sin asignar</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.distrito ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{conteoAbiertas.get(c.id) ?? 0}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {c.ultima_venta_at ? new Date(c.ultima_venta_at).toLocaleDateString("es-PE") : "Nunca"}
                  </TableCell>
                  <TableCell>
                    <Link href={`/gerencia/clientes/${c.id}`} className="text-xs font-medium text-primary hover:underline">
                      Ver
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SeccionPanel>
    </div>
  );
}
