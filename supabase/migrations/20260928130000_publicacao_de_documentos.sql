-- =====================================================================
-- 0015 — Publicação de documentos (F3.1)
--
-- O que a F3.1 precisa do banco, e o que o banco tem de garantir sozinho
-- para que a tela não seja a única barreira:
--
-- A. Bucket privado `documentos` (invariante 3). Sem nenhuma policy em
--    `storage.objects` para ele: nenhum client fala com o Storage. Upload e
--    URL assinada saem do servidor, depois de a RLS de `documentos` decidir.
--
-- B. Escrita em `documentos` respeita categoria e escopo. As policies de
--    escrita da 0008 exigiam só `documentos:editar`: Contratos/Coordenação
--    (categoria `jornada` apenas) conseguia INSERIR holerite, e um interno
--    com escopo no 042 conseguia criar documento individual para pessoa do
--    077. Só não "via" o que criou — o `RETURNING` falhava —, mas um insert
--    sem retorno passava. Agora escrever pede o mesmo que ler rascunho
--    (0010): categoria liberada e pessoa no escopo. E INSERT só cria
--    rascunho: publicar é sempre uma transição, nunca um insert.
--
-- C. Publicado não volta atrás. Depois de publicado, a única mudança aceita
--    é ir para `arquivado`; arquivado não muda mais. Rascunho pode ser
--    apagado; publicado e arquivado não. `publicado_em`/`publicado_por` são
--    carimbados pelo banco, não informados pelo app. Prazo de ciência nasce
--    do padrão do tipo (0014) quando não vier preenchido, e não pode ser
--    anterior à publicação.
--
-- D. Retificação: versão nova aponta para a publicada que substitui, com
--    mesmo tipo, escopo e pessoa, e `versao` calculada aqui. Publicar a nova
--    arquiva a anterior na mesma transação — a v1 fica preservada, com as
--    ciências dela, e sai da lista de pendências. Uma versão só substitui
--    cada documento.
--
-- E. Público-alvo só muda enquanto o documento é rascunho, e só por interno.
--
-- F. Publicar gera a notificação (canal `portal`) de cada destinatário na
--    mesma transação. E-mail é da F4.3.
--
-- G. Duas funções de leitura para a tela: categorias que o usuário pode
--    usar (a regra continua só em `app.categoria_permitida`) e o resumo de
--    ciência de um documento (quantos alcança, quantos responderam).
--
-- Tudo isto vale para `authenticated`. `service_role` e `postgres` (seed,
-- fixture de teste, rotina de retenção) ficam de fora das travas de C/D, de
-- propósito e só elas: a RLS já não se aplica a eles.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Bucket
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 8388608, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- B. Escrita com categoria e escopo
-- ---------------------------------------------------------------------
create or replace function app.pode_escrever_documento(
  p_tipo uuid,
  p_escopo escopo_documento,
  p_pessoa uuid
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select app.tipo() = 'interno'
     and app.tem_permissao('documentos','editar')
     and app.categoria_permitida((select t.categoria from documento_tipos t where t.id = p_tipo))
     and (
       p_escopo = 'coletivo'
       or app.escopo_total()
       or p_pessoa in (select app.pessoas_no_escopo())
     )
$$;

comment on function app.pode_escrever_documento(uuid, escopo_documento, uuid) is
  'Mesmo filtro da leitura de rascunho (0010): interno, documentos:editar, categoria liberada e escopo.';

drop policy documentos_escrita_insercao on documentos;
drop policy documentos_escrita_atualizacao on documentos;
drop policy documentos_escrita_exclusao on documentos;

create policy documentos_escrita_insercao on documentos for insert to authenticated
  with check (
    org_id = app.org_id()
    and status = 'rascunho'
    and app.pode_escrever_documento(tipo_id, escopo, pessoa_id)
  );

create policy documentos_escrita_atualizacao on documentos for update to authenticated
  using (
    org_id = app.org_id()
    and app.pode_escrever_documento(tipo_id, escopo, pessoa_id)
  )
  with check (
    org_id = app.org_id()
    and app.pode_escrever_documento(tipo_id, escopo, pessoa_id)
  );

create policy documentos_escrita_exclusao on documentos for delete to authenticated
  using (
    org_id = app.org_id()
    and status = 'rascunho'
    and app.pode_escrever_documento(tipo_id, escopo, pessoa_id)
  );

-- ---------------------------------------------------------------------
-- C + D. Ciclo de vida
-- ---------------------------------------------------------------------

-- Quem está sujeito às travas. Fora: service_role (fixture, jobs) e os
-- papéis administrativos que rodam migração e seed.
create or replace function app.sujeito_as_travas()
returns boolean
language sql
stable
as $$
  select current_user not in ('service_role', 'postgres', 'supabase_admin')
$$;

-- Hoje em Brasília: prazo é data civil, e o servidor roda em UTC.
create or replace function app.hoje()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

create or replace function app.documento_ao_inserir()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  anterior record;
begin
  if not app.sujeito_as_travas() then
    return new;
  end if;

  -- Carimbos de publicação não se informam: o banco põe ao publicar.
  new.publicado_em := null;
  new.publicado_por := null;

  if new.substitui_id is null then
    new.versao := 1;
    return new;
  end if;

  -- Lida com a RLS de quem insere: retificar pede enxergar o original.
  select d.versao, d.tipo_id, d.escopo, d.pessoa_id, d.status
    into anterior
    from documentos d
   where d.id = new.substitui_id;

  if not found then
    raise exception 'Documento a retificar não encontrado.' using errcode = '55000';
  end if;
  if anterior.status <> 'publicado' then
    raise exception 'Só documento publicado pode ser retificado.' using errcode = '55000';
  end if;
  if anterior.tipo_id <> new.tipo_id
     or anterior.escopo <> new.escopo
     or anterior.pessoa_id is distinct from new.pessoa_id then
    raise exception 'A retificação mantém o tipo, o escopo e a pessoa do documento original.'
      using errcode = '55000';
  end if;

  new.versao := anterior.versao + 1;
  return new;
end $$;

create trigger trg_documentos_ao_inserir
  before insert on documentos
  for each row execute function app.documento_ao_inserir();

create or replace function app.documento_ao_atualizar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  tipo record;
  sem_status documentos;
begin
  if not app.sujeito_as_travas() then
    return new;
  end if;

  -- Arquivado é final.
  if old.status = 'arquivado' then
    raise exception 'Documento arquivado não pode ser alterado.' using errcode = '55000';
  end if;

  -- Publicado: só pode ir para arquivado, e nada mais muda junto.
  if old.status = 'publicado' then
    sem_status := new;
    sem_status.status := old.status;
    sem_status.atualizado_em := old.atualizado_em;
    if new.status <> 'arquivado' or sem_status is distinct from old then
      raise exception 'Documento publicado não pode ser alterado. Para corrigir, retifique: isso cria uma versão nova.'
        using errcode = '55000';
    end if;
    return new;
  end if;

  -- Rascunho. Versão e origem da retificação são fixadas no insert.
  if new.versao <> old.versao or new.substitui_id is distinct from old.substitui_id then
    raise exception 'Versão e documento substituído não se alteram.' using errcode = '55000';
  end if;

  if new.status = 'arquivado' then
    raise exception 'Rascunho não é arquivado: exclua-o.' using errcode = '55000';
  end if;

  if new.status = 'rascunho' then
    new.publicado_em := null;
    new.publicado_por := null;
    return new;
  end if;

  -- Rascunho → publicado.
  new.publicado_em := now();
  new.publicado_por := auth.uid();

  if new.escopo = 'coletivo'
     and not exists (select 1 from documento_destinatarios d where d.documento_id = new.id) then
    raise exception 'Documento coletivo precisa de ao menos um público antes de publicar.'
      using errcode = '55000';
  end if;

  select t.exige_ciencia, t.prazo_ciencia_dias into tipo
    from documento_tipos t where t.id = new.tipo_id;

  if tipo.exige_ciencia then
    new.prazo_ciencia := coalesce(new.prazo_ciencia, app.hoje() + coalesce(tipo.prazo_ciencia_dias, 0));
    if new.prazo_ciencia < app.hoje() then
      raise exception 'O prazo de ciência não pode ser anterior à data de publicação.'
        using errcode = '55000';
    end if;
  else
    new.prazo_ciencia := null;
  end if;

  return new;
end $$;

create trigger trg_documentos_ao_atualizar
  before update on documentos
  for each row execute function app.documento_ao_atualizar();

create or replace function app.documento_ao_excluir()
returns trigger
language plpgsql
as $$
begin
  if app.sujeito_as_travas() and old.status <> 'rascunho' then
    raise exception 'Documento publicado não pode ser excluído, só arquivado.' using errcode = '55000';
  end if;
  return old;
end $$;

-- A policy de exclusão já filtra rascunho; o trigger transforma o "0 linhas"
-- silencioso em erro se uma policy mais larga aparecer amanhã.
create trigger trg_documentos_ao_excluir
  before delete on documentos
  for each row execute function app.documento_ao_excluir();

create unique index documentos_substitui_unico
  on documentos (substitui_id) where substitui_id is not null;

-- ---------------------------------------------------------------------
-- F. Quem o documento alcança, e a notificação ao publicar
-- ---------------------------------------------------------------------

-- DEFINER: o coletivo alcança pessoas que quem publica pode não enxergar
-- (interno com escopo publicando para a organização). Não é concedida a
-- `authenticated`: só o trigger e o resumo abaixo a chamam.
create or replace function app.pessoas_alcancadas(p_documento uuid)
returns table (pessoa_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.pessoa_id
    from documentos d
   where d.id = p_documento and d.escopo = 'individual'
  union
  select distinct a.pessoa_id
    from documentos d
    join documento_destinatarios dd on dd.documento_id = d.id
    join alocacoes a on a.org_id = d.org_id and a.status <> 'encerrada'
   where d.id = p_documento
     and d.escopo = 'coletivo'
     and (dd.contrato_id is null or dd.contrato_id = a.contrato_id)
     and (dd.unidade_id  is null or dd.unidade_id  = a.unidade_id)
     and (dd.funcao      is null or dd.funcao      = a.funcao)
$$;

comment on function app.pessoas_alcancadas(uuid) is
  'Pessoas que o documento alcança: o titular, ou as alocações vigentes que casam com algum público do coletivo. Mesma regra de app.documento_alcanca_pessoa.';

create or replace function app.notificar_publicacao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'publicado' and old.status = 'rascunho' then
    insert into notificacoes (org_id, usuario_id, canal, assunto, corpo, referencia_tipo, referencia_id)
    select new.org_id, u.id, 'portal',
           case when new.versao > 1 then 'Documento retificado: ' else 'Novo documento: ' end || new.titulo,
           case when new.prazo_ciencia is not null
                then 'Confirme a leitura até ' || to_char(new.prazo_ciencia, 'DD/MM/YYYY') || '.'
           end,
           'documentos', new.id
      from app.pessoas_alcancadas(new.id) p
      join usuarios u on u.pessoa_id = p.pessoa_id and u.org_id = new.org_id and u.status = 'ativo';
  end if;
  return null;
end $$;

-- DEFINER porque `notificacoes` não aceita insert de `authenticated`.
-- Roda na transação do UPDATE: publicação e aviso entram ou saem juntos.
create trigger trg_documentos_notificar
  after update on documentos
  for each row execute function app.notificar_publicacao();

-- Publicar a versão nova arquiva a anterior. Roda como quem publica: a RLS
-- e a trava de C continuam valendo (publicado → arquivado é permitido).
create or replace function app.arquivar_versao_substituida()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'publicado' and old.status = 'rascunho' and new.substitui_id is not null then
    update documentos set status = 'arquivado'
     where id = new.substitui_id and status = 'publicado';
  end if;
  return null;
end $$;

create trigger trg_documentos_arquivar_anterior
  after update on documentos
  for each row execute function app.arquivar_versao_substituida();

-- ---------------------------------------------------------------------
-- E. Público-alvo só em rascunho
-- ---------------------------------------------------------------------
drop policy destinatarios_escrita_insercao on documento_destinatarios;
drop policy destinatarios_escrita_atualizacao on documento_destinatarios;
drop policy destinatarios_escrita_exclusao on documento_destinatarios;

-- A subconsulta roda sob a RLS de `documentos`: só alcança o rascunho que
-- quem escreve pode ler (0010). Sem ciclo: `documentos` não lê esta tabela
-- por policy, só por função DEFINER.
create policy destinatarios_escrita_insercao on documento_destinatarios for insert to authenticated
  with check (
    app.tipo() = 'interno'
    and app.tem_permissao('documentos','editar')
    and exists (select 1 from documentos d where d.id = documento_id and d.status = 'rascunho')
  );

create policy destinatarios_escrita_atualizacao on documento_destinatarios for update to authenticated
  using (
    app.tipo() = 'interno'
    and app.tem_permissao('documentos','editar')
    and exists (select 1 from documentos d where d.id = documento_id and d.status = 'rascunho')
  )
  with check (
    app.tipo() = 'interno'
    and app.tem_permissao('documentos','editar')
    and exists (select 1 from documentos d where d.id = documento_id and d.status = 'rascunho')
  );

create policy destinatarios_escrita_exclusao on documento_destinatarios for delete to authenticated
  using (
    app.tipo() = 'interno'
    and app.tem_permissao('documentos','editar')
    and exists (select 1 from documentos d where d.id = documento_id and d.status = 'rascunho')
  );

-- ---------------------------------------------------------------------
-- G. Leitura para a tela
-- ---------------------------------------------------------------------

-- Categorias que o usuário pode usar. A regra não é repetida: a função só
-- pergunta a `app.categoria_permitida` por cada valor do enum.
create or replace function public.categorias_permitidas()
returns setof categoria_doc
language sql
stable
set search_path = public, pg_temp
as $$
  select c from unnest(enum_range(null::categoria_doc)) c where app.categoria_permitida(c)
$$;

-- Parte DEFINER: conta sobre `app.pessoas_alcancadas` e `ciencias` inteiras.
-- Só números, e só chamada por `public.resumo_do_documento`.
create or replace function app.resumo_do_documento(p_documento uuid)
returns table (destinatarios integer, confirmadas integer, divergencias integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with alcance as (select pessoa_id from app.pessoas_alcancadas(p_documento))
  select
    (select count(*) from alcance)::integer,
    (select count(*) from ciencias c
      where c.documento_id = p_documento and c.tipo = 'confirmacao')::integer,
    (select count(*) from ciencias c
      where c.documento_id = p_documento and c.tipo = 'divergencia')::integer
$$;

-- Parte INVOKER: a porta. Só responde sobre documento que a RLS deixa o
-- usuário ler, e só a interno com `documentos:ver`. Documento invisível
-- devolve zero linhas — igual a documento inexistente.
create or replace function public.resumo_do_documento(p_documento uuid)
returns table (destinatarios integer, confirmadas integer, divergencias integer)
language sql
stable
set search_path = public, pg_temp
as $$
  select r.*
    from app.resumo_do_documento(p_documento) r
   where app.tipo() = 'interno'
     and app.tem_permissao('documentos','ver')
     and exists (select 1 from documentos d where d.id = p_documento)
$$;

revoke all on function app.pessoas_alcancadas(uuid) from public, authenticated;
grant execute on function app.pode_escrever_documento(uuid, escopo_documento, uuid) to authenticated;
grant execute on function app.sujeito_as_travas() to authenticated;
grant execute on function app.hoje() to authenticated;
grant execute on function app.resumo_do_documento(uuid) to authenticated;
revoke all on function public.categorias_permitidas() from public, anon;
revoke all on function public.resumo_do_documento(uuid) from public, anon;
grant execute on function public.categorias_permitidas() to authenticated;
grant execute on function public.resumo_do_documento(uuid) to authenticated;
