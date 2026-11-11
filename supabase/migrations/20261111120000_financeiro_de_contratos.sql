-- =====================================================================
-- 0029 — Financeiro do contrato: planilha de custo, competência e lançamento
--
-- O que nasce aqui (docs/03, "Financeiro do contrato"):
--
-- 1. Módulo `financeiro` na lista canônica. Admin geral e Financeiro
--    lançam; Contratos/Coordenação só vê. Contratante nunca: toda leitura
--    exige `app.tipo() = 'interno'`, além da permissão e do escopo.
-- 2. `planilhas_de_custo` + `planilha_postos`: a base do contrato, importada
--    da planilha de custos e formação de preços da licitação. É VERSIONADA:
--    aditivo, reajuste ou repactuação entram como versão nova, com a data em
--    que passam a valer. A versão anterior fica, porque as competências
--    antigas continuam apontando para ela.
-- 3. `competencias`: o mês do contrato. Abre apontando para a planilha
--    vigente; é ali que o previsto do mês sai.
-- 4. `lancamentos`: o realizado do mês — nota emitida, glosa, folha, férias,
--    viagem, alimentação, EPI. Entra pela tela agora e pelo WhatsApp depois;
--    o que a IA não tiver certeza nasce `em_conferencia`.
-- 5. `lancamento_anexos` + bucket privado `financeiro`: a foto da nota ou o
--    comprovante. Sem policy em `storage.objects`, como os buckets de
--    documentos e anexos (invariante 3).
--
-- Regras que o banco segura sozinho:
-- - escopo: quem tem escopo só nos contratos de cliente não lê o
--   financeiro de outro contrato (`app.contratos_permitidos()`);
-- - competência fechada não aceita lançamento novo nem alteração;
-- - o posto do lançamento pertence à planilha da competência;
-- - nada se apaga: lançamento errado vira `descartado` (invariante 8),
--   planilha substituída vira `inativo`. Não há policy de DELETE.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Módulo novo na lista de perfil_permissoes
-- ---------------------------------------------------------------------
alter table perfil_permissoes drop constraint perfil_permissoes_modulo_check;
alter table perfil_permissoes add constraint perfil_permissoes_modulo_check
  check (modulo in ('pessoas','contratos','documentos','jornada','solicitacoes',
                    'comunicacao','sst','relatorios','administracao','financeiro'));

-- Perfis que já existem em qualquer organização (o dev na nuvem e a
-- produção nascem com perfis antes desta migração). O seed reescreve as
-- permissões da org de teste com a mesma matriz (docs/02).
insert into perfil_permissoes (perfil_id, modulo, acao)
select p.id, 'financeiro', m.acao
  from perfis p
  join (values
    ('admin_geral', 'ver'), ('admin_geral', 'criar'), ('admin_geral', 'editar'),
    ('admin_geral', 'excluir'), ('admin_geral', 'exportar'),
    ('financeiro', 'ver'), ('financeiro', 'criar'), ('financeiro', 'editar'),
    ('financeiro', 'exportar'),
    ('contratos', 'ver')
  ) as m(chave, acao) on m.chave = p.chave
 where p.aplica_a = 'interno'
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Tipos
-- ---------------------------------------------------------------------
create type status_competencia  as enum ('aberta', 'fechada');
create type natureza_lancamento as enum ('receita', 'despesa');
create type origem_lancamento   as enum ('plataforma', 'whatsapp');
create type status_lancamento   as enum ('confirmado', 'em_conferencia', 'descartado');

-- ---------------------------------------------------------------------
-- 3. Planilha de custo (versionada) e seus postos
-- ---------------------------------------------------------------------
create table planilhas_de_custo (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,
  contrato_id       uuid not null,
  versao            integer not null check (versao > 0),
  vigente_desde     date not null check (extract(day from vigente_desde) = 1),
  valor_mensal      numeric(14,2) not null check (valor_mensal >= 0),
  meses_execucao    integer check (meses_execucao is null or meses_execucao > 0),
  regime_tributario text,
  arquivo_nome      text not null,
  observacao        text,
  status            status_generico not null default 'ativo',
  importada_por     uuid,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  constraint planilhas_de_custo_org_fk foreign key (org_id)
    references organizacoes (id) on delete cascade,
  constraint planilhas_de_custo_contrato_fk foreign key (contrato_id)
    references contratos (id) on delete restrict,
  constraint planilhas_de_custo_importada_por_fk foreign key (importada_por)
    references usuarios (id) on delete set null,
  constraint planilhas_de_custo_versao_unica unique (contrato_id, versao),
  -- Alvo das FKs compostas abaixo: garante que competência e planilha são
  -- do mesmo contrato.
  constraint planilhas_de_custo_id_contrato unique (id, contrato_id)
);
create index planilhas_de_custo_contrato_idx on planilhas_de_custo (contrato_id, vigente_desde desc);
comment on table planilhas_de_custo is
  'Base financeira do contrato, da planilha de custos da licitação. Versão nova a cada aditivo/reajuste.';

