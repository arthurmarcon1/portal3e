-- =====================================================================
-- 0003 — Categoria de documento vira dado, não código
--
-- Problema corrigido: app.categoria_permitida() inferia acesso a dado
-- sensível a partir de permissões de módulo, usando relatorios:exportar
-- como proxy de "é do Financeiro". Como os 6 perfis internos têm essa
-- permissão, na prática TODOS enxergavam 'bancario' e 'folha' — o oposto
-- do que docs/02-matriz-permissoes.md determina.
--
-- Solução: uma tabela perfil_categorias, no mesmo espírito de
-- perfil_permissoes. Cliente novo com organograma diferente passa a ser
-- insert, não migração.
-- =====================================================================

create table perfil_categorias (
  perfil_id uuid not null references perfis(id) on delete cascade,
  categoria categoria_doc not null,
  primary key (perfil_id, categoria)
);

comment on table perfil_categorias is
  'Categorias RESTRITAS que o perfil pode ver sobre terceiros. As categorias
   abertas (geral, contratual, sst) não precisam de linha aqui. O titular do
   documento sempre vê o próprio, qualquer categoria — isso é tratado na
   policy de documentos, não aqui.';

alter table perfil_categorias enable row level security;

create policy perfil_categorias_leitura on perfil_categorias for select to authenticated
  using (exists (select 1 from perfis p where p.id = perfil_id and p.org_id = app.org_id()));

create policy perfil_categorias_escrita on perfil_categorias for all to authenticated
  using (app.tem_permissao('administracao', 'editar')
         and exists (select 1 from perfis p where p.id = perfil_id and p.org_id = app.org_id()))
  with check (app.tem_permissao('administracao', 'editar')
         and exists (select 1 from perfis p where p.id = perfil_id and p.org_id = app.org_id()));

-- ---------------------------------------------------------------------
-- Função reescrita.
-- O teto do contratante continua no código de propósito: é invariante de
-- produto (CLAUDE.md, item 4), não configuração. Mesmo que alguém insira
-- uma linha em perfil_categorias para um perfil de contratante, o bloqueio
-- prevalece.
-- ---------------------------------------------------------------------
create or replace function app.categoria_permitida(p_categoria categoria_doc)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when app.tipo() = 'contratante' then
      p_categoria in ('geral', 'contratual', 'sst')

    when app.tipo() = 'interno' then
      case
        when p_categoria in ('geral', 'contratual', 'sst') then true
        else exists (
          select 1
          from usuario_perfis up
          join perfil_categorias pc on pc.perfil_id = up.perfil_id
          where up.usuario_id = auth.uid()
            and pc.categoria = p_categoria
        )
      end

    else false
  end
$$;

grant execute on function app.categoria_permitida(categoria_doc) to authenticated;
