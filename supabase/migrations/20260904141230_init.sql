-- =====================================================================
-- Portal 3e — migração inicial
-- Schema base, funções de permissão (SECURITY DEFINER) e RLS.
-- Ordem: extensões → tipos → tabelas → funções → RLS → triggers.
-- =====================================================================

create extension if not exists pgcrypto;

create schema if not exists app;
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------
-- TIPOS
-- ---------------------------------------------------------------------
create type tipo_usuario     as enum ('funcionario', 'contratante', 'interno');
create type status_generico  as enum ('ativo', 'inativo', 'arquivado');
create type status_alocacao  as enum ('ativa', 'afastado', 'ferias', 'encerrada');
create type status_documento as enum ('rascunho', 'publicado', 'arquivado');
create type escopo_documento as enum ('individual', 'coletivo');
create type categoria_doc    as enum ('geral', 'contratual', 'sst', 'pessoal', 'medico', 'bancario', 'folha');
create type tipo_ciencia     as enum ('confirmacao', 'divergencia');
create type tipo_solicitacao as enum ('ferias', 'afastamento', 'correcao_ponto', 'substituicao',
                                      'atualizacao_cadastral', 'ocorrencia', 'suporte', 'outro');
create type status_solicitacao as enum ('aberta', 'em_analise', 'pendente_solicitante',
                                        'aprovada', 'recusada', 'concluida', 'cancelada');

