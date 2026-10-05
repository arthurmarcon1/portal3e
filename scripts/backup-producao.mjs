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
 * 4. **`pg_dump` nativo, da versão certa.** Sem Docker de propósito: rotina
 *    mensal que depende do Docker Desktop aberto é rotina adiada. O `pg_dump`
 *    recusa servidor de versão maior que a dele, então o script pergunta a
 *    versão ao servidor (`psql`) e para, com o comando de instalação, se o
 *    cliente for mais velho. Instalação: docs/08, "Riscos dos planos
 *    gratuitos".
 *
 * As flags do `pg_dump` são as que o `supabase db dump` usa (conferidas com
 * `--dry-run` no CLI v2.116): mesmos schemas excluídos, `--column-inserts`, e
 * o arquivo de dados abre com `session_replication_role = replica` — sem isso
 * a restauração esbarra nos gatilhos de imutabilidade da ciência e na ordem
 * das chaves estrangeiras.
 *
 * Conexão: o endereço direto (`db.<ref>.supabase.co`) só tem IPv6, e o WSL
 * costuma não ter. Use o **Session pooler** (porta 5432, usuário
 * `postgres.<ref>`), que é o que docs/08 põe em `PROD_DB`.
 *
 * Pasta criada com permissão 700 e arquivos com 600: só o dono lê.
 */

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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
      '  export PROD_DB="postgresql://postgres.<ref de produção>:<senha codificada>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"\n' +
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
// 3. pg_dump nativo, compatível com o servidor
// ---------------------------------------------------------------------
const COMO_INSTALAR =
  "Instale o cliente do PostgreSQL pelo repositório oficial (o Ubuntu 24.04 só traz o 16):\n\n" +
  "  sudo apt install -y curl ca-certificates\n" +
  "  sudo install -d /usr/share/postgresql-common/pgdg\n" +
  "  sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc\n" +
  "  . /etc/os-release\n" +
  "  sudo sh -c \"echo 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $VERSION_CODENAME-pgdg main' > /etc/apt/sources.list.d/pgdg.list\"\n" +
  "  sudo apt update\n" +
  "  sudo apt install -y postgresql-client-NN\n\n" +
  "A versão do cliente tem de ser igual ou maior que a do servidor. Detalhes: docs/08,\n" +
  "\"Riscos dos planos gratuitos\".";

/** Major de `pg_dump (PostgreSQL) 17.11 (Ubuntu …)`; null se não instalado. */
function majorDoCliente(programa) {
  const r = spawnSync(programa, ["--version"], { encoding: "utf8" });
  if (r.status !== 0 || r.error) return null;
  const m = r.stdout.match(/\(PostgreSQL\)\s+(\d+)/);
  return m ? Number(m[1]) : null;
}

const clientePgDump = majorDoCliente("pg_dump");
const clientePsql = majorDoCliente("psql");
if (clientePgDump === null || clientePsql === null) {
  abortar("pg_dump/psql não encontrados.", COMO_INSTALAR.replace("NN", "17"));
}

// Conexão pelas variáveis PG*, como o próprio CLI do Supabase faz: a senha
// não vai para a linha de comando (onde `ps` a mostraria).
const ambienteDoBanco = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: url.pathname.replace(/^\//, "") || "postgres",
  PGSSLMODE: "require",
  PGCONNECT_TIMEOUT: "15",
};

/** Nada que vá para a tela leva a senha nem a URL. */
function semSegredo(texto) {
  let t = texto.replaceAll(bruta, "<PROD_DB>");
  const senha = decodeURIComponent(url.password);
  if (senha) t = t.replaceAll(senha, "<senha>");
  return t;
}

function dicaDeConexao(erro) {
  if (url.hostname.startsWith("db.") && /unreachable|Network|resolve|timeout/i.test(erro)) {
    return (
      "\n\nO endereço direto db.<ref>.supabase.co só tem IPv6, e o WSL não tem. Use o\n" +
      "Session pooler em PROD_DB (painel do Supabase › Connect › Session pooler):\n" +
      "  postgresql://postgres.<ref>:<senha>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
    );
  }
  return "";
}

