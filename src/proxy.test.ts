import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { config } from "./proxy";

/**
 * O que o proxy cobre e o que fica fora dele (docs/06, 2026-10-22).
 *
 * Rota de job autentica por segredo, não por sessão — se o proxy a pega, o
 * cron da Vercel leva 307 para `/login` e nunca roda. Toda outra rota de API
 * continua passando pelo proxy (que renova a sessão), mesmo validando sozinha
 * (invariante 9). Este teste falha se alguém mexer no matcher e tirar uma
 * rota sem querer, ou se nascer uma rota de API nova fora dele.
 */

const padrao = new RegExp(`^${config.matcher[0]}$`);
const cobre = (caminho: string) => padrao.test(caminho);

/** Rotas de API que existem hoje, lidas do disco, com `[param]` preenchido. */
function rotasDeApi(): string[] {
  const raiz = join(process.cwd(), "src", "app");
  const rotas: string[] = [];
  const andar = (pasta: string) => {
    for (const item of readdirSync(pasta, { withFileTypes: true })) {
      const caminho = join(pasta, item.name);
      if (item.isDirectory()) andar(caminho);
      else if (item.name === "route.ts") {
        rotas.push(
          "/" + relative(raiz, pasta).split(sep).join("/").replace(/\[[^\]]+\]/g, "00000000-0000-4000-8000-000000000000"),
        );
      }
    }
  };
  andar(join(raiz, "api"));
  return rotas.sort();
}

/** Fora do proxy de propósito: autenticam por segredo, não por sessão. */
const FORA_DO_PROXY = ["/api/jobs/notificacoes"];

describe("matcher do proxy", () => {
  it("rota de job fica fora: autentica por CRON_SECRET, não por sessão", () => {
    expect(cobre("/api/jobs/notificacoes")).toBe(false);
  });

  it("toda outra rota de API passa pelo proxy", () => {
    const rotas = rotasDeApi();
    expect(rotas.length).toBeGreaterThan(1);
    for (const rota of rotas) {
      expect(cobre(rota), rota).toBe(!FORA_DO_PROXY.includes(rota));
    }
  });

  it("as telas das áreas e as de login passam pelo proxy", () => {
    for (const tela of ["/", "/login", "/primeiro-acesso", "/inicio", "/documentos/x", "/admin", "/cliente"]) {
      expect(cobre(tela), tela).toBe(true);
    }
  });

  it("só o prefixo /api/jobs/ sai — nome parecido continua dentro", () => {
    expect(cobre("/api/jobsx")).toBe(true);
    expect(cobre("/api/job/notificacoes")).toBe(true);
    expect(cobre("/admin/api/jobs/x")).toBe(true);
  });
});
