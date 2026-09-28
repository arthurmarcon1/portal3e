-- =====================================================================
-- 0021 — Contratante não lê pedido pessoal de funcionário
--
-- Achado pelo teste da F4.2 (src/features/solicitacoes/
-- solicitacoes.integracao.test.ts), medido: o fiscal do contrato 042 lia o
-- pedido de FÉRIAS da Maria e baixava o ATESTADO anexado ao pedido de
-- afastamento dela.
--
-- Causa: `solicitacoes_leitura` (0001) libera ao terceiro com
-- `solicitacoes:ver` as solicitações de toda PESSOA do escopo dele
-- (`pessoa_id in app.pessoas_no_escopo()`). Para interno isso é certo — o RH
-- com escopo no 042 trata o pedido de quem está no 042. Para contratante,
-- abre o assunto pessoal do funcionário com a 3e: férias, afastamento (com
-- atestado — dado de saúde), correção de ponto, atualização cadastral (com
-- telefone e endereço, que docs/02 bloqueia para contratante). A 0020 fez o
-- pedido do funcionário nascer sem contrato justamente para isso, mas a
-- leitura passava pela pessoa, não pelo contrato.
--
-- Correção: contratante lê solicitação pelo CONTRATO do escopo (e pela
-- unidade, se houver) — ocorrência, substituição, o que for do contrato.
-- Pedido pessoal não tem contrato e não chega a ele. Interno, titular e quem
-- abriu não mudam. `anexos` e `solicitacao_eventos` herdam, porque a leitura
-- deles pergunta se a solicitação é visível.
-- =====================================================================

drop policy solicitacoes_leitura on solicitacoes;

create policy solicitacoes_leitura on solicitacoes for select to authenticated
  using (
    org_id = app.org_id()
    and (
      -- o funcionário, sobre si; e quem abriu, sobre o que abriu
      pessoa_id = app.pessoa_id()
      or aberta_por = auth.uid()
      -- interno: escopo por contrato ou pela pessoa
      or (app.tipo() = 'interno'
          and app.tem_permissao('solicitacoes', 'ver')
          and (app.escopo_total()
               or contrato_id in (select app.contratos_permitidos())
               or pessoa_id in (select app.pessoas_no_escopo())))
      -- contratante: só pelo contrato (e unidade) do escopo — nunca pela pessoa
      or (app.tipo() = 'contratante'
          and app.tem_permissao('solicitacoes', 'ver')
          and contrato_id in (select app.contratos_permitidos())
          and (unidade_id is null or unidade_id in (select app.unidades_permitidas())))
    )
  );
