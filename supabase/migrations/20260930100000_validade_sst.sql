-- =====================================================================
-- 0024 — SST: validade de ASO e treinamento, e o alerta a 30 dias (F5.2)
--
-- SST reaproveita `documentos` (docs/03: uma entidade para tudo que a pessoa
-- recebe, lê e dá ciência). Publicar norma, treinamento e ASO é o mesmo
-- fluxo da F3.1, com a mesma ciência. O que faltava é o documento ter
-- VALIDADE — o ASO e o certificado de treinamento vencem.
--
-- 1. `documento_tipos.validade` diz se o tipo vence e como se conta a
--    renovação:
--      `por_pessoa`  um vigente por pessoa — o ASO novo substitui o anterior,
--                    seja admissional, periódico ou de retorno;
--      `por_titulo`  um vigente por pessoa E título — "NR-35" não renova
--                    "NR-10". A renovação tem de repetir o título.
--    Nulo = não vence (comunicado, norma).
-- 2. `documentos.valido_ate` — quem publica informa. **Nenhuma duração é
--    inventada aqui:** a periodicidade do ASO depende do PCMSO e do risco, a
--    do treinamento, da NR; é dado do documento, não regra do sistema
--    (docs/06). Obrigatória ao publicar documento individual de tipo que
--    vence; em coletivo não se aplica (material de treinamento para todos
--    não é certificado de ninguém).
-- 3. `public.gerar_avisos_de_validade()` — o alerta a 30 dias, pelo mesmo job
--    da F4.3. Vai para a equipe de SST (`sst:editar`) que ENXERGA o documento:
--    categoria (ASO é `medico`) e escopo da pessoa, calculados para cada
--    destinatário. Idempotente: um aviso por documento e pessoa, para sempre.
-- =====================================================================

alter table documento_tipos
  add column validade text
    constraint documento_tipos_validade_valida check (validade in ('por_pessoa', 'por_titulo'));

comment on column documento_tipos.validade is
  'Se o tipo vence e como a renovação é contada: por_pessoa (ASO) ou por_titulo (treinamento). Nulo = não vence.';

alter table documentos add column valido_ate date;

comment on column documentos.valido_ate is
  'Até quando o documento vale (ASO, certificado de treinamento). Informado por quem publica; F5.2.';

create index documentos_valido_ate on documentos (valido_ate)
  where valido_ate is not null and status = 'publicado';

-- O ASO do seed passa a vencer. Tipos novos de SST (treinamento, norma) são
-- dado de organização — entram pelo seed, não por migração.
update documento_tipos set validade = 'por_pessoa' where chave = 'aso';

-- ---------------------------------------------------------------------
-- Validade na publicação. Roda DEPOIS de trg_documentos_ao_atualizar (ordem
-- alfabética), que já tranca tudo de um publicado.
-- ---------------------------------------------------------------------
create or replace function app.documento_validade()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  regra text;
begin
  if not app.sujeito_as_travas() or tg_op <> 'UPDATE'
     or not (old.status = 'rascunho' and new.status = 'publicado') then
    return new;
  end if;

  select t.validade into regra from documento_tipos t where t.id = new.tipo_id;

  if regra is null or new.escopo = 'coletivo' then
    new.valido_ate := null;
  elsif new.valido_ate is null then
    raise exception 'Informe até quando o documento vale antes de publicar.' using errcode = '55000';
  end if;
  return new;
end $$;

create trigger trg_documentos_validade
  before update on documentos
  for each row execute function app.documento_validade();

-- ---------------------------------------------------------------------
-- As perguntas de permissão, feitas para OUTRO usuário.
--
-- `app.tem_permissao`, `app.categoria_permitida` e o escopo respondem por
-- `auth.uid()` — o usuário do request. O job não tem usuário e precisa saber,
-- para cada destinatário, se ELE veria o documento. Estas três são o mesmo
-- cálculo com o usuário explícito, só para interno. O teste da F5.2 compara
-- o resultado com o que a própria RLS mostra ao usuário.
-- ---------------------------------------------------------------------
create or replace function app.usuario_tem_permissao(p_usuario uuid, p_modulo text, p_acao text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from usuario_perfis up
      join perfil_permissoes pp on pp.perfil_id = up.perfil_id
     where up.usuario_id = p_usuario and pp.modulo = p_modulo and pp.acao = p_acao
  )
$$;

