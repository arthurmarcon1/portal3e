#!/usr/bin/env node
/**
 * Recria o banco do projeto dev na NUVEM do zero: `npm run db:reset:nuvem`.
 *
 * Por que existe, em vez de `supabase db reset --linked` cru:
 *
 * O reset remoto não recria o banco — ele apaga os objetos dos schemas do
 * usuário e reaplica as migrações por cima. E o apagamento deixa coisas para
 * trás. Medido em 2026-09-28, na primeira vez que se rodou: a 0001 cria
 * `protocolo_seq` solta (compartilhada por `ciencias` e `solicitacoes` via
 * `app.gerar_protocolo()`, sem coluna dona). O wipe derrubou tabelas,
 * funções, tipos e o schema `app`, mas não ela — e a 0001 morreu no
 * `create sequence` com 42P07, deixando o banco sem schema nenhum e sem
 * histórico de migração. O sintoma (erro no meio da 0001) não aponta para a
 * causa; por isso a limpeza mora aqui, e não num passo manual.
 *
 * O que este script limpa ANTES do reset, e por quê:
 *
 * 1. **Sequências sem coluna dona** em `public` e `app`. Sequência de
 *    `serial`/`identity` cai junto com a tabela; a solta sobrevive ao wipe e
 *    colide com o `create sequence` da migração. A consulta é genérica: pega
 *    `protocolo_seq` e qualquer outra que alguém criar do mesmo jeito.
 * 2. **Arquivos dos buckets criados por migração** (`documentos`). O schema
 *    `storage` não entra no wipe: o bucket continua (a 0015 usa
 *    `on conflict`), mas os arquivos ficariam órfãos de linhas que não
 *    existem mais. Banco do zero é bucket vazio também.
 *
 * O resto já é idempotente nas migrações (`create extension if not exists`,
 * `create schema if not exists`) ou no seed (`auth.users` apagados e
 * recriados).
 *
 * Só roda contra o projeto LINKADO, e só se ele for o de `.env.local`
 * (SUPABASE_PROJECT_REF): o dev, descartável por definição (CLAUDE.md).
 * Produção nasce na F3 como projeto novo, com as migrações em banco limpo —
 * este script não tem nada a fazer lá.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

const VERMELHO = "\x1b[31m";
const AMARELO = "\x1b[33m";
const VERDE = "\x1b[32m";
const CINZA = "\x1b[90m";
const FORTE = "\x1b[1m";
const FIM = "\x1b[0m";

/** Buckets que as migrações criam. Bucket novo em migração = linha nova aqui. */
const BUCKETS_DAS_MIGRACOES = ["documentos"];

const passo = (t) => process.stdout.write(`${CINZA}→ ${t}${FIM}\n`);

function abortar(titulo, detalhe = "") {
  process.stderr.write(`\n${VERMELHO}${titulo}${FIM}\n${detalhe}\n`);
  process.exit(1);
}

function supabase(args, opcoes = {}) {
  return spawnSync("npx", ["supabase", ...args], { encoding: "utf8", ...opcoes });
}

/** `supabase db query --linked` devolve JSON com `rows`; o resto da saída é ruído. */
function consultar(sql) {
  const r = supabase(["db", "query", "--linked", sql]);
  if (r.status !== 0) abortar("Consulta ao banco da nuvem falhou.", `${sql}\n\n${r.stderr}`);
  const inicio = r.stdout.indexOf("{");
  const fim = r.stdout.lastIndexOf("}");
  try {
    return JSON.parse(r.stdout.slice(inicio, fim + 1)).rows ?? [];
  } catch {
    abortar("Resposta inesperada do `supabase db query`.", r.stdout);
  }
}

// ---------------------------------------------------------------------
// Alvo
// ---------------------------------------------------------------------
if (!existsSync(".env.local")) abortar("Sem .env.local: não sei qual é o projeto dev.");
process.loadEnvFile(".env.local");

const refEsperado = process.env.SUPABASE_PROJECT_REF;
const refLinkado = existsSync("supabase/.temp/project-ref")
  ? readFileSync("supabase/.temp/project-ref", "utf8").trim()
  : null;

