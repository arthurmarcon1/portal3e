-- =====================================================================
-- 0013 — Quem edita a estrutura comercial volta a enxergá-la inteira
--
-- Perda (a) da varredura da 0008, corrigida com o mesmo padrão da 0010
-- (rascunho): uma policy de SELECT separada devolve a leitura que o `for all`
-- concedia sem ninguém ter pedido.
--
-- ---------------------------------------------------------------------
-- O defeito
--
-- Antes da 0008, `contratos_escrita`, `unidades_escrita`,
-- `contratantes_escrita` e `contrato_unidades_escrita` eram `for all` com
-- USING = "da minha organização e tenho `contratos:editar`". Esse USING valia
-- para SELECT: quem edita estrutura comercial lia a da organização inteira.
-- A 0008 separou os comandos e sobrou só a `*_leitura`, que filtra pelo
-- escopo (`app.contratos_permitidos()` / `app.unidades_permitidas()`).
--
-- Para interno SEM escopo, nada mudou. Para interno COM escopo e
-- `contratos:editar`, duas coisas quebraram:
--
--   1. não lê contrato, unidade nem contratante fora do escopo;
--   2. não CRIA nenhum dos três. O registro novo não pertence a contrato
--      nenhum do escopo, e `INSERT ... RETURNING` passa pela policy de
--      SELECT: 42501 "new row violates row-level security policy". Medido
--      em 2026-09-15 no projeto dev, com Contratos/Coordenação e escopo no
--      042 — contratante, unidade e contrato, os três.
--
-- Não era latente: a F2.1 entregou a tela que atribui escopo. Quebraria na
-- primeira vez que alguém usasse, com um 42501 que ninguém ligaria ao escopo.
--
-- ---------------------------------------------------------------------
-- A correção
--
-- Leitura da estrutura da organização inteira para interno com
-- `contratos:editar` — exatamente o conjunto que a 0008 tirou, e nada além:
--
-- - Interno com escopo e só `contratos:ver` continua vendo só o escopo
--   (já era assim antes da 0008).
-- - `app.tipo() = 'interno'` é estrutural, como na 0009: nenhum perfil de
--   contratante tem `contratos:editar` na matriz de docs/02, mas permissão é
--   dado, e um insert amanhã não pode abrir a estrutura de todos os clientes.
-- - Nada muda em pessoas, alocações nem documentos: `app.pessoas_no_escopo()`
--   continua lendo `usuario_escopos`, então quem edita contratos com escopo no
--   042 segue sem ver pessoa do 077. Estrutura comercial não é dado de pessoa
--   (mesma linha da regra do coletivo, docs/02).
--
-- `contrato_unidades` entra junto: `sincronizarUnidades` lê e apaga vínculos,
-- e UPDATE/DELETE também precisam enxergar a linha pela policy de SELECT —
-- sem isso, editar as unidades de um contrato fora do escopo seria no-op
-- silencioso.
-- =====================================================================

create policy contratos_leitura_quem_edita on contratos for select to authenticated
  using (
    org_id = app.org_id()
    and app.tipo() = 'interno'
    and app.tem_permissao('contratos', 'editar')
  );

create policy unidades_leitura_quem_edita on unidades for select to authenticated
  using (
    org_id = app.org_id()
    and app.tipo() = 'interno'
    and app.tem_permissao('contratos', 'editar')
  );

create policy contratantes_leitura_quem_edita on contratantes for select to authenticated
  using (
    org_id = app.org_id()
    and app.tipo() = 'interno'
    and app.tem_permissao('contratos', 'editar')
  );

-- A subconsulta em `contratos` roda sob a RLS dela, e para quem passa nos
-- dois primeiros predicados a policy acima já libera a organização inteira —
-- então o `exists` só corta vínculo de outra organização. Sem ciclo: nenhuma
-- policy de `contratos` consulta `contrato_unidades`.
create policy contrato_unidades_leitura_quem_edita on contrato_unidades for select to authenticated
  using (
    app.tipo() = 'interno'
    and app.tem_permissao('contratos', 'editar')
    and exists (select 1 from contratos c
                where c.id = contrato_unidades.contrato_id and c.org_id = app.org_id())
  );
