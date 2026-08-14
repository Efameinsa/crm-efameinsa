import Link from "next/link";
import { Building2 } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function CarteraPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();

  const { data: cuentas } = await supabase
    .from("cuentas")
    .select("id, razon_social, tipo_doc, num_doc, distrito, ultima_venta_at, contactos(id), oportunidades(etapa)")
    .eq("comercial_id", perfil.id)
    .order("razon_social");

  return (
    <SeccionPanel
      titulo="Mi cartera"
      accion={
        cuentas && cuentas.length > 0 ? (
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
            {cuentas.length} cliente{cuentas.length === 1 ? "" : "s"}
          </span>
        ) : undefined
      }
    >
      {!cuentas || cuentas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no tiene clientes en su cartera.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Zona</TableHead>
              <TableHead className="text-right">Contactos</TableHead>
              <TableHead className="text-right">Oportunidades</TableHead>
              <TableHead>Última venta</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {cuentas.map((c) => {
              const contactos = (c.contactos as unknown as { id: string }[]) ?? [];
              const oportunidades = (c.oportunidades as unknown as { etapa: string }[]) ?? [];
              const abiertas = oportunidades.filter((o) => !["venta", "rechazada", "derivada"].includes(o.etapa)).length;
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <span className="inline-flex items-center gap-2 font-medium text-foreground">
                      <Building2 className="size-3.5 text-muted-foreground" />
                      {c.razon_social}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.tipo_doc !== "SIN_DOC" ? `${c.tipo_doc}: ${c.num_doc}` : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.distrito ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{contactos.length}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {oportunidades.length}
                    {abiertas > 0 && <span className="ml-1 text-xs text-primary">({abiertas} activa{abiertas === 1 ? "" : "s"})</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.ultima_venta_at ? new Date(c.ultima_venta_at).toLocaleDateString("es-PE") : "Nunca"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/comercial/cartera/${c.id}`} className="text-sm text-primary hover:underline">
                      Ver
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </SeccionPanel>
  );
}
