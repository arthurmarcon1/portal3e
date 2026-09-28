/**
 * O arquivo do documento: conferência, hash e caminho no Storage.
 *
 * Puro, sem banco — por isso testável em `npm run test:unidade`.
 */

import { createHash } from "node:crypto";

import { TAMANHO_MAXIMO } from "./arquivo-limites";

export { TAMANHO_MAXIMO };

export class ErroDeArquivo extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeArquivo";
  }
}

/**
 * Aceita só PDF, conferido pelo conteúdo.
 *
 * Extensão e `type` do `File` vêm do navegador e não provam nada. A tela de
 * ciência (F3.4) abre o documento num visualizador de PDF, e o caminho no
 * Storage termina em `.pdf` (docs/03) — outro formato quebraria as duas.
 */
export function validarPdf(conteudo: Uint8Array): void {
  if (conteudo.byteLength === 0) {
    throw new ErroDeArquivo("Escolha o arquivo PDF do documento.");
  }
  if (conteudo.byteLength > TAMANHO_MAXIMO) {
    throw new ErroDeArquivo("O arquivo passa de 7 MB. Reduza o PDF e envie de novo.");
  }
  const assinatura = new TextDecoder("latin1").decode(conteudo.subarray(0, 5));
  if (assinatura !== "%PDF-") {
    throw new ErroDeArquivo("O arquivo não é um PDF. Salve o documento como PDF e envie de novo.");
  }
}

/** sha256 do conteúdo, em hex minúsculo — o que vai para `arquivo_hash`. */
export function hashDoArquivo(conteudo: Uint8Array): string {
  return createHash("sha256").update(conteudo).digest("hex");
}

/**
 * `{org_id}/{ano}/{tipo}/{documento_id}.pdf` (docs/03, "Storage").
 *
 * O ano é o do upload, em Brasília: é ele que agrupa o arquivo para a rotina
 * de retenção. `tipo` é a chave (`comunicado`), não o id — legível para quem
 * um dia precisar olhar o bucket.
 */
export function caminhoNoStorage(
  orgId: string,
  chaveTipo: string,
  documentoId: string,
  agora = new Date(),
): string {
  const ano = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "America/Sao_Paulo" }).format(
    agora,
  );
  return `${orgId}/${ano}/${chaveTipo}/${documentoId}.pdf`;
}

/** Hoje + n dias, em Brasília, no formato yyyy-mm-dd do `<input type="date">`. */
export function dataMaisDias(dias: number, agora = new Date()): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
  const [a, m, d] = hoje.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1, d + dias));
  return alvo.toISOString().slice(0, 10);
}