-- ---------------------------------------------------------------------
-- TENANT E ESTRUTURA COMERCIAL
-- ---------------------------------------------------------------------
create table organizacoes (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  cnpj        text not null unique,
  slug        text not null unique,
  status      status_generico not null default 'ativo',
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table organizacoes is 'Tenant: a empresa prestadora de serviços (ex.: 3e Gestão).';

create table contratantes (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references organizacoes(id) on delete cascade,
  nome      text not null,
  cnpj      text,
  status    status_generico not null default 'ativo',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (org_id, cnpj)
);

create table contratos (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizacoes(id) on delete cascade,
  contratante_id  uuid not null references contratantes(id) on delete restrict,
  numero          text not null,
  descricao       text,
  vigencia_inicio date,
  vigencia_fim    date,
  status          status_generico not null default 'ativo',
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (org_id, numero)
);

create table unidades (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizacoes(id) on delete cascade,
  contratante_id uuid not null references contratantes(id) on delete restrict,
  nome           text not null,
  endereco       text,
  cidade         text,
  uf             char(2),
  status         status_generico not null default 'ativo',
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create table contrato_unidades (
  contrato_id uuid not null references contratos(id) on delete cascade,
  unidade_id  uuid not null references unidades(id)  on delete cascade,
  primary key (contrato_id, unidade_id)
);

-- ---------------------------------------------------------------------
-- PESSOAS, USUÁRIOS E ALOCAÇÕES
-- ---------------------------------------------------------------------
create table pessoas (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizacoes(id) on delete cascade,
  nome            text not null,
  cpf             text not null,                 -- somente dígitos
  matricula       text,
  data_nascimento date,
  telefone        text,
  email_pessoal   text,
  endereco        text,
  foto_path       text,
  status          status_generico not null default 'ativo',
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (org_id, cpf)
);
comment on column pessoas.cpf is 'Somente dígitos. Contratante nunca vê o valor completo.';

create table usuarios (
  id            uuid primary key references auth.users(id) on delete cascade,
  org_id        uuid not null references organizacoes(id) on delete cascade,
  pessoa_id     uuid references pessoas(id) on delete set null,
  tipo          tipo_usuario not null,
  nome          text not null,
  email_login   text not null unique,
  telefone      text,
  precisa_trocar_senha boolean not null default true,
  ultimo_acesso timestamptz,
  status        status_generico not null default 'ativo',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint funcionario_tem_pessoa check (tipo <> 'funcionario' or pessoa_id is not null)
);
comment on column usuarios.email_login is
  'Funcionário: <cpf>@func.<slug>.portal3e — sintético, nunca recebe e-mail. Demais: e-mail real.';

create table alocacoes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizacoes(id) on delete cascade,
  pessoa_id   uuid not null references pessoas(id)   on delete cascade,
  contrato_id uuid not null references contratos(id) on delete restrict,
  unidade_id  uuid not null references unidades(id)  on delete restrict,
  funcao      text not null,
  data_inicio date not null,
  data_fim    date,
  status      status_alocacao not null default 'ativa',
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on alocacoes (pessoa_id, status);
create index on alocacoes (contrato_id, unidade_id, status);

-- ---------------------------------------------------------------------
-- PERFIS E ESCOPOS
-- ---------------------------------------------------------------------
create table perfis (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references organizacoes(id) on delete cascade,
  chave     text not null,          -- admin_geral, rh_dp, fiscal_contrato...
  nome      text not null,
  aplica_a  tipo_usuario not null,
  descricao text,
  criado_em timestamptz not null default now(),
  unique (org_id, chave)
);

create table perfil_permissoes (
  perfil_id uuid not null references perfis(id) on delete cascade,
  modulo    text not null check (modulo in ('pessoas','contratos','documentos','jornada',
                                            'solicitacoes','comunicacao','sst','relatorios','administracao')),
  acao      text not null check (acao in ('ver','criar','editar','excluir','exportar')),
  primary key (perfil_id, modulo, acao)
);

create table usuario_perfis (
  usuario_id uuid not null references usuarios(id) on delete cascade,
  perfil_id  uuid not null references perfis(id)   on delete cascade,
  primary key (usuario_id, perfil_id)
);

create table usuario_escopos (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references usuarios(id) on delete cascade,
  contrato_id uuid references contratos(id) on delete cascade,
  unidade_id  uuid references unidades(id)  on delete cascade,
  criado_em   timestamptz not null default now(),
  constraint escopo_nao_vazio check (contrato_id is not null or unidade_id is not null)
);
comment on table usuario_escopos is
  'Sem linhas + tipo interno = alcance total na organização. Contratante SEM linha não enxerga nada.';

-- ---------------------------------------------------------------------
-- DOCUMENTOS E CIÊNCIA
-- ---------------------------------------------------------------------
create table documento_tipos (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizacoes(id) on delete cascade,
  chave          text not null,
  nome           text not null,
  categoria      categoria_doc not null,
  exige_ciencia  boolean not null default false,
  exige_2fa      boolean not null default false,
  retencao_meses integer,
  criado_em      timestamptz not null default now(),
  unique (org_id, chave)
);

create table documentos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizacoes(id) on delete cascade,
  tipo_id       uuid not null references documento_tipos(id) on delete restrict,
  escopo        escopo_documento not null,
  pessoa_id     uuid references pessoas(id) on delete cascade,   -- obrigatório se individual
  titulo        text not null,
  descricao     text,
  competencia   date,                                            -- 1º dia do mês, para espelho
  versao        integer not null default 1,
  substitui_id  uuid references documentos(id) on delete set null,
  arquivo_path  text not null,
  arquivo_hash  text not null,                                   -- sha256 do conteúdo
  arquivo_bytes bigint,
  prazo_ciencia date,
  status        status_documento not null default 'rascunho',
  publicado_em  timestamptz,
  publicado_por uuid references usuarios(id),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint individual_tem_pessoa check (escopo <> 'individual' or pessoa_id is not null),
  constraint coletivo_sem_pessoa   check (escopo <> 'coletivo'   or pessoa_id is null)
);
create index on documentos (org_id, status, tipo_id);
create index on documentos (pessoa_id, competencia);

create table documento_destinatarios (
  id          uuid primary key default gen_random_uuid(),
  documento_id uuid not null references documentos(id) on delete cascade,
  contrato_id uuid references contratos(id) on delete cascade,
  unidade_id  uuid references unidades(id)  on delete cascade,
  funcao      text,
  constraint destinatario_nao_vazio check (contrato_id is not null or unidade_id is not null)
);
comment on table documento_destinatarios is 'Público-alvo de documento coletivo.';

create table ciencias (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizacoes(id) on delete cascade,
  documento_id  uuid not null references documentos(id) on delete restrict,
  documento_versao integer not null,
  documento_hash   text not null,
  pessoa_id     uuid not null references pessoas(id) on delete restrict,
  usuario_id    uuid not null references usuarios(id) on delete restrict,
  tipo          tipo_ciencia not null,
  justificativa text,
  protocolo     text not null unique,
  ip            inet,
  user_agent    text,
  respondido_em timestamptz not null default now(),
  constraint divergencia_tem_justificativa
    check (tipo <> 'divergencia' or coalesce(length(trim(justificativa)), 0) > 10),
  unique (documento_id, pessoa_id)
);
comment on table ciencias is 'IMUTÁVEL. Sem update, sem delete. Versão nova de documento = ciência nova.';

-- ---------------------------------------------------------------------
-- SOLICITAÇÕES
-- ---------------------------------------------------------------------
create table solicitacoes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizacoes(id) on delete cascade,
  protocolo     text not null unique,
  tipo          tipo_solicitacao not null,
  titulo        text not null,
  descricao     text,
  pessoa_id     uuid references pessoas(id)    on delete set null,
  contrato_id   uuid references contratos(id)  on delete set null,
  unidade_id    uuid references unidades(id)   on delete set null,
  documento_id  uuid references documentos(id) on delete set null,  -- contestação de espelho
  aberta_por    uuid not null references usuarios(id) on delete restrict,
  responsavel_id uuid references usuarios(id) on delete set null,
  status        status_solicitacao not null default 'aberta',
  prazo         date,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  concluida_em  timestamptz
);
create index on solicitacoes (org_id, status, tipo);
create index on solicitacoes (pessoa_id, criado_em desc);

