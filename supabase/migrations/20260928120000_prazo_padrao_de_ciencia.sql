-- =====================================================================
-- 0014 — Prazo padrão de ciência por tipo de documento
--
-- Decisão PROVISÓRIA de 2026-09-28 (docs/06, "Decisões provisórias"):
-- 5 dias corridos a partir da publicação, com o valor padrão guardado no
-- tipo e editável na publicação. O prazo efetivo continua sendo
-- `documentos.prazo_ciencia` (data), que a tela preenche a partir daqui —
-- mudar o padrão não mexe em documento já publicado.
--
-- Tipo que não exige ciência não tem prazo: a constraint impede um valor
-- que ninguém usaria e que faria a tela sugerir prazo para holerite.
-- =====================================================================

alter table documento_tipos
  add column prazo_ciencia_dias integer;

alter table documento_tipos
  add constraint documento_tipos_prazo_ciencia_positivo
    check (prazo_ciencia_dias is null or prazo_ciencia_dias > 0),
  add constraint documento_tipos_prazo_so_com_ciencia
    check (exige_ciencia or prazo_ciencia_dias is null);

comment on column documento_tipos.prazo_ciencia_dias is
  'Prazo padrão de ciência em dias corridos a partir da publicação. NULL quando o tipo não exige ciência.';
