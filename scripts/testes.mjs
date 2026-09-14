#!/usr/bin/env node
/**
 * Escolhe o banco de teste e roda a suíte.
 *
 * Dois alvos, decididos por uma pergunta só — existe Docker aqui?
 *
 *   **Docker presente → Supabase local.** Banco descartável: `db reset`
 *   reaplica as migrações na ordem e recarrega o seed antes de cada execução.
 *   É o alvo bom, e é o único que também prova que a cadeia de migrações sobe
 *   em banco limpo, que é como produção vai nascer na F3.
 *
 *   **Docker ausente → projeto dev na nuvem.** Ele é dev permanente e
 *   descartável por definição (CLAUDE.md), então é alvo legítimo, não
 *   gambiarra. O que muda é que **ninguém reseta nada**: o seed que sobrar
 *   estragado fica estragado, e todo fixture precisa limpar o que criou.
 *
 * O que não existe é um terceiro caminho onde os testes de integração são
 * pulados em silêncio. Teste que nunca falhou não prova nada.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const VERDE = "\x1b[32m";
const AMARELO = "\x1b[33m";
const VERMELHO = "\x1b[31m";
const CINZA = "\x1b[90m";
const FORTE = "\x1b[1m";
const FIM = "\x1b[0m";

const rodar = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: "utf8", ...opts });

const passo = (t) => process.stdout.write(`${CINZA}→ ${t}${FIM}\n`);

function abortar(titulo, detalhe) {
  process.stderr.write(`\n${VERMELHO}${titulo}${FIM}\n${detalhe}\n`);
  process.exit(1);
}

function temDocker() {
  const r = rodar("docker", ["info"], { stdio: "ignore" });
  return !r.error && r.status === 0;
}

// ---------------------------------------------------------------------
// Alvo local: sobe o stack, recria o banco, devolve as credenciais
// ---------------------------------------------------------------------
function prepararLocal() {
  passo("Docker encontrado — usando o Supabase local.");

  passo("subindo o stack (idempotente)…");
  if (rodar("npx", ["supabase", "start"], { stdio: "inherit" }).status !== 0) {
    abortar("`supabase start` falhou.", "Rode `npx supabase start` à mão para ver o erro.");
  }

  passo("recriando o banco: migrações na ordem, depois o seed…");
  if (rodar("npx", ["supabase", "db", "reset"], { stdio: "inherit" }).status !== 0) {
    abortar(
      "`supabase db reset` falhou.",
      [
        "A cadeia de migrações não sobe em banco limpo. É defeito real, não",
        "problema do teste: produção (F3) nasce exatamente assim.",
        "Corrija com migração NOVA — migração aplicada não se edita.",
      ].join("\n"),
    );
  }

  passo("lendo as credenciais do stack…");
  const status = rodar("npx", ["supabase", "status", "-o", "env"]);
  if (status.status !== 0) abortar("`supabase status` falhou.", status.stderr || "");

  const cred = {};
  for (const linha of status.stdout.split("\n")) {
    const casa = linha.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (casa) cred[casa[1]] = casa[2];
  }

  if (!cred.API_URL || !cred.ANON_KEY || !cred.SERVICE_ROLE_KEY) {
    abortar("Não li API_URL/ANON_KEY/SERVICE_ROLE_KEY do `supabase status`.", status.stdout);
  }

  return {
    alvo: "local",
    url: cred.API_URL,
    anon: cred.ANON_KEY,
    service: cred.SERVICE_ROLE_KEY,
  };
}

// ---------------------------------------------------------------------
// Alvo nuvem: o projeto dev, sem reset
// ---------------------------------------------------------------------
function prepararNuvem() {
  const arquivo = existsSync(".env.test.local") ? ".env.test.local" : ".env.local";

  if (!existsSync(arquivo)) {
    abortar(
      "Sem Docker e sem credenciais de banco.",
      [
        "Os testes de integração precisam de um Postgres com a RLS de verdade.",
        "",
        "  • Instale o Docker e a suíte passa a usar o Supabase local, resetado",
        "    a cada execução (o caminho bom).",
        "  • Ou preencha .env.local com o projeto dev na nuvem.",
        "",
        "Só o que não depende de banco: npm run test:unidade",
      ].join("\n"),
    );
  }

  process.loadEnvFile(arquivo);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon || !service) {
    abortar(
      `${arquivo} não tem as três variáveis necessárias.`,
      "Precisa de NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const host = new URL(url).host;
  process.stdout.write(
    `\n${AMARELO}${FORTE}  ATENÇÃO — rodando contra o projeto dev na NUVEM  ${FIM}\n` +
      `${AMARELO}  ${host} (de ${arquivo})\n\n` +
      `  Docker não foi encontrado, então não há 'db reset': o banco NÃO volta\n` +
      `  ao estado do seed entre execuções. Na prática:\n\n` +
      `    · todo fixture precisa limpar o que criou, inclusive quando falha;\n` +
      `    · CPF de teste fora da faixa do seed — escrever sobre um CPF do seed\n` +
      `      apaga uma persona e quebra a suíte inteira;\n` +
      `    · um teste que morre no meio pode deixar sujeira que faz o PRÓXIMO\n` +
      `      falhar por um motivo que não é o dele.\n\n` +
      `  Instale o Docker para ter o local resetado a cada execução.${FIM}\n\n`,
  );

  return { alvo: "nuvem", url, anon, service };
}

// ---------------------------------------------------------------------
const destino = temDocker() ? prepararLocal() : prepararNuvem();

passo("rodando a suíte…\n");
const vitest = rodar("npx", ["vitest", "run", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: destino.url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: destino.anon,
    SUPABASE_SERVICE_ROLE_KEY: destino.service,
    PORTAL3E_ALVO_DE_TESTE: destino.alvo,
  },
});

if (vitest.status === 0) {
  process.stdout.write(
    destino.alvo === "local"
      ? `\n${VERDE}Suíte verde contra o Supabase local (banco recriado do zero).${FIM}\n`
      : `\n${VERDE}Suíte verde${FIM} ${AMARELO}contra o projeto dev na nuvem — sem reset.${FIM}\n`,
  );
}
process.exit(vitest.status ?? 1);
