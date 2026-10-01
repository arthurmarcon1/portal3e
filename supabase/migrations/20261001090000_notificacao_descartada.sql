-- =====================================================================
-- 0028 — Aviso descartado por idade
--
-- Decisão do Arthur (docs/06, 2026-10-01): aviso de e-mail com mais de 48
-- horas na fila é DESCARTADO, não enviado. Prazo de ciência que já venceu e
-- publicação de semanas atrás não têm valor chegando atrasados, e a fila
-- acumulada de uma vez pareceria spam — que é o que aconteceria no dia em que
-- o e-mail fosse ligado depois de um piloto inteiro sem ele.
--
-- `erro` não serve: é falha de entrega. Descartar é ato deliberado, e quem
-- lê a tabela tem de distinguir "não conseguimos" de "decidimos não mandar".
-- O descarte em si é do servidor (src/features/notificacoes/envio.ts); aqui
-- só se abre a situação.
--
-- Lembrete e vencido descartados continuam ocupando o índice único da 0022:
-- o job não os recria, e o mesmo aviso não volta na rodada seguinte.
-- =====================================================================

alter table notificacoes drop constraint notificacoes_status_check;

alter table notificacoes add constraint notificacoes_status_check
  check (status in ('pendente', 'enviada', 'erro', 'lida', 'descartada'));

comment on column notificacoes.status is
  'pendente → enviada | erro | descartada (e-mail com mais de 48 h na fila, nunca enviado). lida: canal portal.';
