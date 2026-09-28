-- =====================================================================
-- 0020 — Solicitações: SLA, fluxo de status e linha do tempo à prova de
--        falsificação (F4.2)
--
-- A. SLA por tipo em tabela (`sla_solicitacoes`), por organização. Decisão
--    PROVISÓRIA do Arthur, 2026-09-29 (docs/06): valores em dias úteis. Muda
--    por `update`, sem código, quando o gestor decidir.
--
-- B. Prazo calculado pelo banco na abertura: hoje (Brasília) + N dias úteis
--    (`app.somar_dias_uteis`, pula sábado e domingo; feriado ainda não —
--    docs/06). Quem abre não escolhe o próprio prazo, e toda solicitação
--    nasce `aberta` e sem responsável. Vale também para a solicitação que a
--    divergência abre (0018): agora que há SLA, ela nasce com prazo.
--
-- C. Quem abre o quê (`solicitacoes_insert`). A policy da 0001 aceitava
--    qualquer tipo, contrato e pessoa de quem tivesse `solicitacoes:criar`:
--    - funcionário: só para si, e só férias, afastamento, correção de ponto,
--      atualização cadastral e suporte (docs/05, F4.2). Sem contrato — o
--      pedido é dele com a 3e; se levasse o contrato, o contratante do escopo
--      passaria a ler o pedido de férias ou a correção de ponto da pessoa;
--    - contratante: só ocorrência e substituição, e só em contrato (e
--      unidade, e pessoa, se informadas) do escopo dele;
--    - interno: qualquer tipo, com `solicitacoes:criar`.
--
-- D. Quem muda (`solicitacoes_update`): só interno com `solicitacoes:editar`
--    e a solicitação no escopo — por contrato OU pela pessoa (a da 0001 só
--    olhava contrato, e pedido de funcionário não tem contrato). Contratante
--    e funcionário não mudam status nem responsável: respondem por
--    `public.responder_solicitacao`.
--    Transições válidas e colunas imutáveis conferidas por trigger. O evento
--    de mudança de status continua sendo gravado SÓ pelo trigger da 0001
--    (`trg_solicitacao_status`) — nada aqui o duplica.
--
-- E. Linha do tempo à prova de falsificação. `eventos_insert` (0001) deixava
--    qualquer um que enxergasse a solicitação inserir QUALQUER evento — um
--    funcionário podia gravar um `mudanca_status` falso, ou uma "nota
--    interna". Agora: insert direto só de interno com `solicitacoes:editar`,
--    e só `comentario`; `mudanca_status` e `atribuicao` só por trigger; o
--    solicitante escreve pela função de resposta. UPDATE e DELETE revogados
--    — a linha do tempo é imutável (docs/01), e falha com 42501.
--
-- F. Nomes para a tela sem abrir `usuarios` (que só `administracao:ver`
--    lê): responsáveis possíveis e autores da linha do tempo, por funções que
--    devolvem id e nome e nada mais, e só a quem enxerga a solicitação.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. SLA
-- ---------------------------------------------------------------------
create table sla_solicitacoes (
  org_id     uuid not null references organizacoes(id) on delete cascade,
  tipo       tipo_solicitacao not null,
  dias_uteis integer not null check (dias_uteis > 0),
  atualizado_em timestamptz not null default now(),
  primary key (org_id, tipo)
);

comment on table sla_solicitacoes is
  'Prazo de resposta por tipo de solicitação, em dias úteis. Provisório (docs/06).';

alter table sla_solicitacoes enable row level security;

create policy sla_leitura on sla_solicitacoes for select to authenticated
  using (org_id = app.org_id());

create policy sla_insercao on sla_solicitacoes for insert to authenticated
  with check (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('administracao', 'editar'));

create policy sla_atualizacao on sla_solicitacoes for update to authenticated
  using (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('administracao', 'editar'))
  with check (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('administracao', 'editar'));

create trigger trg_sla_atualizado
  before update on sla_solicitacoes
  for each row execute function app.set_atualizado_em();

-- ---------------------------------------------------------------------
-- B. Prazo e estado inicial
-- ---------------------------------------------------------------------
create or replace function app.somar_dias_uteis(p_inicio date, p_dias integer)
returns date
language plpgsql
immutable
as $$
declare
  d date := p_inicio;
  faltam integer := p_dias;
begin
  while faltam > 0 loop
    d := d + 1;
    -- isodow: 6 = sábado, 7 = domingo. Feriado: pendente (docs/06).
    if extract(isodow from d) < 6 then
      faltam := faltam - 1;
    end if;
  end loop;
  return d;
end $$;

comment on function app.somar_dias_uteis(date, integer) is
  'Data + N dias úteis (segunda a sexta). Feriados ainda não entram — docs/06.';

