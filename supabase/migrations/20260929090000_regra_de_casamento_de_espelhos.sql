-- =====================================================================
-- 0019 — Regra de casamento dos arquivos de espelho (F4.1)
--
-- A publicação em lote casa cada PDF com uma pessoa pelo CPF ou pela
-- matrícula que está no NOME do arquivo. Como esse nome sai do fechamento do
-- PontoTel e a regra ainda não veio do gestor (docs/06, "Nomenclatura dos
-- arquivos de espelho"), ela é configurável: uma expressão regular cujo
-- primeiro grupo de captura é a chave, e o campo que a chave representa.
--
-- Uma linha por organização (multi-tenant desde a primeira linha): cada
-- cliente do Portal terá o seu sistema de ponto e o seu padrão de nome.
--
-- Leitura: toda a organização (é regra, não dado de pessoa — como o resto do
-- catálogo). Escrita: interno com `jornada:editar`. Sem `for all`
-- (invariante 1): insert e update separados; delete não existe — a regra
-- muda, não some.
-- =====================================================================

create table regras_espelho (
  org_id        uuid primary key references organizacoes(id) on delete cascade,
  expressao     text not null check (length(expressao) between 1 and 200),
  campo         text not null check (campo in ('cpf', 'matricula')),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id) on delete set null
);

comment on table regras_espelho is
  'Como achar a pessoa no nome do arquivo de espelho (F4.1): regex com a chave no 1º grupo, e se a chave é CPF ou matrícula.';

alter table regras_espelho enable row level security;

create policy regras_espelho_leitura on regras_espelho for select to authenticated
  using (org_id = app.org_id());

create policy regras_espelho_insercao on regras_espelho for insert to authenticated
  with check (
    org_id = app.org_id()
    and app.tipo() = 'interno'
    and app.tem_permissao('jornada', 'editar')
  );

create policy regras_espelho_atualizacao on regras_espelho for update to authenticated
  using (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('jornada', 'editar'))
  with check (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('jornada', 'editar'));

create trigger trg_regras_espelho_atualizado
  before update on regras_espelho
  for each row execute function app.set_atualizado_em();
