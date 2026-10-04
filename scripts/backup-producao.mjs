#!/usr/bin/env node
/**
 * Backup do banco de PRODUÇÃO: `npm run backup:producao`.
 *
 * O piloto roda no Supabase gratuito, que não tem backup (docs/08, "Riscos dos
 * planos gratuitos"). O que não se refaz — a ciência dos funcionários, imutável,
 * e a trilha de auditoria — só existe lá. Este script é a cópia.
 *
 * Gera dois arquivos numa pasta com data e hora:
 *
 * - `portal3e-<quando>-dados.sql`: os dados de `public`, `app`, `auth` (logins e
 *   senhas com hash) e os metadados do `storage`. É o que importa.
 * - `portal3e-<quando>-esquema.sql`: o esquema daquele momento, para conferência.
 *   Para restaurar, o caminho é projeto novo + migrações na ordem (as do commit
 *   da época) + o arquivo de dados.
 *
 * **Os PDFs do Storage não entram** — o dump é do banco. Os originais do mês
 * vêm do PontoTel e são guardados à parte.
 *
 * Guardas, todas antes de tocar em qualquer coisa:
 *
 * 1. **Alvo só por `PROD_DB`**, a URL do banco exportada no terminal (docs/08,
 *    "Variáveis deste guia"). Nunca pelo link do repositório, nunca por
 *    `.env.local`: o link aponta para o dev, de propósito (docs/08, regra 2).
 * 2. **Recusa o dev e o local.** O ref de `PROD_DB` é comparado com o
 *    `SUPABASE_PROJECT_REF` de `.env.local`, que é o dev. Backup do dev é dado
 *    fictício; se o alvo for ele, a variável está errada.
 * 3. **Saída fora do repositório** por padrão (`~/portal3e-backups`). Com
 *    `--saida=` dentro do repositório, só se o git ignorar o caminho. O
 *    arquivo é dado pessoal de funcionário real: no repositório, seria o
 *    primeiro vazamento de verdade deste projeto.
 * 4. **Docker ligado.** O `supabase db dump` roda o `pg_dump` num contêiner.
 *
 * Pasta criada com permissão 700 e arquivos com 600: só o dono lê.
 */

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const VERMELHO = "\x1b[31m";
const AMARELO = "\x1b[33m";
const VERDE = "\x1b[32m";
const CINZA = "\x1b[90m";
const FORTE = "\x1b[1m";
const FIM = "\x1b[0m";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAIDA_PADRAO = path.join(homedir(), "portal3e-backups");

const passo = (t) => process.stdout.write(`${CINZA}→ ${t}${FIM}\n`);

function abortar(titulo, detalhe = "") {
  process.stderr.write(`\n${VERMELHO}${titulo}${FIM}\n${detalhe}\n`);
  process.exit(1);
}

/** Ref do projeto pela URL: `db.<ref>.supabase.co` ou usuário `postgres.<ref>` do pooler. */
function refDaUrl(url) {
  const doHost = url.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/);
  if (doHost) return doHost[1];
  const doUsuario = decodeURIComponent(url.username).match(/^postgres\.([a-z0-9]{20})$/);
  if (doUsuario && url.hostname.endsWith(".pooler.supabase.com")) return doUsuario[1];
  return null;
}

/** O dev é o de `.env.local`. Lido só para recusar — nunca como alvo. */
function refDoDev() {
  const arquivo = path.join(RAIZ, ".env.local");
  if (!existsSync(arquivo)) return null;
  return parseEnv(readFileSync(arquivo, "utf8")).SUPABASE_PROJECT_REF ?? null;
}

function dentroDoRepositorio(caminho) {
  const relativo = path.relative(RAIZ, caminho);
  return relativo === "" || (!relativo.startsWith("..") && !path.isAbsolute(relativo));
}

/** `git check-ignore` sai 0 quando o caminho é ignorado. */
function ignoradoPeloGit(caminho) {
  return spawnSync("git", ["check-ignore", "-q", caminho], { cwd: RAIZ }).status === 0;
}

