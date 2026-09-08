-- =====================================================================
-- Portal 3e — seed
--
-- Dados FICTÍCIOS para desenvolvimento e teste. Nenhum dado real de
-- funcionário entra aqui: o quadro real chega pela importação de planilha
-- (F1.3), nunca pelo seed.
--
-- Fonte da verdade das permissões: docs/02-matriz-permissoes.md.
-- Se divergir do que está lá, o errado é este arquivo.
--
-- Idempotente: apaga o que semeou antes e recria. Pode rodar quantas vezes
-- quiser em banco de desenvolvimento.
--
-- Aplicar no projeto remoto:  npx supabase db push --include-seed
-- =====================================================================

-- crypt()/gen_salt() vêm do pgcrypto, que no Supabase gerenciado fica no
-- schema `extensions` e não no search_path padrão desta conexão. Incluir os
-- dois schemas funciona nos dois casos (gerenciado e local).
set search_path = public, extensions;

-- ---------------------------------------------------------------------
-- Limpeza — ordem de dependência, escopo restrito à organização '3e'.
-- ---------------------------------------------------------------------
delete from auth.users where email like '%@func.3e.portal3e'
   or email in ('admin_geral@3e.com.br','rh_dp@3e.com.br','contratos@3e.com.br','financeiro@3e.com.br','sst@3e.com.br','suporte_auditoria@3e.com.br','gestor.contrato@hsaolucas.com.br','fiscal@hsaolucas.com.br','gestor.unidade@hsaolucas.com.br','adm.financeiro@bompreco.com.br');

do $$
declare v_org uuid;
begin
  select id into v_org from organizacoes where slug = '3e';
  if v_org is null then return; end if;

  delete from auditoria            where org_id = v_org;
  delete from notificacoes         where org_id = v_org;
  delete from ciencias             where org_id = v_org;
  delete from documento_destinatarios where documento_id in (select id from documentos where org_id = v_org);
  delete from solicitacao_eventos  where solicitacao_id in (select id from solicitacoes where org_id = v_org);
  delete from anexos               where org_id = v_org;
  delete from solicitacoes         where org_id = v_org;
  delete from documentos           where org_id = v_org;
  delete from documento_tipos      where org_id = v_org;
  delete from alocacoes            where org_id = v_org;
  delete from pessoas              where org_id = v_org;
  delete from contrato_unidades    where contrato_id in (select id from contratos where org_id = v_org);
  delete from contratos            where org_id = v_org;
  delete from unidades             where org_id = v_org;
  delete from contratantes         where org_id = v_org;
  delete from perfil_categorias    where perfil_id in (select id from perfis where org_id = v_org);
  delete from perfil_permissoes    where perfil_id in (select id from perfis where org_id = v_org);
  delete from perfis               where org_id = v_org;
  delete from organizacoes         where id = v_org;
end $$;

-- ---------------------------------------------------------------------
-- Organização (tenant)
-- ---------------------------------------------------------------------
insert into organizacoes (id, nome, cnpj, slug) values
  ('1fac8b3c-4860-5606-836b-ca4c8dd420d0', '3e Gestao de Pessoas', '09876543000199', '3e');

-- ---------------------------------------------------------------------
-- Perfis — 6 internos + 4 de contratante (docs/02)
-- ---------------------------------------------------------------------
insert into perfis (id, org_id, chave, nome, aplica_a, descricao) values
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'admin_geral', 'Administrador geral', 'interno', 'Acesso total. Nunca deve ser uma pessoa só.'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'rh_dp', 'RH / DP', 'interno', 'Cadastro, documentos, jornada e solicitações.'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'contratos', 'Contratos / Coordenação', 'interno', 'Estrutura comercial, publica espelho e trata contestação.'),
  ('cbaf2fb8-aef6-5297-b142-fd430c1ef24e', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'financeiro', 'Financeiro', 'interno', 'Faturamento, folha e bancário.'),
  ('840c335b-3dc4-59a9-8db6-29617ed44acb', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'sst', 'SST', 'interno', 'Saúde e segurança do trabalho.'),
  ('e2167a38-534d-52c9-b71d-3e298d1afafe', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'suporte_auditoria', 'Suporte / Auditoria', 'interno', 'Somente leitura, incluindo a trilha de auditoria.'),
  ('991e4ba6-788a-5d79-9197-3342fa955521', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'gestor_contrato', 'Gestor do contrato', 'contratante', 'Responsável pelo contrato no cliente.'),
  ('cb994b78-0287-5a88-b97d-bd99968e1a04', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'fiscal', 'Fiscal do contrato', 'contratante', 'Acompanha a execução no dia a dia.'),
  ('74d1d972-c4ea-558b-8d3b-de8f44221dc3', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'gestor_unidade', 'Gestor da unidade', 'contratante', 'Responsável por uma unidade específica.'),
  ('6d628744-e8d3-546a-ade5-7bec104c6581', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'adm_financeiro', 'Administrativo / Financeiro', 'contratante', 'Faturamento e relatórios do cliente.');

