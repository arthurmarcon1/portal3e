/**
 * O original da alimentação: áudio ou foto, conferido pelo conteúdo, não pela
 * extensão — como a foto da divergência e o PDF do documento.
 *
 * Puro, sem banco: testável em `npm run test:unidade`. Os formatos de áudio
 * são os que o WhatsApp e o gravador do celular produzem, e os que a
 * transcrição aceita: OGG/Opus (WhatsApp), M4A (iPhone), MP3, WAV, WebM
 * (gravação no navegador). O bucket `alimentacoes` (0029) aceita os mesmos.
 */

import { ErroDeAnexo, validarImagem } from "@/features/documentos/anexo";
import { TAMANHO_MAXIMO } from "@/features/documentos/arquivo-limites";

export type OriginalAceito = {
  tipo: "audio" | "foto";
  mime: string;
  extensao: string;
};

export class ErroDeOriginal extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeOriginal";
  }
}

const ASCII = new TextDecoder("latin1");

export function validarOriginal(conteudo: Uint8Array): OriginalAceito {
  if (conteudo.byteLength === 0) throw new ErroDeOriginal("O arquivo veio vazio. Envie de novo.");
  if (conteudo.byteLength > TAMANHO_MAXIMO) {
    throw new ErroDeOriginal("O arquivo passa de 7 MB. Envie um áudio mais curto ou uma foto menor.");
  }

  const b = conteudo;
  const inicio = ASCII.decode(b.subarray(0, 4));
  if (inicio === "OggS") return { tipo: "audio", mime: "audio/ogg", extensao: "ogg" };
  if (inicio === "RIFF" && ASCII.decode(b.subarray(8, 12)) === "WAVE") {
    return { tipo: "audio", mime: "audio/wav", extensao: "wav" };
  }
  if (ASCII.decode(b.subarray(4, 8)) === "ftyp") return { tipo: "audio", mime: "audio/mp4", extensao: "m4a" };
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    return { tipo: "audio", mime: "audio/webm", extensao: "webm" };
  }
  if (inicio.startsWith("ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) {
    return { tipo: "audio", mime: "audio/mpeg", extensao: "mp3" };
  }

  try {
    return { tipo: "foto", ...validarImagem(conteudo) };
  } catch (erro) {
    if (erro instanceof ErroDeAnexo) {
      throw new ErroDeOriginal(
        "O arquivo não é um áudio nem uma foto. Envie o áudio do WhatsApp (ou MP3, M4A, WAV) ou uma foto JPG ou PNG.",
      );
    }
    throw erro;
  }
}
