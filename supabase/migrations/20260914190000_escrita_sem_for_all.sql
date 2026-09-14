-- =====================================================================
-- 0008 — `for all` deixa de dar SELECT: escopo e categoria voltam a valer
--
-- O bug, encontrado ao cobrir a 0007 com teste:
--
--   No Postgres, o `USING` de uma policy `FOR ALL` vale para TODOS os
--   comandos — SELECT inclusive. E policies permissivas se somam por OR. O
--   resultado é que cada policy `*_escrita` escrita como `for all` virou,
--   sem que ninguém pedisse, uma segunda porta de leitura larga: quem tem a
--   permissão de editar lê a tabela inteira da organização, e a policy
--   `*_leitura` — com todo o seu cuidado de escopo e de categoria — nunca
--   chega a ser consultada, porque o OR já foi satisfeito.
--
-- Medido no seed antes desta migração, com escopo no contrato 042:
--
--   | persona                          | pessoas visíveis |
--   |----------------------------------|------------------|
--   | Coordenação (pessoas:ver)        | 14  (correto)    |
--   | RH/DP (pessoas:editar)           | 30  (a org toda) |
--
-- O caso mais grave não é esse. `documentos_escrita` tem a mesma forma, e
-- `documentos_leitura` é justamente quem chama `app.categoria_permitida()`.
-- Ou seja: qualquer interno com `documentos:editar` lia documento das
-- categorias `medico`, `bancario` e `folha` de qualquer pessoa da
-- organização. Isso é a invariante 4 do CLAUDE.md — "dado sensível é
-- bloqueado por padrão" — furada no schema, não no código.
--
-- A correção: trocar cada `for all` por INSERT + UPDATE + DELETE explícitos,
-- com os MESMOS predicados de antes. Nenhuma escrita muda de comportamento;
-- o que desaparece é a concessão de leitura que ninguém tinha pedido. A
-- partir daqui, quem decide SELECT é sempre e somente a policy `_leitura`.
--
-- Por que não bastou ajustar `pessoas`: o erro é de forma, não de tabela. As
-- 15 policies nasceram do mesmo molde, então todas carregam o mesmo furo.
--
-- Regra para daqui em diante: **policy de escrita nunca usa `for all`.**
-- Se precisar dos três comandos, são três policies.
-- =====================================================================

-- contratos
drop policy contratos_escrita on contratos;

create policy contratos_escrita_insercao on contratos for insert to authenticated
  with check (org_id = app.org_id() and app.tem_permissao('contratos','editar'));

create policy contratos_escrita_atualizacao on contratos for update to authenticated
  using (org_id = app.org_id() and app.tem_permissao('contratos','editar'))
  with check (org_id = app.org_id() and app.tem_permissao('contratos','editar'));

create policy contratos_escrita_exclusao on contratos for delete to authenticated
  using (org_id = app.org_id() and app.tem_permissao('contratos','editar'));

-- unidades
drop policy unidades_escrita on unidades;

create policy unidades_escrita_insercao on unidades for insert to authenticated
  with check (org_id = app.org_id() and app.tem_permissao('contratos','editar'));

create policy unidades_escrita_atualizacao on unidades for update to authenticated
  using (org_id = app.org_id() and app.tem_permissao('contratos','editar'))
  with check (org_id = app.org_id() and app.tem_permissao('contratos','editar'));

create policy unidades_escrita_exclusao on unidades for delete to authenticated
  using (org_id = app.org_id() and app.tem_permissao('contratos','editar'));

-- pessoas
drop policy pessoas_escrita on pessoas;

create policy pessoas_escrita_insercao on pessoas for insert to authenticated
  with check (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('pessoas','editar'));

create policy pessoas_escrita_atualizacao on pessoas for update to authenticated
  using (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('pessoas','editar'))
  with check (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('pessoas','editar'));

create policy pessoas_escrita_exclusao on pessoas for delete to authenticated
  using (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('pessoas','editar'));

-- usuarios
drop policy usuarios_escrita on usuarios;

create policy usuarios_escrita_insercao on usuarios for insert to authenticated
  with check (org_id = app.org_id() and app.tem_permissao('administracao','editar'));