-- ---------------------------------------------------------------------
-- perfil_permissoes — transcrição literal das duas tabelas de docs/02
-- ---------------------------------------------------------------------
insert into perfil_permissoes (perfil_id, modulo, acao) values
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'pessoas', 'ver'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'pessoas', 'criar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'pessoas', 'editar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'pessoas', 'excluir'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'pessoas', 'exportar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'contratos', 'ver'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'contratos', 'criar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'contratos', 'editar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'contratos', 'excluir'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'contratos', 'exportar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'documentos', 'ver'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'documentos', 'criar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'documentos', 'editar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'documentos', 'excluir'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'documentos', 'exportar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'jornada', 'ver'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'jornada', 'criar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'jornada', 'editar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'jornada', 'excluir'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'jornada', 'exportar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'solicitacoes', 'ver'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'solicitacoes', 'criar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'solicitacoes', 'editar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'solicitacoes', 'excluir'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'solicitacoes', 'exportar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'comunicacao', 'ver'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'comunicacao', 'criar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'comunicacao', 'editar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'comunicacao', 'excluir'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'comunicacao', 'exportar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'sst', 'ver'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'sst', 'criar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'sst', 'editar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'sst', 'excluir'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'sst', 'exportar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'relatorios', 'ver'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'relatorios', 'exportar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'administracao', 'ver'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'administracao', 'criar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'administracao', 'editar'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'administracao', 'excluir'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'administracao', 'exportar'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'pessoas', 'ver'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'pessoas', 'criar'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'pessoas', 'editar'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'pessoas', 'exportar'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'contratos', 'ver'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'documentos', 'ver'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'documentos', 'criar'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'documentos', 'editar'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'documentos', 'exportar'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'jornada', 'ver'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'jornada', 'criar'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'jornada', 'editar'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'jornada', 'exportar'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'solicitacoes', 'ver'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'solicitacoes', 'criar'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'solicitacoes', 'editar'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'solicitacoes', 'exportar'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'comunicacao', 'ver'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'comunicacao', 'criar'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'comunicacao', 'editar'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'comunicacao', 'exportar'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'sst', 'ver'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'relatorios', 'ver'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'relatorios', 'exportar'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'pessoas', 'ver'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'pessoas', 'exportar'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'contratos', 'ver'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'contratos', 'criar'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'contratos', 'editar'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'contratos', 'exportar'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'documentos', 'ver'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'documentos', 'criar'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'documentos', 'editar'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'documentos', 'exportar'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'jornada', 'ver'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'jornada', 'exportar'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'solicitacoes', 'ver'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'solicitacoes', 'criar'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'solicitacoes', 'editar'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'solicitacoes', 'exportar'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'comunicacao', 'ver'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'comunicacao', 'criar'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'comunicacao', 'editar'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'comunicacao', 'exportar'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'sst', 'ver'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'relatorios', 'ver'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'relatorios', 'exportar'),
  ('cbaf2fb8-aef6-5297-b142-fd430c1ef24e', 'pessoas', 'ver'),
  ('cbaf2fb8-aef6-5297-b142-fd430c1ef24e', 'contratos', 'ver'),
  ('cbaf2fb8-aef6-5297-b142-fd430c1ef24e', 'contratos', 'exportar'),
  ('cbaf2fb8-aef6-5297-b142-fd430c1ef24e', 'documentos', 'ver'),
  ('cbaf2fb8-aef6-5297-b142-fd430c1ef24e', 'documentos', 'criar'),
  ('cbaf2fb8-aef6-5297-b142-fd430c1ef24e', 'documentos', 'editar'),
  ('cbaf2fb8-aef6-5297-b142-fd430c1ef24e', 'documentos', 'exportar'),
  ('cbaf2fb8-aef6-5297-b142-fd430c1ef24e', 'jornada', 'ver'),
  ('cbaf2fb8-aef6-5297-b142-fd430c1ef24e', 'jornada', 'exportar'),
  ('cbaf2fb8-aef6-5297-b142-fd430c1ef24e', 'solicitacoes', 'ver'),
  ('cbaf2fb8-aef6-5297-b142-fd430c1ef24e', 'solicitacoes', 'exportar'),
  ('cbaf2fb8-aef6-5297-b142-fd430c1ef24e', 'relatorios', 'ver'),
  ('cbaf2fb8-aef6-5297-b142-fd430c1ef24e', 'relatorios', 'exportar'),
  ('840c335b-3dc4-59a9-8db6-29617ed44acb', 'pessoas', 'ver'),
  ('840c335b-3dc4-59a9-8db6-29617ed44acb', 'contratos', 'ver'),
  ('840c335b-3dc4-59a9-8db6-29617ed44acb', 'documentos', 'ver'),
  ('840c335b-3dc4-59a9-8db6-29617ed44acb', 'documentos', 'criar'),
  ('840c335b-3dc4-59a9-8db6-29617ed44acb', 'documentos', 'editar'),
  ('840c335b-3dc4-59a9-8db6-29617ed44acb', 'documentos', 'exportar'),
  ('840c335b-3dc4-59a9-8db6-29617ed44acb', 'solicitacoes', 'ver'),
  ('840c335b-3dc4-59a9-8db6-29617ed44acb', 'solicitacoes', 'criar'),
  ('840c335b-3dc4-59a9-8db6-29617ed44acb', 'solicitacoes', 'editar'),
  ('840c335b-3dc4-59a9-8db6-29617ed44acb', 'comunicacao', 'ver'),
  ('840c335b-3dc4-59a9-8db6-29617ed44acb', 'comunicacao', 'criar'),
  ('840c335b-3dc4-59a9-8db6-29617ed44acb', 'comunicacao', 'editar'),
  ('840c335b-3dc4-59a9-8db6-29617ed44acb', 'comunicacao', 'exportar'),
  ('840c335b-3dc4-59a9-8db6-29617ed44acb', 'sst', 'ver'),
  ('840c335b-3dc4-59a9-8db6-29617ed44acb', 'sst', 'criar'),
  ('840c335b-3dc4-59a9-8db6-29617ed44acb', 'sst', 'editar'),
  ('840c335b-3dc4-59a9-8db6-29617ed44acb', 'sst', 'excluir'),
  ('840c335b-3dc4-59a9-8db6-29617ed44acb', 'sst', 'exportar'),
  ('840c335b-3dc4-59a9-8db6-29617ed44acb', 'relatorios', 'ver'),
  ('840c335b-3dc4-59a9-8db6-29617ed44acb', 'relatorios', 'exportar'),
  ('e2167a38-534d-52c9-b71d-3e298d1afafe', 'pessoas', 'ver'),
  ('e2167a38-534d-52c9-b71d-3e298d1afafe', 'contratos', 'ver'),
  ('e2167a38-534d-52c9-b71d-3e298d1afafe', 'documentos', 'ver'),
  ('e2167a38-534d-52c9-b71d-3e298d1afafe', 'jornada', 'ver'),
  ('e2167a38-534d-52c9-b71d-3e298d1afafe', 'solicitacoes', 'ver'),
  ('e2167a38-534d-52c9-b71d-3e298d1afafe', 'comunicacao', 'ver'),
  ('e2167a38-534d-52c9-b71d-3e298d1afafe', 'sst', 'ver'),
  ('e2167a38-534d-52c9-b71d-3e298d1afafe', 'relatorios', 'ver'),
  ('e2167a38-534d-52c9-b71d-3e298d1afafe', 'relatorios', 'exportar'),
  ('e2167a38-534d-52c9-b71d-3e298d1afafe', 'administracao', 'ver'),
  ('991e4ba6-788a-5d79-9197-3342fa955521', 'pessoas', 'ver'),
  ('991e4ba6-788a-5d79-9197-3342fa955521', 'pessoas', 'exportar'),
  ('991e4ba6-788a-5d79-9197-3342fa955521', 'contratos', 'ver'),
  ('991e4ba6-788a-5d79-9197-3342fa955521', 'contratos', 'exportar'),
  ('991e4ba6-788a-5d79-9197-3342fa955521', 'documentos', 'ver'),
  ('991e4ba6-788a-5d79-9197-3342fa955521', 'documentos', 'exportar'),
  ('991e4ba6-788a-5d79-9197-3342fa955521', 'jornada', 'ver'),
  ('991e4ba6-788a-5d79-9197-3342fa955521', 'jornada', 'exportar'),
  ('991e4ba6-788a-5d79-9197-3342fa955521', 'solicitacoes', 'ver'),
  ('991e4ba6-788a-5d79-9197-3342fa955521', 'solicitacoes', 'criar'),
  ('991e4ba6-788a-5d79-9197-3342fa955521', 'solicitacoes', 'editar'),
  ('991e4ba6-788a-5d79-9197-3342fa955521', 'solicitacoes', 'exportar'),
  ('991e4ba6-788a-5d79-9197-3342fa955521', 'comunicacao', 'ver'),
  ('991e4ba6-788a-5d79-9197-3342fa955521', 'sst', 'ver'),
  ('991e4ba6-788a-5d79-9197-3342fa955521', 'sst', 'exportar'),
  ('991e4ba6-788a-5d79-9197-3342fa955521', 'relatorios', 'ver'),
  ('991e4ba6-788a-5d79-9197-3342fa955521', 'relatorios', 'exportar'),
  ('cb994b78-0287-5a88-b97d-bd99968e1a04', 'pessoas', 'ver'),
  ('cb994b78-0287-5a88-b97d-bd99968e1a04', 'contratos', 'ver'),
  ('cb994b78-0287-5a88-b97d-bd99968e1a04', 'documentos', 'ver'),
  ('cb994b78-0287-5a88-b97d-bd99968e1a04', 'jornada', 'ver'),
  ('cb994b78-0287-5a88-b97d-bd99968e1a04', 'solicitacoes', 'ver'),
  ('cb994b78-0287-5a88-b97d-bd99968e1a04', 'solicitacoes', 'criar'),
  ('cb994b78-0287-5a88-b97d-bd99968e1a04', 'solicitacoes', 'editar'),
  ('cb994b78-0287-5a88-b97d-bd99968e1a04', 'comunicacao', 'ver'),
  ('cb994b78-0287-5a88-b97d-bd99968e1a04', 'sst', 'ver'),
  ('cb994b78-0287-5a88-b97d-bd99968e1a04', 'relatorios', 'ver'),
  ('74d1d972-c4ea-558b-8d3b-de8f44221dc3', 'pessoas', 'ver'),
  ('74d1d972-c4ea-558b-8d3b-de8f44221dc3', 'contratos', 'ver'),
  ('74d1d972-c4ea-558b-8d3b-de8f44221dc3', 'documentos', 'ver'),
  ('74d1d972-c4ea-558b-8d3b-de8f44221dc3', 'jornada', 'ver'),
  ('74d1d972-c4ea-558b-8d3b-de8f44221dc3', 'solicitacoes', 'ver'),
  ('74d1d972-c4ea-558b-8d3b-de8f44221dc3', 'solicitacoes', 'criar'),
  ('74d1d972-c4ea-558b-8d3b-de8f44221dc3', 'solicitacoes', 'editar'),
  ('74d1d972-c4ea-558b-8d3b-de8f44221dc3', 'comunicacao', 'ver'),
  ('74d1d972-c4ea-558b-8d3b-de8f44221dc3', 'sst', 'ver'),
  ('74d1d972-c4ea-558b-8d3b-de8f44221dc3', 'relatorios', 'ver'),
  ('74d1d972-c4ea-558b-8d3b-de8f44221dc3', 'relatorios', 'exportar'),
  ('6d628744-e8d3-546a-ade5-7bec104c6581', 'pessoas', 'ver'),
  ('6d628744-e8d3-546a-ade5-7bec104c6581', 'contratos', 'ver'),
  ('6d628744-e8d3-546a-ade5-7bec104c6581', 'contratos', 'exportar'),
  ('6d628744-e8d3-546a-ade5-7bec104c6581', 'documentos', 'ver'),
  ('6d628744-e8d3-546a-ade5-7bec104c6581', 'documentos', 'exportar'),
  ('6d628744-e8d3-546a-ade5-7bec104c6581', 'jornada', 'ver'),
  ('6d628744-e8d3-546a-ade5-7bec104c6581', 'jornada', 'exportar'),
  ('6d628744-e8d3-546a-ade5-7bec104c6581', 'solicitacoes', 'ver'),
  ('6d628744-e8d3-546a-ade5-7bec104c6581', 'solicitacoes', 'criar'),
  ('6d628744-e8d3-546a-ade5-7bec104c6581', 'relatorios', 'ver'),
  ('6d628744-e8d3-546a-ade5-7bec104c6581', 'relatorios', 'exportar');

