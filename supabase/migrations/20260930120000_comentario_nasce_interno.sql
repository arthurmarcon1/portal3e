-- =====================================================================
-- 0026 — Comentário de solicitação nasce interno
--
-- Texto livre é o único vazamento que o invariante 10 (CLAUDE.md) não cobre:
-- função de banco escolhe colunas, não o que alguém escreveu dentro delas.
-- Um comentário da equipe ("atestado com CID F32", "cliente reclamou dela")
-- vai para o contratante ou o funcionário se `interno` for `false`.
--
-- Até aqui o padrão era `false`: esquecer de marcar EXPUNHA. Agora o padrão
-- é `true`: esquecer ESCONDE, e mostrar ao solicitante é ato explícito — na
-- tela ("Visível ao solicitante", desmarcada), na Server Action (sem o campo,
-- é nota interna) e aqui no banco (insert que omite a coluna é nota).
--
-- O evento de status (trigger da 0001) omitia a coluna e contava com o
-- `false` do padrão — sem o ajuste abaixo, a troca de padrão sumiria com a
-- linha do tempo do solicitante. Agora ele diz `false` explicitamente, como
-- já diziam a atribuição e a resposta do solicitante (0020).
-- =====================================================================

create or replace function app.log_status_solicitacao()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status is distinct from old.status then
    insert into solicitacao_eventos (solicitacao_id, usuario_id, tipo, status_anterior, status_novo, interno)
    values (new.id, coalesce(auth.uid(), new.aberta_por), 'mudanca_status', old.status, new.status, false);
  end if;
  return new;
end $$;

alter table solicitacao_eventos alter column interno set default true;

comment on column solicitacao_eventos.interno is
  'true = nota interna, invisível ao solicitante. Padrão true desde a 0026: mostrar é explícito.';
