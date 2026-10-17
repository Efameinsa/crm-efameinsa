import { afterEach, describe, expect, test } from "vitest";
import { crearTokenPdf, leerTokenPdf, urlPdfPortal, VIGENCIA_PDF_MS } from "./token-pdf";

const S = "un-secreto-de-prueba-bastante-largo";
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const AHORA = 1_792_000_000_000;

describe("token del PDF", () => {
  afterEach(() => {
    delete process.env.PORTAL_PUBLIC_URL;
  });

  test("ida y vuelta", () => {
    const t = crearTokenPdf(S, "cotizacion", ID, AHORA);
    expect(leerTokenPdf(S, t, AHORA + 1000)).toEqual({ k: "cotizacion", id: ID });
  });

  test("vence a la hora", () => {
    const t = crearTokenPdf(S, "cotizacion", ID, AHORA);
    expect(leerTokenPdf(S, t, AHORA + VIGENCIA_PDF_MS - 1)).not.toBeNull();
    expect(leerTokenPdf(S, t, AHORA + VIGENCIA_PDF_MS + 1)).toBeNull();
  });

  test("otro secreto o una firma tocada no pasan", () => {
    const t = crearTokenPdf(S, "cotizacion", ID, AHORA);
    expect(leerTokenPdf("otro-secreto-cualquiera-largo", t, AHORA)).toBeNull();
    const [p, f] = t.split(".");
    expect(leerTokenPdf(S, `${p}.${f.slice(0, -1)}${f.endsWith("0") ? "1" : "0"}`, AHORA)).toBeNull();
  });

  test("cambiar el id o la clase rompe la firma", () => {
    const t = crearTokenPdf(S, "cotizacion", ID, AHORA);
    const [, f] = t.split(".");
    const falsa = Buffer.from(JSON.stringify({ k: "cotizacion", id: "11111111-1111-4111-8111-111111111111", exp: AHORA + VIGENCIA_PDF_MS })).toString("base64url");
    expect(leerTokenPdf(S, `${falsa}.${f}`, AHORA)).toBeNull();
  });

  test("basura, vacío o sin secreto: null", () => {
    for (const t of ["", "abc", "a.b.c", null, undefined]) expect(leerTokenPdf(S, t, AHORA)).toBeNull();
    expect(leerTokenPdf("", crearTokenPdf(S, "cotizacion", ID, AHORA), AHORA)).toBeNull();
  });

  test("la URL usa PORTAL_PUBLIC_URL o crm.efameinsa.com", () => {
    expect(urlPdfPortal(S, "cotizacion", ID, AHORA)).toMatch(/^https:\/\/crm\.efameinsa\.com\/api\/portal\/pdf\?t=/);
    process.env.PORTAL_PUBLIC_URL = "https://otro.ejemplo/";
    const u = new URL(urlPdfPortal(S, "informe_servicio", ID, AHORA));
    expect(u.origin).toBe("https://otro.ejemplo");
    expect(leerTokenPdf(S, u.searchParams.get("t"), AHORA)).toEqual({ k: "informe_servicio", id: ID });
  });
});