create table planilha_postos (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  planilha_id      uuid not null,
  cargo            text not null,
  quantidade       integer not null check (quantidade > 0),
  valor_unitario   numeric(14,2) not null check (valor_unitario >= 0),
  valor_total      numeric(14,2) generated always as (quantidade * valor_unitario) stored,
  -- Composição por empregado, como na planilha (módulos 1 a 5).
  salario_base     numeric(14,2) not null default 0,
  remuneracao      numeric(14,2) not null default 0,
  beneficios       numeric(14,2) not null default 0,
  insumos          numeric(14,2) not null default 0,
  encargos         numeric(14,2) not null default 0,
  custos_indiretos numeric(14,2) not null default 0,
  tributos         numeric(14,2) not null default 0,
  lucro            numeric(14,2) not null default 0,
  ordem            integer not null default 0,
  criado_em        timestamptz not null default now(),
  constraint planilha_postos_org_fk foreign key (org_id)
    references organizacoes (id) on delete cascade,
  constraint planilha_postos_planilha_fk foreign key (planilha_id)
    references planilhas_de_custo (id) on delete cascade,
  constraint planilha_postos_cargo_unico unique (planilha_id, cargo)
);
create index planilha_postos_planilha_idx on planilha_postos (planilha_id, ordem);
comment on table planilha_postos is
  'Cargo × quantidade × valor unitário cobrado, com a composição de custo por empregado. Imutável: muda com versão nova da planilha.';

-- ---------------------------------------------------------------------
-- 4. Competência
-- ---------------------------------------------------------------------
create table competencias (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  contrato_id   uuid not null,
  planilha_id   uuid not null,
  mes           date not null check (extract(day from mes) = 1),
  status        status_competencia not null default 'aberta',
  observacao    text,
  fechada_em    timestamptz,
  fechada_por   uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint competencias_org_fk foreign key (org_id)
    references organizacoes (id) on delete cascade,
  constraint competencias_contrato_fk foreign key (contrato_id)
    references contratos (id) on delete restrict,
  constraint competencias_planilha_fk foreign key (planilha_id, contrato_id)
    references planilhas_de_custo (id, contrato_id) on delete restrict,
  constraint competencias_fechada_por_fk foreign key (fechada_por)
    references usuarios (id) on delete set null,
  constraint competencias_mes_unico unique (contrato_id, mes),
  constraint competencias_id_contrato unique (id, contrato_id),
  constraint competencias_fechamento_completo check (
    (status = 'aberta' and fechada_em is null) or (status = 'fechada' and fechada_em is not null)
  )
);
comment on column competencias.mes is 'Primeiro dia do mês da competência do serviço (a nota fica aqui; o caixa, na data do pagamento).';

