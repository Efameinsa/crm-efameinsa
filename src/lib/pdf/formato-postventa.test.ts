import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { lineasDelConcepto, lugarDeEjecucion, tituloDelDetalle, variantePostventa } from "./formato-postventa";
import { filasDelDetalle } from "./cotizacion-postventa-pdf";
import { renderizarCotizacionPdf, type CotizacionParaPdf } from "./armar-cotizacion";

/**
 * Los dos formatos de postventa de Santos (28-09): cuál toca a cada
 * cotización, cómo se escribe el concepto del renglón y que el PDF salga con
 * el cuerpo de postventa y no con el de equipos.
 */

const servicio = (concepto: string) => ({ segmento: "servicio", concepto });
const repuesto = (concepto: string) => ({ segmento: "repuesto", concepto });
const aMano = (concepto: string) => ({ segmento: null, concepto });

describe("qué formato lleva una cotización de postventa", () => {
  it("solo servicios del catálogo → mantenimiento (el Word de MINERIA SINGULARIDAD)", () => {
    expect(
      variantePostventa([
        servicio("SERVICIO DE MANTENIMIENTO PREVENTIVO LAVADORA CENTRIFUGA SEMI INDUSTRIAL GIANT C MAX 13 KG"),
        servicio("SERVICIO DE MANTENIMIENTO PREVENTIVO SECADORA INDUSTRIAL GAS UNIMAC UT055L"),
      ]),
    ).toBe("mantenimiento");
  });

  it("dos repuestos y el correctivo que los instala → repuestos (el 2196-26 de TOMY JIRO)", () => {
    expect(
      variantePostventa([
        aMano("AUTOTRANSFORMADOR PARA SECADORA SEMI INDUSTRIAL\nMARCA: LG"),
        aMano("KIT INTERRUPTOR DE SEGURIDAD DE SECADORA SEMI INDUSTRIAL"),
        aMano("SERVICIO DE MANTENIMIENTO CORRECTIVO DE SECADORA SEMI INDUSTRIAL"),
      ]),
    ).toBe("repuestos");
  });

  it("un repuesto suelto → repuestos", () => {
    expect(variantePostventa([aMano("VALVULA COLECTORA DE AGUA P/LAV UC40\nSERIE:20104631")])).toBe("repuestos");
    expect(variantePostventa([repuesto("VIDRIO DE LA PUERTA")])).toBe("repuestos");
  });

  it("un mantenimiento escrito a mano también es mantenimiento", () => {
    expect(variantePostventa([aMano("Mantenimiento preventivo de lavadora 17 kg")])).toBe("mantenimiento");
    expect(variantePostventa([aMano("Servicio de mantenimiento correctivo de rodillo")])).toBe("mantenimiento");
  });

  it("la mayoría son mantenimientos → mantenimiento; la mitad o menos → repuestos", () => {
    expect(variantePostventa([servicio("SERVICIO DE MANTENIMIENTO PREVENTIVO A"), servicio("SERVICIO DE MANTENIMIENTO PREVENTIVO B"), repuesto("FAJA")])).toBe(
      "mantenimiento",
    );
    expect(variantePostventa([servicio("SERVICIO DE MANTENIMIENTO PREVENTIVO A"), repuesto("FAJA")])).toBe("repuestos");
  });

  it("una máquina del catálogo no es un servicio; sin renglones, repuestos", () => {
    expect(variantePostventa([{ segmento: "semi_industrial", concepto: "LAVADORA C. APILABLE" }])).toBe("repuestos");
    expect(variantePostventa([])).toBe("repuestos");
  });
});