create policy usuarios_escrita_atualizacao on usuarios for update to authenticated
  using (org_id = app.org_id() and app.tem_permissao('administracao','editar'))
  with check (org_id = app.org_id() and app.tem_permissao('administracao','editar'));

create policy usuarios_escrita_exclusao on usuarios for delete to authenticated
  using (org_id = app.org_id() and app.tem_permissao('administracao','editar'));

-- alocacoes
drop policy alocacoes_escrita on alocacoes;

create policy alocacoes_escrita_insercao on alocacoes for insert to authenticated
  with check (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('pessoas','editar'));

create policy alocacoes_escrita_atualizacao on alocacoes for update to authenticated
  using (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('pessoas','editar'))
  with check (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('pessoas','editar'));

create policy alocacoes_escrita_exclusao on alocacoes for delete to authenticated
  using (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('pessoas','editar'));

-- perfis
drop policy perfis_escrita on perfis;

create policy perfis_escrita_insercao on perfis for insert to authenticated
  with check (org_id = app.org_id() and app.tem_permissao('administracao','editar'));

create policy perfis_escrita_atualizacao on perfis for update to authenticated
  using (org_id = app.org_id() and app.tem_permissao('administracao','editar'))
  with check (org_id = app.org_id() and app.tem_permissao('administracao','editar'));

create policy perfis_escrita_exclusao on perfis for delete to authenticated
  using (org_id = app.org_id() and app.tem_permissao('administracao','editar'));

-- perfil_permissoes
drop policy perfil_permissoes_escrita on perfil_permissoes;

create policy perfil_permissoes_escrita_insercao on perfil_permissoes for insert to authenticated
  with check (app.tem_permissao('administracao','editar')
         and exists (select 1 from perfis p where p.id = perfil_id and p.org_id = app.org_id()));

create policy perfil_permissoes_escrita_atualizacao on perfil_permissoes for update to authenticated
  using (app.tem_permissao('administracao','editar')
         and exists (select 1 from perfis p where p.id = perfil_id and p.org_id = app.org_id()))
  with check (app.tem_permissao('administracao','editar')
         and exists (select 1 from perfis p where p.id = perfil_id and p.org_id = app.org_id()));

create policy perfil_permissoes_escrita_exclusao on perfil_permissoes for delete to authenticated
  using (app.tem_permissao('administracao','editar')
         and exists (select 1 from perfis p where p.id = perfil_id and p.org_id = app.org_id()));

-- usuario_perfis
drop policy usuario_perfis_escrita on usuario_perfis;

create policy usuario_perfis_escrita_insercao on usuario_perfis for insert to authenticated
  with check (app.tem_permissao('administracao','editar'));

create policy usuario_perfis_escrita_atualizacao on usuario_perfis for update to authenticated
  using (app.tem_permissao('administracao','editar'))
  with check (app.tem_permissao('administracao','editar'));

create policy usuario_perfis_escrita_exclusao on usuario_perfis for delete to authenticated
  using (app.tem_permissao('administracao','editar'));

-- usuario_escopos
drop policy usuario_escopos_escrita on usuario_escopos;

create policy usuario_escopos_escrita_insercao on usuario_escopos for insert to authenticated
  with check (app.tem_permissao('administracao','editar'));

create policy usuario_escopos_escrita_atualizacao on usuario_escopos for update to authenticated
  using (app.tem_permissao('administracao','editar'))
  with check (app.tem_permissao('administracao','editar'));

create policy usuario_escopos_escrita_exclusao on usuario_escopos for delete to authenticated
  using (app.tem_permissao('administracao','editar'));

-- documento_tipos
drop policy documento_tipos_escrita on documento_tipos;

create policy documento_tipos_escrita_insercao on documento_tipos for insert to authenticated
  with check (org_id = app.org_id() and app.tem_permissao('administracao','editar'));

create policy documento_tipos_escrita_atualizacao on documento_tipos for update to authenticated
  using (org_id = app.org_id() and app.tem_permissao('administracao','editar'))
  with check (org_id = app.org_id() and app.tem_permissao('administracao','editar'));

create policy documento_tipos_escrita_exclusao on documento_tipos for delete to authenticated
  using (org_id = app.org_id() and app.tem_permissao('administracao','editar'));

-- documentos
drop policy documentos_escrita on documentos;

