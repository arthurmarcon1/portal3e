-- =====================================================================
-- 0006 — Importação de pessoas em lote (F1.3)
--
-- Por que uma função no banco, e não um laço no Node:
--
-- O critério da F1.3 diz "importação roda em transação; se qualquer linha
-- crítica falhar, nada é gravado". O supabase-js fala com o PostgREST, e cada
-- chamada é a sua própria transação — não existe BEGIN/COMMIT abrangendo
-- várias. Um laço no servidor Node gravaria metade do quadro e pararia no
-- erro da linha 57, que é exatamente o que o critério proíbe. Uma função
-- plpgsql, ao contrário, é atômica por construção: qualquer exception dentro
-- dela desfaz tudo o que ela fez.
--
-- SECURITY INVOKER (o padrão, escrito aqui de propósito para ninguém
-- "consertar" depois): a função roda com os direitos de quem chamou, então a
-- RLS continua valendo linha a linha. É o mesmo princípio do download de
-- documento em docs/03 — quem autoriza é a policy, nunca um if no código.
-- Trocar para SECURITY DEFINER transformaria esta função num buraco: qualquer
-- usuário autenticado gravaria pessoa em qualquer organização.
--
-- Mora em `public` porque o schema `app` não é exposto na API (config.toml) e
-- RPC só alcança o que o PostgREST enxerga.
-- =====================================================================

create or replace function public.importar_pessoas(p_linhas jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_org         uuid := app.org_id();
  v_linha       jsonb;
  v_indice      int  := 0;
  v_cpf         text;
  v_contrato    uuid;
  v_unidade     uuid;
  v_pessoa      uuid;
  v_existia     boolean;
  v_criados     int := 0;
  v_atualizados int := 0;
  v_alocacoes   int := 0;
begin
  if v_org is null then
    raise exception 'Sessão sem organização ativa.'
      using errcode = '42501';
  end if;

  -- A RLS já barraria cada escrita, mas a mensagem que ela devolve é genérica.
  -- Esta checagem existe para o usuário saber o que fazer.
  if not app.tem_permissao('pessoas', 'criar') then
    raise exception 'Sem permissão para importar pessoas.'
      using errcode = '42501';
  end if;

  if jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'Formato de importação inválido.'
      using errcode = '22023';
  end if;

  for v_linha in select * from jsonb_array_elements(p_linhas)
  loop
    v_indice := v_indice + 1;
    v_cpf := regexp_replace(coalesce(v_linha->>'cpf', ''), '\D', '', 'g');

    if length(v_cpf) <> 11 then
      raise exception 'Linha %: CPF inválido.', v_indice
        using errcode = '22023';
    end if;

    -- Contrato e unidade chegam como texto na planilha (número e nome) e são
    -- resolvidos aqui dentro, na mesma transação: resolver fora abriria uma
    -- janela para o contrato ser desativado entre a conferência e a gravação.
    select c.id into v_contrato
    from contratos c
    where c.org_id = v_org
      and c.numero = trim(coalesce(v_linha->>'contrato', ''));

    if v_contrato is null then
      raise exception 'Linha %: contrato "%" não encontrado.',
        v_indice, coalesce(v_linha->>'contrato', '')
        using errcode = '23503';
    end if;

    select u.id into v_unidade
    from unidades u
    where u.org_id = v_org
      and lower(u.nome) = lower(trim(coalesce(v_linha->>'unidade', '')));

    if v_unidade is null then
      raise exception 'Linha %: unidade "%" não encontrada.',
        v_indice, coalesce(v_linha->>'unidade', '')
        using errcode = '23503';
    end if;

    -- Mesma coerência que a F1.2 exige na tela: a unidade precisa ser
    -- atendida pelo contrato, senão o escopo do contratante sai torto.
    if not exists (
      select 1 from contrato_unidades cu
      where cu.contrato_id = v_contrato and cu.unidade_id = v_unidade
    ) then
      raise exception 'Linha %: a unidade "%" não é atendida pelo contrato "%".',
        v_indice, v_linha->>'unidade', v_linha->>'contrato'
        using errcode = '23503';
    end if;

    -- CPF já cadastrado vira atualização, nunca duplicata (critério da F1.3).
    select p.id into v_pessoa
    from pessoas p
    where p.org_id = v_org and p.cpf = v_cpf;

    v_existia := v_pessoa is not null;

    if v_existia then
      update pessoas set
        nome      = coalesce(nullif(trim(v_linha->>'nome'), ''), nome),
        matricula = coalesce(nullif(trim(v_linha->>'matricula'), ''), matricula),
        telefone  = coalesce(
                      nullif(regexp_replace(coalesce(v_linha->>'telefone',''), '\D', '', 'g'), ''),
                      telefone),
        atualizado_em = now()
      where id = v_pessoa;

      v_atualizados := v_atualizados + 1;
    else
      insert into pessoas (org_id, nome, cpf, matricula, telefone)
      values (
        v_org,
        nullif(trim(coalesce(v_linha->>'nome', '')), ''),
        v_cpf,
        nullif(trim(coalesce(v_linha->>'matricula', '')), ''),
        nullif(regexp_replace(coalesce(v_linha->>'telefone',''), '\D', '', 'g'), '')
      )
      returning id into v_pessoa;

      v_criados := v_criados + 1;
    end if;

    -- Reimportar a mesma planilha não pode empilhar alocação repetida. Se já
    -- existe uma vigente no mesmo posto e função, a linha não cria outra —
    -- isso é idempotência, não mudança de vínculo: trocar de posto continua
    -- sendo encerrar a alocação anterior e abrir uma nova, na ficha.
    if not exists (
      select 1 from alocacoes a
      where a.pessoa_id   = v_pessoa
        and a.contrato_id = v_contrato
        and a.unidade_id  = v_unidade
        and a.funcao      = trim(coalesce(v_linha->>'funcao', ''))
        and a.status <> 'encerrada'
    ) then
      insert into alocacoes (org_id, pessoa_id, contrato_id, unidade_id, funcao, data_inicio)
      values (
        v_org,
        v_pessoa,
        v_contrato,
        v_unidade,
        nullif(trim(coalesce(v_linha->>'funcao', '')), ''),
        (v_linha->>'data_inicio')::date
      );

      v_alocacoes := v_alocacoes + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'total',            v_indice,
    'criados',          v_criados,
    'atualizados',      v_atualizados,
    'alocacoes_criadas', v_alocacoes
  );
end;
$$;

comment on function public.importar_pessoas(jsonb) is
  'Importa o quadro em lote, atomicamente. SECURITY INVOKER: a RLS decide cada escrita.';

-- PUBLIC recebe EXECUTE por padrão em função nova; revogar e conceder só a
-- `authenticated` deixa explícito que anônimo não importa nada.
revoke all on function public.importar_pessoas(jsonb) from public, anon;
grant execute on function public.importar_pessoas(jsonb) to authenticated;
