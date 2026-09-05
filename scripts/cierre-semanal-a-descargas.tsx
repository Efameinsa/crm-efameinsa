import React from "react";
// Genera el PDF del cierre semanal de un comercial CON DATOS REALES y lo deja
// en Descargas, para revisarlo sin entrar al CRM ni pedirle a nadie su sesión.
//
// Uso:
//   npx tsx --env-file=.env.local scripts/cierre-semanal-a-descargas.tsx C5
//   npx tsx --env-file=.env.local scripts/cierre-semanal-a-descargas.tsx C5 2026-08-31
//
// Con la llave de servicio, así que ve todo: es una herramienta de revisión,
// no una pantalla. El segundo archivo, «(ejemplo declarado)», es el mismo
// documento con una declaración de muestra, para ver cómo queda el recuadro de
// compromiso y necesidades cuando el comercial ya lo llenó.

import { createClient } from "@supabase/supabase-js";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cargarCierreSemanal, sabadoDe } from "../src/lib/cierre-semanal";
import { lunesSemana } from "../src/lib/potenciales-semana";
import { CierreSemanalPdf } from "../src/lib/pdf/cierre-semanal-pdf";

const DESCARGAS = "C:\\Users\\diseno\\Downloads";

const codigo = (process.argv[2] ?? "C5").toUpperCase();
const lunes = lunesSemana(process.argv[3]);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function main() {
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("id, nombre, codigo_comercial")
    .eq("codigo_comercial", codigo)
    .maybeSingle();
  if (!perfil) throw new Error(`No existe el comercial ${codigo}`);

  const cierre = await cargarCierreSemanal(lunes, perfil.id, supabase as never);
  const logo = readFileSync(join(process.cwd(), "public", "logo-efameinsa.png"));

  const enLetra = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "long" });
  const rango = `Del ${enLetra(lunes)} al ${enLetra(sabadoDe(lunes))} de ${lunes.slice(0, 4)}`;

  const base = `Cierre semanal ${codigo} ${lunes}`;

  // 1. Tal cual está hoy.
  const real = await renderToBuffer(<CierreSemanalPdf logoBuffer={logo} rango={rango} cierre={cierre} />);
  writeFileSync(join(DESCARGAS, `${base}.pdf`), real);
  console.log(`→ ${base}.pdf`);
  console.log(`   ${cierre.comercial.nombre} · vendido US$ ${Math.round(cierre.vendidoUsd).toLocaleString("es-PE")}` +
    ` · ${cierre.ventas.length} venta(s) · ${cierre.rechazos.length} rechazo(s)` +
    ` · declaración: ${cierre.declaracion ? "sí" : "todavía no"}`);

  // 2. El mismo, con una declaración de muestra, para ver el recuadro lleno.
  if (!cierre.declaracion) {
    const conMuestra = await renderToBuffer(
      <CierreSemanalPdf
        logoBuffer={logo}
        rango={rango}
        cierre={{
          ...cierre,
          declaracion: {
            compromiso:
              "Voy a retomar con visita, no con llamada, los clientes que cotizaron en agosto y no respondieron; y voy a dejar cerrada la fecha de cierre de las oportunidades que están sin fecha.",
            necesidades:
              "Capacitación en la secadora a gas y las fichas técnicas de los coches de lavandería para poder cotizarlos sin preguntar.",
            sinNecesidades: false,
            declaradoAt: new Date().toISOString(),
          },
        }}
      />,
    );
    writeFileSync(join(DESCARGAS, `${base} (ejemplo declarado).pdf`), conMuestra);
    console.log(`→ ${base} (ejemplo declarado).pdf   ← con el recuadro lleno, para ver cómo queda`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
