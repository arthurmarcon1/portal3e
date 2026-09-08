/**
 * Erros de domínio e a tradução deles para a mensagem que vai à tela.
 *
 * Regra do projeto: a UI nunca vê erro cru do Postgres. Toda Server Action
 * devolve `{ ok: false, erro }` com texto em português dizendo o que fazer.
 */

export type Resultado<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { dados?: undefined } : { dados: T }))
  | { ok: false; erro: string };

/** Usuário autenticado, mas sem a permissão exigida para a operação. */
export class ErroDePermissao extends Error {
  constructor(mensagem = "Você não tem permissão para esta ação. Fale com o administrador do Portal.") {
    super(mensagem);
    this.name = "ErroDePermissao";
  }
}

/** Regra de negócio violada — a mensagem já vem pronta para o usuário. */
export class ErroDeNegocio extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeNegocio";
  }
}

/**
 * Converte qualquer exceção na mensagem que a tela mostra.
 *
 * O que não for erro de domínio vira texto genérico: detalhe de banco não
 * chega ao usuário. O erro real vai para o console do servidor.
 */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroDePermissao || erro instanceof ErroDeNegocio) {
    return erro.message;
  }
  console.error("[erro inesperado]", erro);
  return "Não foi possível concluir a operação. Tente novamente em alguns minutos ou abra um chamado com o suporte.";
}
