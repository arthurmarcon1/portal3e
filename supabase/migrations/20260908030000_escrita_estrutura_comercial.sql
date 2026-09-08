-- =====================================================================
-- 0005 — Escrita da estrutura comercial (contratantes e contrato_unidades)
--
-- Problema encontrado ao implementar a F1.1:
--
-- 1. `contratantes` tinha só policy de SELECT. Cadastrar um cliente novo
--    era impossível pela aplicação — o insert batia na RLS.
-- 2. `contrato_unidades` idem. Vincular unidade a contrato é requisito da
--    F1.1 e não havia por onde.
-- 3. `contratantes_leitura` exigia um contrato JÁ existente apontando para
--    o contratante. Ovo e galinha: o contratante recém-criado sumia da
--    lista antes de dar tempo de criar o contrato dele — inclusive para o
--    administrador geral.
--
-- Critério de escrita: `contratos:editar`, o mesmo que a migração inicial
-- já usa em `contratos_escrita` e `unidades_escrita`. A distinção fina
-- entre criar/editar/excluir é feita na Server Action com exigirPermissao;
-- a policy é o piso.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Leitura de contratantes
--
-- O ramo novo é `app.escopo_total()`: interno sem escopo cadastrado tem
-- alcance total na própria organização (docs/03, decisão 5). É o que
-- permite ver um contratante que ainda não tem contrato.
--
-- O contratante-usuário NÃO ganha nada: ele continua enxergando apenas
-- quem tem contrato dentro do escopo dele, e `escopo_total()` é falsa
-- para o tipo `contratante` por construção (falha fechada).
-- ---------------------------------------------------------------------
drop policy contratantes_leitura on contratantes;

create policy contratantes_leitura on contratantes for select to authenticated
  using (
    org_id = app.org_id()
    and (
      app.escopo_total()
      or exists (
        select 1 from contratos c
        where c.contratante_id = contratantes.id
          and c.id in (select app.contratos_permitidos())
      )
    )
  );

create policy contratantes_escrita on contratantes for all to authenticated
  using (org_id = app.org_id() and app.tem_permissao('contratos', 'editar'))
  with check (org_id = app.org_id() and app.tem_permissao('contratos', 'editar'));

-- ---------------------------------------------------------------------
-- 2. Vínculo contrato × unidade
--
-- Sem coluna org_id na tabela (é uma tabela de ligação), então a policy
-- checa a organização pelos dois lados do vínculo. Isso também impede
-- amarrar um contrato de uma organização a uma unidade de outra.
-- ---------------------------------------------------------------------
create policy contrato_unidades_escrita on contrato_unidades for all to authenticated
  using (
    app.tem_permissao('contratos', 'editar')
    and exists (select 1 from contratos c
                where c.id = contrato_unidades.contrato_id and c.org_id = app.org_id())
    and exists (select 1 from unidades u
                where u.id = contrato_unidades.unidade_id and u.org_id = app.org_id())
  )
  with check (
    app.tem_permissao('contratos', 'editar')
    and exists (select 1 from contratos c
                where c.id = contrato_unidades.contrato_id and c.org_id = app.org_id())
    and exists (select 1 from unidades u
                where u.id = contrato_unidades.unidade_id and u.org_id = app.org_id())
  );

-- ---------------------------------------------------------------------
-- 3. Índices que a F1.1 usa nas listagens
-- ---------------------------------------------------------------------
create index if not exists contratos_contratante_idx on contratos (contratante_id, status);
create index if not exists unidades_contratante_idx  on unidades  (contratante_id, status);
create index if not exists contrato_unidades_unidade_idx on contrato_unidades (unidade_id);
