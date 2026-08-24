import { describe, it, expect, afterEach } from "vitest";
import { urlApp, enlaceApp } from "./url-app";

const previo = { APP_URL: process.env.APP_URL, VERCEL: process.env.VERCEL_PROJECT_PRODUCTION_URL };
afterEach(() => {
  process.env.APP_URL = previo.APP_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL = previo.VERCEL;
  if (previo.APP_URL === undefined) delete process.env.APP_URL;
  if (previo.VERCEL === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
});

describe("urlApp", () => {
  it("APP_URL manda sobre todo lo demás", () => {
    process.env.APP_URL = "https://staging.efameinsa.com";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "crm-efameinsa.vercel.app";
    expect(urlApp()).toBe("https://staging.efameinsa.com");
  });

  it("sin APP_URL usa el dominio de producción que pone Vercel, sin protocolo", () => {
    delete process.env.APP_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "crm.efameinsa.com";
    expect(urlApp()).toBe("https://crm.efameinsa.com");
  });

  it("sin nada configurado cae al dominio nuevo, no al viejo de Vercel", () => {
    delete process.env.APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    expect(urlApp()).toBe("https://crm.efameinsa.com");
  });

  it("no deja dobles barras al armar el enlace", () => {
    process.env.APP_URL = "https://crm.efameinsa.com/";
    expect(enlaceApp("/central")).toBe("https://crm.efameinsa.com/central");
    expect(enlaceApp("central")).toBe("https://crm.efameinsa.com/central");
  });
});
