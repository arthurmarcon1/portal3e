import { afterEach, describe, expect, it } from "vitest";

import { chaveServiceRole, urlSupabase } from "./env";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe("env do Supabase", () => {
  it("devolve o valor quando a variável está definida", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co";
    expect(urlSupabase()).toBe("https://exemplo.supabase.co");
  });

  it("falha com mensagem em português dizendo o que fazer", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => chaveServiceRole()).toThrowError(
      /SUPABASE_SERVICE_ROLE_KEY não definida.*\.env\.example/s,
    );
  });
});
