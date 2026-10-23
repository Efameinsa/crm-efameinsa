import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Cada PDF lleva el logo de SU empresa (Santos 23-10: «los PDF que se generen deben tener sus
 * respectivos logos, de Efameinsa y de Open»). El de Open es el oficial del 21-10 (sin complemento).
 * El ancho va aparte porque el de Open es más alto: así los dos ocupan lo mismo en la cabecera.
 */
const EFAMEINSA = readFileSync(join(process.cwd(), "public", "logo-efameinsa.png"));
const OPEN = readFileSync(join(process.cwd(), "public", "logo-open.png"));

export type Empresa = "OPEN" | "EFAMEINSA";

export const empresaValida = (v: string | null | undefined): Empresa => (String(v ?? "").toUpperCase() === "EFAMEINSA" ? "EFAMEINSA" : "OPEN");

export function logoDeEmpresa(empresa: string | null | undefined): { buffer: Buffer; ancho: number } {
  return empresaValida(empresa) === "EFAMEINSA" ? { buffer: EFAMEINSA, ancho: 100 } : { buffer: OPEN, ancho: 72 };
}
