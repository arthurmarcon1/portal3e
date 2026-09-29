/**
 * O modelo único de e-mail (F4.3). Puro — testável sem servidor.
 *
 * Regras que não mudam (docs/05 e o pedido da Fase 4):
 * - o e-mail **avisa e leva ao Portal**: uma frase, um botão "Abrir no
 *   Portal". Nunca leva documento em anexo, nem botão de confirmar;
 * - **nenhum dado pessoal além do primeiro nome**: sem título de documento
 *   (título pode dizer demais — "Advertência", "Rescisão"), sem conteúdo de
 *   solicitação, sem CPF. O protocolo e a data do prazo não identificam
 *   ninguém e ajudam a pessoa a achar o que é.
 */

export type Motivo = "publicado" | "lembrete" | "vencido" | "respondida" | "concluida" | "validade";

export type DadosDoAviso = {
  motivo: Motivo;
  primeiroNome: string;
  /** Link absoluto para a tela certa do Portal. */
  link: string;
  /** Prazo de ciência (yyyy-mm-dd), para os avisos de documento. */
  prazo?: string | null;
  /** Protocolo da solicitação, para os avisos de solicitação. */
  protocolo?: string | null;
};

export type Email = { assunto: string; texto: string; html: string };

/** "Maria Aparecida Ferreira" → "Maria". Nome vazio vira saudação neutra. */
export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

function data(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function frase(d: DadosDoAviso): { assunto: string; linha: string } {
  const ate = d.prazo ? ` até ${data(d.prazo)}` : "";
  const protocolo = d.protocolo ? ` ${d.protocolo}` : "";
  switch (d.motivo) {
    case "publicado":
      return {
        assunto: "Você tem um documento para confirmar no Portal 3e",
        linha: `Há um documento novo para você ler e confirmar no Portal${ate}.`,
      };
    case "lembrete":
      return {
        assunto: "Lembrete: documento para confirmar no Portal 3e",
        linha: `Você ainda não confirmou um documento no Portal. O prazo vai${ate}.`,
      };
    case "vencido":
      return {
        assunto: "Prazo vencido: documento sem confirmação no Portal 3e",
        linha: "O prazo para confirmar um documento no Portal terminou. Você ainda pode responder.",
      };
    case "respondida":
      return {
        assunto: "Sua solicitação foi respondida no Portal 3e",
        linha: `Há uma resposta para a sua solicitação${protocolo} no Portal.`,
      };
    case "concluida":
      return {
        assunto: "Sua solicitação foi concluída no Portal 3e",
        linha: `A sua solicitação${protocolo} foi concluída. Veja o resultado no Portal.`,
      };
    // F5.2 — para a equipe de SST. Sem nome de quem vence nem tipo do
    // documento: ASO é dado de saúde, e o e-mail só leva ao painel.
    case "validade":
      return {
        assunto: "Documento de SST vencendo em até 30 dias",
        linha: "Há documento de SST (ASO ou treinamento) vencendo nos próximos 30 dias. Veja no painel de SST.",
      };
  }
}

function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function montarEmail(d: DadosDoAviso): Email {
  const { assunto, linha } = frase(d);
  const saudacao = d.primeiroNome ? `Olá, ${d.primeiroNome}.` : "Olá.";
  const rodape = "Este é um aviso automático do Portal 3e. Não responda este e-mail.";

  const texto = `${saudacao}\n\n${linha}\n\nAbrir no Portal: ${d.link}\n\n${rodape}\n`;

  // Tabela e estilo inline: é o que cliente de e-mail antigo entende.
  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:24px;background:#F6F7F8;font-family:Arial,Helvetica,sans-serif;color:#1A1D21">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #DDE1E6;border-radius:8px">
<tr><td style="padding:24px;font-size:16px;line-height:1.5">
<p style="margin:0 0 12px">${escapar(saudacao)}</p>
<p style="margin:0 0 24px">${escapar(linha)}</p>
<a href="${escapar(d.link)}" style="display:inline-block;background:#14532D;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold">Abrir no Portal</a>
<p style="margin:24px 0 0;font-size:12px;color:#5B6570">${escapar(rodape)}</p>
</td></tr></table></body></html>`;

  return { assunto, texto, html };
}

/** Envio só de 8h a 20h em Brasília: aviso de madrugada acorda e irrita. */
export function dentroDaJanela(agora: Date): boolean {
  const hora = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(agora),
  );
  return hora >= 8 && hora < 20;
}

/** A tela certa para cada aviso, pela área de quem recebe. */
export function caminhoDoAviso(
  referenciaTipo: string | null,
  referenciaId: string | null,
  tipoUsuario: "funcionario" | "contratante" | "interno",
  motivo?: Motivo | null,
): string {
  if (motivo === "validade") return "/admin/sst";
  if (!referenciaId) return "/";
  if (referenciaTipo === "documentos") {
    return tipoUsuario === "funcionario" ? `/documentos/${referenciaId}` : `/admin/documentos/${referenciaId}`;
  }
  if (referenciaTipo === "solicitacoes") {
    if (tipoUsuario === "funcionario") return `/pedidos/${referenciaId}`;
    if (tipoUsuario === "contratante") return `/cliente/solicitacoes/${referenciaId}`;
    return `/admin/solicitacoes/${referenciaId}`;
  }
  return "/";
}
