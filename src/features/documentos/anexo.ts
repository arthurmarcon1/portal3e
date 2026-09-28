/**
 * Foto da divergência: conferência pelo conteúdo, não pela extensão.
 *
 * Puro, sem banco — testável em `npm run test:unidade`. O tamanho máximo é o
 * mesmo do PDF (a Server Action tem teto de 8 MB); a tela já reduz a foto
 * antes de enviar, então isto é a rede de segurança, não o caminho normal.
 */

import { TAMANHO_MAXIMO } from "./arquivo-limites";

export type ImagemAceita = { mime: "image/jpeg" | "image/png" | "image/webp"; extensao: string };

export class ErroDeAnexo extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeAnexo";
  }
}

export function validarImagem(conteudo: Uint8Array): ImagemAceita {
  if (conteudo.byteLength === 0) throw new ErroDeAnexo("A foto veio vazia. Tire a foto de novo.");
  if (conteudo.byteLength > TAMANHO_MAXIMO) {
    throw new ErroDeAnexo("A foto passa de 7 MB. Tire outra foto ou envie sem foto.");
  }
  const b = conteudo;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", extensao: "jpg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { mime: "image/png", extensao: "png" };
  }
  const riff = new TextDecoder("latin1").decode(b.subarray(0, 4));
  const webp = new TextDecoder("latin1").decode(b.subarray(8, 12));
  if (riff === "RIFF" && webp === "WEBP") return { mime: "image/webp", extensao: "webp" };
  throw new ErroDeAnexo("O arquivo não é uma foto. Envie uma imagem JPG ou PNG, ou envie sem foto.");
}
