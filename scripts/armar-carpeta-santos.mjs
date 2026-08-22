// Arma V:\SANTOS\<MARCA>\<CODIGO>\ con copias del catálogo y la
// especificación técnica de cada código (lee el cruce ya hecho por
// cruzar-codificacion-equipos.mjs) — para que Darwin/Santos pueda navegar
// visualmente qué tiene cada producto, sin depender de la organización de
// V:\LESLY. Es una copia, no toca ni mueve nada del original.
//
// Si a un código le falta catálogo y/o especificación, igual se crea la
// carpeta con lo que sí hay, más un FALTA.txt corto explicando qué falta
// (mismo dato que el Excel para Lesly, pero visible al navegar la carpeta).
//
// Uso: node scripts/armar-carpeta-santos.mjs [ruta-al-cruce.json] [raiz-salida]

import { readFileSync, mkdirSync, copyFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join, basename } from "node:path";

const ENTRADA = process.argv[2] ?? "scripts/data/cruce-definitivo-2026-08-22.json";
const RAIZ = process.argv[3] ?? "V:/SANTOS";

const bruto = JSON.parse(readFileSync(ENTRADA, "utf-8"));
const datos = bruto.productos;
// Avisos que solo se descubren leyendo el contenido de la ficha, indexados
// por código para dejarlos visibles en la carpeta del producto afectado.
const avisosPorCodigo = new Map();
function agregarAviso(codigo, texto) {
  avisosPorCodigo.set(codigo, [...(avisosPorCodigo.get(codigo) ?? []), texto]);
}
for (const m of bruto.malNombrados ?? []) {
  agregarAviso(
    m.codigoReal,
    `La ficha de este producto está guardada en V:\\ con el código ${m.codigoEnElArchivo}, no con el suyo.\n` +
      `  Archivo: ${m.ruta}\n  Se confirmó por su contenido: ${m.evidencia.join(", ")}`,
  );
  agregarAviso(
    m.codigoEnElArchivo,
    `OJO: el archivo guardado con este código ("${m.ruta.split(/[\\/]/).pop()}") en realidad describe al producto ${m.codigoReal}.`,
  );
}
for (const d of bruto.discrepanciasDeModelo ?? []) {
  // Se avisa a los DOS lados: al código con el que el archivo está guardado
  // y al producto al que el contenido parece pertenecer. Quien abra
  // cualquiera de las dos carpetas tiene que enterarse.
  agregarAviso(
    d.codigo,
    `El archivo "${d.ruta.split(/[\\/]/).pop()}" está guardado con este código, pero su contenido\n` +
      `  corresponde al producto ${d.pareceSer} (${d.equipoQueParece.slice(0, 70)}).\n` +
      `  El Excel dice que este código es el modelo ${d.modeloSegunMaestro}. Confirmar de qué lado está el error.`,
  );
  agregarAviso(
    d.pareceSer,
    `Su ficha podría ser "${d.ruta.split(/[\\/]/).pop()}", que está guardada con el código ${d.codigo} y no con el suyo.\n` +
      `  Archivo: ${d.ruta}`,
  );
}