describe("el concepto del renglón", () => {
  it("una línea a mano sale tal como se escribió, renglón por renglón", () => {
    expect(
      lineasDelConcepto({ nombre: "x", marca: "—", modelo: "—", capacidad: null, descripcionLinea: "RESISTENCIA\n MARCA: LG \n\nSERIE: 1", deCatalogo: false }),
    ).toEqual(["RESISTENCIA", "MARCA: LG", "SERIE: 1"]);
  });

  it("un producto del catálogo arma marca, modelo y capacidad, y suma la serie escrita en el renglón", () => {
    expect(
      lineasDelConcepto({
        nombre: "SERVICIO DE MANTENIMIENTO PREVENTIVO LAVADORA",
        marca: "LG",
        modelo: "GIANT C MAX\n(CWG27MDCRS)",
        capacidad: "13 kg",
        descripcionLinea: "MARCA: LG\nSERIE: 507KWEL2A076",
        deCatalogo: true,
      }),
    ).toEqual(["SERVICIO DE MANTENIMIENTO PREVENTIVO LAVADORA", "MARCA: LG", "MODELO: GIANT C MAX (CWG27MDCRS)", "CAPACIDAD: 13 kg", "SERIE: 507KWEL2A076"]);
  });

  it("un repuesto suma sus piezas debajo, con guion (Lesly 05-10, kit de instalación LG)", () => {
    expect(
      lineasDelConcepto({
        nombre: "KIT DE INSTALACION PARA SECADORA LG",
        marca: "LG",
        modelo: "LG",
        capacidad: null,
        deCatalogo: true,
        detalle: ["MANOMETRO PARA GAS BAJA PRESION", "CODO FN 1/2", "  "],
      }),
    ).toEqual(["KIT DE INSTALACION PARA SECADORA LG", "MARCA: LG", "MODELO: LG", "- MANOMETRO PARA GAS BAJA PRESION", "- CODO FN 1/2"]);
  });

  it("el título del detalle y el lugar de ejecución", () => {
    expect(tituloDelDetalle("SERVICIO DE MANTENIMIENTO PREVENTIVO SECADORA INDUSTRIAL GAS UNIMAC UT055L")).toBe(
      "DETALLE DEL SERVICIO DE MANTENIMIENTO PREVENTIVO DE SECADORA INDUSTRIAL GAS UNIMAC UT055L",
    );
    expect(lugarDeEjecucion("Entrega en las instalaciones del cliente.")).toBe("En las instalaciones del cliente.");
    expect(lugarDeEjecucion("  ")).toBeNull();
  });

  it("el detalle de trabajos: sistemas numerados con ✓ y sin la cabecera leída del Word", () => {
    const filas = filasDelDetalle([
      { t: "titulo", texto: "TRABAJOS QUE INCLUYE EL SERVICIO" },
      { t: "vineta", texto: "ITEM I: LAVADORA CENTRIFUGA SEMI INDUSTRIAL" },
      { t: "vineta", texto: "ITEM" },
      { t: "subtitulo", texto: "1. Exteriores" },
      { t: "vineta", texto: "Limpieza externa general del equipo" },
      { t: "subtitulo", texto: "Descarga" },
    ]);
    expect(filas).toEqual([
      { numero: "1", texto: "Exteriores", sistema: true },
      { numero: null, texto: "Limpieza externa general del equipo", sistema: false },
      { numero: null, texto: "Descarga", sistema: true },
    ]);
  });
});

async function textoDelPdf(bytes: Uint8Array): Promise<string> {
  const doc = await getDocument({ data: bytes }).promise;
  let texto = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    texto += c.items.map((x) => ("str" in x ? x.str : "")).join(" ") + "\n";
  }
  return texto;
}

describe("el PDF de postventa", () => {
  const cot = {
    codigo: "Presu_9997-26", correlativo: 9997, serie: "OPEN", moneda: "USD",
    moneda_impresa: "USD", tipo_cambio: null, condiciones: null, vigencia_dias: 7,
    entrega_lugar: "Entrega en las instalaciones del cliente.", tiempo_entrega: "1 día", garantia: null,
    forma_pago: "Cancela culminando el servicio.", saldo: null, created_at: "2026-09-25T15:00:00Z",
    cliente_snapshot: { razon_social: "TOMY JIRO EIRL", tipo_doc: "RUC", num_doc: "20000000003", direccion: "Lima" },
    cotizacion_items: [
      { cantidad: 1, precio_unitario: 125, descripcion: "AUTOTRANSFORMADOR PARA SECADORA\nSERIE: 711KWEL9E900", color: null, productos: null },
      { cantidad: 1, precio_unitario: 195, descripcion: "SERVICIO DE MANTENIMIENTO CORRECTIVO DE SECADORA", color: null, productos: null },
    ],
    oportunidades: null,
    perfiles: { nombre: "Rubí Simeon", cargo: "Post Venta", telefono: "504-1695", celular: "981 345 538", email_contacto: "postventa@efameinsa.com", email_open: "postventa@openinvestments.com.pe" },
  } as unknown as CotizacionParaPdf;

  it("sale con el cuerpo de repuestos, no con el de equipos", async () => {
    const texto = await textoDelPdf(new Uint8Array(await renderizarCotizacionPdf(cot, { postventa: true })));
    expect(texto).toContain("USD$ 125.00 + IGV");
    expect(texto).toContain("USD$ 377.60"); // (125 + 195) × 1,18
    expect(texto).toContain("En las instalaciones del cliente.");
    expect(texto).toContain("NUESTRAS INSTALACIONES EN HUACHIPA");
    expect(texto).toContain("VALIDEZ DE LA COTIZACION: 7 DIAS");
    expect(texto).toContain("postventa@openinvestments.com.pe");
    // Lo de equipos no aparece: ni el resumen ni los puntos de máquinas.
    expect(texto).not.toContain("RESUMEN");
    expect(texto).not.toContain("juego de manuales");
  }, 60000);

  it("con las cifras tapadas no se lee ningún monto", async () => {
    const texto = await textoDelPdf(new Uint8Array(await renderizarCotizacionPdf(cot, { postventa: true, sinMontos: true })));
    expect(texto).toContain("USD$ ***** + IGV");
    expect(texto).not.toContain("125.00");
    expect(texto).not.toContain("377.60");
  }, 60000);
});