-- ---------------------------------------------------------------------
-- 5. Lançamento
-- ---------------------------------------------------------------------
create table lancamentos (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  contrato_id     uuid not null,
  competencia_id  uuid not null,
  posto_id        uuid,
  natureza        natureza_lancamento not null,
  categoria       text not null,
  descricao       text not null check (length(trim(descricao)) > 0),
  valor           numeric(14,2) not null check (valor > 0),
  data_documento  date,
  origem          origem_lancamento not null default 'plataforma',
  status          status_lancamento not null default 'confirmado',
  -- O que a IA leu (transcrição, campos sugeridos, confiança). Só informação:
  -- o que vale é o que está nas colunas, conferido por gente.
  sugestao        jsonb,
  motivo_descarte text,
  criado_por      uuid,
  conferido_por   uuid,
  conferido_em    timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint lancamentos_org_fk foreign key (org_id)
    references organizacoes (id) on delete cascade,
  constraint lancamentos_competencia_fk foreign key (competencia_id, contrato_id)
    references competencias (id, contrato_id) on delete restrict,
  constraint lancamentos_posto_fk foreign key (posto_id)
    references planilha_postos (id) on delete restrict,
  constraint lancamentos_criado_por_fk foreign key (criado_por)
    references usuarios (id) on delete set null,
  constraint lancamentos_conferido_por_fk foreign key (conferido_por)
    references usuarios (id) on delete set null,
  constraint lancamentos_categoria_da_natureza check (
    (natureza = 'receita' and categoria in ('faturamento', 'extra', 'glosa'))
    or (natureza = 'despesa' and categoria in (
      'folha', 'encargos', 'beneficios', 'ferias_13', 'rescisao',
      'epi_uniforme', 'materiais', 'equipamentos',
      'viagem', 'alimentacao', 'deslocamento', 'exames_treinamentos',
      'tributos', 'outros'))
  ),
  constraint lancamentos_descarte_com_motivo check (
    status <> 'descartado' or length(trim(coalesce(motivo_descarte, ''))) > 0
  )
);
create index lancamentos_competencia_idx on lancamentos (competencia_id, status);
create index lancamentos_contrato_idx on lancamentos (contrato_id, criado_em desc);
comment on column lancamentos.categoria is
  'Receita: faturamento (bruto da nota), extra, glosa (subtrai). Despesa: ver o check. Lista em docs/03.';

create table lancamento_anexos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  lancamento_id uuid not null,
  nome          text not null,
  arquivo_path  text not null unique,
  mime          text not null,
  bytes         integer not null check (bytes > 0),
  enviado_por   uuid,
  criado_em     timestamptz not null default now(),
  constraint lancamento_anexos_org_fk foreign key (org_id)
    references organizacoes (id) on delete cascade,
  constraint lancamento_anexos_lancamento_fk foreign key (lancamento_id)
    references lancamentos (id) on delete restrict,
  constraint lancamento_anexos_enviado_por_fk foreign key (enviado_por)
    references usuarios (id) on delete set null
);
create index lancamento_anexos_lancamento_idx on lancamento_anexos (lancamento_id);

-- ---------------------------------------------------------------------
-- 6. Gatilhos
-- ---------------------------------------------------------------------
create trigger trg_planilhas_de_custo_atualizado before update on planilhas_de_custo
  for each row execute function app.set_atualizado_em();
create trigger trg_competencias_atualizado before update on competencias
  for each row execute function app.set_atualizado_em();
create trigger trg_lancamentos_atualizado before update on lancamentos
  for each row execute function app.set_atualizado_em();

-- Lançamento só entra e só muda com a competência aberta, e o posto tem de
-- ser da planilha da competência. Vale para qualquer caminho de escrita —
-- tela, WhatsApp, script —, por isso mora no banco e não na action.
create or replace function app.lancamento_consistente()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_status   status_competencia;
  v_planilha uuid;
begin
  select c.status, c.planilha_id into v_status, v_planilha
    from competencias c where c.id = new.competencia_id;

  if v_status = 'fechada' then
    raise exception 'A competência está fechada. Reabra a competência para lançar ou corrigir.'
      using errcode = 'P0001', hint = 'competencia_fechada';
  end if;

  if tg_op = 'UPDATE' then
    -- O lançamento não troca de contrato nem de competência: corrigir mês
    -- errado é descartar e lançar de novo, para o histórico mostrar o erro.
    if new.competencia_id <> old.competencia_id or new.contrato_id <> old.contrato_id
       or new.org_id <> old.org_id or new.origem <> old.origem then
      raise exception 'Lançamento não muda de competência, contrato ou origem.'
        using errcode = 'P0001', hint = 'lancamento_imutavel';
    end if;
    if old.status = 'descartado' then
      raise exception 'Lançamento descartado não volta a valer. Lance de novo.'
        using errcode = 'P0001', hint = 'lancamento_descartado';
    end if;
  end if;

  if new.posto_id is not null and not exists (
    select 1 from planilha_postos p where p.id = new.posto_id and p.planilha_id = v_planilha
  ) then
    raise exception 'O posto não pertence à planilha desta competência.'
      using errcode = 'P0001', hint = 'posto_fora_da_planilha';
  end if;

  return new;
end $$;

create trigger trg_lancamentos_consistente before insert or update on lancamentos
  for each row execute function app.lancamento_consistente();

