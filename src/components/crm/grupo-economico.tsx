import Link from "next/link";
import { Building2, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";

// El grupo económico del cliente: su empresa madre y las razones sociales
// hermanas, con lo que compró cada una.
//
// PARA QUÉ SIRVE EN LA GESTIÓN COMERCIAL: una casa grande factura por varias
// razones sociales o por sede, y el comercial que abre la sede chica cree que
// tiene enfrente un cliente de US$ 3.000 cuando el grupo lleva comprados
// US$ 90.000. Con eso negocia distinto — y sabe a quién más puede venderle.
//
// No se fusionan a propósito: son contribuyentes distintos, con RUC distinto,
// y la cotización se emite a UNO solo.

interface Miembro {
  id: string;
  razon_social: string;
  num_doc: string | null;
  es_madre: boolean;
  es_esta: boolean;
  comercial: string | null;
  ventas: number;
  monto: number;
  cotizaciones: number;
}

export async function GrupoEconomico({ cuentaId, comoGerencia = false }: { cuentaId: string; comoGerencia?: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("grupo_economico", { p_cuenta_id: cuentaId });
  const miembros = (data ?? []) as Miembro[];

  // Una sola empresa no es un grupo: la sección no aparece y no ocupa espacio.
  if (miembros.length < 2) return null;

  const base = comoGerencia ? "/gerencia/clientes" : "/comercial/cartera";
  const totalMonto = miembros.reduce((a, m) => a + Number(m.monto), 0);
  const totalVentas = miembros.reduce((a, m) => a + Number(m.ventas), 0);
  const totalCot = miembros.reduce((a, m) => a + Number(m.cotizaciones), 0);
  // Institución con sedes bajo un mismo RUC (0158: ESSALUD, Marina, MINSA):
  // todas las fichas del grupo llevan el mismo documento. No son razones
  // sociales distintas sino sedes que se atienden como negocios distintos.
  const sedesDeUnRuc = miembros.every((m) => m.num_doc && m.num_doc === miembros[0].num_doc);
  const madre = miembros.find((m) => m.es_madre);

  return (
    <SeccionPanel titulo={sedesDeUnRuc ? "Sedes de la institución" : "Grupo económico"}>
      <p className="mb-3 text-sm text-muted-foreground">
        {sedesDeUnRuc ? (
          <>
            {madre?.razon_social ?? "Esta institución"} atiende por <b className="text-foreground">{miembros.length - 1}</b>{" "}
            sede{miembros.length === 2 ? "" : "s"} con el mismo RUC, cada una como un negocio distinto. Entre todas
          </>
        ) : (
          <>
            Este cliente factura bajo <b className="text-foreground">{miembros.length}</b> razones sociales. Entre todas
          </>
        )}{" "}
        llevan <b className="text-foreground">{totalVentas}</b> compra{totalVentas === 1 ? "" : "s"} por{" "}
        <b className="text-foreground">USD {totalMonto.toLocaleString("es-PE")}</b> y {totalCot} cotizaciones.
      </p>
      <ul className="space-y-1.5">
        {miembros.map((m) => (
          <li
            key={m.id}
            className={
              m.es_esta
                ? "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2"
                : "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
            }
          >
            <span className="flex min-w-0 items-center gap-2">
              {m.es_madre ? (
                <Star className="size-3.5 flex-none text-primary" aria-label="Empresa madre" />
              ) : (
                <Building2 className="size-3.5 flex-none text-muted-foreground" />
              )}
              {m.es_esta ? (
                <span className="truncate text-sm font-semibold text-foreground">{m.razon_social}</span>
              ) : (
                <Link href={`${base}/${m.id}`} className="truncate text-sm font-medium text-primary hover:underline">
                  {m.razon_social}
                </Link>
              )}
              <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">{m.num_doc ?? "sin RUC"}</span>
            </span>
            <span className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
              {m.comercial && <span className="hidden md:inline">{m.comercial}</span>}
              <span>{m.cotizaciones} cot.</span>
              <span className="font-semibold text-foreground">
                {Number(m.ventas) > 0 ? `USD ${Number(m.monto).toLocaleString("es-PE")}` : "sin compras"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </SeccionPanel>
  );
}
