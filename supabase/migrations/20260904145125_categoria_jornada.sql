-- =====================================================================
-- 0004 — Categoria 'jornada' para espelho de ponto
--
-- Espelho de ponto não cabe em nenhuma categoria existente: não é dado de
-- pagamento ('folha'), não é documento pessoal ('pessoal') e claramente não
-- é aberto ('geral'). É um domínio de sensibilidade próprio.
--
-- Encaixá-lo em 'folha' ou 'pessoal' excluiria Contratos/Coordenação, que é
-- o time que publica espelho e trata contestação — quebraria a operação para
-- proteger a coisa errada.
--
-- Efeito colateral desejado: como o teto do contratante em
-- app.categoria_permitida() lista apenas geral/contratual/sst, a categoria
-- nova já nasce bloqueada para contratante. A decisão "contratante vê espelho
-- individual?" (docs/06, Trava a Fase 2) segue genuinamente em aberto, e em
-- aberto pelo lado seguro.
--
-- Para respondê-la SIM no futuro: incluir 'jornada' na lista do ramo
-- 'contratante' daquela função, via migração nova. É deliberadamente uma
-- migração e não um insert — mudar o teto do contratante é decisão de
-- produto, não configuração de cliente.
-- =====================================================================

alter type categoria_doc add value if not exists 'jornada';

-- Uso da categoria (documento_tipos e perfil_categorias) fica no seed.
-- Postgres não permite usar um valor de enum na mesma transação em que ele
-- foi criado, então nada além do ALTER TYPE pode entrar neste arquivo.
