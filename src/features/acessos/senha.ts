import "server-only";

import { randomInt } from "node:crypto";

/**
 * Senha provisória do primeiro acesso.
 *
 * Alfabeto sem `0/O`, `1/l/I` e sem símbolo: ela vai ser ditada por telefone
 * ou copiada de um papel pelo supervisor, e digitada num teclado de celular.
 * docs/03 já registra por que não exigimos símbolo — a barreira de digitação
 * piora a segurança na prática, porque as pessoas anotam a senha.
 *
 * `randomInt` do `node:crypto`, não `Math.random()`: é senha, ainda que
 * provisória, e `usuarios.precisa_trocar_senha` só força a troca no próximo
 * acesso — até lá ela vale.
 */
const ALFABETO = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function gerarSenhaProvisoria(tamanho = 10): string {
  let senha = "";
  for (let i = 0; i < tamanho; i++) {
    senha += ALFABETO[randomInt(ALFABETO.length)];
  }
  return senha;
}
