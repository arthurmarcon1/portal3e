-- =====================================================================
-- 0018 — Ciência só é gravada pelo servidor
--
-- O IP e o user-agent da ciência eram informados por quem gravava. A Server
-- Action passava os do request, mas `ciencias_insert` (0001) e
-- `public.registrar_ciencia` (0017, chamável por `authenticated`) aceitavam
-- os valores como vinham: um funcionário com o próprio token, chamando a API
-- do Supabase direto, gravava a ciência dele com IP e user-agent escolhidos
-- por ele. Evidência que o próprio interessado escolhe não é evidência — e a
-- ciência é o produto. Achado na F3.4.
--
-- Agora:
--
-- 1. `authenticated` não insere em `ciencias`. Sem policy e sem privilégio —
--    REVOKE, como a `auditoria` desde a 0012: a tentativa falha com 42501, e
--    uma policy criada por descuido amanhã não reabre nada.
--
-- 2. `public.registrar_ciencia` passa a ser SECURITY DEFINER e só
--    `service_role` a executa. Quem chama é a Server Action
--    (`src/features/documentos/ciencia.ts`), que tira o usuário da sessão
--    validada no servidor e o IP e o user-agent do request — nada disso vem
--    do navegador.
--
-- 3. Sem a RLS de quem responde no caminho, a função confere sozinha o que a
--    RLS conferia: usuário ativo, do tipo funcionário, com pessoa; documento
--    da mesma organização que CHEGA a essa pessoa, pelas mesmas peças de
--    `documentos_leitura` — individual dela, ou coletivo que alcança a
--    alocação vigente dela (`app.documento_alcanca_pessoa`). Documento que não
--    chega dá a mesma resposta de documento inexistente.
--
-- A assinatura muda (entra `p_usuario`), então a versão da 0017 sai
-- explicitamente — `create or replace` com outra assinatura criaria uma
-- segunda função, e a antiga continuaria aberta a `authenticated`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Nada de insert direto
-- ---------------------------------------------------------------------
drop policy ciencias_insert on ciencias;
revoke insert on ciencias from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2 + 3. A função, só para o servidor
-- ---------------------------------------------------------------------
drop function public.registrar_ciencia(uuid, tipo_ciencia, text, inet, text);

create function public.registrar_ciencia(
  p_usuario uuid,
  p_documento uuid,
  p_tipo tipo_ciencia,
  p_justificativa text,
  p_ip inet,
  p_user_agent text
)
returns table (
  ciencia_id uuid,
  protocolo text,
  respondido_em timestamptz,
  solicitacao_id uuid,
  solicitacao_protocolo text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  quem record;
  doc record;
  nova ciencias;
  -- Escalares, não `record`: ler campo de record nunca atribuído (caso da
  -- confirmação, que não abre solicitação) é erro em plpgsql.
  sol_id uuid;
  sol_protocolo text;
  v_justificativa text := nullif(trim(coalesce(p_justificativa, '')), '');
begin
  select u.id, u.org_id, u.pessoa_id
    into quem
    from usuarios u
   where u.id = p_usuario
     and u.status = 'ativo'
     and u.tipo = 'funcionario'
     and u.pessoa_id is not null;

  if not found then
    raise exception 'Só o funcionário a quem o documento foi enviado pode dar ciência.'
      using errcode = '55000';
  end if;

  select d.id, d.org_id, d.titulo, d.versao, d.arquivo_hash, d.status,
         t.exige_ciencia, t.tipo_solicitacao_divergencia
    into doc
    from documentos d
    join documento_tipos t on t.id = d.tipo_id
   where d.id = p_documento
     and d.org_id = quem.org_id
     and d.status <> 'rascunho'
     -- As mesmas duas portas de `documentos_leitura` para o funcionário.
     and (
       (d.escopo = 'individual' and d.pessoa_id = quem.pessoa_id)
       or (d.escopo = 'coletivo' and app.documento_alcanca_pessoa(d.id, quem.pessoa_id))
     );

  if not found then
    raise exception 'Documento não encontrado.' using errcode = '55000';
  end if;
  if doc.status <> 'publicado' then
    raise exception 'Este documento foi substituído por uma versão nova. Abra a versão atual para responder.'
      using errcode = '55000';
  end if;
  if not doc.exige_ciencia then
    raise exception 'Este documento não pede ciência.' using errcode = '55000';
  end if;
  if p_tipo = 'divergencia' and coalesce(length(v_justificativa), 0) < 20 then
    raise exception 'Explique a divergência com pelo menos 20 caracteres.' using errcode = '55000';
  end if;

  begin
    insert into ciencias (org_id, documento_id, documento_versao, documento_hash, pessoa_id,
                          usuario_id, tipo, justificativa, ip, user_agent)
    values (doc.org_id, doc.id, doc.versao, doc.arquivo_hash, quem.pessoa_id,
            quem.id, p_tipo,
            case when p_tipo = 'divergencia' then v_justificativa end,
            p_ip, left(p_user_agent, 500))
    returning * into nova;
  exception when unique_violation then
    raise exception 'Você já respondeu este documento.' using errcode = '55000';
  end;

  if p_tipo = 'divergencia' and doc.tipo_solicitacao_divergencia is not null then
    insert into solicitacoes (org_id, tipo, titulo, descricao, pessoa_id, documento_id, aberta_por)
    values (doc.org_id, doc.tipo_solicitacao_divergencia,
            left('Divergência: ' || doc.titulo, 200), v_justificativa,
            quem.pessoa_id, doc.id, quem.id)
    returning solicitacoes.id, solicitacoes.protocolo into sol_id, sol_protocolo;
  end if;

  return query select nova.id, nova.protocolo, nova.respondido_em, sol_id, sol_protocolo;
end $$;

comment on function public.registrar_ciencia(uuid, uuid, tipo_ciencia, text, inet, text) is
  'Único caminho de escrita em ciencias. DEFINER e só service_role: usuário da sessão, IP e user-agent vêm do servidor, nunca do navegador. Confere sozinha que o documento chega à pessoa.';

revoke all on function public.registrar_ciencia(uuid, uuid, tipo_ciencia, text, inet, text)
  from public, anon, authenticated;
grant execute on function public.registrar_ciencia(uuid, uuid, tipo_ciencia, text, inet, text)
  to service_role;
