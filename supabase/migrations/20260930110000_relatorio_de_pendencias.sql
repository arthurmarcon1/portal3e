-- =====================================================================
-- 0025 — Relatório de pendências de ciência (F5.3)
--
-- "Quem ainda não respondeu" depende de quem o documento ALCANÇA — e o
-- alcance do coletivo (`app.pessoas_alcancadas`, 0015) é DEFINER e fechado a
-- `authenticated`, porque enxerga alocações de fora do escopo de quem
-- pergunta. O relatório precisa respeitar o escopo de quem exporta (docs/05),
-- então segue o padrão de `resumo_do_documento`: invólucro INVOKER + parte
-- DEFINER mínima.
--
-- - `app.pendentes_do_documento(doc)` (DEFINER): as pessoas alcançadas que
--   ainda não responderam. Só ids; só para interno com `documentos:ver`.
-- - `public.relatorio_pendencias_de_ciencia()` (INVOKER): lê `documentos`,
--   `documento_tipos` e `pessoas` com a RLS de quem chama — categoria e
--   escopo do documento, e escopo da pessoa. Pendência de pessoa que o
--   usuário não enxerga não aparece, nem como contagem.
-- =====================================================================

create or replace function app.pendentes_do_documento(p_documento uuid)
returns table (pessoa_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select al.pessoa_id
    from app.pessoas_alcancadas(p_documento) al
   where app.tipo() = 'interno'
     and app.tem_permissao('documentos', 'ver')
     and not exists (
       select 1 from ciencias c where c.documento_id = p_documento and c.pessoa_id = al.pessoa_id
     )
$$;

comment on function app.pendentes_do_documento(uuid) is
  'Parte DEFINER do relatório de pendências: alcançados sem resposta. O recorte de escopo e categoria é do invólucro, pela RLS.';

revoke all on function app.pendentes_do_documento(uuid) from public, anon;
grant execute on function app.pendentes_do_documento(uuid) to authenticated;

create or replace function public.relatorio_pendencias_de_ciencia()
returns table (
  documento_id uuid,
  titulo text,
  tipo_nome text,
  publicado_em timestamptz,
  prazo_ciencia date,
  pessoa_id uuid,
  pessoa_nome text,
  matricula text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select d.id, d.titulo, t.nome, d.publicado_em, d.prazo_ciencia, p.id, p.nome, p.matricula
    from documentos d
    join documento_tipos t on t.id = d.tipo_id and t.exige_ciencia
    cross join lateral app.pendentes_do_documento(d.id) x
    join pessoas p on p.id = x.pessoa_id
   where d.status = 'publicado'
   order by d.prazo_ciencia nulls last, d.titulo, p.nome
$$;

comment on function public.relatorio_pendencias_de_ciencia() is
  'F5.3: uma linha por documento publicado com ciência e pessoa alcançada sem resposta, no escopo e nas categorias de quem chama.';

revoke all on function public.relatorio_pendencias_de_ciencia() from public, anon;
grant execute on function public.relatorio_pendencias_de_ciencia() to authenticated;
