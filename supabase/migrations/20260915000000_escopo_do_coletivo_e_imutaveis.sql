-- =====================================================================
-- 0012 — Coletivo respeita o escopo do contratante; imutáveis recusam alto
--
-- Três defeitos, os três encontrados pelos testes de RLS da F2.3
-- (tests/rls/), cada um visto falhando antes desta migração.
--
-- ---------------------------------------------------------------------
-- A. Contratante lia documento coletivo de qualquer contrato
--
-- O ramo "terceiros" de `documentos_leitura` aceitava `escopo = 'coletivo'`
-- sem olhar para quem o coletivo foi dirigido. Resultado medido: o fiscal do
-- contrato 042 (Hospital São Lucas) lia o comunicado dirigido ao 077 (Rede
-- Bom Preço), e um contratante SEM escopo nenhum lia todo coletivo publicado
-- da organização. docs/02 diz que o contratante é "sempre limitado ao(s)
-- contrato(s) e unidade(s) do escopo do usuário", e docs/03 espera "0 linhas
-- em tudo" para contratante sem escopo. Vem da 0001.
--
-- Correção: para contratante, coletivo só quando algum destinatário cai no
-- escopo dele — mesma interseção contrato × unidade de `pessoas_no_escopo`.
--
-- **Interno não muda.** Interno com escopo continua lendo todo coletivo da
-- organização, exatamente como antes. Se isso deve mudar é regra de
-- permissão sem resposta nos docs; está em docs/06.
--
-- ---------------------------------------------------------------------
-- B. `documento_destinatarios` legível para a organização inteira
--
-- Regressão da 0010. A 0001 dizia "leio o destinatário se leio o documento"
-- — só que por subconsulta que voltava para `documentos` e recursava. A 0010
-- quebrou a recursão trocando a pergunta por "o documento é da minha
-- organização", o que abriu o público-alvo de todo documento (inclusive
-- rascunho, inclusive coletivo de outro cliente) a qualquer usuário da org.
--
-- A recursão não existe mais: desde a 0010, `documentos_leitura` só chega a
-- `documento_destinatarios` por funções SECURITY DEFINER. Então dá para
-- voltar à regra original, agora sem ciclo.
--
-- ---------------------------------------------------------------------
-- C. Imutáveis que recusavam em silêncio
--
-- `ciencias` não tem policy de UPDATE nem DELETE (invariante 7), e
-- `auditoria` não tem nenhuma de escrita. Com RLS, isso faz o UPDATE devolver
-- "0 linhas afetadas" SEM erro: quem tenta reescrever uma ciência não
-- distingue "proibido" de "não encontrado", e a imutabilidade depende de
-- ninguém nunca criar uma policy por engano.
--
-- REVOKE tira o privilégio da tabela, antes da RLS: a tentativa passa a
-- falhar com 42501, e uma policy criada por descuido amanhã não reabre nada.
-- `service_role` não é afetada (o log continua sendo escrito pelo servidor, e
-- a rotina de expurgo continua possível).
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. O coletivo alcança o escopo de quem lê
-- ---------------------------------------------------------------------
create or replace function app.documento_no_escopo(p_documento uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from documento_destinatarios d
    where d.documento_id = p_documento
      and (d.contrato_id is null or d.contrato_id in (select app.contratos_permitidos()))
      and (d.unidade_id  is null or d.unidade_id  in (select app.unidades_permitidas()))
  )
$$;

comment on function app.documento_no_escopo(uuid) is
  'Algum destinatário do coletivo cai no escopo (contrato × unidade) do usuário. DEFINER: consultada de dentro de documentos_leitura.';

grant execute on function app.documento_no_escopo(uuid) to authenticated;

drop policy documentos_leitura on documentos;

create policy documentos_leitura on documentos for select to authenticated
  using (
    org_id = app.org_id()
    and status = 'publicado'
    and (
      -- 1. o titular sempre vê o próprio documento, qualquer categoria
      (escopo = 'individual' and pessoa_id = app.pessoa_id())
      -- 2. coletivo direcionado ao contrato/unidade/função do funcionário
      or (escopo = 'coletivo' and app.tipo() = 'funcionario'
          and app.documento_alcanca_pessoa(id, app.pessoa_id()))
      -- 3. terceiros: precisa de permissão, escopo e categoria liberada
      or (app.tipo() <> 'funcionario'
          and app.tem_permissao('documentos','ver')
          and app.categoria_permitida((select t.categoria from documento_tipos t where t.id = tipo_id))
          and (
            -- Coletivo: interno lê todos (inalterado, ver docs/06); contratante
            -- só o que foi dirigido a contrato/unidade do escopo dele.
            (escopo = 'coletivo'
             and (app.tipo() = 'interno' or app.documento_no_escopo(id)))
            or app.escopo_total()
            or pessoa_id in (select app.pessoas_no_escopo())
          ))
    )
  );

-- ---------------------------------------------------------------------
-- B. Destinatário é legível por quem lê o documento
--
-- A subconsulta roda sob a RLS de `documentos` — é isso que se quer. Não há
-- ciclo: nenhuma policy de `documentos` consulta esta tabela diretamente.
-- ---------------------------------------------------------------------
drop policy destinatarios_leitura on documento_destinatarios;

create policy destinatarios_leitura on documento_destinatarios for select to authenticated
  using (exists (select 1 from documentos d where d.id = documento_id));

-- `app.documento_da_org` ficou sem uso. Sai, para ninguém a reaproveitar
-- achando que é a regra certa de leitura.
drop function app.documento_da_org(uuid);

-- ---------------------------------------------------------------------
-- C. Imutáveis
-- ---------------------------------------------------------------------
revoke update, delete on ciencias from anon, authenticated;
revoke insert, update, delete on auditoria from anon, authenticated;
