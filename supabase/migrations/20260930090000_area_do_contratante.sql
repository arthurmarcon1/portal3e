-- =====================================================================
-- 0023 — Área do contratante: o que ele lê de uma pessoa (F5.1)
--
-- Achado antes de codar a F5.1, lendo a policy no banco de dev: RLS
-- filtra LINHA, não COLUNA. `pessoas_leitura` dava ao contratante com
-- `pessoas:ver` a linha inteira de toda pessoa alocada no escopo — e a linha
-- tem `cpf` completo, `data_nascimento`, `telefone`, `email_pessoal` e
-- `endereco`, os cinco campos que docs/02 bloqueia para contratante "independente
-- do perfil". A própria suíte provava a linha visível (tests/rls/pessoas:
-- "fiscal lista só as pessoas alocadas no 042"), e o PostgREST devolve a
-- coluna que se pedir da linha visível. A tela nunca mostrou — mas bloqueio
-- que depende de a tela não pedir não é bloqueio.
--
-- Mesma família (docs/06, "Riscos"): a leitura do contratante foi herdada da
-- do interno em vez de desenhada para ele. Aqui ela é desenhada:
--
-- 1. **Contratante não lê `pessoas` nem `ciencias` direto.** O que ele vê de
--    uma pessoa sai de `public.quadro_do_contratante()`, que devolve só a lista
--    permitida de docs/02 (nome, matrícula, CPF só com os 3 últimos dígitos —
--    cortados AQUI, o completo nunca sai do banco —, função, contrato,
--    unidade, situação, início). A pendência de ciência sai agregada de
--    `public.pendencias_de_ciencia_do_contratante()`. `ciencias` tem IP,
--    user agent e a justificativa da divergência: nada disso está na lista.
-- 2. **Só alocação vigente.** docs/02: "qualquer pessoa sem alocação ativa no
--    contrato/unidade do escopo" é bloqueio absoluto. `app.pessoas_no_escopo()`
--    contava alocação encerrada — o contratante via quem já saiu, e os
--    documentos dele. Para contratante, agora só alocação não encerrada e
--    dentro da vigência. Para interno não muda: o RH com escopo no 042 segue
--    lendo o histórico de quem passou pelo 042.
-- 3. **Guarda estrutural, falha fechada.** `auditoria`, `usuarios`,
--    `usuario_perfis` e `usuario_escopos` liberavam leitura a quem tivesse
--    `administracao:ver`, de qualquer tipo. Nenhum perfil de contratante tem —
--    mas permissão é dado, e um insert em `perfil_permissoes` abriria a trilha
--    inteira e o `email_login` do funcionário, que é `<cpf>@func…`. Agora o
--    ramo de `administracao:ver` exige `app.tipo() = 'interno'`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 2. Escopo de pessoas: contratante só enxerga alocação vigente
-- ---------------------------------------------------------------------
create or replace function app.alocacao_vigente(p_status status_alocacao, p_data_fim date)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select p_status <> 'encerrada' and (p_data_fim is null or p_data_fim >= app.hoje())
$$;

comment on function app.alocacao_vigente(status_alocacao, date) is
  'Alocação ativa, afastada ou em férias, e dentro da vigência. É o recorte do contratante (docs/02).';

grant execute on function app.alocacao_vigente(status_alocacao, date) to authenticated;

create or replace function app.pessoas_no_escopo()
returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select distinct a.pessoa_id
  from alocacoes a
  where a.org_id = app.org_id()
    and a.contrato_id in (select app.contratos_permitidos())
    and a.unidade_id  in (select app.unidades_permitidas())
    and (app.tipo() is distinct from 'contratante' or app.alocacao_vigente(a.status, a.data_fim))
$$;

-- ---------------------------------------------------------------------
-- 1. `pessoas` e `ciencias`: sem o ramo do contratante
-- ---------------------------------------------------------------------
drop policy pessoas_leitura on pessoas;

create policy pessoas_leitura on pessoas for select to authenticated
  using (
    org_id = app.org_id()
    and (
      id = app.pessoa_id()                                              -- o próprio
      or (app.tipo() = 'interno'    and app.tem_permissao('pessoas','ver')
          and (app.escopo_total() or id in (select app.pessoas_no_escopo())))
      -- Ainda não alocada: ver 0009.
      or (app.tipo() = 'interno'    and app.tem_permissao('pessoas','editar')
          and app.pessoa_sem_alocacao(id))
      -- Contratante: nenhum ramo. Ele lê pessoa por quadro_do_contratante().
    )
  );

drop policy ciencias_leitura on ciencias;

create policy ciencias_leitura on ciencias for select to authenticated
  using (
    org_id = app.org_id()
    and (
      pessoa_id = app.pessoa_id()
      or (app.tipo() = 'interno'
          and app.tem_permissao('documentos', 'ver')
          and (app.escopo_total() or pessoa_id in (select app.pessoas_no_escopo()))
          and app.categoria_permitida(app.categoria_do_documento(documento_id)))
    )
  );

-- Alocação: o contratante lê só a vigente (função, unidade, situação, início).
drop policy alocacoes_leitura on alocacoes;

