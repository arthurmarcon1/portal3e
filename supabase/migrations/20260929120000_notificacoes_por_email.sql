-- =====================================================================
-- 0022 — Notificações por e-mail (F4.3)
--
-- O banco decide QUEM é avisado e DE QUÊ, gravando uma linha em
-- `notificacoes` com `canal = 'email'` e `status = 'pendente'`. O envio é
-- outro passo, do servidor (src/features/notificacoes/envio.ts), atrás de uma
-- flag: sem ela — ou sem RESEND_API_KEY —, as linhas ficam pendentes. Assim o
-- registro de "quem devia ter sido avisado" existe mesmo antes do provedor.
--
-- Os cinco avisos da F4.3 (docs/05):
--   `publicado`  documento publicado com prazo de ciência — trigger;
--   `lembrete`   no 3º dia da publicação, se ainda sem resposta e dentro do
--                prazo (decisão provisória, docs/06: com o prazo padrão de 5
--                dias é o mesmo dia que "2 dias antes do prazo") — job;
--   `vencido`    prazo passou sem resposta — job;
--   `respondida` a equipe interna respondeu ao solicitante (comentário
--                visível, ou pediu algo a ele, ou decidiu) — trigger;
--   `concluida`  solicitação concluída — trigger.
--
-- Os de job são idempotentes (índice único): rodar o job duas vezes não manda
-- dois lembretes. Os de trigger têm um freio de 5 minutos por solicitação e
-- motivo — comentar e mudar a situação no mesmo gesto não vira dois e-mails.
--
-- O conteúdo do e-mail não mora aqui: a linha guarda o motivo e a referência;
-- o texto sai de um modelo único no servidor, que só usa o primeiro nome.
-- =====================================================================

alter table notificacoes
  add column motivo text,
  add column tentativas integer not null default 0,
  add column erro text;

alter table notificacoes
  add constraint notificacoes_motivo_valido
    check (motivo is null or motivo in ('publicado', 'lembrete', 'vencido', 'respondida', 'concluida'));

comment on column notificacoes.motivo is
  'Por que o aviso existe (F4.3). Define o texto do e-mail no modelo do servidor.';

-- Lembrete e vencido: um por pessoa, documento e canal, para sempre.
create unique index notificacoes_uma_por_prazo
  on notificacoes (usuario_id, canal, referencia_id, motivo)
  where motivo in ('lembrete', 'vencido');

-- A fila do envio.
create index notificacoes_email_pendentes
  on notificacoes (criado_em)
  where canal = 'email' and status = 'pendente';

-- ---------------------------------------------------------------------
-- Ajudante: aviso por portal + e-mail, com o freio de 5 minutos
-- ---------------------------------------------------------------------
create or replace function app.avisar(
  p_org uuid,
  p_usuario uuid,
  p_motivo text,
  p_assunto text,
  p_referencia_tipo text,
  p_referencia uuid,
  p_so_email boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from notificacoes n
     where n.usuario_id = p_usuario and n.canal = 'email' and n.referencia_id = p_referencia
       and n.motivo = p_motivo and n.status = 'pendente'
       and n.criado_em > now() - interval '5 minutes'
  ) then
    return;
  end if;

  if not p_so_email then
    insert into notificacoes (org_id, usuario_id, canal, assunto, referencia_tipo, referencia_id, motivo)
    values (p_org, p_usuario, 'portal', p_assunto, p_referencia_tipo, p_referencia, p_motivo);
  end if;
  insert into notificacoes (org_id, usuario_id, canal, assunto, referencia_tipo, referencia_id, motivo)
  values (p_org, p_usuario, 'email', p_assunto, p_referencia_tipo, p_referencia, p_motivo);
end $$;

revoke all on function app.avisar(uuid, uuid, text, text, text, uuid, boolean) from public, authenticated;

-- ---------------------------------------------------------------------
-- `publicado`: a publicação (0015) já avisa no portal; agora também por
-- e-mail, quando há prazo de ciência.
-- ---------------------------------------------------------------------
create or replace function app.notificar_publicacao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'publicado' and old.status = 'rascunho' then
    insert into notificacoes (org_id, usuario_id, canal, assunto, corpo, referencia_tipo, referencia_id, motivo)
    select new.org_id, u.id, 'portal',
           case when new.versao > 1 then 'Documento retificado: ' else 'Novo documento: ' end || new.titulo,
           case when new.prazo_ciencia is not null
                then 'Confirme a leitura até ' || to_char(new.prazo_ciencia, 'DD/MM/YYYY') || '.'
           end,
           'documentos', new.id, 'publicado'
      from app.pessoas_alcancadas(new.id) p
      join usuarios u on u.pessoa_id = p.pessoa_id and u.org_id = new.org_id and u.status = 'ativo';

    -- E-mail só com prazo (F4.3: "documento publicado com prazo"). O assunto
    -- guardado aqui é para a tela interna; o e-mail sai do modelo, sem título.
    if new.prazo_ciencia is not null then
      insert into notificacoes (org_id, usuario_id, canal, assunto, referencia_tipo, referencia_id, motivo)
      select new.org_id, u.id, 'email', 'Documento para confirmar', 'documentos', new.id, 'publicado'
        from app.pessoas_alcancadas(new.id) p
        join usuarios u on u.pessoa_id = p.pessoa_id and u.org_id = new.org_id and u.status = 'ativo';
    end if;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------
