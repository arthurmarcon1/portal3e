-- =====================================================================
-- 0017 — Registro de ciência e divergência (F3.4)
--
-- A. Mapeamento "tipo de documento → tipo de solicitação da divergência"
--    vira coluna em `documento_tipos`, não `switch` no código. Decisão
--    PROVISÓRIA de 2026-09-28 (docs/06): espelho → `correcao_ponto`,
--    comunicado e norma interna → `outro`. **Nunca `ocorrencia`**: em
--    docs/02 ocorrência é o que o contratante abre sobre a operação e cai na
--    fila dele; divergência de funcionário sobre um documento é outro
--    assunto, outro responsável. Muda quando a Fase 4 decidir o SLA e quando
--    holerite e ASO ganharem tela — por isso é dado.
--
-- B. `public.registrar_ciencia()`: a ciência e, se for divergência, a
--    solicitação vinculada, na MESMA transação. Ciência é imutável
--    (invariante 7): se a solicitação falhasse depois de a ciência gravada,
--    não haveria como desfazer — ficaria divergência sem ninguém para
--    tratá-la. SECURITY INVOKER: cada insert passa pela RLS de quem responde
--    (`ciencias_insert`, `solicitacoes_insert`), e a leitura do documento
--    também. Versão e hash vêm do documento lido, não do cliente — a prova
--    diz a qual arquivo a pessoa respondeu.
--
-- C. Bucket privado `anexos` (docs/03: `{org_id}/solicitacoes/{id}/{uuid}`),
--    para a foto da divergência. Sem policy em `storage.objects`, como o de
--    documentos.
--
-- D. `anexos_insert` passa a exigir que a solicitação seja visível a quem
--    anexa. Pedia só organização e autor: qualquer usuário da organização
--    podia pendurar arquivo na solicitação de outra pessoa. Vem da 0001.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Mapeamento
-- ---------------------------------------------------------------------
alter table documento_tipos
  add column tipo_solicitacao_divergencia tipo_solicitacao;

alter table documento_tipos
  add constraint documento_tipos_divergencia_so_com_ciencia
    check (exige_ciencia or tipo_solicitacao_divergencia is null);

comment on column documento_tipos.tipo_solicitacao_divergencia is
  'Tipo da solicitação aberta automaticamente quando alguém registra divergência. NULL = a divergência fica só na ciência, sem solicitação (ex.: tipo ainda sem fluxo definido).';

-- ---------------------------------------------------------------------
-- B. Registro
-- ---------------------------------------------------------------------

-- Mínimo da justificativa da divergência (docs/05, F3.4). A constraint da
-- 0001 (> 10) continua como piso do banco; este é o da regra de produto.
create or replace function public.registrar_ciencia(
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
security invoker
set search_path = public, pg_temp
as $$
declare
  doc record;
  nova ciencias;
  -- Escalares, não `record`: ler campo de record nunca atribuído (caso da
  -- confirmação, que não abre solicitação) é erro em plpgsql.
  sol_id uuid;
  sol_protocolo text;
  v_justificativa text := nullif(trim(coalesce(p_justificativa, '')), '');
begin
  if app.tipo() <> 'funcionario' or app.pessoa_id() is null then
    raise exception 'Só o funcionário a quem o documento foi enviado pode dar ciência.'
      using errcode = '55000';
  end if;

  -- Lido pela RLS de quem responde: documento que não chega a ela não existe.
  select d.id, d.org_id, d.titulo, d.versao, d.arquivo_hash, d.status,
         t.exige_ciencia, t.tipo_solicitacao_divergencia
    into doc
    from documentos d
    join documento_tipos t on t.id = d.tipo_id
   where d.id = p_documento;

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
    values (doc.org_id, doc.id, doc.versao, doc.arquivo_hash, app.pessoa_id(),
            auth.uid(), p_tipo,
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
            app.pessoa_id(), doc.id, auth.uid())
    returning solicitacoes.id, solicitacoes.protocolo into sol_id, sol_protocolo;
  end if;

  return query select nova.id, nova.protocolo, nova.respondido_em, sol_id, sol_protocolo;
end $$;

comment on function public.registrar_ciencia(uuid, tipo_ciencia, text, inet, text) is
  'Ciência + solicitação da divergência numa transação. INVOKER: a RLS de quem responde decide cada passo.';

revoke all on function public.registrar_ciencia(uuid, tipo_ciencia, text, inet, text) from public, anon;
grant execute on function public.registrar_ciencia(uuid, tipo_ciencia, text, inet, text) to authenticated;

-- ---------------------------------------------------------------------
-- C. Bucket de anexos
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anexos', 'anexos', false, 8388608,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- D. Anexo só em solicitação que quem anexa enxerga
-- ---------------------------------------------------------------------
drop policy anexos_insert on anexos;

create policy anexos_insert on anexos for insert to authenticated
  with check (
    org_id = app.org_id()
    and enviado_por = auth.uid()
    and exists (select 1 from solicitacoes s where s.id = solicitacao_id)
  );
