-- =====================================================================
-- 0010 — Documentos voltam a ser legíveis: recursão e rascunho
--
-- Dois defeitos, encontrados ao testar a criação do primeiro documento.
--
-- ---------------------------------------------------------------------
-- A. Recursão infinita entre `documentos` e `documento_destinatarios`
--
-- `documentos_leitura` lê `documento_destinatarios` (para saber se o
-- coletivo alcança o funcionário) e `destinatarios_leitura` lê `documentos`
-- (para conferir a organização). Subconsulta em policy roda sob a RLS da
-- tabela consultada, então uma chama a outra sem fim: qualquer SELECT em
-- `documentos` devolve 42P17 para TODAS as personas — funcionário, interno e
-- contratante. A tabela estava simplesmente ilegível.
--
-- Não apareceu antes porque nenhum documento tinha sido criado ainda: o
-- planejador só precisa avaliar a policy quando há linha para avaliar. Isto
-- vem da 0001 e teria parado a F3.1 no primeiro upload.
--
-- A correção é a mesma da 0007/0009: a pergunta que cruza tabela vira função
-- SECURITY DEFINER. Assim a policy pergunta sem disparar outra policy.
--
-- ---------------------------------------------------------------------
-- B. Rascunho ficou invisível para todos (regressão da 0008)
--
-- `documentos_leitura` exige `status = 'publicado'`. Quem dava acesso a
-- rascunho era, sem que ninguém percebesse, o `USING` da `documentos_escrita`
-- em `for all` — a mesma concessão de leitura acidental que a 0008 removeu.
-- Removida ela, rascunho não é lido por ninguém, e como `INSERT ... RETURNING`
-- passa pela policy de SELECT, **criar rascunho falha com 42501**. É a mesma
-- classe de bug que a 0009 consertou em `pessoas`.
--
-- A policy nova devolve rascunho a quem edita documento, com os MESMOS
-- filtros de sensibilidade da `documentos_leitura`: interno, permissão de
-- editar, `app.categoria_permitida()` e escopo. O bypass de categoria que a
-- 0008 fechou **não** volta: quem não pode ver `medico` publicado também não
-- pode ver `medico` em rascunho. Rascunho não é categoria mais frouxa — é
-- documento que ainda não foi publicado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Funções que quebram o ciclo
-- ---------------------------------------------------------------------

create or replace function app.documento_alcanca_pessoa(p_documento uuid, p_pessoa uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from documento_destinatarios d
    join alocacoes a on a.pessoa_id = p_pessoa and a.status <> 'encerrada'
    where d.documento_id = p_documento
      and (d.contrato_id is null or d.contrato_id = a.contrato_id)
      and (d.unidade_id  is null or d.unidade_id  = a.unidade_id)
      and (d.funcao      is null or d.funcao      = a.funcao)
  )
$$;

comment on function app.documento_alcanca_pessoa(uuid, uuid) is
  'O documento coletivo atinge a alocação vigente desta pessoa. DEFINER: evita a recursão documentos <-> documento_destinatarios.';

create or replace function app.documento_da_org(p_documento uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from documentos d
    where d.id = p_documento and d.org_id = app.org_id()
  )
$$;

comment on function app.documento_da_org(uuid) is
  'O documento pertence à organização do usuário. DEFINER: o outro lado da mesma recursão.';

grant execute on function app.documento_alcanca_pessoa(uuid, uuid) to authenticated;
grant execute on function app.documento_da_org(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Leitura de documento publicado — mesma regra de antes, sem a recursão
-- ---------------------------------------------------------------------
drop policy documentos_leitura on documentos;

create policy documentos_leitura on documentos for select to authenticated
  using (
    org_id = app.org_id()
    and status = 'publicado'
    and (
      -- 1. o titular sempre vê o próprio documento, qualquer categoria
      (escopo = 'individual' and pessoa_id = app.pessoa_id())
      -- 2. coletivo direcionado ao contrato/unidade/função do funcionário
      or (escopo = 'coletivo' and app.tipo() = 'funcionario'
          and app.documento_alcanca_pessoa(id, app.pessoa_id()))
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

-- ---------------------------------------------------------------------
-- B. Leitura de rascunho e arquivado
--
-- Policy separada, e não um ramo a mais na de cima, porque a condição é outra
-- e o que ela libera é outro. Separada, dá para ler o arquivo e responder
-- "quem enxerga documento não publicado?" sem desembaraçar um OR de quatro
-- ramos — e dá para revogá-la sozinha, se um dia a resposta mudar.
-- ---------------------------------------------------------------------
create policy documentos_leitura_nao_publicado on documentos for select to authenticated
  using (
    org_id = app.org_id()
    and status <> 'publicado'
    and app.tipo() = 'interno'
    and app.tem_permissao('documentos','editar')
    -- Sensibilidade vale igual antes de publicar. Rascunho de holerite é
    -- holerite (invariante 4).
    and app.categoria_permitida((select t.categoria from documento_tipos t where t.id = tipo_id))
    and (
      escopo = 'coletivo'
      or app.escopo_total()
      or pessoa_id in (select app.pessoas_no_escopo())
    )
  );

-- ---------------------------------------------------------------------
-- O outro lado da recursão
-- ---------------------------------------------------------------------
drop policy destinatarios_leitura on documento_destinatarios;

create policy destinatarios_leitura on documento_destinatarios for select to authenticated
  using (app.documento_da_org(documento_id));
