-- =====================================================================
-- 0011 — Trilha de auditoria (F2.2) e bloqueio de login por tentativas
--
-- Nenhuma regra de acesso muda aqui. `auditoria_leitura` continua exatamente
-- como a 0001 a escreveu: própria organização e `administracao:ver`.
--
-- ---------------------------------------------------------------------
-- A. Leitura das tentativas de login
--
-- O bloqueio temporário (src/lib/auth/bloqueio.ts) lê as últimas
-- `falha_login` de um identificador antes de tentar a senha. Isso roda em
-- TODO login, então não pode ser scan de `auditoria` — que é a tabela que mais
-- cresce no schema.
--
-- A chave é `detalhes->>'chave_login'`: HMAC do identificador normalizado,
-- nunca o CPF nem o e-mail em claro. Ela existe também para identificador sem
-- cadastro, e é isso que impede o bloqueio de virar oráculo de "este CPF
-- existe" — se só conta de usuário real fosse bloqueada, a sexta tentativa
-- responderia a pergunta.
--
-- Índice parcial: só as ações que a regra lê entram nele, e o resto da
-- auditoria não paga por isso.
-- ---------------------------------------------------------------------
create index auditoria_tentativas_login_idx
  on auditoria ((detalhes ->> 'chave_login'), criado_em desc)
  where acao in ('falha_login', 'login', 'senha_redefinida');

-- ---------------------------------------------------------------------
-- B. Valores para os filtros de /admin/auditoria
--
-- Ação e entidade são texto livre gravado pelo código, não enum: a lista do
-- filtro sai do que existe na tabela, e não de uma constante que diverge no
-- primeiro evento novo.
--
-- SECURITY INVOKER de propósito, ao contrário das funções de `app`: aqui a RLS
-- de `auditoria` TEM de valer. Quem não tem `administracao:ver` recebe lista
-- vazia, pelo mesmo motivo que recebe tabela vazia.
-- ---------------------------------------------------------------------
create or replace function public.auditoria_opcoes_de_filtro()
returns table (campo text, valor text)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select 'acao'::text, a.acao from auditoria a group by a.acao
  union all
  select 'entidade'::text, a.entidade from auditoria a group by a.entidade
$$;

comment on function public.auditoria_opcoes_de_filtro() is
  'Ações e entidades distintas visíveis ao usuário, para os filtros da trilha. INVOKER: a RLS de auditoria vale.';

revoke all on function public.auditoria_opcoes_de_filtro() from public, anon;
grant execute on function public.auditoria_opcoes_de_filtro() to authenticated;