create table solicitacao_eventos (
  id             uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references solicitacoes(id) on delete cascade,
  usuario_id     uuid not null references usuarios(id) on delete restrict,
  tipo           text not null check (tipo in ('comentario','mudanca_status','anexo','atribuicao')),
  conteudo       text,
  status_anterior status_solicitacao,
  status_novo    status_solicitacao,
  interno        boolean not null default false,   -- true = nota interna, invisível ao solicitante
  criado_em      timestamptz not null default now()
);

create table anexos (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizacoes(id) on delete cascade,
  solicitacao_id uuid references solicitacoes(id) on delete cascade,
  nome           text not null,
  arquivo_path   text not null,
  mime           text,
  bytes          bigint,
  enviado_por    uuid not null references usuarios(id) on delete restrict,
  criado_em      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- AUTENTICAÇÃO REFORÇADA, NOTIFICAÇÕES E AUDITORIA
-- ---------------------------------------------------------------------
create table codigos_verificacao (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references usuarios(id) on delete cascade,
  codigo_hash text not null,
  finalidade  text not null,
  tentativas  integer not null default 0,
  expira_em   timestamptz not null,
  usado_em    timestamptz,
  criado_em   timestamptz not null default now()
);
create index on codigos_verificacao (usuario_id, expira_em desc);

create table notificacoes (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizacoes(id) on delete cascade,
  usuario_id     uuid not null references usuarios(id) on delete cascade,
  canal          text not null check (canal in ('portal','email','whatsapp')),
  assunto        text not null,
  corpo          text,
  referencia_tipo text,
  referencia_id  uuid,
  lida_em        timestamptz,
  enviada_em     timestamptz,
  status         text not null default 'pendente' check (status in ('pendente','enviada','erro','lida')),
  criado_em      timestamptz not null default now()
);

create table auditoria (
  id          bigserial primary key,
  org_id      uuid,
  usuario_id  uuid,
  acao        text not null,          -- ver, download, criar, editar, excluir, publicar, login, exportar
  entidade    text not null,
  entidade_id uuid,
  detalhes    jsonb,
  ip          inet,
  user_agent  text,
  criado_em   timestamptz not null default now()
);
create index on auditoria (org_id, criado_em desc);
create index on auditoria (entidade, entidade_id);
comment on table auditoria is 'Append-only. Sem update e sem delete para ninguém além de rotina de expurgo.';

-- =====================================================================
-- FUNÇÕES DE PERMISSÃO
-- SECURITY DEFINER para evitar recursão de RLS. search_path travado.
-- =====================================================================
create or replace function app.org_id()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select u.org_id from usuarios u where u.id = auth.uid() and u.status = 'ativo'
$$;

create or replace function app.tipo()
returns tipo_usuario language sql stable security definer set search_path = public, pg_temp as $$
  select u.tipo from usuarios u where u.id = auth.uid() and u.status = 'ativo'
$$;

create or replace function app.pessoa_id()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select u.pessoa_id from usuarios u where u.id = auth.uid() and u.status = 'ativo'
$$;

create or replace function app.tem_permissao(p_modulo text, p_acao text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from usuario_perfis up
    join perfil_permissoes pp on pp.perfil_id = up.perfil_id
    where up.usuario_id = auth.uid()
      and pp.modulo = p_modulo
      and pp.acao   = p_acao
  )
$$;

create or replace function app.escopo_total()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select app.tipo() = 'interno'
     and not exists (select 1 from usuario_escopos e where e.usuario_id = auth.uid())
$$;

create or replace function app.contratos_permitidos()
returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select c.id from contratos c
  where c.org_id = app.org_id()
    and (
      app.escopo_total()
      or exists (
        select 1 from usuario_escopos e
        where e.usuario_id = auth.uid()
          and (e.contrato_id = c.id
               or (e.contrato_id is null and e.unidade_id in
                   (select cu.unidade_id from contrato_unidades cu where cu.contrato_id = c.id)))
      )
    )
$$;

create or replace function app.unidades_permitidas()
returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select u.id from unidades u
  where u.org_id = app.org_id()
    and (
      app.escopo_total()
      or exists (
        select 1 from usuario_escopos e
        where e.usuario_id = auth.uid()
          and (e.unidade_id = u.id
               or (e.unidade_id is null and e.contrato_id in
                   (select cu.contrato_id from contrato_unidades cu where cu.unidade_id = u.id)))
      )
    )
$$;

-- Pessoas que o usuário atual pode enxergar (interno com escopo, ou contratante).
create or replace function app.pessoas_no_escopo()
returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select distinct a.pessoa_id
  from alocacoes a
  where a.org_id = app.org_id()
    and a.contrato_id in (select app.contratos_permitidos())
    and a.unidade_id  in (select app.unidades_permitidas())
$$;

-- Categoria de documento que o usuário atual pode ver sobre TERCEIROS.
create or replace function app.categoria_permitida(p_categoria categoria_doc)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when app.tipo() = 'contratante' then p_categoria in ('geral','contratual','sst')
    when app.tipo() = 'interno' then
      case p_categoria
        when 'medico'   then app.tem_permissao('sst','ver')      or app.tem_permissao('administracao','ver')
        when 'bancario' then app.tem_permissao('administracao','ver') or app.tem_permissao('relatorios','exportar')
        when 'folha'    then app.tem_permissao('administracao','ver') or app.tem_permissao('relatorios','exportar')
        when 'pessoal'  then app.tem_permissao('pessoas','editar')
        else true
      end
    else false
  end
$$;

grant execute on all functions in schema app to authenticated;

-- =====================================================================
-- RLS
-- =====================================================================
alter table organizacoes           enable row level security;
alter table contratantes           enable row level security;
alter table contratos              enable row level security;
alter table unidades               enable row level security;
alter table contrato_unidades      enable row level security;
alter table pessoas                enable row level security;
alter table usuarios               enable row level security;
alter table alocacoes              enable row level security;
alter table perfis                 enable row level security;
alter table perfil_permissoes      enable row level security;
alter table usuario_perfis         enable row level security;
alter table usuario_escopos        enable row level security;
alter table documento_tipos        enable row level security;
alter table documentos             enable row level security;
alter table documento_destinatarios enable row level security;
alter table ciencias               enable row level security;
alter table solicitacoes           enable row level security;
alter table solicitacao_eventos    enable row level security;
alter table anexos                 enable row level security;
alter table codigos_verificacao    enable row level security;
alter table notificacoes           enable row level security;
alter table auditoria              enable row level security;

-- Organização: leitura da própria; escrita só por service_role.
create policy org_leitura on organizacoes for select to authenticated
  using (id = app.org_id());

-- Estrutura comercial
create policy contratantes_leitura on contratantes for select to authenticated
  using (org_id = app.org_id()
         and exists (select 1 from contratos c
                     where c.contratante_id = contratantes.id
                       and c.id in (select app.contratos_permitidos())));

create policy contratos_leitura on contratos for select to authenticated
  using (id in (select app.contratos_permitidos()));

create policy contratos_escrita on contratos for all to authenticated
  using (org_id = app.org_id() and app.tem_permissao('contratos','editar'))
  with check (org_id = app.org_id() and app.tem_permissao('contratos','editar'));

create policy unidades_leitura on unidades for select to authenticated
  using (id in (select app.unidades_permitidas()));

create policy unidades_escrita on unidades for all to authenticated
  using (org_id = app.org_id() and app.tem_permissao('contratos','editar'))
  with check (org_id = app.org_id() and app.tem_permissao('contratos','editar'));

create policy contrato_unidades_leitura on contrato_unidades for select to authenticated
  using (contrato_id in (select app.contratos_permitidos()));

-- Pessoas
create policy pessoas_leitura on pessoas for select to authenticated
  using (
    org_id = app.org_id()
    and (
      id = app.pessoa_id()                                              -- o próprio
      or (app.tipo() = 'interno'    and app.tem_permissao('pessoas','ver')
          and (app.escopo_total() or id in (select app.pessoas_no_escopo())))
      or (app.tipo() = 'contratante' and app.tem_permissao('pessoas','ver')
          and id in (select app.pessoas_no_escopo()))
    )
  );

create policy pessoas_escrita on pessoas for all to authenticated
  using (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('pessoas','editar'))
  with check (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('pessoas','editar'));

-- Usuários: cada um lê a si; admin lê todos da org.
create policy usuarios_leitura on usuarios for select to authenticated
  using (id = auth.uid()
         or (org_id = app.org_id() and app.tem_permissao('administracao','ver')));

create policy usuarios_escrita on usuarios for all to authenticated
  using (org_id = app.org_id() and app.tem_permissao('administracao','editar'))
  with check (org_id = app.org_id() and app.tem_permissao('administracao','editar'));

-- Alocações
create policy alocacoes_leitura on alocacoes for select to authenticated
  using (
    org_id = app.org_id()
    and (
      pessoa_id = app.pessoa_id()
      or (app.tem_permissao('pessoas','ver')
          and contrato_id in (select app.contratos_permitidos())
          and unidade_id  in (select app.unidades_permitidas()))
    )
  );

create policy alocacoes_escrita on alocacoes for all to authenticated
  using (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('pessoas','editar'))
  with check (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('pessoas','editar'));

-- Perfis e permissões: leitura para quem administra; o usuário lê os próprios vínculos.
create policy perfis_leitura on perfis for select to authenticated
  using (org_id = app.org_id());

create policy perfis_escrita on perfis for all to authenticated
  using (org_id = app.org_id() and app.tem_permissao('administracao','editar'))
  with check (org_id = app.org_id() and app.tem_permissao('administracao','editar'));

create policy perfil_permissoes_leitura on perfil_permissoes for select to authenticated
  using (exists (select 1 from perfis p where p.id = perfil_id and p.org_id = app.org_id()));

create policy perfil_permissoes_escrita on perfil_permissoes for all to authenticated
  using (app.tem_permissao('administracao','editar')
         and exists (select 1 from perfis p where p.id = perfil_id and p.org_id = app.org_id()))
  with check (app.tem_permissao('administracao','editar')
         and exists (select 1 from perfis p where p.id = perfil_id and p.org_id = app.org_id()));

create policy usuario_perfis_leitura on usuario_perfis for select to authenticated
  using (usuario_id = auth.uid() or app.tem_permissao('administracao','ver'));

create policy usuario_perfis_escrita on usuario_perfis for all to authenticated
  using (app.tem_permissao('administracao','editar'))
  with check (app.tem_permissao('administracao','editar'));

create policy usuario_escopos_leitura on usuario_escopos for select to authenticated
  using (usuario_id = auth.uid() or app.tem_permissao('administracao','ver'));

create policy usuario_escopos_escrita on usuario_escopos for all to authenticated
  using (app.tem_permissao('administracao','editar'))
  with check (app.tem_permissao('administracao','editar'));

-- Documentos
create policy documento_tipos_leitura on documento_tipos for select to authenticated
  using (org_id = app.org_id());

create policy documento_tipos_escrita on documento_tipos for all to authenticated
  using (org_id = app.org_id() and app.tem_permissao('administracao','editar'))
  with check (org_id = app.org_id() and app.tem_permissao('administracao','editar'));

create policy documentos_leitura on documentos for select to authenticated
  using (
    org_id = app.org_id()
    and status = 'publicado'
    and (
      -- 1. o titular sempre vê o próprio documento, qualquer categoria
      (escopo = 'individual' and pessoa_id = app.pessoa_id())
      -- 2. coletivo direcionado ao contrato/unidade do funcionário
      or (escopo = 'coletivo' and app.tipo() = 'funcionario' and exists (
            select 1 from documento_destinatarios d
            join alocacoes a on a.pessoa_id = app.pessoa_id() and a.status <> 'encerrada'
            where d.documento_id = documentos.id
              and (d.contrato_id is null or d.contrato_id = a.contrato_id)
              and (d.unidade_id  is null or d.unidade_id  = a.unidade_id)
              and (d.funcao      is null or d.funcao      = a.funcao)))
      -- 3. terceiros: precisa de permissão, escopo e categoria liberada
      or (app.tipo() <> 'funcionario'
          and app.tem_permissao('documentos','ver')
          and app.categoria_permitida((select t.categoria from documento_tipos t where t.id = tipo_id))
          and (
            escopo = 'coletivo'
            or app.escopo_total()
            or pessoa_id in (select app.pessoas_no_escopo())
          ))
    )
  );

create policy documentos_escrita on documentos for all to authenticated
  using (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('documentos','editar'))
  with check (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('documentos','editar'));

create policy destinatarios_leitura on documento_destinatarios for select to authenticated
  using (exists (select 1 from documentos d where d.id = documento_id and d.org_id = app.org_id()));

create policy destinatarios_escrita on documento_destinatarios for all to authenticated
  using (app.tem_permissao('documentos','editar'))
  with check (app.tem_permissao('documentos','editar'));

-- Ciências: insert do próprio titular; leitura do titular e de quem tem permissão.
create policy ciencias_leitura on ciencias for select to authenticated
  using (
    org_id = app.org_id()
    and (pessoa_id = app.pessoa_id()
         or (app.tem_permissao('documentos','ver')
             and (app.escopo_total() or pessoa_id in (select app.pessoas_no_escopo()))))
  );

create policy ciencias_insert on ciencias for insert to authenticated
  with check (
    org_id = app.org_id()
    and usuario_id = auth.uid()
    and pessoa_id = app.pessoa_id()
    and exists (select 1 from documentos d where d.id = documento_id and d.status = 'publicado')
  );
-- Sem policy de update/delete: ciência é imutável.

-- Solicitações
create policy solicitacoes_leitura on solicitacoes for select to authenticated
  using (
    org_id = app.org_id()
    and (
      pessoa_id = app.pessoa_id()
      or aberta_por = auth.uid()
      or (app.tem_permissao('solicitacoes','ver')
          and (app.escopo_total()
               or contrato_id in (select app.contratos_permitidos())
               or pessoa_id  in (select app.pessoas_no_escopo())))
    )
  );

create policy solicitacoes_insert on solicitacoes for insert to authenticated
  with check (
    org_id = app.org_id()
    and aberta_por = auth.uid()
    and (
      (app.tipo() = 'funcionario' and pessoa_id = app.pessoa_id())
      or app.tem_permissao('solicitacoes','criar')
    )
  );

create policy solicitacoes_update on solicitacoes for update to authenticated
  using (org_id = app.org_id() and app.tem_permissao('solicitacoes','editar')
         and (app.escopo_total() or contrato_id in (select app.contratos_permitidos())))
  with check (org_id = app.org_id() and app.tem_permissao('solicitacoes','editar'));

create policy eventos_leitura on solicitacao_eventos for select to authenticated
  using (
    exists (select 1 from solicitacoes s where s.id = solicitacao_id)
    and (interno = false or app.tipo() = 'interno')
  );

create policy eventos_insert on solicitacao_eventos for insert to authenticated
  with check (usuario_id = auth.uid()
              and exists (select 1 from solicitacoes s where s.id = solicitacao_id));

create policy anexos_leitura on anexos for select to authenticated
  using (org_id = app.org_id()
         and exists (select 1 from solicitacoes s where s.id = solicitacao_id));

create policy anexos_insert on anexos for insert to authenticated
  with check (org_id = app.org_id() and enviado_por = auth.uid());

-- Códigos de verificação: só o dono, e nunca o hash por SELECT amplo.
create policy codigos_proprios on codigos_verificacao for select to authenticated
  using (usuario_id = auth.uid());

-- Notificações
create policy notificacoes_proprias on notificacoes for select to authenticated
  using (usuario_id = auth.uid());

create policy notificacoes_update on notificacoes for update to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- Auditoria: leitura só para perfil de auditoria/admin. Escrita só pelo servidor.
create policy auditoria_leitura on auditoria for select to authenticated
  using (org_id = app.org_id() and app.tem_permissao('administracao','ver'));

-- =====================================================================
-- TRIGGERS
-- =====================================================================
create or replace function app.set_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['organizacoes','contratantes','contratos','unidades','pessoas',
                           'usuarios','alocacoes','documentos','solicitacoes']
  loop
    execute format(
      'create trigger trg_%s_atualizado before update on %I
       for each row execute function app.set_atualizado_em()', t, t);
  end loop;
end $$;

-- Protocolo sequencial legível: 2026-000123
create sequence protocolo_seq;

create or replace function app.gerar_protocolo()
returns text language sql volatile security definer set search_path = public, pg_temp as $$
  select to_char(now(), 'YYYY') || '-' || lpad(nextval('protocolo_seq')::text, 6, '0')
$$;

alter table solicitacoes alter column protocolo set default app.gerar_protocolo();
alter table ciencias     alter column protocolo set default app.gerar_protocolo();

-- Registra automaticamente toda mudança de status de solicitação na linha do tempo.
create or replace function app.log_status_solicitacao()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status is distinct from old.status then
    insert into solicitacao_eventos (solicitacao_id, usuario_id, tipo, status_anterior, status_novo)
    values (new.id, coalesce(auth.uid(), new.aberta_por), 'mudanca_status', old.status, new.status);
  end if;
  return new;
end $$;

create trigger trg_solicitacao_status
  after update on solicitacoes
  for each row execute function app.log_status_solicitacao();

-- =====================================================================
-- GRANTS FINAIS
-- Repetido no fim porque "all functions" só alcança o que já existe.
-- gerar_protocolo() é usada como DEFAULT de coluna: sem EXECUTE, o insert falha.
-- =====================================================================
grant execute on all functions in schema app to authenticated;
grant usage, select on sequence protocolo_seq to authenticated;
