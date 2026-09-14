-- =====================================================================
-- 0009 — "sem alocação" passa a ser perguntado por linha
--
-- Corrige a forma da 0007, mantendo a regra dela intacta.
--
-- O que quebrou: `app.pessoas_sem_alocacao()` devolvia o conjunto de pessoas
-- sem alocação **enumerando a tabela `pessoas`**, e a policy testava
-- `id in (select app.pessoas_sem_alocacao())`. A função é STABLE, então
-- enxerga o snapshot do início da statement — onde a linha que está sendo
-- inserida ainda não existe. Resultado: `insert ... returning` falhava para
-- quem tem escopo, porque a pessoa recém-criada não podia constar de uma
-- enumeração feita antes de ela existir. O sintoma era um 42501 enganoso
-- ("new row violates row-level security policy") num INSERT cujo WITH CHECK
-- passava perfeitamente — quem recusava era o SELECT do RETURNING.
--
-- A correção é perguntar sobre a tabela certa. "Esta pessoa tem alocação?" é
-- uma pergunta sobre `alocacoes`, não sobre `pessoas`: para a linha nova, a
-- resposta é não em qualquer snapshot, porque alocação nenhuma foi criada.
-- De quebra, sai o scan da tabela inteira por consulta — vira busca no índice
-- `alocacoes (pessoa_id, status)`.
--
-- SECURITY DEFINER continua sendo obrigatório, pelo mesmo motivo da 0007: sob
-- a RLS de `alocacoes`, "não tem alocação" seria confundido com "tem alocação
-- que eu não enxergo", e todo interno com escopo passaria a ver o quadro
-- inteiro. Ver o comentário da 0007.
-- =====================================================================

create or replace function app.pessoa_sem_alocacao(p_pessoa uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not exists (select 1 from alocacoes a where a.pessoa_id = p_pessoa)
$$;

comment on function app.pessoa_sem_alocacao(uuid) is
  'A pessoa não tem nenhuma alocação. DEFINER: sob RLS, "sem alocação" seria confundido com "alocação que não enxergo".';

grant execute on function app.pessoa_sem_alocacao(uuid) to authenticated;

drop policy pessoas_leitura on pessoas;

create policy pessoas_leitura on pessoas for select to authenticated
  using (
    org_id = app.org_id()
    and (
      id = app.pessoa_id()                                              -- o próprio
      or (app.tipo() = 'interno'    and app.tem_permissao('pessoas','ver')
          and (app.escopo_total() or id in (select app.pessoas_no_escopo())))
      -- Ainda não alocada: não pertence a contrato nenhum, nada a segregar.
      -- O `app.tipo() = 'interno'` é estrutural: a decisão diz "quem tem
      -- pessoas:editar", e nenhum perfil de contratante tem essa ação hoje —
      -- mas permissão é dado, e um insert amanhã poderia dar. Falha fechada.
      or (app.tipo() = 'interno'    and app.tem_permissao('pessoas','editar')
          and app.pessoa_sem_alocacao(id))
      or (app.tipo() = 'contratante' and app.tem_permissao('pessoas','ver')
          and id in (select app.pessoas_no_escopo()))
    )
  );

-- Sem referências restantes: a versão que enumerava a tabela sai de cena.
drop function if exists app.pessoas_sem_alocacao();