-- ---------------------------------------------------------------------
-- perfil_categorias — categorias RESTRITAS por perfil (migração 0003).
-- 'geral', 'contratual' e 'sst' são abertas e não entram aqui.
-- O contratante nunca entra: o teto dele é invariante de produto, fica em
-- app.categoria_permitida(), não em configuração.
-- ---------------------------------------------------------------------
insert into perfil_categorias (perfil_id, categoria) values
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'medico'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'bancario'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'folha'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'pessoal'),
  ('fe9f7afe-04a3-582c-89c7-12f65d68018b', 'jornada'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'medico'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'folha'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'pessoal'),
  ('9d433605-659e-5ba4-a24e-b1c0d498d71c', 'jornada'),
  ('d6b929c4-ffe1-5efd-b53e-0797a7993a38', 'jornada'),
  ('cbaf2fb8-aef6-5297-b142-fd430c1ef24e', 'bancario'),
  ('cbaf2fb8-aef6-5297-b142-fd430c1ef24e', 'folha'),
  ('cbaf2fb8-aef6-5297-b142-fd430c1ef24e', 'jornada'),
  ('840c335b-3dc4-59a9-8db6-29617ed44acb', 'medico');

-- ---------------------------------------------------------------------
-- documento_tipos
-- retencao_meses fica NULL de propósito: o prazo de guarda por categoria é
-- decisão do jurídico, ainda aberta em docs/06.
-- ---------------------------------------------------------------------
insert into documento_tipos (id, org_id, chave, nome, categoria, exige_ciencia, exige_2fa, retencao_meses) values
  -- Categoria e flags definidas na migração 0004.
  ('941fb37f-659c-5222-9dfd-f2fc3b893e37', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'espelho_ponto', 'Espelho de ponto', 'jornada', true, false, null),
  ('fa73e13b-2b1c-54fe-b0f3-ed9702d3dab2', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'comunicado', 'Comunicado', 'geral', true, false, null),
  -- Aberta: mesma visibilidade de 'geral' e 'sst'.
  ('d71f6f1d-1129-5685-a465-bd727e0ddfb1', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'norma_interna', 'Norma interna', 'geral', true, false, null),
  -- docs/02: medico = ASO, CID, atestado.
  ('a5ea6ce3-223a-5b48-b69c-9be2c7bcc720', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'aso', 'ASO', 'medico', true, false, null),
  -- docs/02: 2FA para folha e benefícios.
  ('485e0b90-d471-5f86-ac73-b942a9d8759e', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'holerite', 'Holerite', 'folha', true, true, null),
  -- Fecha para contratante; Financeiro precisa ver as verbas.
  ('c54b23ba-0906-5f3b-a177-9c5f87924ba0', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'termo_rescisao', 'Termo de rescisão', 'folha', true, true, null),
  -- Contém salário: fora do alcance do contratante.
  ('50464eac-5b11-56ab-a6ca-55b5d2413d9b', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'contrato_trabalho', 'Contrato de trabalho', 'pessoal', true, false, null);

