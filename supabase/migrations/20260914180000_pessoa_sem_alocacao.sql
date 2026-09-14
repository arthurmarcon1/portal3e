-- =====================================================================
-- 0007 — Pessoa sem alocação é visível para quem cadastra
--
-- Decisão do Arthur, registrada como pendência na F1.2 e agora fechada:
--
--   Pessoa sem NENHUMA alocação é visível para quem tem `pessoas:editar`,
--   independentemente de escopo. Pessoa não alocada não pertence a contrato
--   nenhum, logo não há o que segregar; e esconder de quem acabou de
--   cadastrar o registro que ele mesmo criou é absurdo operacional. Assim que
--   ganha alocação, vale a regra de escopo normal.
--
-- O problema que isto resolve (era invisível enquanto todo interno do seed
-- tinha escopo total): `app.pessoas_no_escopo()` é derivada de `alocacoes`.
-- Uma pessoa recém-cadastrada não aparece em lugar nenhum dessa derivação,
-- então sumia da lista de qualquer interno COM escopo — o mesmo ovo e galinha
-- que a migração 0005 resolveu para `contratantes`.
--
-- ---------------------------------------------------------------------
-- Por que a checagem mora numa função SECURITY DEFINER
--
-- Escrever `not exists (select 1 from alocacoes a where a.pessoa_id = ...)`
-- direto na policy seria um buraco, não um atalho: subconsulta em policy roda
-- com os direitos de quem consulta, então a RLS de `alocacoes` se aplica a
-- ela. Um interno com escopo no contrato 042 não enxerga as alocações do
-- contrato 077 — e portanto veria "sem alocação" para TODA pessoa alocada
-- apenas no 077, ganhando acesso ao quadro inteiro. O escopo deixaria de
-- existir exatamente para quem ele deveria limitar.
--
-- SECURITY DEFINER faz a função enxergar `alocacoes` por completo, que é o
-- único jeito de a resposta "esta pessoa não tem alocação" ser verdadeira.
-- É o mesmo motivo pelo qual todas as funções de `app` já são DEFINER.
-- =====================================================================

create or replace function app.pessoas_sem_alocacao()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id
  from pessoas p
  where p.org_id = app.org_id()
    and not exists (select 1 from alocacoes a where a.pessoa_id = p.id)
$$;

comment on function app.pessoas_sem_alocacao() is
  'Pessoas da org sem nenhuma alocação. DEFINER de propósito: sob RLS, "sem alocação" seria confundido com "alocação que não enxergo".';

grant execute on function app.pessoas_sem_alocacao() to authenticated;

-- ---------------------------------------------------------------------
-- A policy
--
-- O ramo novo é o terceiro. Note o `app.tipo() = 'interno'` nele: a decisão
-- diz "quem tem pessoas:editar", e hoje nenhum perfil de contratante tem essa
-- ação na matriz de docs/02 — mas permissão é DADO (docs/03, decisão 4), e um
-- insert em `perfil_permissoes` amanhã poderia dar `editar` a um contratante.
-- O tipo trava isso por estrutura em vez de por convenção, mantendo o
-- resultado que a decisão descreve: contratante nunca enxerga pessoa não
-- alocada. Falha fechada, como o resto do arquivo.
-- ---------------------------------------------------------------------
drop policy pessoas_leitura on pessoas;

create policy pessoas_leitura on pessoas for select to authenticated
  using (
    org_id = app.org_id()
    and (
      id = app.pessoa_id()                                              -- o próprio
      or (app.tipo() = 'interno'    and app.tem_permissao('pessoas','ver')
          and (app.escopo_total() or id in (select app.pessoas_no_escopo())))
      -- Ainda não alocada: não pertence a contrato nenhum, nada a segregar.
      or (app.tipo() = 'interno'    and app.tem_permissao('pessoas','editar')
          and id in (select app.pessoas_sem_alocacao()))
      or (app.tipo() = 'contratante' and app.tem_permissao('pessoas','ver')
          and id in (select app.pessoas_no_escopo()))
    )
  );
