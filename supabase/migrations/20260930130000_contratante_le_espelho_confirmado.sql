-- =====================================================================
-- 0027 — Contratante lê o espelho que o funcionário confirmou
--
-- Decisão do gestor (docs/06, 2026-09-30): o contratante vê o espelho
-- individual **depois que o funcionário confirma a ciência dele**. Era a
-- leitura (a) da pendência "Contratante vê espelho individual?" — espelho
-- contestado nunca chega ao cliente.
--
-- É exceção por documento, não liberação de categoria:
--
-- - `jornada` continua fora do teto do contratante em
--   `app.categoria_permitida()`, que não muda. Por isso `ciencias_leitura`
--   também não muda: a ciência do espelho (IP, user agent, justificativa da
--   divergência) segue ilegível ao contratante, e
--   `pendencias_de_ciencia_do_contratante()` segue sem espelho.
-- - O ramo novo de `documentos_leitura` é só do contratante e só do tipo
--   `espelho_ponto` — outro tipo que um dia caia em `jornada` não entra
--   junto. Individual, `publicado`, pessoa no escopo (para contratante, só
--   alocação vigente — 0023), `documentos:ver`, e **ciência do tipo
--   `confirmacao` naquele documento**.
-- - Ciência é por linha de `documentos`, e cada versão é uma linha: a
--   confirmação vale para a versão confirmada e nenhuma outra.
-- - **Divergência não libera.** Espelho divergido fica invisível. A
--   retificação é versão nova, sem ciência — invisível até o funcionário
--   confirmá-la. A v1 divergida vira `arquivado`, e contratante só lê
--   `publicado`: ela nunca aparece.
-- - Sem resposta, invisível — inclusive depois do prazo. Silêncio não é
--   confirmação.
--
-- O titular não muda: continua lendo o próprio espelho em qualquer caso
-- (ramo 1). Interno não muda.
--
-- A pergunta "há confirmação?" é função SECURITY DEFINER pelo mesmo motivo
-- de `app.respondeu` (0016): `ciencias_leitura` consulta `documentos`, e o
-- contratante não lê `ciencias`.
-- =====================================================================

create or replace function app.ciencia_confirmada(p_documento uuid, p_pessoa uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from ciencias c
    where c.documento_id = p_documento
      and c.pessoa_id = p_pessoa
      and c.tipo = 'confirmacao'
  )
$$;

comment on function app.ciencia_confirmada(uuid, uuid) is
  'A pessoa confirmou (não divergiu) este documento — esta versão. DEFINER: consultada de dentro de documentos_leitura para o contratante, que não lê ciencias.';

grant execute on function app.ciencia_confirmada(uuid, uuid) to authenticated;

drop policy documentos_leitura on documentos;

create policy documentos_leitura on documentos for select to authenticated
  using (
    org_id = app.org_id()
    and (
      -- 1. o titular sempre vê o próprio documento, qualquer categoria e
      --    qualquer status que já tenha sido publicado
      (escopo = 'individual' and pessoa_id = app.pessoa_id()
       and status in ('publicado', 'arquivado'))
      -- 2. coletivo direcionado ao contrato/unidade/função do funcionário
      or (escopo = 'coletivo' and app.tipo() = 'funcionario' and status = 'publicado'
          and app.documento_alcanca_pessoa(id, app.pessoa_id()))
      -- 2b. coletivo arquivado que o funcionário respondeu: a prova fica com ele
      or (escopo = 'coletivo' and app.tipo() = 'funcionario' and status = 'arquivado'
          and app.respondeu(id, app.pessoa_id()))
      -- 3. terceiros: só publicado, com permissão, escopo e categoria liberada
      or (app.tipo() <> 'funcionario'
          and status = 'publicado'
          and app.tem_permissao('documentos','ver')
          and app.categoria_permitida((select t.categoria from documento_tipos t where t.id = tipo_id))
          and (
            (escopo = 'coletivo'
             and (app.tipo() = 'interno' or app.documento_no_escopo(id)))
            or app.escopo_total()
            or pessoa_id in (select app.pessoas_no_escopo())
          ))
      -- 4. contratante: espelho individual que o titular CONFIRMOU (0027).
      --    Exceção por documento; a categoria `jornada` segue bloqueada.
      or (app.tipo() = 'contratante'
          and escopo = 'individual'
          and status = 'publicado'
          and app.tem_permissao('documentos','ver')
          and (select t.chave from documento_tipos t where t.id = tipo_id) = 'espelho_ponto'
          and pessoa_id in (select app.pessoas_no_escopo())
          and app.ciencia_confirmada(id, pessoa_id))
    )
  );
