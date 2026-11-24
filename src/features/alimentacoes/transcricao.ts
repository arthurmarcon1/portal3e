import "server-only";

/**
 * Transcrição do áudio pela API do Groq (Whisper), no plano gratuito.
 *
 * Escolha da prova de conceito (2026-11-23): transcrição por API — a Vercel
 * não roda o Whisper local — e sem custo até a direção ser aprovada. O plano
 * gratuito do Groq tem limite de uso por minuto e por dia, que sobra para a
 * demonstração.
 *
 * **Opcional.** Sem `GROQ_API_KEY`, `transcricaoDisponivel()` é falso: o
 * áudio é guardado mesmo assim e a equipe digita a transcrição na tela de
 * conferência. A demonstração não depende de rede externa para funcionar.
 *
 * Só áudio gravado pela própria equipe passa por aqui (docs/06, LGPD): áudio
 * de produtor real não entra até a decisão formal sobre operadores externos.
 */

const ENDERECO = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODELO_PADRAO = "whisper-large-v3";

export function transcricaoDisponivel(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

function modelo(): string {
  return process.env.GROQ_MODELO_TRANSCRICAO?.trim() || MODELO_PADRAO;
}

export type Transcricao = { texto: string; origem: string };

/** Lança em qualquer falha — quem chama guarda o áudio e segue sem texto. */
export async function transcrever(
  conteudo: Uint8Array,
  arquivo: { mime: string; extensao: string },
): Promise<Transcricao> {
  const chave = process.env.GROQ_API_KEY?.trim();
  if (!chave) throw new Error("GROQ_API_KEY não configurada");

  const corpo = new FormData();
  // Cópia em ArrayBuffer próprio: o tipo do Blob não aceita Uint8Array sobre SharedArrayBuffer.
  corpo.set("file", new Blob([new Uint8Array(conteudo)], { type: arquivo.mime }), `audio.${arquivo.extensao}`);
  corpo.set("model", modelo());
  corpo.set("language", "pt");
  corpo.set("response_format", "json");

  const resposta = await fetch(ENDERECO, {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}` },
    body: corpo,
    signal: AbortSignal.timeout(60_000),
  });
  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    throw new Error(`Groq respondeu ${resposta.status}: ${detalhe.slice(0, 300)}`);
  }

  const json = (await resposta.json()) as { text?: unknown };
  const texto = typeof json.text === "string" ? json.text.trim() : "";
  if (!texto) throw new Error("Groq devolveu transcrição vazia");
  return { texto, origem: `groq:${modelo()}` };
}
