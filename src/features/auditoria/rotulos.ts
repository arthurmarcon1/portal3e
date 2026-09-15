/**
 * Nome legível das ações e entidades gravadas em `auditoria`.
 *
 * Só apresentação: o filtro lista o que existe na tabela
 * (`auditoria_opcoes_de_filtro`, migração 0011), e evento sem rótulo aqui
 * aparece com o nome cru — nunca some da tela por falta de tradução.
 */

const ACOES: Record<string, string> = {
  login: "Login",
  falha_login: "Falha de login",
  login_bloqueado: "Login bloqueado",
  logout: "Logout",
  trocar_senha: "Troca de senha",
  codigo_solicitado: "Código solicitado",
  falha_codigo: "Código incorreto",
  senha_redefinida: "Senha redefinida",
  criar_usuario: "Criação de usuário",
  mudar_perfis: "Mudança de perfis",
  mudar_escopo: "Mudança de escopo",
  mudar_permissoes_perfil: "Mudança de permissões",
  desativar_usuario: "Desativação de usuário",
  reativar_usuario: "Reativação de usuário",
  criar: "Criação",
  editar: "Edição",
  desativar: "Desativação",
  reativar: "Reativação",
  encerrar: "Encerramento",
  importar: "Importação",
  exportar: "Exportação",
  download: "Download",
  publicar: "Publicação",
  ver: "Visualização",
};

const ENTIDADES: Record<string, string> = {
  usuarios: "Usuários",
  perfis: "Perfis",
  codigos_verificacao: "Códigos de verificação",
  contratantes: "Contratantes",
  contratos: "Contratos",
  unidades: "Unidades",
  pessoas: "Pessoas",
  alocacoes: "Alocações",
  documentos: "Documentos",
  auditoria: "Auditoria",
};

export function rotuloAcao(acao: string): string {
  return ACOES[acao] ?? acao;
}

export function rotuloEntidade(entidade: string): string {
  return ENTIDADES[entidade] ?? entidade;
}