create policy alocacoes_leitura on alocacoes for select to authenticated
  using (
    org_id = app.org_id()
    and (
      pessoa_id = app.pessoa_id()
      or (app.tipo() = 'interno'
          and app.tem_permissao('pessoas', 'ver')
          and contrato_id in (select app.contratos_permitidos())
          and unidade_id  in (select app.unidades_permitidas()))
      or (app.tipo() = 'contratante'
          and app.tem_permissao('pessoas', 'ver')
          and contrato_id in (select app.contratos_permitidos())
          and unidade_id  in (select app.unidades_permitidas())
          and app.alocacao_vigente(status, data_fim))
    )
  );

-- ---------------------------------------------------------------------
-- 3. `administracao:ver` só abre leitura a interno
-- ---------------------------------------------------------------------
drop policy auditoria_leitura on auditoria;
create policy auditoria_leitura on auditoria for select to authenticated
  using (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('administracao', 'ver'));

drop policy usuarios_leitura on usuarios;
create policy usuarios_leitura on usuarios for select to authenticated
  using (
    id = auth.uid()
    or (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('administracao', 'ver'))
  );

drop policy usuario_perfis_leitura on usuario_perfis;
create policy usuario_perfis_leitura on usuario_perfis for select to authenticated
  using (usuario_id = auth.uid() or (app.tipo() = 'interno' and app.tem_permissao('administracao', 'ver')));

drop policy usuario_escopos_leitura on usuario_escopos;
create policy usuario_escopos_leitura on usuario_escopos for select to authenticated
  using (usuario_id = auth.uid() or (app.tipo() = 'interno' and app.tem_permissao('administracao', 'ver')));

-- ---------------------------------------------------------------------
-- O que o contratante lê de uma pessoa
-- ---------------------------------------------------------------------
create or replace function public.quadro_do_contratante()
returns table (
  pessoa_id uuid,
  nome text,
  matricula text,
  cpf_final text,
  funcao text,
  contrato_id uuid,
  contrato_numero text,
  unidade_id uuid,
  unidade_nome text,
  situacao status_alocacao,
  data_inicio date
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.nome, p.matricula,
         right(p.cpf, 3),              -- docs/02: só os 3 últimos; o resto não sai daqui
         a.funcao, a.contrato_id, c.numero, a.unidade_id, u.nome, a.status, a.data_inicio
    from alocacoes a
    join pessoas p   on p.id = a.pessoa_id and p.org_id = a.org_id
    join contratos c on c.id = a.contrato_id
    join unidades u  on u.id = a.unidade_id
   where app.tipo() = 'contratante'
     and app.tem_permissao('pessoas', 'ver')
     and a.org_id = app.org_id()
     and a.contrato_id in (select app.contratos_permitidos())
     and a.unidade_id  in (select app.unidades_permitidas())
     and app.alocacao_vigente(a.status, a.data_fim)
     and p.status = 'ativo'
   order by p.nome, c.numero, u.nome
$$;

comment on function public.quadro_do_contratante() is
  'F5.1: pessoas com alocação vigente no escopo do contratante, só com os campos de docs/02. Vazio para quem não é contratante com pessoas:ver.';

revoke all on function public.quadro_do_contratante() from public, anon;
grant execute on function public.quadro_do_contratante() to authenticated;

-- Pendência de ciência, agregada por documento. Só categoria que o
-- contratante pode ver (geral, contratual, sst): espelho (`jornada`) fica de
-- fora — nem a contagem de quem confirmou o espelho chega a ele, enquanto a
-- decisão do gestor sobre espelho individual não vier (docs/06).
create or replace function public.pendencias_de_ciencia_do_contratante()
returns table (
  documento_id uuid,
  titulo text,
  tipo_nome text,
  prazo_ciencia date,
  publicado_em timestamptz,
  alcancados integer,
  respondidos integer,
  pendentes integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with quadro as (
    select distinct q.pessoa_id from public.quadro_do_contratante() q
  ),
  alvo as (
    select d.id, d.titulo, t.nome as tipo_nome, d.prazo_ciencia, d.publicado_em, al.pessoa_id,
           exists (select 1 from ciencias c where c.documento_id = d.id and c.pessoa_id = al.pessoa_id) as respondeu
      from documentos d
      join documento_tipos t on t.id = d.tipo_id and t.exige_ciencia
      cross join lateral app.pessoas_alcancadas(d.id) al
      join quadro q on q.pessoa_id = al.pessoa_id
     where app.tipo() = 'contratante'
       and app.tem_permissao('documentos', 'ver')
       and d.org_id = app.org_id()
       and d.status = 'publicado'
       and app.categoria_permitida(t.categoria)
  )
  select id, titulo, tipo_nome, prazo_ciencia, publicado_em,
         count(*)::integer,
         count(*) filter (where respondeu)::integer,
         count(*) filter (where not respondeu)::integer
    from alvo
   group by id, titulo, tipo_nome, prazo_ciencia, publicado_em
  having count(*) filter (where not respondeu) > 0
   order by prazo_ciencia nulls last, publicado_em
$$;

comment on function public.pendencias_de_ciencia_do_contratante() is
  'F5.1: por documento publicado com ciência, quantas pessoas do quadro do contratante ainda não responderam. Só categorias abertas ao contratante; sem nomes.';

revoke all on function public.pendencias_de_ciencia_do_contratante() from public, anon;
grant execute on function public.pendencias_de_ciencia_do_contratante() to authenticated;