describe("«Sin garantía» no se imprime (Gabriela, 03-10)", () => {
  it("reconoce las formas en que se escribe, y no las garantías reales", async () => {
    const { esSinGarantia } = await import("./series");
    expect(esSinGarantia("Sin garantía")).toBe(true);
    expect(esSinGarantia("  SIN GARANTIA del servicio")).toBe(true);
    expect(esSinGarantia("12 meses")).toBe(false);
    expect(esSinGarantia("Garantía de fábrica")).toBe(false);
    expect(esSinGarantia(null)).toBe(false);
  });

  // Un repuesto del catálogo con su detalle escrito en el renglón (para qué
  // máquina es, la serie): Gabriela, 03-10.
  const conDetalle = (garantia: string) =>
    ({
      codigo: "Presu_9996-26", correlativo: 9996, serie: "OPEN", moneda: "USD",
      moneda_impresa: "USD", tipo_cambio: null, condiciones: null, vigencia_dias: 7,
      entrega_lugar: null, tiempo_entrega: "Inmediata", forma_pago: "Contado", saldo: null,
      created_at: "2026-10-03T15:00:00Z",
      cliente_snapshot: { razon_social: "TOMY JIRO EIRL", tipo_doc: "RUC", num_doc: "20000000003", direccion: "Lima" },
      oportunidades: null,
      perfiles: { nombre: "Gabriela Palacios", cargo: "Post Venta", telefono: "504-1695", celular: null, email_contacto: "postventa2@efameinsa.com", email_open: null },
      garantia,
      cotizacion_items: [
        {
          cantidad: 1, precio_unitario: 90, color: null,
          descripcion: "PARA LAVADORA LG TITAN MAX 17 KG\nSERIE: 507KWEL2A076",
          productos: { nombre: "BOMBA DE DRENAJE", marca: "LG", modelo: "TITAN MAX", capacidad: null, categoria: null, segmento: "repuesto", ficha: null, foto_path: null, sku: null },
        },
      ],
    }) as unknown as CotizacionParaPdf;

  it("en el PDF de postventa: sin el renglón de garantía y con el detalle del repuesto", async () => {
    const texto = await textoDelPdf(new Uint8Array(await renderizarCotizacionPdf(conDetalle("Sin garantía"), { postventa: true })));
    expect(texto).toContain("BOMBA DE DRENAJE");
    expect(texto).toContain("PARA LAVADORA LG TITAN MAX 17 KG");
    expect(texto).toContain("SERIE: 507KWEL2A076");
    expect(texto).not.toMatch(/sin\s+garant/i);
    const conGarantia = await textoDelPdf(new Uint8Array(await renderizarCotizacionPdf(conDetalle("12 meses"), { postventa: true })));
    expect(conGarantia).toContain("12 meses");
  }, 60000);

  it("en el PDF de equipos: igual", async () => {
    const texto = await textoDelPdf(new Uint8Array(await renderizarCotizacionPdf(conDetalle("Sin garantía"))));
    expect(texto).toContain("SERIE: 507KWEL2A076");
    expect(texto).not.toMatch(/sin\s+garant/i);
  }, 60000);
});