create or replace function app.solicitacao_ao_inserir()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  dias integer;
begin
  -- Toda solicitação nasce igual, venha de onde vier (tela, divergência).
  new.status := 'aberta';
  new.responsavel_id := null;
  new.concluida_em := null;

  select s.dias_uteis into dias
    from sla_solicitacoes s
   where s.org_id = new.org_id and s.tipo = new.tipo;

  new.prazo := case when dias is null then null else app.somar_dias_uteis(app.hoje(), dias) end;
  return new;
end $$;

-- DEFINER só para ler o SLA sem depender da policy de quem abre.
create trigger trg_solicitacao_ao_inserir
  before insert on solicitacoes
  for each row execute function app.solicitacao_ao_inserir();

-- ---------------------------------------------------------------------
-- C. Quem abre o quê
-- ---------------------------------------------------------------------
drop policy solicitacoes_insert on solicitacoes;

create policy solicitacoes_insert on solicitacoes for insert to authenticated
  with check (
    org_id = app.org_id()
    and aberta_por = auth.uid()
    and (
      (app.tipo() = 'funcionario'
       and pessoa_id = app.pessoa_id()
       and tipo in ('ferias', 'afastamento', 'correcao_ponto', 'atualizacao_cadastral', 'suporte')
       and contrato_id is null and unidade_id is null and documento_id is null)
      or (app.tipo() = 'contratante'
          and app.tem_permissao('solicitacoes', 'criar')
          and tipo in ('ocorrencia', 'substituicao')
          and contrato_id in (select app.contratos_permitidos())
          and (unidade_id is null or unidade_id in (select app.unidades_permitidas()))
          and (pessoa_id is null or pessoa_id in (select app.pessoas_no_escopo()))
          and documento_id is null)
      or (app.tipo() = 'interno' and app.tem_permissao('solicitacoes', 'criar'))
    )
  );

-- ---------------------------------------------------------------------
-- D. Quem muda, e como
-- ---------------------------------------------------------------------
drop policy solicitacoes_update on solicitacoes;

create policy solicitacoes_update on solicitacoes for update to authenticated
  using (
    org_id = app.org_id()
    and app.tipo() = 'interno'
    and app.tem_permissao('solicitacoes', 'editar')
    and (app.escopo_total()
         or contrato_id in (select app.contratos_permitidos())
         or pessoa_id in (select app.pessoas_no_escopo()))
  )
  with check (
    org_id = app.org_id()
    and app.tipo() = 'interno'
    and app.tem_permissao('solicitacoes', 'editar')
  );

-- A mesma tabela a tela usa para oferecer só o que pode (src/features/solicitacoes/fluxo.ts).
create or replace function app.transicao_valida(p_de status_solicitacao, p_para status_solicitacao)
returns boolean
language sql
immutable
as $$
  select case p_de
    when 'aberta'               then p_para in ('em_analise', 'pendente_solicitante', 'aprovada', 'recusada', 'concluida', 'cancelada')
    when 'em_analise'           then p_para in ('pendente_solicitante', 'aprovada', 'recusada', 'concluida', 'cancelada')
    when 'pendente_solicitante' then p_para in ('em_analise', 'cancelada')
    when 'aprovada'             then p_para in ('concluida')
    when 'recusada'             then p_para in ('concluida')
    else false  -- concluida e cancelada são finais
  end
$$;

create or replace function app.solicitacao_ao_atualizar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not app.sujeito_as_travas() then
    return new;
  end if;

  if new.org_id <> old.org_id or new.protocolo <> old.protocolo or new.tipo <> old.tipo
     or new.aberta_por <> old.aberta_por or new.pessoa_id is distinct from old.pessoa_id
     or new.documento_id is distinct from old.documento_id or new.criado_em <> old.criado_em then
    raise exception 'Tipo, solicitante, pessoa e documento de uma solicitação não mudam.'
      using errcode = '55000';
  end if;

  if new.status <> old.status then
    if not app.transicao_valida(old.status, new.status) then
      raise exception 'Não é possível mudar a situação de "%" para "%".', old.status, new.status
        using errcode = '55000';
    end if;
    new.concluida_em := case when new.status in ('concluida', 'cancelada') then now() end;
  elsif old.status in ('concluida', 'cancelada') then
    raise exception 'Solicitação encerrada não muda mais.' using errcode = '55000';
  end if;

  if new.responsavel_id is distinct from old.responsavel_id and new.responsavel_id is not null
     and not exists (
       select 1 from usuarios u
        where u.id = new.responsavel_id and u.org_id = new.org_id
          and u.tipo = 'interno' and u.status = 'ativo'
     ) then
    raise exception 'O responsável precisa ser alguém ativo da equipe interna.' using errcode = '55000';
  end if;

  return new;
end $$;

create trigger trg_solicitacao_ao_atualizar
  before update on solicitacoes
  for each row execute function app.solicitacao_ao_atualizar();

