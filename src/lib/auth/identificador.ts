/**
 * Regra do identificador de login (docs/03 — "Login por CPF").
 *
 * O Supabase Auth só trabalha com e-mail. Funcionário não tem e-mail: entra
 * pelo CPF, que vira um e-mail sintético em um domínio que não resolve na
 * internet — nenhuma mensagem é enviada para ele.
 *
 * Módulo puro de propósito: é a peça que o teste cobre sem banco nem rede.
 */

import { apenasDigitos } from "@/lib/cpf-cnpj";

/** Domínio interno dos funcionários. Não resolve DNS — não recebe e-mail. */
const DOMINIO_SINTETICO = "portal3e";

// Uma só implementação de "tira a máscara", compartilhada com a validação de
// CPF/CNPJ. Reexportada porque o login já a usava por este caminho.
export { apenasDigitos };

/** E-mail sintético do funcionário: `<cpf>@func.<slug-da-org>.portal3e`. */
export function emailSintetico(cpf: string, slugOrg: string): string {
  return `${apenasDigitos(cpf)}@func.${slugOrg}.${DOMINIO_SINTETICO}`;
}

export type Identificador =
  | { tipo: "cpf"; email: string; cpf: string }
  | { tipo: "email"; email: string };

/**
 * Traduz o que a pessoa digitou no campo único "CPF ou e-mail".
 *
 * Sem "@" e com 11 dígitos → CPF. Com "@" → e-mail real, mesmo que tenha 11
 * dígitos no meio (`joao12345678901@x.com` é e-mail, não CPF). Devolve `null`
 * quando não é nem um nem outro — a mensagem para o usuário fica na Server
 * Action, não aqui.
 */
export function resolverIdentificador(
  entrada: string,
  slugOrg: string,
): Identificador | null {
  const normalizado = entrada.trim().toLowerCase();
  if (normalizado === "") return null;

  if (normalizado.includes("@")) {
    // Validação de formato fica no Zod; aqui só decidimos o caminho.
    return { tipo: "email", email: normalizado };
  }

  const digitos = apenasDigitos(normalizado);
  if (digitos.length !== 11) return null;

  return {
    tipo: "cpf",
    cpf: digitos,
    email: emailSintetico(digitos, slugOrg),
  };
}

/**
 * Versão do identificador segura para gravar em `auditoria`.
 *
 * Falha de login é auditada mesmo quando ninguém foi autenticado, então o que
 * a pessoa digitou vai para o log. CPF completo e e-mail inteiro não vão.
 */
export function mascararIdentificador(entrada: string): string {
  const normalizado = entrada.trim().toLowerCase();
  if (normalizado.includes("@")) {
    const [usuario, dominio] = normalizado.split("@");
    return `${usuario.slice(0, 2)}***@${dominio ?? ""}`;
  }
  const digitos = apenasDigitos(normalizado);
  // Mesmo critério de docs/02 para o contratante: só os 3 últimos dígitos.
  if (digitos.length === 11) return `********${digitos.slice(-3)}`;
  return "***";
}
