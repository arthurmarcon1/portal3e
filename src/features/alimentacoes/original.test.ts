import { describe, expect, it } from "vitest";

import { validarOriginal } from "./original";

const bytes = (...partes: Array<string | number[]>) =>
  new Uint8Array(
    partes.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)).concat(Array(32).fill(0)),
  );

describe("validarOriginal", () => {
  it.each([
    ["OGG do WhatsApp", bytes("OggS"), "audio/ogg"],
    ["M4A do iPhone", bytes([0, 0, 0, 0x20], "ftypM4A "), "audio/mp4"],
    ["MP3 com ID3", bytes("ID3"), "audio/mpeg"],
    ["MP3 sem ID3", bytes([0xff, 0xfb, 0x90]), "audio/mpeg"],
    ["WAV", bytes("RIFF", [0, 0, 0, 0], "WAVE"), "audio/wav"],
    ["WebM do navegador", bytes([0x1a, 0x45, 0xdf, 0xa3]), "audio/webm"],
  ])("%s é áudio", (_, conteudo, mime) => {
    expect(validarOriginal(conteudo)).toMatchObject({ tipo: "audio", mime });
  });

  it("foto JPG", () => {
    expect(validarOriginal(bytes([0xff, 0xd8, 0xff]))).toMatchObject({ tipo: "foto", mime: "image/jpeg" });
  });

  it("PDF não é aceito, com mensagem que diz o que enviar", () => {
    expect(() => validarOriginal(bytes("%PDF-1.7"))).toThrow(/nem uma foto/);
  });

  it("vazio", () => {
    expect(() => validarOriginal(new Uint8Array())).toThrow(/vazio/);
  });
});
