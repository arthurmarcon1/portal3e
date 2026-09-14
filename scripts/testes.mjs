#!/usr/bin/env node
/**
 * Prepara o Supabase LOCAL e roda a suíte inteira.
 *
 * Por que local: parte da suíte é de integração e escreve no banco (RLS é
 * dado, não código — testar contra dublê provaria só o dublê). Um banco que
 * pode ser resetado a cada execução dá duas coisas que o projeto na nuvem não
 * dá: isolamento entre execuções e a reaplicação da cadeia de migrações do
 * zero, que é o que prova que a sequência sobe sem o histórico de tentativas.
 *
 * O projeto na nuvem virou ambiente de demonstração e teste manual, com seed
 * estável. Nenhum teste automatizado escreve nele.
 *
 * Exige Docker. Ver a seção "Testes" do CLAUDE.md.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const VERDE = "\x1b[32m";
const VERMELHO = "\x1b[31m";
const CINZA = "\x1b[90m";
const FIM = "\x1b[0m";

function rodar(comando, argumentos, opcoes = {}) {
  return spawnSync(comando, argumentos, { encoding: "utf8", ...opcoes });
}

function passo(texto) {
  process.stdout.write(`${CINZA}→ ${texto}${FIM}\n`);
}

function abortar(titulo, detalhe) {
  process.stderr.write(`\n${VERMELHO}${titulo}${FIM}\n${detalhe}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------
// 1. Docker
// ---------------------------------------------------------------------
const docker = rodar("docker", ["info"], { stdio: "ignore" });
if (docker.error || docker.status !== 0) {
  abortar(
    "Docker não está disponível.",
    [
      "A suíte de integração roda contra o Supabase local, que sobe em contêineres.",
      "",
      "  • Sem Docker instalado: instale o Docker Engine (WSL2: dentro da distro).",
      "  • Docker instalado mas parado: inicie o serviço e rode de novo.",
      "  • Máquina de 8GB: o stack do Supabase não cabe. Use:",
      "",
      "        npm run test:unidade",
      "",
      "    que roda tudo que não depende de banco. Os testes de integração",
      "    ficam para a máquina maior ou para o CI.",
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------
// 2. Stack local de pé
// ---------------------------------------------------------------------
passo("subindo o Supabase local (idempotente)…");
const start = rodar("npx", ["supabase", "start"], { stdio: "inherit" });
if (start.status !== 0) {
  abortar(
    "`supabase start` falhou.",
    "Rode `npx supabase start` à mão para ver o erro completo.",
  );
}

// ---------------------------------------------------------------------
// 3. Banco do zero: migrações na ordem + seed
//
// É aqui que uma migração que só funcionava por causa do histórico do projeto
// na nuvem aparece — ela simplesmente não sobe em banco limpo.
// ---------------------------------------------------------------------
passo("recriando o banco: migrações 0001→N na ordem, depois o seed…");
const reset = rodar("npx", ["supabase", "db", "reset"], { stdio: "inherit" });
if (reset.status !== 0) {
  abortar(
    "`supabase db reset` falhou.",
    [
      "A cadeia de migrações não sobe em banco limpo. Isso é um defeito real,",
      "não um problema do teste: produção (F3) nasce exatamente assim.",
      "Corrija com uma migração NOVA — migração aplicada não se edita.",
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------
// 4. Credenciais do stack local
//
// Lidas do próprio CLI em vez de fixadas aqui: as chaves mudam entre versões
// do Supabase, e chave errada dá erro de autenticação difícil de ler.
// ---------------------------------------------------------------------
passo("lendo as credenciais do stack local…");
const status = rodar("npx", ["supabase", "status", "-o", "env"]);
if (status.status !== 0) {
  abortar("`supabase status` falhou.", status.stderr || "sem detalhe.");
}

const credenciais = {};
for (const linha of status.stdout.split("\n")) {
  const casa = linha.match(/^([A-Z_]+)="?([^"]*)"?$/);
  if (casa) credenciais[casa[1]] = casa[2];
}

const url = credenciais.API_URL;
const anon = credenciais.ANON_KEY;
const service = credenciais.SERVICE_ROLE_KEY;

if (!url || !anon || !service) {
  abortar(
    "Não consegui ler API_URL/ANON_KEY/SERVICE_ROLE_KEY do `supabase status`.",
    `Saída recebida:\n${status.stdout}`,
  );
}

// ---------------------------------------------------------------------
// 5. Suíte
// ---------------------------------------------------------------------
if (existsSync(".env.test.local")) {
  process.stdout.write(
    `${CINZA}  (.env.test.local existe, mas \`npm test\` ignora: este comando é sempre local)${FIM}\n`,
  );
}

passo("rodando a suíte…\n");
const vitest = rodar("npx", ["vitest", "run", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    // Sobrescreve qualquer coisa que venha de .env: o alvo é o local.
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
    SUPABASE_SERVICE_ROLE_KEY: service,
    PORTAL3E_ALVO_DE_TESTE: "local",
  },
});

if (vitest.status === 0) {
  process.stdout.write(`\n${VERDE}Suíte verde contra o Supabase local.${FIM}\n`);
}
process.exit(vitest.status ?? 1);
