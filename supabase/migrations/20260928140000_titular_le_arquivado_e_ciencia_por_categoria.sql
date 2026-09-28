-- =====================================================================
-- 0016 — O titular lê o que arquivou-se; ciência respeita categoria
--
-- Dois furos achados na F3.1, corrigidos antes de ela fechar.
--
-- ---------------------------------------------------------------------
-- A. Documento arquivado ficava invisível para o próprio titular
--
-- `documentos_leitura` exige `status = 'publicado'` em todos os ramos. Desde
-- a 0015, publicar uma retificação arquiva a versão anterior — então o
-- funcionário que confirmou a v1 perdia o acesso a ela, e a linha dele em
-- `ciencias` passava a apontar para um documento que ele não abre. Dispara na
-- primeira retificação de espelho, que é rotina mensal, e apaga da vista de
-- quem assinou justamente a prova que o produto existe para guardar.
--
-- A regra já estava no desenho — "o titular sempre vê o próprio documento,
-- qualquer categoria" — e passa a valer também para qualquer status que já
-- tenha sido publicado: `publicado` e `arquivado`. **Rascunho não**: rascunho
-- nunca foi entregue a ninguém.
--
-- O mesmo vale para o coletivo que a pessoa respondeu: comunicado retificado
-- arquiva a v1 igual a espelho. Ali não há titular, então o critério é ter
-- respondido (`app.respondeu`) — quem deu ciência lê aquilo a que deu
-- ciência. Coletivo arquivado que a pessoa não respondeu continua fora da
-- vista dela: não há prova a preservar, e ela não precisa de uma versão
-- substituída.
--
-- Terceiros não mudam: interno e contratante continuam lendo só publicado
-- (e rascunho/arquivado por `documentos_leitura_nao_publicado`, para quem
-- edita).
--
-- ---------------------------------------------------------------------
-- B. `ciencias_leitura` ignorava a categoria do documento
--
-- O ramo de terceiros pedia `documentos:ver` e escopo, mas não
-- `app.categoria_permitida()`. A justificativa de uma divergência num ASO
-- pode conter informação de saúde, e estava legível para quem não pode abrir
-- o ASO — Suporte/Auditoria, por exemplo. Invariante 4 furada pela porta dos
-- fundos. Vem da 0001.
--
-- Agora o terceiro precisa da mesma categoria que a leitura do documento
-- exige. O titular continua lendo a própria ciência sempre.
--
-- As duas perguntas que cruzam tabela viram funções SECURITY DEFINER, pelo
-- mesmo motivo da 0010: `documentos_leitura` passa a olhar `ciencias`, e
-- `ciencias_leitura` passa a olhar `documentos`. Por subconsulta, uma policy
-- chamaria a outra sem fim (42P17).
-- =====================================================================

create or replace function app.respondeu(p_documento uuid, p_pessoa uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from ciencias c
    where c.documento_id = p_documento and c.pessoa_id = p_pessoa
  )
$$;

comment on function app.respondeu(uuid, uuid) is
  'A pessoa registrou ciência (confirmação ou divergência) neste documento. DEFINER: consultada de dentro de documentos_leitura, e ciencias_leitura consulta documentos.';

create or replace function app.categoria_do_documento(p_documento uuid)
returns categoria_doc
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.categoria
    from documentos d
    join documento_tipos t on t.id = d.tipo_id
   where d.id = p_documento
$$;

comment on function app.categoria_do_documento(uuid) is
  'Categoria do tipo do documento. DEFINER: consultada de dentro de ciencias_leitura sem passar pela RLS de documentos.';

grant execute on function app.respondeu(uuid, uuid) to authenticated;
grant execute on function app.categoria_do_documento(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- A. Leitura de documento
-- ---------------------------------------------------------------------
drop policy documentos_leitura on documentos;

create policy documentos_leitura on documentos for select to authenticated
  using (
    org_id = app.org_id()
    and (
      -- 1. o titular sempre vê o próprio documento, qualquer categoria e
      --    qualquer status que já tenha sido publicado
      (escopo = 'individual' and pessoa_id = app.pessoa_id()
       and status in ('publicado', 'arquivado'))
      -- 2. coletivo direcionado ao contrato/unidade/função do funcionário
      or (escopo = 'coletivo' and app.tipo() = 'funcionario' and status = 'publicado'
          and app.documento_alcanca_pessoa(id, app.pessoa_id()))
      -- 2b. coletivo arquivado que o funcionário respondeu: a prova fica com ele
      or (escopo = 'coletivo' and app.tipo() = 'funcionario' and status = 'arquivado'
          and app.respondeu(id, app.pessoa_id()))
      -- 3. terceiros: só publicado, com permissão, escopo e categoria liberada
      or (app.tipo() <> 'funcionario'
          and status = 'publicado'
          and app.tem_permissao('documentos','ver')
          and app.categoria_permitida((select t.categoria from documento_tipos t where t.id = tipo_id))
          and (
            (escopo = 'coletivo'
             and (app.tipo() = 'interno' or app.documento_no_escopo(id)))
            or app.escopo_total()
            or pessoa_id in (select app.pessoas_no_escopo())
          ))
    )
  );

-- ---------------------------------------------------------------------
-- B. Leitura de ciência
-- ---------------------------------------------------------------------
drop policy ciencias_leitura on ciencias;

create policy ciencias_leitura on ciencias for select to authenticated
  using (
    org_id = app.org_id()
    and (
      -- o titular sempre lê a própria ciência
      pessoa_id = app.pessoa_id()
      -- terceiros: permissão, escopo e a categoria do documento
      or (app.tem_permissao('documentos','ver')
          and (app.escopo_total() or pessoa_id in (select app.pessoas_no_escopo()))
          and app.categoria_permitida(app.categoria_do_documento(documento_id)))
    )
  );
