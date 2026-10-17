import { describe, expect, test } from "vitest";
import { firmarPortal, verificarFirmaPortal, VENTANA_MS } from "./firma";

const SECRETO = "un-secreto-de-prueba-bastante-largo";
const CUERPO = JSON.stringify({ email: "prueba@efameinsa.com" });
const AHORA = 1_792_000_000_000;

describe("firma del portal", () => {
  test("la firma correcta pasa", () => {
    const ts = String(AHORA);
    const firma = firmarPortal(SECRETO, ts, CUERPO);
    expect(firma).toMatch(/^[0-9a-f]{64}$/);
    expect(verificarFirmaPortal({ secreto: SECRETO, ts, firma, cuerpo: CUERPO, ahora: AHORA })).toEqual({ ok: true });
  });

  test("es la misma fórmula del contrato: HMAC-SHA256 de `${ts}.${cuerpo}`", () => {
    // Valor fijo calculado una vez: si alguien cambia la fórmula, la web deja de entrar.
    expect(firmarPortal("clave", "1000", "{}")).toBe("40bb01cdd95f128c99e9d5069ac07c601689bcc232c65911c4503a1e2f5f224d");
    const a = firmarPortal("clave", "1000", "{}");
    const b = firmarPortal("clave", "1000", "{} ");
    expect(a).not.toBe(b);
  });

  test("un cuerpo cambiado no pasa", () => {
    const ts = String(AHORA);
    const firma = firmarPortal(SECRETO, ts, CUERPO);
    const r = verificarFirmaPortal({ secreto: SECRETO, ts, firma, cuerpo: CUERPO.replace("prueba", "otro"), ahora: AHORA });
    expect(r).toEqual({ ok: false, motivo: "firma" });
  });

  test("otro secreto no pasa", () => {
    const ts = String(AHORA);
    const firma = firmarPortal("otro-secreto-cualquiera-largo", ts, CUERPO);
    expect(verificarFirmaPortal({ secreto: SECRETO, ts, firma, cuerpo: CUERPO, ahora: AHORA }).ok).toBe(false);
  });

  test("más de 5 minutos de diferencia no pasa, hacia atrás ni hacia adelante", () => {
    for (const desfase of [VENTANA_MS + 1, -(VENTANA_MS + 1)]) {
      const ts = String(AHORA + desfase);
      const firma = firmarPortal(SECRETO, ts, CUERPO);
      expect(verificarFirmaPortal({ secreto: SECRETO, ts, firma, cuerpo: CUERPO, ahora: AHORA })).toEqual({ ok: false, motivo: "hora" });
    }
    const ts = String(AHORA - VENTANA_MS);
    expect(verificarFirmaPortal({ secreto: SECRETO, ts, firma: firmarPortal(SECRETO, ts, CUERPO), cuerpo: CUERPO, ahora: AHORA }).ok).toBe(true);
  });

  test("sin secreto configurado (o uno corto) no pasa nada", () => {
    const ts = String(AHORA);
    for (const secreto of [undefined, null, "", "corto"]) {
      const firma = firmarPortal(secreto ?? "", ts, CUERPO);
      expect(verificarFirmaPortal({ secreto, ts, firma, cuerpo: CUERPO, ahora: AHORA })).toEqual({ ok: false, motivo: "sin_secreto" });
    }
  });

  test("cabeceras faltantes o mal formadas no pasan", () => {
    const ts = String(AHORA);
    const firma = firmarPortal(SECRETO, ts, CUERPO);
    expect(verificarFirmaPortal({ secreto: SECRETO, ts: null, firma, cuerpo: CUERPO, ahora: AHORA }).ok).toBe(false);
    expect(verificarFirmaPortal({ secreto: SECRETO, ts, firma: null, cuerpo: CUERPO, ahora: AHORA }).ok).toBe(false);
    expect(verificarFirmaPortal({ secreto: SECRETO, ts: "hola", firma, cuerpo: CUERPO, ahora: AHORA }).ok).toBe(false);
    expect(verificarFirmaPortal({ secreto: SECRETO, ts, firma: firma.slice(0, 63), cuerpo: CUERPO, ahora: AHORA }).ok).toBe(false);
  });

  test("la firma en mayúsculas también vale (es el mismo hex)", () => {
    const ts = String(AHORA);
    const firma = firmarPortal(SECRETO, ts, CUERPO).toUpperCase();
    expect(verificarFirmaPortal({ secreto: SECRETO, ts, firma, cuerpo: CUERPO, ahora: AHORA }).ok).toBe(true);
  });
});