create or replace function app.usuario_ve_categoria(p_usuario uuid, p_categoria categoria_doc)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_categoria in ('geral', 'contratual', 'sst')
      or exists (
        select 1 from usuario_perfis up
          join perfil_categorias pc on pc.perfil_id = up.perfil_id
         where up.usuario_id = p_usuario and pc.categoria = p_categoria
      )
$$;

-- Mesmo recorte de app.contratos_permitidos × app.unidades_permitidas ×
-- app.pessoas_no_escopo, para um interno qualquer. Sem escopo = total.
create or replace function app.usuario_alcanca_pessoa(p_usuario uuid, p_pessoa uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select not exists (select 1 from usuario_escopos e where e.usuario_id = p_usuario)
      or exists (
        select 1 from alocacoes a
         where a.pessoa_id = p_pessoa
           and exists (
             select 1 from usuario_escopos e
              where e.usuario_id = p_usuario
                and (e.contrato_id = a.contrato_id
                     or (e.contrato_id is null and e.unidade_id in
                         (select cu.unidade_id from contrato_unidades cu where cu.contrato_id = a.contrato_id))))
           and exists (
             select 1 from usuario_escopos e
              where e.usuario_id = p_usuario
                and (e.unidade_id = a.unidade_id
                     or (e.unidade_id is null and e.contrato_id in
                         (select cu.contrato_id from contrato_unidades cu where cu.unidade_id = a.unidade_id))))
      )
$$;

revoke all on function app.usuario_tem_permissao(uuid, text, text) from public, anon, authenticated;
revoke all on function app.usuario_ve_categoria(uuid, categoria_doc) from public, anon, authenticated;
revoke all on function app.usuario_alcanca_pessoa(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- O alerta a 30 dias
-- ---------------------------------------------------------------------
alter table notificacoes drop constraint notificacoes_motivo_valido;
alter table notificacoes
  add constraint notificacoes_motivo_valido
    check (motivo is null or motivo in ('publicado', 'lembrete', 'vencido', 'respondida', 'concluida', 'validade'));

create unique index notificacoes_uma_por_validade
  on notificacoes (usuario_id, canal, referencia_id, motivo)
  where motivo = 'validade';

create or replace function public.gerar_avisos_de_validade()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  hoje date := app.hoje();
  n integer;
begin
  with a_vencer as (
    select d.id, d.org_id, d.pessoa_id, t.categoria
      from documentos d
      join documento_tipos t on t.id = d.tipo_id and t.validade is not null
     where d.status = 'publicado'
       and d.escopo = 'individual'
       and d.valido_ate between hoje and hoje + 30
       -- já renovado: há outro publicado que vale mais
       and not exists (
         select 1 from documentos r
          where r.tipo_id = d.tipo_id and r.pessoa_id = d.pessoa_id and r.status = 'publicado'
            and r.valido_ate > d.valido_ate
            and (t.validade = 'por_pessoa' or lower(trim(r.titulo)) = lower(trim(d.titulo))))
       -- quem saiu não precisa renovar nada
       and exists (select 1 from alocacoes a where a.pessoa_id = d.pessoa_id and app.alocacao_vigente(a.status, a.data_fim))
  ),
  novos as (
    insert into notificacoes (org_id, usuario_id, canal, assunto, referencia_tipo, referencia_id, motivo)
    select v.org_id, u.id, c.canal, 'Documento de SST vence em até 30 dias', 'documentos', v.id, 'validade'
      from a_vencer v
      join usuarios u on u.org_id = v.org_id and u.tipo = 'interno' and u.status = 'ativo'
      cross join (values ('portal'), ('email')) as c(canal)
     where app.usuario_tem_permissao(u.id, 'sst', 'editar')
       and app.usuario_ve_categoria(u.id, v.categoria)
       and app.usuario_alcanca_pessoa(u.id, v.pessoa_id)
    on conflict (usuario_id, canal, referencia_id, motivo) where motivo = 'validade'
    do nothing
    returning canal
  )
  select count(*) filter (where canal = 'email') into n from novos;
  return n;
end $$;

comment on function public.gerar_avisos_de_validade() is
  'F5.2: aviso à equipe de SST que enxerga o documento, 30 dias antes do vencimento de ASO/treinamento não renovado. Idempotente. Só service_role (job).';

revoke all on function public.gerar_avisos_de_validade() from public, anon, authenticated;
grant execute on function public.gerar_avisos_de_validade() to service_role;
