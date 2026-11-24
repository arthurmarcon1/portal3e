-- =====================================================================
-- 0030 — 3e Conecta: alimentações, rubricas e lançamentos (prova de conceito)
--
-- Vem DEPOIS da 0029 (financeiro do contrato), que já tem uma tabela
-- `lancamentos` — o realizado do contrato da 3e. O lançamento do Conecta é
-- outro conceito, por isso `lancamentos_conecta`. Se os dois devem virar um
-- só é decisão pendente (docs/06).
--
-- O Conecta mora dentro do Portal (decisão do gestor, 2026-11-23): mesma
-- organização, mesmo login, mesma RLS. O produtor manda um áudio ou uma foto
-- ("abasteci a caminhonete da Estância Aurora, R$ 320 de gasolina em
-- novembro"); o Portal guarda o original, transcreve, sugere os campos, e a
-- equipe CONFERE antes de virar registro.
--
-- 1. Módulo novo `alimentacoes` no check de `perfil_permissoes`. Quem tem o
--    quê é dado (seed, docs/02): na prova de conceito, só o Admin geral.
-- 2. `rubricas` — a categoria do lançamento (combustível, venda de gado…).
--    Dado da organização, com as palavras que a extração por regras procura.
--    Sem policy de escrita: entra por seed até haver tela.
-- 3. `alimentacoes` — o que chegou: o arquivo (bucket privado), a transcrição,
--    o que foi extraído e o status pendente / conferida / recusada. **Decidida
--    não muda mais** (trigger): o que foi conferido é o que virou lançamento.
-- 4. `lancamentos_conecta` — o registro que nasce da alimentação conferida. Um por
--    alimentação, só pela função `conferir_alimentacao()`, que decide e lança
--    na mesma transação.
--
-- **Quem confere é sempre a equipe interna; o produtor só origina.** Regra de
-- negócio (docs/06, 2026-11-23): toda escrita aqui exige `app.tipo() =
-- 'interno'`, então um produtor com usuário — quando existir — nunca confere
-- nem a própria alimentação nem a de outro.
--
-- Leitura e escrita seguem o escopo de contrato do interno
-- (`app.contratos_permitidos()`), como pessoas e documentos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Módulo novo
-- ---------------------------------------------------------------------
alter table perfil_permissoes drop constraint perfil_permissoes_modulo_check;
alter table perfil_permissoes add constraint perfil_permissoes_modulo_check
  check (modulo in ('pessoas','contratos','documentos','jornada','solicitacoes',
                    'comunicacao','sst','relatorios','administracao','financeiro',
                    'alimentacoes'));

create type status_alimentacao as enum ('pendente', 'conferida', 'recusada');
create type tipo_alimentacao   as enum ('audio', 'foto');

-- ---------------------------------------------------------------------
-- 2. Rubricas
-- ---------------------------------------------------------------------
create table rubricas (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null constraint rubricas_org_fk references organizacoes(id) on delete cascade,
  chave          text not null,
  nome           text not null,
  palavras_chave text[] not null default '{}',
  status         status_generico not null default 'ativo',
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint rubricas_chave_unica unique (org_id, chave)
);

comment on table rubricas is
  'Categoria do lançamento do Conecta. Dado da organização; PROVISÓRIO na prova de conceito (docs/06).';
comment on column rubricas.palavras_chave is
  'Termos que a extração por regras procura na transcrição, sem acento e em minúsculas.';

alter table rubricas enable row level security;

create policy rubricas_leitura on rubricas for select to authenticated
  using (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('alimentacoes', 'ver'));

-- ---------------------------------------------------------------------
-- 3. Alimentações
-- ---------------------------------------------------------------------
create table alimentacoes (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null constraint alimentacoes_org_fk references organizacoes(id) on delete cascade,
  contrato_id        uuid not null constraint alimentacoes_contrato_fk references contratos(id) on delete restrict,
  tipo               tipo_alimentacao not null,
  arquivo_path       text not null constraint alimentacoes_arquivo_unico unique,
  arquivo_mime       text not null,
  arquivo_bytes      integer not null constraint alimentacoes_bytes_positivo check (arquivo_bytes > 0),
  arquivo_hash       text not null,
  enviada_por        uuid not null constraint alimentacoes_enviada_por_fk references usuarios(id) on delete restrict,
  transcricao        text,
  -- De onde veio o texto: 'groq:<modelo>' ou 'manual' (digitado na conferência).
  transcricao_origem text,
  -- O que a extração sugeriu, como saiu dela — a conferência pode mudar tudo,
  -- mas a sugestão original fica para comparar.
  extracao           jsonb,
  status             status_alimentacao not null default 'pendente',
  decidida_por       uuid constraint alimentacoes_decidida_por_fk references usuarios(id) on delete restrict,
  decidida_em        timestamptz,
  motivo_recusa      text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint alimentacoes_decisao_completa check (
    (status = 'pendente' and decidida_por is null and decidida_em is null)
    or (status <> 'pendente' and decidida_por is not null and decidida_em is not null)
  ),
  constraint alimentacoes_recusa_com_motivo check (
    status <> 'recusada' or length(trim(coalesce(motivo_recusa, ''))) > 0
  )
);

create index alimentacoes_fila on alimentacoes (org_id, status, criado_em desc);

comment on table alimentacoes is
  'O que o produtor mandou (áudio ou foto) e a conferência da equipe. Decidida não muda (0030).';

alter table alimentacoes enable row level security;

create policy alimentacoes_leitura on alimentacoes for select to authenticated
  using (
    org_id = app.org_id() and app.tipo() = 'interno'
    and app.tem_permissao('alimentacoes', 'ver')
    and contrato_id in (select app.contratos_permitidos())
  );

-- Nasce pendente, de quem envia, num contrato do escopo dele.
create policy alimentacoes_insercao on alimentacoes for insert to authenticated
  with check (
    org_id = app.org_id() and app.tipo() = 'interno'
    and app.tem_permissao('alimentacoes', 'criar')
    and contrato_id in (select app.contratos_permitidos())
    and enviada_por = auth.uid()
    and status = 'pendente'
  );

-- Conferir, recusar ou corrigir a transcrição: só pendente, só quem edita.
create policy alimentacoes_atualizacao on alimentacoes for update to authenticated
  using (
    org_id = app.org_id() and app.tipo() = 'interno'
    and app.tem_permissao('alimentacoes', 'editar')
    and contrato_id in (select app.contratos_permitidos())
    and status = 'pendente'
  )
  with check (
    org_id = app.org_id() and app.tipo() = 'interno'
    and app.tem_permissao('alimentacoes', 'editar')
    and contrato_id in (select app.contratos_permitidos())
  );

-- Sem policy de delete: nada some (CLAUDE.md, invariante 8). Recusar é status.

create or replace function app.alimentacao_ao_atualizar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if app.sujeito_as_travas() then
    if old.status <> 'pendente' then
      raise exception 'Esta alimentação já foi decidida e não muda mais.' using errcode = '55000';
    end if;
    if new.org_id is distinct from old.org_id
       or new.contrato_id is distinct from old.contrato_id
       or new.tipo is distinct from old.tipo
       or new.arquivo_path is distinct from old.arquivo_path
       or new.arquivo_mime is distinct from old.arquivo_mime
       or new.arquivo_bytes is distinct from old.arquivo_bytes
       or new.arquivo_hash is distinct from old.arquivo_hash
       or new.enviada_por is distinct from old.enviada_por
       or new.criado_em is distinct from old.criado_em then
      raise exception 'O original de uma alimentação não muda.' using errcode = '55000';
    end if;
    -- Quem decide é quem está logado, agora — não o que o cliente mandou.
    if new.status <> 'pendente' then
      new.decidida_por := auth.uid();
      new.decidida_em := now();
    else
      new.decidida_por := null;
      new.decidida_em := null;
    end if;
  end if;
  new.atualizado_em := now();
  return new;
end $$;

create trigger trg_alimentacoes_ao_atualizar
  before update on alimentacoes
  for each row execute function app.alimentacao_ao_atualizar();

-- ---------------------------------------------------------------------
-- 4. Lançamentos
-- ---------------------------------------------------------------------
create table lancamentos_conecta (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null constraint lancamentos_conecta_org_fk references organizacoes(id) on delete cascade,
  contrato_id    uuid not null constraint lancamentos_conecta_contrato_fk references contratos(id) on delete restrict,
  unidade_id     uuid constraint lancamentos_conecta_unidade_fk references unidades(id) on delete restrict,
  alimentacao_id uuid not null constraint lancamentos_conecta_alimentacao_fk references alimentacoes(id) on delete restrict
                 constraint lancamentos_conecta_um_por_alimentacao unique,
  rubrica_id     uuid not null constraint lancamentos_conecta_rubrica_fk references rubricas(id) on delete restrict,
  descricao      text not null constraint lancamentos_conecta_descricao_preenchida check (length(trim(descricao)) > 0),
  valor          numeric(14, 2) not null constraint lancamentos_conecta_valor_positivo check (valor > 0),
  competencia    date not null constraint lancamentos_conecta_competencia_mes check (extract(day from competencia) = 1),
  criado_por     uuid not null constraint lancamentos_conecta_criado_por_fk references usuarios(id) on delete restrict,
  criado_em      timestamptz not null default now()
);

create index lancamentos_conecta_por_competencia on lancamentos_conecta (org_id, competencia desc);

comment on table lancamentos_conecta is
  'Registro que nasce da alimentação conferida — um por alimentação, só por conferir_alimentacao() (0030).';
comment on column lancamentos_conecta.competencia is 'Mês do lançamento, sempre no dia 1.';

alter table lancamentos_conecta enable row level security;

create policy lancamentos_conecta_leitura on lancamentos_conecta for select to authenticated
  using (
    org_id = app.org_id() and app.tipo() = 'interno'
    and app.tem_permissao('alimentacoes', 'ver')
    and contrato_id in (select app.contratos_permitidos())
  );

-- Só para alimentação que ACABOU de ser conferida, do mesmo contrato, por
-- quem a conferiu. Na prática, só a função abaixo passa por aqui.
create policy lancamentos_conecta_insercao on lancamentos_conecta for insert to authenticated
  with check (
    org_id = app.org_id() and app.tipo() = 'interno'
    and app.tem_permissao('alimentacoes', 'editar')
    and contrato_id in (select app.contratos_permitidos())
    and criado_por = auth.uid()
    and exists (
      select 1 from alimentacoes a
       where a.id = alimentacao_id
         and a.contrato_id = lancamentos_conecta.contrato_id
         and a.status = 'conferida'
         and a.decidida_por = auth.uid()
    )
  );

-- Sem update nem delete: o ciclo de vida do lançamento (estorno, correção)
-- ainda não está decidido (docs/06). Até lá, o que entrou fica.

-- ---------------------------------------------------------------------
-- Conferir: decide a alimentação e cria o lançamento na mesma transação.
-- SECURITY INVOKER: quem barra é a RLS de quem chama, não a função.
-- ---------------------------------------------------------------------
create or replace function public.conferir_alimentacao(
  p_alimentacao uuid,
  p_rubrica     uuid,
  p_unidade     uuid,
  p_descricao   text,
  p_valor       numeric,
  p_competencia date
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_alimentacao alimentacoes;
  v_lancamento  uuid;
begin
  if p_unidade is not null and not exists (
    select 1 from contrato_unidades cu
      join alimentacoes a on a.contrato_id = cu.contrato_id
     where a.id = p_alimentacao and cu.unidade_id = p_unidade
  ) then
    raise exception 'O cliente escolhido não pertence ao contrato desta alimentação.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from rubricas r
      join alimentacoes a on a.org_id = r.org_id
     where a.id = p_alimentacao and r.id = p_rubrica and r.status = 'ativo'
  ) then
    raise exception 'Escolha uma rubrica ativa.' using errcode = '22023';
  end if;

  update alimentacoes set status = 'conferida'
   where id = p_alimentacao and status = 'pendente'
  returning * into v_alimentacao;

  if v_alimentacao.id is null then
    raise exception 'Esta alimentação não está pendente, ou você não pode conferi-la.' using errcode = 'P0002';
  end if;

  insert into lancamentos_conecta (org_id, contrato_id, unidade_id, alimentacao_id, rubrica_id,
                           descricao, valor, competencia, criado_por)
  values (v_alimentacao.org_id, v_alimentacao.contrato_id, p_unidade, v_alimentacao.id, p_rubrica,
          trim(p_descricao), p_valor, date_trunc('month', p_competencia)::date, auth.uid())
  returning id into v_lancamento;

  return v_lancamento;
end $$;

revoke all on function public.conferir_alimentacao(uuid, uuid, uuid, text, numeric, date) from public, anon;
grant execute on function public.conferir_alimentacao(uuid, uuid, uuid, text, numeric, date) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Bucket privado do original (invariante 3). Sem policy para ninguém: o
-- arquivo sobe com service_role na Server Action e sai pela rota auditada
-- /api/alimentacoes/[id]/arquivo. 8 MB = o teto do corpo da Server Action.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('alimentacoes', 'alimentacoes', false, 8388608,
        array['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm',
              'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