function carimbo() {
  // 2026-10-04_14h05 — em hora local, que é como a pessoa procura depois.
  const d = new Date();
  const dois = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}_${dois(d.getHours())}h${dois(d.getMinutes())}`;
}

// ---------------------------------------------------------------------
// 1. Alvo
// ---------------------------------------------------------------------
const bruta = process.env.PROD_DB;
if (!bruta) {
  abortar(
    "PROD_DB não está definida — não sei qual banco copiar.",
    "Exporte no terminal, como em docs/08 (\"Variáveis deste guia\"):\n" +
      '  export PROD_DB="postgresql://postgres:<senha codificada>@db.<ref de produção>.supabase.co:5432/postgres"\n' +
      "Este script nunca usa o link do repositório nem o .env.local como alvo.",
  );
}

let url;
try {
  url = new URL(bruta);
} catch {
  abortar("PROD_DB não é uma URL de banco válida.", "Senha com caractere especial precisa estar codificada (docs/08, passo 1).");
}

if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) {
  abortar("PROD_DB aponta para o Supabase local.", "Backup do banco local é dado fictício. Use a URL de produção.");
}

const ref = refDaUrl(url);
if (!ref) {
  abortar(
    "PROD_DB não parece um banco Supabase.",
    `Host: ${url.hostname}. Esperado db.<ref>.supabase.co (ou o pooler, com usuário postgres.<ref>).`,
  );
}

const dev = refDoDev();
if (dev && ref === dev) {
  abortar(
    "PROD_DB aponta para o projeto DEV — não faço backup dele.",
    `Ref ${ref} é o SUPABASE_PROJECT_REF de .env.local. O dev é descartável e só tem dado\n` +
      "fictício; se você queria produção, a variável está errada.",
  );
}

// ---------------------------------------------------------------------
// 2. Saída
// ---------------------------------------------------------------------
const argSaida = process.argv.find((a) => a.startsWith("--saida="));
const base = path.resolve(argSaida ? argSaida.slice("--saida=".length) : SAIDA_PADRAO);
const pasta = path.join(base, carimbo());

if (dentroDoRepositorio(pasta) && !ignoradoPeloGit(pasta)) {
  abortar(
    "A pasta de saída está dentro do repositório e o git NÃO a ignora.",
    `${pasta}\n` +
      "O dump é dado pessoal de funcionário real e nunca entra no repositório.\n" +
      `Use o padrão (${SAIDA_PADRAO}) ou uma pasta coberta pelo .gitignore (ex.: --saida=backups).`,
  );
}

// ---------------------------------------------------------------------
// 3. Docker
// ---------------------------------------------------------------------
if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) {
  abortar(
    "O Docker não está rodando.",
    "O `supabase db dump` executa o pg_dump num contêiner. Abra o Docker Desktop e rode de novo.",
  );
}

// ---------------------------------------------------------------------
// 4. Dump
// ---------------------------------------------------------------------
process.stdout.write(`\n${FORTE}Backup do banco de produção ${ref}${FIM}\n\n`);

mkdirSync(pasta, { recursive: true, mode: 0o700 });
chmodSync(pasta, 0o700);

const prefixo = path.join(pasta, `portal3e-${path.basename(pasta)}`);
const arquivos = {
  esquema: `${prefixo}-esquema.sql`,
  dados: `${prefixo}-dados.sql`,
};

function dump(rotulo, extras, arquivo) {
  passo(`${rotulo}…`);
  // A URL vai como argumento, nunca impressa: ela carrega a senha do banco.
  const r = spawnSync("npx", ["supabase", "db", "dump", "--db-url", bruta, ...extras, "-f", arquivo], {
    encoding: "utf8",
    cwd: RAIZ,
  });
  if (r.status !== 0) {
    const saida = (r.stderr || r.stdout).replaceAll(bruta, "<PROD_DB>");
    const senha = decodeURIComponent(url.password);
    abortar(`O dump (${rotulo}) falhou.`, senha ? saida.replaceAll(senha, "<senha>") : saida);
  }
  if (!existsSync(arquivo) || statSync(arquivo).size === 0) {
    abortar(`O dump (${rotulo}) não gerou arquivo, ou gerou vazio.`, arquivo);
  }
  chmodSync(arquivo, 0o600);
}

dump("esquema", [], arquivos.esquema);
dump("dados", ["--data-only"], arquivos.dados);

// Conferência mínima: produção tem organização e usuários desde o passo 5 do
// docs/08. Sem eles, o arquivo não é backup de produção — ou a URL está errada.
const conteudo = readFileSync(arquivos.dados, "utf8");
const tem = (tabela) => conteudo.includes(`INSERT INTO "public"."${tabela}"`);
const faltando = ["organizacoes", "usuarios"].filter((t) => !tem(t));
if (faltando.length > 0) {
  abortar(
    "O arquivo de dados não traz o que produção tem de ter.",
    `Sem INSERT para: ${faltando.join(", ")}. Confira se PROD_DB é mesmo produção.\n${arquivos.dados}`,
  );
}
const presenca = ["pessoas", "ciencias", "auditoria"].map((t) => `${t}: ${tem(t) ? "sim" : "vazia"}`).join(" · ");

const tamanho = (f) => `${(statSync(f).size / 1024).toFixed(0)} KB`;
process.stdout.write(
  `\n${VERDE}${FORTE}Salvo em ${pasta}${FIM}\n` +
    `  ${path.basename(arquivos.dados)}  (${tamanho(arquivos.dados)})\n` +
    `  ${path.basename(arquivos.esquema)}  (${tamanho(arquivos.esquema)})\n` +
    `${CINZA}  ${presenca} · pasta 700, arquivos 600${FIM}\n\n` +
    `${AMARELO}${FORTE}  AGORA: cifre e apague o original.${FIM}\n` +
    `${AMARELO}  É dado pessoal de funcionário real, em texto puro.${FIM}\n\n` +
    `    gpg --symmetric --cipher-algo AES256 "${arquivos.dados}"\n` +
    `    gpg --symmetric --cipher-algo AES256 "${arquivos.esquema}"\n` +
    `    shred -u "${arquivos.dados}" "${arquivos.esquema}"\n\n` +
    `  A senha do gpg vai para o gerenciador de senhas. O .gpg fica fora do repositório\n` +
    `  e fora de pasta sincronizada sem controle de acesso. Os PDFs do Storage NÃO estão\n` +
    `  aqui: guarde os originais do PontoTel do mês.\n`,
);