const versao = spawnSync("psql", ["-XAtc", "show server_version_num"], { encoding: "utf8", env: ambienteDoBanco });
if (versao.status !== 0) {
  const erro = semSegredo(versao.stderr || versao.stdout);
  abortar("Não consegui conectar em PROD_DB.", erro + dicaDeConexao(erro));
}
const servidor = Math.floor(Number(versao.stdout.trim()) / 10000);
if (!servidor) abortar("Resposta inesperada do servidor ao pedir a versão.", semSegredo(versao.stdout));
if (clientePgDump < servidor) {
  abortar(
    `O pg_dump instalado é ${clientePgDump} e o servidor é ${servidor}: o pg_dump recusa servidor mais novo.`,
    COMO_INSTALAR.replace("NN", String(servidor)),
  );
}

// ---------------------------------------------------------------------
// 4. Dump
// ---------------------------------------------------------------------
process.stdout.write(
  `\n${FORTE}Backup do banco de produção ${ref}${FIM}  ${CINZA}(servidor ${servidor}, pg_dump ${clientePgDump})${FIM}\n\n`,
);

mkdirSync(pasta, { recursive: true, mode: 0o700 });
chmodSync(pasta, 0o700);

const prefixo = path.join(pasta, `portal3e-${path.basename(pasta)}`);
const arquivos = {
  esquema: `${prefixo}-esquema.sql`,
  dados: `${prefixo}-dados.sql`,
};

// Os mesmos do `supabase db dump`: o que a plataforma mantém não é backup nosso.
// No de dados, `auth` e `storage` FICAM (logins e metadados dos arquivos).
const EXCLUIDOS_DADOS =
  "information_schema|pg_*|graphql|graphql_public|pgsodium|pgsodium_masks|pgtle|repack|tiger|tiger_data|timescaledb_*|_timescaledb_*|topology|vault|etl|extensions|pgbouncer|realtime|supabase_migrations|_analytics|_realtime|_supavisor";
const EXCLUIDOS_ESQUEMA =
  "information_schema|pg_*|_analytics|_realtime|_supavisor|auth|etl|extensions|pgbouncer|realtime|storage|supabase_functions|supabase_migrations|cron|dbdev|graphql|graphql_public|net|pgmq|pgsodium|pgsodium_masks|pgtle|repack|tiger|tiger_data|timescaledb_*|_timescaledb_*|topology|vault";

function dump(rotulo, argumentos, arquivo, { antes = "", depois = "" } = {}) {
  passo(`${rotulo}…`);
  // O banco do piloto cabe em memória com folga (MB); `maxBuffer` só evita o
  // corte silencioso do padrão do Node.
  const r = spawnSync("pg_dump", ["--quote-all-identifier", "--role", "postgres", ...argumentos], {
    encoding: "utf8",
    env: ambienteDoBanco,
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (r.status !== 0 || r.error) {
    const erro = semSegredo(r.stderr || String(r.error ?? ""));
    abortar(`O pg_dump (${rotulo}) falhou.`, erro + dicaDeConexao(erro));
  }
  if (!r.stdout.trim()) abortar(`O pg_dump (${rotulo}) não devolveu nada.`);
  // `\restrict`/`\unrestrict` (pg_dump 17.6+) são meta-comandos do psql: comentados,
  // como o CLI do Supabase faz, para o arquivo rodar também fora do psql.
  const corpo = r.stdout.replace(/^\\(un)?restrict .*$/gm, "-- $&");
  writeFileSync(arquivo, antes + corpo + depois, { mode: 0o600 });
  chmodSync(arquivo, 0o600);
}

dump("esquema", ["--schema-only", "--exclude-schema", EXCLUIDOS_ESQUEMA], arquivos.esquema);
dump(
  "dados",
  [
    "--data-only",
    "--exclude-schema",
    EXCLUIDOS_DADOS,
    "--exclude-table",
    "auth.schema_migrations",
    "--exclude-table",
    "storage.migrations",
    "--exclude-table",
    "supabase_functions.migrations",
    "--schema",
    "*",
    "--column-inserts",
    "--rows-per-insert",
    "100000",
  ],
  arquivos.dados,
  // Restauração com gatilhos desligados: a imutabilidade da ciência e a ordem
  // das FKs valem para quem escreve, não para quem devolve uma cópia exata.
  { antes: "SET session_replication_role = replica;\n\n", depois: "\nRESET ALL;\n" },
);

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