-- `respondida` e `concluida`: pela linha do tempo da solicitação.
-- O evento de status é gravado pelo trigger da 0001; este lê o evento — não
-- grava outro.
-- ---------------------------------------------------------------------
create or replace function app.notificar_solicitacao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  sol record;
  autor_interno boolean;
  motivo text;
begin
  select s.id, s.org_id, s.aberta_por into sol from solicitacoes s where s.id = new.solicitacao_id;
  if not found or new.usuario_id = sol.aberta_por then
    return null;  -- o próprio solicitante não é avisado do que ele fez
  end if;

  if new.tipo = 'comentario' and not new.interno then
    select u.tipo = 'interno' into autor_interno from usuarios u where u.id = new.usuario_id;
    if coalesce(autor_interno, false) then motivo := 'respondida'; end if;
  elsif new.tipo = 'mudanca_status' then
    motivo := case
      when new.status_novo = 'concluida' then 'concluida'
      when new.status_novo in ('pendente_solicitante', 'aprovada', 'recusada') then 'respondida'
    end;
  end if;

  if motivo is not null then
    perform app.avisar(
      sol.org_id, sol.aberta_por, motivo,
      case motivo when 'concluida' then 'Solicitação concluída' else 'Solicitação respondida' end,
      'solicitacoes', sol.id);
  end if;
  return null;
end $$;

create trigger trg_eventos_notificar
  after insert on solicitacao_eventos
  for each row execute function app.notificar_solicitacao();

-- ---------------------------------------------------------------------
-- `lembrete` e `vencido`: pelo job. Idempotente pelo índice único.
-- Só `service_role` executa — é tarefa de sistema, não de usuário.
-- ---------------------------------------------------------------------
create or replace function public.gerar_avisos_de_prazo()
returns table (lembretes integer, vencidos integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  hoje date := app.hoje();
  n_lembretes integer;
  n_vencidos integer;
begin
  with pendentes as (
    select d.id as documento_id, d.org_id, d.prazo_ciencia,
           (d.publicado_em at time zone 'America/Sao_Paulo')::date as publicado_dia,
           u.id as usuario_id
      from documentos d
      join documento_tipos t on t.id = d.tipo_id and t.exige_ciencia
      cross join lateral app.pessoas_alcancadas(d.id) p
      join usuarios u on u.pessoa_id = p.pessoa_id and u.org_id = d.org_id and u.status = 'ativo'
     where d.status = 'publicado'
       and d.prazo_ciencia is not null
       and not exists (select 1 from ciencias c where c.documento_id = d.id and c.pessoa_id = p.pessoa_id)
  ),
  novos as (
    insert into notificacoes (org_id, usuario_id, canal, assunto, referencia_tipo, referencia_id, motivo)
    select x.org_id, x.usuario_id, c.canal,
           case x.motivo when 'lembrete' then 'Lembrete: documento para confirmar'
                         else 'Prazo de confirmação vencido' end,
           'documentos', x.documento_id, x.motivo
      from (
        select *, case when hoje > prazo_ciencia then 'vencido' else 'lembrete' end as motivo
          from pendentes
         where hoje > prazo_ciencia
            or hoje >= publicado_dia + 3   -- 3º dia da publicação (docs/06)
      ) x
      cross join (values ('portal'), ('email')) as c(canal)
    on conflict (usuario_id, canal, referencia_id, motivo) where motivo in ('lembrete', 'vencido')
    do nothing
    returning motivo, canal
  )
  select count(*) filter (where motivo = 'lembrete' and canal = 'email'),
         count(*) filter (where motivo = 'vencido' and canal = 'email')
    into n_lembretes, n_vencidos
    from novos;

  return query select n_lembretes, n_vencidos;
end $$;

comment on function public.gerar_avisos_de_prazo() is
  'Lembrete no 3º dia da publicação e aviso de prazo vencido, por pessoa sem ciência. Idempotente. Só service_role (job).';

revoke all on function public.gerar_avisos_de_prazo() from public, anon, authenticated;
grant execute on function public.gerar_avisos_de_prazo() to service_role;
