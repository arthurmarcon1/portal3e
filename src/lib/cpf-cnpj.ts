/**
 * CPF e CNPJ: normalização, dígito verificador e máscara de exibição.
 *
 * Um lugar só para a conta. A F1.1 validou CNPJ apenas pelo tamanho e deixou
 * o dígito verificador anotado para cá de propósito — duas implementações da
 * mesma verificação divergem no primeiro ajuste.
 *
 * Regra do projeto (F1.2): **o banco guarda somente dígitos**. A máscara é
 * assunto de exibição e nunca é gravada; `formatarCpf` existe para a tela,
 * `apenasDigitos` para tudo que sai daqui em direção ao Postgres.
 *
 * Módulo puro: sem banco, sem rede, sem `server-only`. É o que permite cobrir
 * com teste de unidade e usar no cliente e no servidor sem duplicar.
 */

export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/**
 * Dígito verificador no esquema módulo 11 usado por CPF e CNPJ.
 *
 * `pesos` já vem alinhado com `base`, posição a posição. Resto 0 ou 1 vira
 * dígito 0 — é a regra da Receita, não um caso de borda esquecido.
 */
function digitoVerificador(base: string, pesos: readonly number[]): number {
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += Number(base[i]) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Pesos do CPF: 10..2 no primeiro dígito, 11..2 no segundo. */
function pesosCpf(tamanho: number): number[] {
  return Array.from({ length: tamanho }, (_, i) => tamanho + 1 - i);
}

/**
 * Pesos do CNPJ. A sequência não é decrescente simples: ela reinicia em 9
 * depois do 2. Os do primeiro dígito são os 12 últimos desta lista.
 */
const PESOS_CNPJ = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

/**
 * CPF válido: 11 dígitos e os dois verificadores conferindo.
 *
 * Sequência de dígito repetido (`111.111.111-11`) passa na conta do módulo 11
 * e por isso é recusada explicitamente — é o erro de digitação mais comum em
 * cadastro feito às pressas.
 */
export function validarCpf(valor: string): boolean {
  const digitos = apenasDigitos(valor);
  if (digitos.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digitos)) return false;

  const primeiro = digitoVerificador(digitos.slice(0, 9), pesosCpf(9));
  const segundo = digitoVerificador(digitos.slice(0, 10), pesosCpf(10));
  return primeiro === Number(digitos[9]) && segundo === Number(digitos[10]);
}

/** CNPJ válido: 14 dígitos, sem repetição total, com os dois verificadores. */
export function validarCnpj(valor: string): boolean {
  const digitos = apenasDigitos(valor);
  if (digitos.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digitos)) return false;

  const primeiro = digitoVerificador(digitos.slice(0, 12), PESOS_CNPJ.slice(1));
  const segundo = digitoVerificador(digitos.slice(0, 13), PESOS_CNPJ);
  return primeiro === Number(digitos[12]) && segundo === Number(digitos[13]);
}

/**
 * `000.000.000-00` para a tela. Valor que não tem 11 dígitos volta como veio:
 * exibição não é lugar de esconder dado torto do cadastro.
 */
export function formatarCpf(valor: string): string {
  const d = apenasDigitos(valor);
  if (d.length !== 11) return valor;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** `00.000.000/0000-00` para a tela, na mesma regra do `formatarCpf`. */
export function formatarCnpj(valor: string): string {
  const d = apenasDigitos(valor);
  if (d.length !== 14) return valor;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