-- Atribuição vira evento da linha do tempo, como a mudança de status.
create or replace function app.log_atribuicao_solicitacao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.responsavel_id is distinct from old.responsavel_id then
    insert into solicitacao_eventos (solicitacao_id, usuario_id, tipo, conteudo, interno)
    values (new.id, coalesce(auth.uid(), new.aberta_por), 'atribuicao',
            coalesce((select u.nome from usuarios u where u.id = new.responsavel_id), 'sem responsável'),
            false);
  end if;
  return null;
end $$;

create trigger trg_solicitacao_atribuicao
  after update on solicitacoes
  for each row execute function app.log_atribuicao_solicitacao();

-- ---------------------------------------------------------------------
-- E. Linha do tempo
-- ---------------------------------------------------------------------
drop policy eventos_insert on solicitacao_eventos;

create policy eventos_insert on solicitacao_eventos for insert to authenticated
  with check (
    usuario_id = auth.uid()
    and tipo = 'comentario'
    and status_anterior is null and status_novo is null
    and app.tipo() = 'interno'
    and app.tem_permissao('solicitacoes', 'editar')
    and exists (select 1 from solicitacoes s where s.id = solicitacao_id)
  );

revoke update, delete on solicitacao_eventos from anon, authenticated;

-- O solicitante responde: comentário + volta para análise, numa transação.
-- DEFINER porque ele não tem update na solicitação nem insert na linha do
-- tempo; a função confere sozinha que é ele e que está pendente com ele.
create or replace function public.responder_solicitacao(p_solicitacao uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  sol record;
  texto text := nullif(trim(coalesce(p_texto, '')), '');
begin
  select s.id, s.status, s.aberta_por, s.org_id into sol
    from solicitacoes s
   where s.id = p_solicitacao and s.org_id = app.org_id()
     and s.aberta_por = auth.uid();

  if not found then
    raise exception 'Solicitação não encontrada.' using errcode = '55000';
  end if;
  if sol.status <> 'pendente_solicitante' then
    raise exception 'Esta solicitação não está esperando resposta sua.' using errcode = '55000';
  end if;
  if coalesce(length(texto), 0) < 5 then
    raise exception 'Escreva a sua resposta.' using errcode = '55000';
  end if;

  insert into solicitacao_eventos (solicitacao_id, usuario_id, tipo, conteudo, interno)
  values (sol.id, auth.uid(), 'comentario', left(texto, 4000), false);

  -- O trigger da 0001 grava o evento da mudança de status.
  update solicitacoes set status = 'em_analise' where id = sol.id;
end $$;

revoke all on function public.responder_solicitacao(uuid, text) from public, anon;
grant execute on function public.responder_solicitacao(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- F. Nomes para a tela
-- ---------------------------------------------------------------------
create or replace function public.responsaveis_possiveis()
returns table (id uuid, nome text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id, u.nome
    from usuarios u
   where u.org_id = app.org_id()
     and u.tipo = 'interno'
     and u.status = 'ativo'
     and app.tipo() = 'interno'
     and app.tem_permissao('solicitacoes', 'editar')
     and exists (
       select 1 from usuario_perfis up
         join perfil_permissoes pp on pp.perfil_id = up.perfil_id
        where up.usuario_id = u.id and pp.modulo = 'solicitacoes' and pp.acao = 'editar'
     )
   order by u.nome
$$;

-- Parte DEFINER: nomes dos autores da linha do tempo e do responsável.
create or replace function app.pessoas_da_solicitacao(p_solicitacao uuid)
returns table (id uuid, nome text, tipo tipo_usuario)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id, u.nome, u.tipo
    from usuarios u
   where u.id in (
     select e.usuario_id from solicitacao_eventos e where e.solicitacao_id = p_solicitacao
     union
     select s.aberta_por from solicitacoes s where s.id = p_solicitacao
     union
     select s.responsavel_id from solicitacoes s where s.id = p_solicitacao
   )
$$;

-- Parte INVOKER: a porta — só responde sobre solicitação que a RLS mostra.
create or replace function public.pessoas_da_solicitacao(p_solicitacao uuid)
returns table (id uuid, nome text, tipo tipo_usuario)
language sql
stable
set search_path = public, pg_temp
as $$
  select p.* from app.pessoas_da_solicitacao(p_solicitacao) p
   where exists (select 1 from solicitacoes s where s.id = p_solicitacao)
$$;

revoke all on function public.responsaveis_possiveis() from public, anon;
revoke all on function public.pessoas_da_solicitacao(uuid) from public, anon;
grant execute on function public.responsaveis_possiveis() to authenticated;
grant execute on function public.pessoas_da_solicitacao(uuid) to authenticated;
grant execute on function app.pessoas_da_solicitacao(uuid) to authenticated;
grant execute on function app.transicao_valida(status_solicitacao, status_solicitacao) to authenticated;
grant execute on function app.somar_dias_uteis(date, integer) to authenticated;