-- Fechar competência com lançamento em conferência deixaria o mês fechado
-- com número que ninguém conferiu.
create or replace function app.competencia_ao_fechar()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.planilha_id <> old.planilha_id or new.mes <> old.mes or new.contrato_id <> old.contrato_id then
    raise exception 'A competência não muda de mês, contrato ou planilha.'
      using errcode = 'P0001', hint = 'competencia_imutavel';
  end if;
  if new.status = 'fechada' and old.status = 'aberta' and exists (
    select 1 from lancamentos l where l.competencia_id = new.id and l.status = 'em_conferencia'
  ) then
    raise exception 'Há lançamentos em conferência. Confira ou descarte antes de fechar.'
      using errcode = 'P0001', hint = 'conferencia_pendente';
  end if;
  return new;
end $$;

create trigger trg_competencias_ao_fechar before update on competencias
  for each row execute function app.competencia_ao_fechar();

-- ---------------------------------------------------------------------
-- 7. Permissão: um predicado só para as cinco tabelas
--
-- Interno, com a permissão do módulo, e o contrato dentro do escopo. O
-- contratante cai no primeiro termo sempre — inclusive o Adm./Financeiro
-- do cliente, que vê o próprio contrato em outras telas mas não o custo e a
-- margem da 3e.
-- ---------------------------------------------------------------------
create or replace function app.financeiro_alcanca(p_contrato uuid, p_acao text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select app.tipo() = 'interno'
     and app.tem_permissao('financeiro', p_acao)
     and p_contrato in (select app.contratos_permitidos())
$$;

grant execute on function app.financeiro_alcanca(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 8. RLS — leitura por `ver`, inserção por `criar`, atualização por
--    `editar`. Nunca `for all` (invariante 1). Sem DELETE para ninguém.
-- ---------------------------------------------------------------------
alter table planilhas_de_custo enable row level security;
alter table planilha_postos    enable row level security;
alter table competencias       enable row level security;
alter table lancamentos        enable row level security;
alter table lancamento_anexos  enable row level security;

-- planilhas_de_custo
create policy planilhas_de_custo_leitura on planilhas_de_custo for select to authenticated
  using (org_id = app.org_id() and app.financeiro_alcanca(contrato_id, 'ver'));

create policy planilhas_de_custo_insercao on planilhas_de_custo for insert to authenticated
  with check (org_id = app.org_id() and app.financeiro_alcanca(contrato_id, 'criar'));

create policy planilhas_de_custo_atualizacao on planilhas_de_custo for update to authenticated
  using (org_id = app.org_id() and app.financeiro_alcanca(contrato_id, 'editar'))
  with check (org_id = app.org_id() and app.financeiro_alcanca(contrato_id, 'editar'));

-- planilha_postos: segue a planilha. Sem UPDATE — muda com versão nova.
create policy planilha_postos_leitura on planilha_postos for select to authenticated
  using (
    org_id = app.org_id()
    and exists (select 1 from planilhas_de_custo p
                where p.id = planilha_postos.planilha_id
                  and app.financeiro_alcanca(p.contrato_id, 'ver'))
  );

create policy planilha_postos_insercao on planilha_postos for insert to authenticated
  with check (
    org_id = app.org_id()
    and exists (select 1 from planilhas_de_custo p
                where p.id = planilha_postos.planilha_id
                  and p.org_id = app.org_id()
                  and app.financeiro_alcanca(p.contrato_id, 'criar'))
  );

-- competencias
create policy competencias_leitura on competencias for select to authenticated
  using (org_id = app.org_id() and app.financeiro_alcanca(contrato_id, 'ver'));

create policy competencias_insercao on competencias for insert to authenticated
  with check (org_id = app.org_id() and app.financeiro_alcanca(contrato_id, 'criar'));

create policy competencias_atualizacao on competencias for update to authenticated
  using (org_id = app.org_id() and app.financeiro_alcanca(contrato_id, 'editar'))
  with check (org_id = app.org_id() and app.financeiro_alcanca(contrato_id, 'editar'));

-- lancamentos
create policy lancamentos_leitura on lancamentos for select to authenticated
  using (org_id = app.org_id() and app.financeiro_alcanca(contrato_id, 'ver'));

create policy lancamentos_insercao on lancamentos for insert to authenticated
  with check (
    org_id = app.org_id()
    and criado_por = auth.uid()
    and app.financeiro_alcanca(contrato_id, 'criar')
  );

create policy lancamentos_atualizacao on lancamentos for update to authenticated
  using (org_id = app.org_id() and app.financeiro_alcanca(contrato_id, 'editar'))
  with check (org_id = app.org_id() and app.financeiro_alcanca(contrato_id, 'editar'));

-- lancamento_anexos: imutável, segue o lançamento.
create policy lancamento_anexos_leitura on lancamento_anexos for select to authenticated
  using (
    org_id = app.org_id()
    and exists (select 1 from lancamentos l
                where l.id = lancamento_anexos.lancamento_id
                  and app.financeiro_alcanca(l.contrato_id, 'ver'))
  );

create policy lancamento_anexos_insercao on lancamento_anexos for insert to authenticated
  with check (
    org_id = app.org_id()
    and enviado_por = auth.uid()
    and exists (select 1 from lancamentos l
                where l.id = lancamento_anexos.lancamento_id
                  and l.org_id = app.org_id()
                  and app.financeiro_alcanca(l.contrato_id, 'criar'))
  );

-- ---------------------------------------------------------------------
-- 9. Bucket privado das notas e comprovantes
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('financeiro', 'financeiro', false, 8388608,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- 10. Gravação da planilha numa transação
--
-- Planilha sem posto é base que mente: o painel mostraria valor mensal sem
-- composição. Cabeçalho e postos entram juntos ou não entram. INVOKER: a RLS
-- de quem importa decide cada insert (precisa de `financeiro:criar` no
-- contrato). A versão é a próxima do contrato; a corrida entre duas
-- importações simultâneas para no unique (contrato_id, versao).
-- O valor mensal é a soma dos postos, calculada aqui — nunca o número que
-- veio do cliente.
-- ---------------------------------------------------------------------
create or replace function public.gravar_planilha_de_custo(
  p_contrato      uuid,
  p_vigente_desde date,
  p_meses         integer,
  p_regime        text,
  p_arquivo       text,
  p_observacao    text,
  p_postos        jsonb
)
returns table (planilha_id uuid, versao integer)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_id     uuid;
  v_versao integer;
  v_total  numeric(14,2);
begin
  if p_postos is null or jsonb_typeof(p_postos) <> 'array' or jsonb_array_length(p_postos) = 0 then
    raise exception 'A planilha precisa de pelo menos um posto.'
      using errcode = 'P0001', hint = 'planilha_sem_posto';
  end if;

  select coalesce(max(p.versao), 0) + 1 into v_versao
    from planilhas_de_custo p where p.contrato_id = p_contrato;

  select round(sum((x->>'quantidade')::integer * round((x->>'valor_unitario')::numeric, 2)), 2)
    into v_total from jsonb_array_elements(p_postos) x;

  insert into planilhas_de_custo (org_id, contrato_id, versao, vigente_desde, valor_mensal,
                                  meses_execucao, regime_tributario, arquivo_nome, observacao, importada_por)
  values (app.org_id(), p_contrato, v_versao, p_vigente_desde, v_total,
          p_meses, p_regime, p_arquivo, p_observacao, auth.uid())
  returning id into v_id;

  insert into planilha_postos (org_id, planilha_id, cargo, quantidade, valor_unitario,
                               salario_base, remuneracao, beneficios, insumos, encargos,
                               custos_indiretos, tributos, lucro, ordem)
  select app.org_id(), v_id, trim(x->>'cargo'), (x->>'quantidade')::integer,
         round((x->>'valor_unitario')::numeric, 2),
         round(coalesce((x->>'salario_base')::numeric, 0), 2),
         round(coalesce((x->>'remuneracao')::numeric, 0), 2),
         round(coalesce((x->>'beneficios')::numeric, 0), 2),
         round(coalesce((x->>'insumos')::numeric, 0), 2),
         round(coalesce((x->>'encargos')::numeric, 0), 2),
         round(coalesce((x->>'custos_indiretos')::numeric, 0), 2),
         round(coalesce((x->>'tributos')::numeric, 0), 2),
         round(coalesce((x->>'lucro')::numeric, 0), 2),
         (t.ord - 1)::integer
    from jsonb_array_elements(p_postos) with ordinality as t(x, ord);

  return query select v_id, v_versao;
end $$;

comment on function public.gravar_planilha_de_custo(uuid, date, integer, text, text, text, jsonb) is
  'Planilha de custo + postos numa transação, como versão nova do contrato. INVOKER: a RLS de quem importa decide.';

revoke all on function public.gravar_planilha_de_custo(uuid, date, integer, text, text, text, jsonb) from public, anon;
grant execute on function public.gravar_planilha_de_custo(uuid, date, integer, text, text, text, jsonb) to authenticated;