function nombreSeguro(s) {
  return s.replace(/[\\/:*?"<>|]/g, "-").trim();
}

const carpetasVistas = new Set();
let archivos = 0;
for (const d of datos) {
  const marca = nombreSeguro(d.marca || "SIN MARCA");
  const carpetaCodigo = join(RAIZ, marca, nombreSeguro(d.codigo));
  mkdirSync(carpetaCodigo, { recursive: true });
  carpetasVistas.add(carpetaCodigo);

  const tieneSpec = Boolean(d.especificacion) || Boolean(d.especificacionAprox?.length);
  const tieneCat = Boolean(d.catalogos?.length);

  if (d.especificacion) {
    copyFileSync(d.especificacion, join(carpetaCodigo, "ESPECIFICACION - " + basename(d.especificacion)));
    archivos++;
  }
  // Aproximada: se copia igual, pero con el nombre marcado para que Darwin
  // sepa que el match no fue exacto y conviene confirmarlo.
  for (const aprox of d.especificacionAprox ?? []) {
    copyFileSync(aprox, join(carpetaCodigo, "ESPECIFICACION (revisar match) - " + basename(aprox)));
    archivos++;
  }
  for (const cat of d.catalogos ?? []) {
    const destino = join(carpetaCodigo, "CATALOGO - " + basename(cat));
    if (!existsSync(destino)) {
      copyFileSync(cat, destino);
      archivos++;
    }
  }

  // Candidatos ambiguos (barrido de todo V:\, sin match exacto o con más de
  // uno) — se copian aparte para que Darwin los abra y elija, en vez de
  // adivinar cuál corresponde.
  for (const r of d.revisar ?? []) {
    for (const candidato of r.candidatos) {
      const destino = join(carpetaCodigo, "CANDIDATOS (revisar)", basename(candidato));
      if (!existsSync(destino)) {
        mkdirSync(join(carpetaCodigo, "CANDIDATOS (revisar)"), { recursive: true });
        copyFileSync(candidato, destino);
        archivos++;
      }
    }
  }

  // Se re-corre sobre la misma carpeta a medida que el cruce mejora — borrar
  // primero evita dejar un archivo viejo en un código que ya se resolvió.
  for (const obsoleto of ["FALTA.txt", "OJO - revisar.txt"]) {
    const r = join(carpetaCodigo, obsoleto);
    if (existsSync(r)) unlinkSync(r);
  }

  const avisos = avisosPorCodigo.get(d.codigo);
  if (avisos?.length) {
    writeFileSync(
      join(carpetaCodigo, "OJO - revisar.txt"),
      `Código: ${d.codigo}\nEquipo: ${d.equipo}\n\n${avisos.join("\n\n")}\n`,
      "utf-8",
    );
  }

  const faltaSpec = !tieneSpec && !d.revisar?.some((r) => r.tipo === "especificacion");
  const faltaCat = !tieneCat && !d.revisar?.some((r) => r.tipo === "catalogo");
  const hayParaRevisar = d.revisar?.length > 0;
  if (faltaSpec || faltaCat || hayParaRevisar) {
    const partes = [];
    if (faltaSpec) partes.push("especificación técnica (nada encontrado)");
    if (faltaCat) partes.push("catálogo (nada encontrado)");
    if (hayParaRevisar) partes.push("hay candidatos en CANDIDATOS (revisar) — confirmar cuál es");
    writeFileSync(
      join(carpetaCodigo, "FALTA.txt"),
      `Código: ${d.codigo}\nMarca: ${d.marca}\nEquipo: ${d.equipo}\n\n${partes.join("\n")}\n`,
      "utf-8",
    );
  }
}

// Resumen por marca, para no tener que abrir cada carpeta.
const resumen = {};
for (const d of datos) {
  const m = d.marca;
  resumen[m] ??= { total: 0, completos: 0 };
  resumen[m].total++;
  const ok = (d.especificacion || d.especificacionAprox?.length) && d.catalogos?.length;
  if (ok) resumen[m].completos++;
}
writeFileSync(
  join(RAIZ, "LEEME.txt"),
  [
    "Carpeta armada automáticamente desde V:\\LESLY (cruce del " + new Date().toISOString().slice(0, 10) + ").",
    "Una subcarpeta por marca > código, con su catálogo (foto/ficha comercial) y su especificación técnica.",
    "Si falta algo, la carpeta del código tiene un FALTA.txt explicando qué.",
    "El detalle completo de lo que falta está en 'Pendientes catalogo y especificaciones - para Lesly.xlsx', en esta misma carpeta.",
    "",
    "Resumen por marca (completos = con catálogo Y especificación):",
    ...Object.entries(resumen).map(([m, r]) => `  ${m}: ${r.completos}/${r.total} completos`),
  ].join("\n"),
  "utf-8",
);

console.log(`Carpetas de código: ${carpetasVistas.size} (3 códigos duplicados en el Excel comparten carpeta — ver reporte-pendientes-lesly.mjs)`);
console.log(`Archivos copiados: ${archivos}`);
console.log("Resumen por marca:", resumen);