-- ---------------------------------------------------------------------
-- Estrutura comercial fictícia
-- ---------------------------------------------------------------------
insert into contratantes (id, org_id, nome, cnpj) values
  ('4cef5154-d96d-5d3e-879e-fef2401f2cf5', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Hospital Sao Lucas', '11222333000181'),
  ('73b46f69-8d4f-54e9-9dbe-87a03553c88a', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Rede Bom Preco', '44555666000172');

insert into unidades (id, org_id, contratante_id, nome, endereco, cidade, uf) values
  ('79baf83d-a8c3-5a89-90bf-6ae7d29a2302', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '4cef5154-d96d-5d3e-879e-fef2401f2cf5', 'Unidade Central', 'Av. Ipiranga, 1200', 'Porto Alegre', 'RS'),
  ('f6996a20-115f-5adc-81d4-68f640140f9e', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '4cef5154-d96d-5d3e-879e-fef2401f2cf5', 'Ambulatorio Zona Norte', 'R. Assis Brasil, 340', 'Porto Alegre', 'RS'),
  ('ff3cf250-defb-522b-841e-5a09701a27b1', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '4cef5154-d96d-5d3e-879e-fef2401f2cf5', 'Anexo Administrativo', 'Av. Ipiranga, 1188', 'Porto Alegre', 'RS'),
  ('a6565dbb-e74b-5a93-9c62-4134b6f76473', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '73b46f69-8d4f-54e9-9dbe-87a03553c88a', 'Loja Centro', 'R. dos Andradas, 900', 'Porto Alegre', 'RS'),
  ('12536647-f736-5ffb-ab19-a7b4c7ce2259', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '73b46f69-8d4f-54e9-9dbe-87a03553c88a', 'Centro de Distribuicao Sul', 'BR-116, km 22', 'Guaiba', 'RS');

insert into contratos (id, org_id, contratante_id, numero, descricao, vigencia_inicio) values
  ('d594b950-e556-5f78-ae9b-98f6b1d12b63', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '4cef5154-d96d-5d3e-879e-fef2401f2cf5', '042', 'Limpeza e higienizacao hospitalar', '2025-01-01'),
  ('3d8b84f9-d552-59f1-897f-80a440afd718', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '4cef5154-d96d-5d3e-879e-fef2401f2cf5', '043', 'Portaria e controle de acesso', '2025-03-01'),
  ('e716f5c1-3603-596b-a331-1d307ccf82f3', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '73b46f69-8d4f-54e9-9dbe-87a03553c88a', '077', 'Limpeza e reposicao de loja', '2025-06-01');

insert into contrato_unidades (contrato_id, unidade_id) values
  ('d594b950-e556-5f78-ae9b-98f6b1d12b63', '79baf83d-a8c3-5a89-90bf-6ae7d29a2302'),
  ('d594b950-e556-5f78-ae9b-98f6b1d12b63', 'f6996a20-115f-5adc-81d4-68f640140f9e'),
  ('d594b950-e556-5f78-ae9b-98f6b1d12b63', 'ff3cf250-defb-522b-841e-5a09701a27b1'),
  ('3d8b84f9-d552-59f1-897f-80a440afd718', '79baf83d-a8c3-5a89-90bf-6ae7d29a2302'),
  ('e716f5c1-3603-596b-a331-1d307ccf82f3', 'a6565dbb-e74b-5a93-9c62-4134b6f76473'),
  ('e716f5c1-3603-596b-a331-1d307ccf82f3', '12536647-f736-5ffb-ab19-a7b4c7ce2259');

-- ---------------------------------------------------------------------
-- 30 pessoas fictícias + alocações (CPF com dígito verificador válido)
-- ---------------------------------------------------------------------
insert into pessoas (id, org_id, nome, cpf, matricula, telefone) values
  ('9af9c3c1-a1a7-5dd1-99a4-49cd1d80355c', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Maria Aparecida Ferreira', '01000791998', '3000', '51990100079'),
  ('8605334e-658a-5360-a78a-79e3ff3736e8', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Joao Batista Souza', '01001583825', '3001', '51990100158'),
  ('e3ee9ed0-858b-56aa-850e-b7c6ba3cb83f', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Ana Claudia Nunes', '01002375762', '3002', '51990100237'),
  ('6ef416f7-a939-51cb-8196-5acd13d0510c', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Carlos Eduardo Lima', '01003167608', '3003', '51990100316'),
  ('d621f337-7ffd-5461-8d19-9661069d2650', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Fernanda Rocha Alves', '01003959539', '3004', '51990100395'),
  ('45071ef1-c3d3-585d-8a27-86386adabbba', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Paulo Sergio Martins', '01004751400', '3005', '51990100475'),
  ('50990dee-4fee-54ab-9f24-0b33b0aaabeb', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Juliana Mendes Costa', '01005543348', '3006', '51990100554'),
  ('49f33219-8706-5387-b992-e404fd7063ef', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Roberto Carlos Dias', '01006335285', '3007', '51990100633'),
  ('1532f940-0354-52f7-badc-df4ab27ec04a', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Sandra Regina Pinto', '01007127112', '3008', '51990100712'),
  ('aa5a4065-cb0a-5a3b-a418-62f475042a7b', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Marcos Antonio Silva', '01007919051', '3009', '51990100791'),
  ('450533cc-012d-5282-bab2-13c7503de094', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Patricia Gomes Barbosa', '01008710970', '3010', '51990100871'),
  ('a449b4a8-99da-5b30-8a3b-b96aacf12c8b', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Luiz Fernando Teixeira', '01009502808', '3011', '51990100950'),
  ('89e53c87-7fb5-5724-8ef4-f9e9d69b9451', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Vera Lucia Andrade', '01010294709', '3012', '51990101029'),
  ('6f1b44fd-3beb-5659-86e6-b9693f711d66', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Anderson Ribeiro Cruz', '01011086646', '3013', '51990101108'),
  ('33a65718-c7ba-5bf7-8485-ce9d678c5e55', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Simone Cardoso Melo', '01011878585', '3014', '51990101187'),
  ('c5acd48c-9327-5bee-90fb-c297db3b6498', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Jose Renato Fagundes', '01012670457', '3015', '51990101267'),
  ('f0570234-40ba-5882-ba6d-85134c4c4727', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Cristiane Moraes Duarte', '01013462394', '3016', '51990101346'),
  ('b776c31c-3db3-5a9c-908c-5fa89ef79fcb', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Edson Luis Camargo', '01014254221', '3017', '51990101425'),
  ('62c02fe7-35a6-5d11-a613-4b713a0b5f65', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Rosangela Batista Freitas', '01015046169', '3018', '51990101504'),
  ('8c7b170f-cfb2-51c0-95c4-9f6ffddcd57e', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Wagner de Oliveira', '01015838006', '3019', '51990101583'),
  ('011be5a6-5e12-5580-b226-bd802fbe1017', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Camila Souza Ramos', '01016629982', '3020', '51990101662'),
  ('60d8b8c1-e225-5760-b94f-194294397d5b', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Alexandre Pereira Goncalves', '01017421854', '3021', '51990101742'),
  ('f5e8d991-06b6-57bd-9477-daf28d484459', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Debora Cristina Lopes', '01018213791', '3022', '51990101821'),
  ('bde54139-0cc0-510a-bf91-b41f0f0d93c3', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Rafael Augusto Moreira', '01019005629', '3023', '51990101900'),
  ('3045b327-d51a-51a1-8b27-7decae8d1426', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Elaine Cristina Vieira', '01019797541', '3024', '51990101979'),
  ('4163f983-8874-5f82-b18c-ca9818fc6d00', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Sergio Murilo Bastos', '01020589469', '3025', '51990102058'),
  ('8ddbdf4d-8020-5bb1-bc68-19f70a070b18', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Tatiane Farias Machado', '01021381330', '3026', '51990102138'),
  ('aef668ad-38bc-5da4-9ff7-c2e934b0c9aa', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Gilberto Nascimento Reis', '01022173278', '3027', '51990102217'),
  ('c06dd800-66bb-5b52-a9f3-1174b71d5a52', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Michele Santos Correa', '01022965107', '3028', '51990102296'),
  ('b97ce11a-ccff-56ab-8a7a-da63e8f7664e', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'Adriano Cesar Fontes', '01023757044', '3029', '51990102375');

insert into alocacoes (id, org_id, pessoa_id, contrato_id, unidade_id, funcao, data_inicio, status) values
  ('8b9f45e6-ff47-5849-9dc2-59ea583643cb', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '9af9c3c1-a1a7-5dd1-99a4-49cd1d80355c', 'd594b950-e556-5f78-ae9b-98f6b1d12b63', '79baf83d-a8c3-5a89-90bf-6ae7d29a2302', 'Auxiliar de limpeza', '2025-02-10', 'ativa'),
  ('3059f64b-b3cb-58e1-a325-7b23440bc637', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '8605334e-658a-5360-a78a-79e3ff3736e8', 'd594b950-e556-5f78-ae9b-98f6b1d12b63', 'f6996a20-115f-5adc-81d4-68f640140f9e', 'Auxiliar de limpeza', '2025-02-10', 'ativa'),
  ('6a7a26b9-6ff2-5780-9c37-4dd8cedceb92', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'e3ee9ed0-858b-56aa-850e-b7c6ba3cb83f', 'd594b950-e556-5f78-ae9b-98f6b1d12b63', 'ff3cf250-defb-522b-841e-5a09701a27b1', 'Encarregado de limpeza', '2025-02-10', 'ativa'),
  ('5d685f0d-94dc-5260-86c6-152dfc12226d', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '6ef416f7-a939-51cb-8196-5acd13d0510c', 'd594b950-e556-5f78-ae9b-98f6b1d12b63', '79baf83d-a8c3-5a89-90bf-6ae7d29a2302', 'Auxiliar de limpeza hospitalar', '2025-02-10', 'ativa'),
  ('7f953d28-29d5-540c-a368-b67d8a7c5621', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'd621f337-7ffd-5461-8d19-9661069d2650', 'd594b950-e556-5f78-ae9b-98f6b1d12b63', 'f6996a20-115f-5adc-81d4-68f640140f9e', 'Auxiliar de limpeza', '2025-02-10', 'ativa'),
  ('1c38aaf4-f416-53c9-bcfd-ce8a1fede214', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '45071ef1-c3d3-585d-8a27-86386adabbba', 'd594b950-e556-5f78-ae9b-98f6b1d12b63', 'ff3cf250-defb-522b-841e-5a09701a27b1', 'Auxiliar de limpeza', '2025-02-10', 'ferias'),
  ('e0eec1a6-578f-55b2-b925-47a46c708cf1', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '50990dee-4fee-54ab-9f24-0b33b0aaabeb', 'd594b950-e556-5f78-ae9b-98f6b1d12b63', '79baf83d-a8c3-5a89-90bf-6ae7d29a2302', 'Encarregado de limpeza', '2025-02-10', 'ativa'),
  ('0282a743-d5b0-53b1-adb5-9b52d13c3d64', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '49f33219-8706-5387-b992-e404fd7063ef', 'd594b950-e556-5f78-ae9b-98f6b1d12b63', 'f6996a20-115f-5adc-81d4-68f640140f9e', 'Auxiliar de limpeza hospitalar', '2025-02-10', 'ativa'),
  ('d989f10b-8aca-58ba-a162-8a1eca11f5af', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '1532f940-0354-52f7-badc-df4ab27ec04a', 'd594b950-e556-5f78-ae9b-98f6b1d12b63', 'ff3cf250-defb-522b-841e-5a09701a27b1', 'Auxiliar de limpeza', '2025-02-10', 'ativa'),
  ('29c0e634-e5ab-54c5-931b-b71abdbfd37e', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'aa5a4065-cb0a-5a3b-a418-62f475042a7b', 'd594b950-e556-5f78-ae9b-98f6b1d12b63', '79baf83d-a8c3-5a89-90bf-6ae7d29a2302', 'Auxiliar de limpeza', '2025-02-10', 'ativa'),
  ('cda02e69-8d17-5f05-b1a3-6765d137ef4e', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '450533cc-012d-5282-bab2-13c7503de094', 'd594b950-e556-5f78-ae9b-98f6b1d12b63', 'f6996a20-115f-5adc-81d4-68f640140f9e', 'Encarregado de limpeza', '2025-02-10', 'ativa'),
  ('b3f872c3-3a3b-5928-a2e5-99038978a756', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'a449b4a8-99da-5b30-8a3b-b96aacf12c8b', 'd594b950-e556-5f78-ae9b-98f6b1d12b63', 'ff3cf250-defb-522b-841e-5a09701a27b1', 'Auxiliar de limpeza hospitalar', '2025-02-10', 'afastado'),
  ('ddae41ea-54ae-5bf5-8194-d332154fe33c', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '89e53c87-7fb5-5724-8ef4-f9e9d69b9451', 'd594b950-e556-5f78-ae9b-98f6b1d12b63', '79baf83d-a8c3-5a89-90bf-6ae7d29a2302', 'Auxiliar de limpeza', '2025-02-10', 'ativa'),
  ('17802542-059d-5beb-a691-a2cec66827d0', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '6f1b44fd-3beb-5659-86e6-b9693f711d66', 'd594b950-e556-5f78-ae9b-98f6b1d12b63', 'f6996a20-115f-5adc-81d4-68f640140f9e', 'Auxiliar de limpeza', '2025-02-10', 'ativa'),
  ('f31799c2-28bc-5456-97bf-d534ee3cf54c', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '33a65718-c7ba-5bf7-8485-ce9d678c5e55', '3d8b84f9-d552-59f1-897f-80a440afd718', '79baf83d-a8c3-5a89-90bf-6ae7d29a2302', 'Vigia', '2025-04-01', 'ativa'),
  ('b80abd04-ac8b-5397-a541-966bcd81353e', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'c5acd48c-9327-5bee-90fb-c297db3b6498', '3d8b84f9-d552-59f1-897f-80a440afd718', '79baf83d-a8c3-5a89-90bf-6ae7d29a2302', 'Porteiro', '2025-04-01', 'ativa'),
  ('7ff4ca7f-d8b0-54a9-9897-54c13cdb4d46', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'f0570234-40ba-5882-ba6d-85134c4c4727', '3d8b84f9-d552-59f1-897f-80a440afd718', '79baf83d-a8c3-5a89-90bf-6ae7d29a2302', 'Controlador de acesso', '2025-04-01', 'ativa'),
  ('b2c4a84d-62dd-57f0-a998-b4718d3dfd54', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'b776c31c-3db3-5a9c-908c-5fa89ef79fcb', '3d8b84f9-d552-59f1-897f-80a440afd718', '79baf83d-a8c3-5a89-90bf-6ae7d29a2302', 'Vigia', '2025-04-01', 'ativa'),
  ('7c611054-9872-5814-b683-0d3b6002a104', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '62c02fe7-35a6-5d11-a613-4b713a0b5f65', '3d8b84f9-d552-59f1-897f-80a440afd718', '79baf83d-a8c3-5a89-90bf-6ae7d29a2302', 'Porteiro', '2025-04-01', 'ativa'),
  ('5bfca7b0-599d-5724-a7d8-c64ac04acc12', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '8c7b170f-cfb2-51c0-95c4-9f6ffddcd57e', '3d8b84f9-d552-59f1-897f-80a440afd718', '79baf83d-a8c3-5a89-90bf-6ae7d29a2302', 'Controlador de acesso', '2025-04-01', 'ativa'),
  ('be88a1d7-b169-5379-83df-c066156f9086', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '011be5a6-5e12-5580-b226-bd802fbe1017', 'e716f5c1-3603-596b-a331-1d307ccf82f3', 'a6565dbb-e74b-5a93-9c62-4134b6f76473', 'Operador de loja', '2025-07-15', 'ativa'),
  ('7b7ae9a5-63ac-5fa8-9ea9-3c1d2e0a2e81', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '60d8b8c1-e225-5760-b94f-194294397d5b', 'e716f5c1-3603-596b-a331-1d307ccf82f3', '12536647-f736-5ffb-ab19-a7b4c7ce2259', 'Repositor', '2025-07-15', 'ativa'),
  ('d22bb7ed-916e-594e-8810-eddb2113bcf8', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'f5e8d991-06b6-57bd-9477-daf28d484459', 'e716f5c1-3603-596b-a331-1d307ccf82f3', 'a6565dbb-e74b-5a93-9c62-4134b6f76473', 'Auxiliar de limpeza', '2025-07-15', 'ativa'),
  ('bcaa3056-16e1-59d1-9878-05377d3be8dc', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'bde54139-0cc0-510a-bf91-b41f0f0d93c3', 'e716f5c1-3603-596b-a331-1d307ccf82f3', '12536647-f736-5ffb-ab19-a7b4c7ce2259', 'Operador de loja', '2025-07-15', 'ativa'),
  ('95afce01-289e-56c5-9cef-6c911ede7f42', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '3045b327-d51a-51a1-8b27-7decae8d1426', 'e716f5c1-3603-596b-a331-1d307ccf82f3', 'a6565dbb-e74b-5a93-9c62-4134b6f76473', 'Repositor', '2025-07-15', 'ativa'),
  ('887eff7b-01b1-5247-b735-a10b9d831210', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '4163f983-8874-5f82-b18c-ca9818fc6d00', 'e716f5c1-3603-596b-a331-1d307ccf82f3', '12536647-f736-5ffb-ab19-a7b4c7ce2259', 'Auxiliar de limpeza', '2025-07-15', 'ativa'),
  ('aa1e9ec6-af90-51de-a90d-5cf12beabc01', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '8ddbdf4d-8020-5bb1-bc68-19f70a070b18', 'e716f5c1-3603-596b-a331-1d307ccf82f3', 'a6565dbb-e74b-5a93-9c62-4134b6f76473', 'Operador de loja', '2025-07-15', 'ativa'),
  ('d6a7644b-3e54-5746-8786-f82e4d0450c4', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'aef668ad-38bc-5da4-9ff7-c2e934b0c9aa', 'e716f5c1-3603-596b-a331-1d307ccf82f3', '12536647-f736-5ffb-ab19-a7b4c7ce2259', 'Repositor', '2025-07-15', 'ativa'),
  ('143da1c2-446e-5775-afaf-cf71fffd429b', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'c06dd800-66bb-5b52-a9f3-1174b71d5a52', 'e716f5c1-3603-596b-a331-1d307ccf82f3', 'a6565dbb-e74b-5a93-9c62-4134b6f76473', 'Auxiliar de limpeza', '2025-07-15', 'ativa'),
  ('6d5e6570-de67-521e-9523-05401723f87b', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', 'b97ce11a-ccff-56ab-8a7a-da63e8f7664e', 'e716f5c1-3603-596b-a331-1d307ccf82f3', '12536647-f736-5ffb-ab19-a7b4c7ce2259', 'Operador de loja', '2025-07-15', 'ativa');

-- Alocação encerrada, para a ficha ter histórico de verdade (F1.2 exibe em
-- ordem cronológica inversa e não pode apagar registro).
insert into alocacoes (id, org_id, pessoa_id, contrato_id, unidade_id, funcao, data_inicio, data_fim, status) values
  ('10f19608-5258-581e-994e-df07a436e52a', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '9af9c3c1-a1a7-5dd1-99a4-49cd1d80355c', '3d8b84f9-d552-59f1-897f-80a440afd718', '79baf83d-a8c3-5a89-90bf-6ae7d29a2302', 'Porteiro', '2024-08-01', '2025-02-09', 'encerrada');

-- ---------------------------------------------------------------------
-- Usuários de teste — um por tipo e por subperfil.
-- Senha de todos: portal3e2026
-- E-mail sintético do funcionário conforme docs/03: <cpf>@func.<slug>.portal3e
-- ---------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change) values
  ('00000000-0000-0000-0000-000000000000', '460759de-e5a3-5bf7-92ad-41ca4ac4f9a6', 'authenticated', 'authenticated', 'admin_geral@3e.com.br',
   crypt('portal3e2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c4c1bbd3-90c6-5c43-ac35-857b37a96fd3', 'authenticated', 'authenticated', 'rh_dp@3e.com.br',
   crypt('portal3e2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '9e5217c3-52f4-5b8c-bb99-3f3a0342f7e9', 'authenticated', 'authenticated', 'contratos@3e.com.br',
   crypt('portal3e2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b8864205-4ba3-5295-886e-f0c8e843f3b8', 'authenticated', 'authenticated', 'financeiro@3e.com.br',
   crypt('portal3e2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'ea23d309-2920-594f-bfd3-27cc72a97b00', 'authenticated', 'authenticated', 'sst@3e.com.br',
   crypt('portal3e2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e32f544e-472f-58d5-8c6f-40c0272bc44c', 'authenticated', 'authenticated', 'suporte_auditoria@3e.com.br',
   crypt('portal3e2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b1867161-8491-5910-bf96-814c402f9593', 'authenticated', 'authenticated', 'gestor.contrato@hsaolucas.com.br',
   crypt('portal3e2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '4a2ade92-25e1-58f2-afda-9198dd3da8df', 'authenticated', 'authenticated', 'fiscal@hsaolucas.com.br',
   crypt('portal3e2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0e10492d-66c6-53e4-ab0d-bf379b37a520', 'authenticated', 'authenticated', 'gestor.unidade@hsaolucas.com.br',
   crypt('portal3e2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '5d6d70e7-25ed-52cb-a3d9-db372097c8ed', 'authenticated', 'authenticated', 'adm.financeiro@bompreco.com.br',
   crypt('portal3e2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '2c739684-5dce-5ac4-a8f5-4bccfd9150e2', 'authenticated', 'authenticated', '01000791998@func.3e.portal3e',
   crypt('portal3e2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd291f5ba-25c3-5319-84a5-fdb824f00b8c', 'authenticated', 'authenticated', '01001583825@func.3e.portal3e',
   crypt('portal3e2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

-- Sem linha em auth.identities o signInWithPassword falha no GoTrue atual.
insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), au.id,
       jsonb_build_object('sub', au.id::text, 'email', au.email),
       'email', au.id::text, now(), now(), now()
  from auth.users au
 where au.email like '%@func.3e.portal3e' or au.email in ('admin_geral@3e.com.br', 'rh_dp@3e.com.br', 'contratos@3e.com.br', 'financeiro@3e.com.br', 'sst@3e.com.br', 'suporte_auditoria@3e.com.br', 'gestor.contrato@hsaolucas.com.br', 'fiscal@hsaolucas.com.br', 'gestor.unidade@hsaolucas.com.br', 'adm.financeiro@bompreco.com.br');

insert into usuarios (id, org_id, pessoa_id, tipo, nome, email_login, precisa_trocar_senha) values
  ('460759de-e5a3-5bf7-92ad-41ca4ac4f9a6', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', null, 'interno', 'Administrador geral (teste)', 'admin_geral@3e.com.br', false),
  ('c4c1bbd3-90c6-5c43-ac35-857b37a96fd3', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', null, 'interno', 'RH / DP (teste)', 'rh_dp@3e.com.br', false),
  ('9e5217c3-52f4-5b8c-bb99-3f3a0342f7e9', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', null, 'interno', 'Contratos / Coordenação (teste)', 'contratos@3e.com.br', false),
  ('b8864205-4ba3-5295-886e-f0c8e843f3b8', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', null, 'interno', 'Financeiro (teste)', 'financeiro@3e.com.br', false),
  ('ea23d309-2920-594f-bfd3-27cc72a97b00', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', null, 'interno', 'SST (teste)', 'sst@3e.com.br', false),
  ('e32f544e-472f-58d5-8c6f-40c0272bc44c', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', null, 'interno', 'Suporte / Auditoria (teste)', 'suporte_auditoria@3e.com.br', false),
  ('b1867161-8491-5910-bf96-814c402f9593', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', null, 'contratante', 'Gestor do contrato 042 (teste)', 'gestor.contrato@hsaolucas.com.br', false),
  ('4a2ade92-25e1-58f2-afda-9198dd3da8df', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', null, 'contratante', 'Fiscal do contrato 042 (teste)', 'fiscal@hsaolucas.com.br', false),
  ('0e10492d-66c6-53e4-ab0d-bf379b37a520', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', null, 'contratante', 'Gestor da Unidade Central (teste)', 'gestor.unidade@hsaolucas.com.br', false),
  ('5d6d70e7-25ed-52cb-a3d9-db372097c8ed', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', null, 'contratante', 'Administrativo Bom Preco (teste)', 'adm.financeiro@bompreco.com.br', false),
  ('2c739684-5dce-5ac4-a8f5-4bccfd9150e2', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '9af9c3c1-a1a7-5dd1-99a4-49cd1d80355c', 'funcionario', 'Maria Aparecida Ferreira', '01000791998@func.3e.portal3e', false),
  ('d291f5ba-25c3-5319-84a5-fdb824f00b8c', '1fac8b3c-4860-5606-836b-ca4c8dd420d0', '8605334e-658a-5360-a78a-79e3ff3736e8', 'funcionario', 'Joao Batista Souza', '01001583825@func.3e.portal3e', true);

insert into usuario_perfis (usuario_id, perfil_id) values
  ('460759de-e5a3-5bf7-92ad-41ca4ac4f9a6', 'fe9f7afe-04a3-582c-89c7-12f65d68018b'),
  ('c4c1bbd3-90c6-5c43-ac35-857b37a96fd3', '9d433605-659e-5ba4-a24e-b1c0d498d71c'),
  ('9e5217c3-52f4-5b8c-bb99-3f3a0342f7e9', 'd6b929c4-ffe1-5efd-b53e-0797a7993a38'),
  ('b8864205-4ba3-5295-886e-f0c8e843f3b8', 'cbaf2fb8-aef6-5297-b142-fd430c1ef24e'),
  ('ea23d309-2920-594f-bfd3-27cc72a97b00', '840c335b-3dc4-59a9-8db6-29617ed44acb'),
  ('e32f544e-472f-58d5-8c6f-40c0272bc44c', 'e2167a38-534d-52c9-b71d-3e298d1afafe'),
  ('b1867161-8491-5910-bf96-814c402f9593', '991e4ba6-788a-5d79-9197-3342fa955521'),
  ('4a2ade92-25e1-58f2-afda-9198dd3da8df', 'cb994b78-0287-5a88-b97d-bd99968e1a04'),
  ('0e10492d-66c6-53e4-ab0d-bf379b37a520', '74d1d972-c4ea-558b-8d3b-de8f44221dc3'),
  ('5d6d70e7-25ed-52cb-a3d9-db372097c8ed', '6d628744-e8d3-546a-ade5-7bec104c6581');

-- Escopo do contratante. Interno fica sem escopo de propósito: em
-- app.escopo_total(), interno sem escopo enxerga a organização inteira,
-- enquanto contratante sem escopo não enxerga nada (falha fechada).
insert into usuario_escopos (usuario_id, contrato_id, unidade_id) values
  ('b1867161-8491-5910-bf96-814c402f9593', 'd594b950-e556-5f78-ae9b-98f6b1d12b63', null),
  ('4a2ade92-25e1-58f2-afda-9198dd3da8df', 'd594b950-e556-5f78-ae9b-98f6b1d12b63', null),
  ('0e10492d-66c6-53e4-ab0d-bf379b37a520', null, '79baf83d-a8c3-5a89-90bf-6ae7d29a2302'),
  ('5d6d70e7-25ed-52cb-a3d9-db372097c8ed', 'e716f5c1-3603-596b-a331-1d307ccf82f3', null);