if (!refEsperado || refLinkado !== refEsperado) {
  abortar(
    "O projeto linkado não é o projeto dev de .env.local — não reseto.",
    `linkado: ${refLinkado ?? "(nenhum)"} · .env.local: ${refEsperado ?? "(vazio)"}\n` +
      "Rode `npx supabase link --project-ref <ref do dev>` se for o caso.",
  );
}
if (!process.env.SUPABASE_DB_PASSWORD) {
  abortar("SUPABASE_DB_PASSWORD vazia em .env.local.", "O `db reset --linked` precisa dela.");
}

process.stdout.write(
  `\n${AMARELO}${FORTE}  APAGA TUDO no projeto dev ${refLinkado}  ${FIM}\n` +
    `${AMARELO}  Banco, histórico de migração e arquivos dos buckets. Depois: migrações\n` +
    `  na ordem e o seed.${FIM}\n\n`,
);

// ---------------------------------------------------------------------
// 1. Sequências sem coluna dona
// ---------------------------------------------------------------------
passo("procurando sequências sem coluna dona em public e app…");
const soltas = consultar(`
  select format('%I.%I', n.nspname, c.relname) as nome
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'S'
     and n.nspname in ('public', 'app')
     and not exists (
       select 1 from pg_depend d
        where d.classid = 'pg_class'::regclass and d.objid = c.oid
          and d.deptype in ('a', 'i')
     )
   order by 1
`).map((l) => l.nome);

if (soltas.length === 0) {
  passo("nenhuma.");
} else {
  passo(`derrubando: ${soltas.join(", ")}`);
  // Sem CASCADE: se algo depender delas de verdade, é melhor parar e olhar.
  consultar(`drop sequence ${soltas.join(", ")}`);
}

// ---------------------------------------------------------------------
// 2. Arquivos dos buckets
// ---------------------------------------------------------------------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) abortar("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes em .env.local.");
const admin = createClient(url, service, { auth: { persistSession: false } });

/** Todos os caminhos de arquivo sob `prefixo`, descendo pelas "pastas". */
async function listarTudo(bucket, prefixo = "") {
  const caminhos = [];
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(prefixo, { limit: 1000, offset: pagina * 1000 });
    if (error) throw new Error(`${bucket}/${prefixo}: ${error.message}`);
    for (const item of data) {
      const caminho = prefixo ? `${prefixo}/${item.name}` : item.name;
      // Pasta não tem id no Storage.
      if (item.id === null) caminhos.push(...(await listarTudo(bucket, caminho)));
      else caminhos.push(caminho);
    }
    if (data.length < 1000) return caminhos;
  }
}

for (const bucket of BUCKETS_DAS_MIGRACOES) {
  const { data: existe } = await admin.storage.getBucket(bucket);
  if (!existe) {
    passo(`bucket ${bucket}: não existe ainda — a migração cria.`);
    continue;
  }
  const caminhos = await listarTudo(bucket);
  passo(`bucket ${bucket}: ${caminhos.length} arquivo(s) a apagar.`);
  for (let i = 0; i < caminhos.length; i += 100) {
    const { error } = await admin.storage.from(bucket).remove(caminhos.slice(i, i + 100));
    if (error) abortar(`Não consegui esvaziar o bucket ${bucket}.`, error.message);
  }
}

// ---------------------------------------------------------------------
// 3. Reset
// ---------------------------------------------------------------------
passo("db reset --linked: wipe, migrações na ordem, seed…\n");
const reset = supabase(["db", "reset", "--linked", "--yes"], { stdio: "inherit", env: process.env });
if (reset.status !== 0) {
  abortar(
    "`supabase db reset --linked` falhou.",
    [
      "O banco da nuvem pode ter ficado pela metade. Se o erro for um objeto que",
      "\"already exists\", é outro órfão do wipe: trate-o aqui neste script, não à",
      "mão. Se for erro de migração, corrija com migração NOVA.",
    ].join("\n"),
  );
}

process.stdout.write(`\n${VERDE}Projeto dev ${refLinkado} recriado do zero.${FIM}\n`);