create policy documentos_escrita_insercao on documentos for insert to authenticated
  with check (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('documentos','editar'));

create policy documentos_escrita_atualizacao on documentos for update to authenticated
  using (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('documentos','editar'))
  with check (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('documentos','editar'));

create policy documentos_escrita_exclusao on documentos for delete to authenticated
  using (org_id = app.org_id() and app.tipo() = 'interno' and app.tem_permissao('documentos','editar'));

-- documento_destinatarios
drop policy destinatarios_escrita on documento_destinatarios;

create policy destinatarios_escrita_insercao on documento_destinatarios for insert to authenticated
  with check (app.tem_permissao('documentos','editar'));

create policy destinatarios_escrita_atualizacao on documento_destinatarios for update to authenticated
  using (app.tem_permissao('documentos','editar'))
  with check (app.tem_permissao('documentos','editar'));

create policy destinatarios_escrita_exclusao on documento_destinatarios for delete to authenticated
  using (app.tem_permissao('documentos','editar'));

-- contratantes
drop policy contratantes_escrita on contratantes;

create policy contratantes_escrita_insercao on contratantes for insert to authenticated
  with check (org_id = app.org_id() and app.tem_permissao('contratos', 'editar'));

create policy contratantes_escrita_atualizacao on contratantes for update to authenticated
  using (org_id = app.org_id() and app.tem_permissao('contratos', 'editar'))
  with check (org_id = app.org_id() and app.tem_permissao('contratos', 'editar'));

create policy contratantes_escrita_exclusao on contratantes for delete to authenticated
  using (org_id = app.org_id() and app.tem_permissao('contratos', 'editar'));

-- contrato_unidades
drop policy contrato_unidades_escrita on contrato_unidades;

create policy contrato_unidades_escrita_insercao on contrato_unidades for insert to authenticated
  with check (app.tem_permissao('contratos', 'editar')
         and exists (select 1 from contratos c
                     where c.id = contrato_unidades.contrato_id and c.org_id = app.org_id())
         and exists (select 1 from unidades u
                     where u.id = contrato_unidades.unidade_id and u.org_id = app.org_id()));

create policy contrato_unidades_escrita_atualizacao on contrato_unidades for update to authenticated
  using (app.tem_permissao('contratos', 'editar')
         and exists (select 1 from contratos c
                     where c.id = contrato_unidades.contrato_id and c.org_id = app.org_id())
         and exists (select 1 from unidades u
                     where u.id = contrato_unidades.unidade_id and u.org_id = app.org_id()))
  with check (app.tem_permissao('contratos', 'editar')
         and exists (select 1 from contratos c
                     where c.id = contrato_unidades.contrato_id and c.org_id = app.org_id())
         and exists (select 1 from unidades u
                     where u.id = contrato_unidades.unidade_id and u.org_id = app.org_id()));

create policy contrato_unidades_escrita_exclusao on contrato_unidades for delete to authenticated
  using (app.tem_permissao('contratos', 'editar')
         and exists (select 1 from contratos c
                     where c.id = contrato_unidades.contrato_id and c.org_id = app.org_id())
         and exists (select 1 from unidades u
                     where u.id = contrato_unidades.unidade_id and u.org_id = app.org_id()));

-- perfil_categorias
drop policy perfil_categorias_escrita on perfil_categorias;

create policy perfil_categorias_escrita_insercao on perfil_categorias for insert to authenticated
  with check (app.tem_permissao('administracao', 'editar')
         and exists (select 1 from perfis p where p.id = perfil_id and p.org_id = app.org_id()));

create policy perfil_categorias_escrita_atualizacao on perfil_categorias for update to authenticated
  using (app.tem_permissao('administracao', 'editar')
         and exists (select 1 from perfis p where p.id = perfil_id and p.org_id = app.org_id()))
  with check (app.tem_permissao('administracao', 'editar')
         and exists (select 1 from perfis p where p.id = perfil_id and p.org_id = app.org_id()));

create policy perfil_categorias_escrita_exclusao on perfil_categorias for delete to authenticated
  using (app.tem_permissao('administracao', 'editar')
         and exists (select 1 from perfis p where p.id = perfil_id and p.org_id = app.org_id()));

