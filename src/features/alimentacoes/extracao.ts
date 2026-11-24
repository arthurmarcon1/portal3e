/**
 * Extração por regras: da transcrição, a sugestão de cliente, rubrica,
 * descrição, valor e competência.
 *
 * Prova de conceito sem custo (decisão do Arthur, 2026-11-23): nada de modelo
 * pago até a direção ser aprovada. As regras cobrem o jeito comum de falar
 * ("R$ 320", "trezentos e vinte reais", "em novembro", "da Estância Aurora");
 * o que não acharem fica vazio e a equipe preenche na conferência — nunca um
 * chute. Trocar por um modelo de linguagem é trocar esta função: a entrada e
 * a saída (`Extracao`) ficam.
 *
 * Puro, sem banco: testável em `npm run test:unidade`.
 */

export const VERSAO_EXTRACAO = "regras-v1";

export type RubricaParaExtracao = { id: string; palavras_chave: string[] };
export type UnidadeParaExtracao = { id: string; nome: string };

export type Extracao = {
  versao: typeof VERSAO_EXTRACAO;
  unidade_id: string | null;
  rubrica_id: string | null;
  descricao: string | null;
  valor: number | null;
  /** `aaaa-mm-01`. */
  competencia: string | null;
  /** Campos que as regras não acharam — a tela pede atenção a eles. */
  faltou: Array<"cliente" | "rubrica" | "valor" | "competencia">;
};

/** Minúsculas, sem acento, pontuação vira espaço, espaços colapsados. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9$,.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Texto normalizado e só com palavras — para procurar termos inteiros. */
function emPalavras(texto: string): string {
  return ` ${normalizar(texto).replace(/[$,.]/g, " ").replace(/\s+/g, " ")} `;
}

// ---------------------------------------------------------------------
// Valor
// ---------------------------------------------------------------------

const UNIDADES: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7,
  oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14,
  quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30,
  quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100,
  cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400,
  quatrocentas: 400, quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600,
  setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900,
  novecentas: 900,
};

/** "trezentos e vinte" → 320; "dois mil e quinhentos" → 2500. `null` se não for número. */
export function numeroPorExtenso(palavras: string[]): number | null {
  let total = 0;
  let grupo = 0;
  let achou = false;
  for (const p of palavras) {
    if (p === "e") continue;
    if (p === "mil") {
      total += (grupo || 1) * 1000;
      grupo = 0;
      achou = true;
    } else if (p in UNIDADES) {
      grupo += UNIDADES[p];
      achou = true;
    } else {
      return null;
    }
  }
  return achou ? total + grupo : null;
}

/** "320", "320,50", "1.500", "1.500,00", "2,5" (com "mil" depois) → número. */
function numeroEscrito(bruto: string): number | null {
  let s = bruto.trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const MOEDA = "(?:reais|real|pila|pilas|conto|contos)";

export function extrairValor(texto: string): number | null {
  const t = normalizar(texto);

  // "R$ 320", "r$ 1.500,00", "R$ 2 mil"
  const cifrao = t.match(/r\$\s*(\d[\d.,]*)(\s*mil\b)?/);
  if (cifrao) {
    const n = numeroEscrito(cifrao[1]);
    if (n !== null) return arredondar(cifrao[2] ? n * 1000 : n);
  }

  // "320 reais", "2 mil reais", "1,5 mil pila"
  const algarismo = t.match(new RegExp(`(\\d[\\d.,]*)\\s*(mil\\s+)?${MOEDA}\\b`));
  if (algarismo) {
    const n = numeroEscrito(algarismo[1]);
    if (n !== null) return arredondar(algarismo[2] ? n * 1000 : n);
  }

  // "trezentos e vinte reais": as palavras numéricas logo antes da moeda.
  const palavras = emPalavras(texto).trim().split(" ");
  for (let i = 0; i < palavras.length; i++) {
    if (!new RegExp(`^${MOEDA}$`).test(palavras[i])) continue;
    let inicio = i;
    while (inicio > 0 && (palavras[inicio - 1] in UNIDADES || palavras[inicio - 1] === "mil" || palavras[inicio - 1] === "e")) {
      inicio--;
    }
    while (palavras[inicio] === "e") inicio++;
    const n = numeroPorExtenso(palavras.slice(inicio, i));
    if (n !== null && n > 0) return n;
  }
  return null;
}

function arredondar(n: number): number | null {
  return n > 0 ? Math.round(n * 100) / 100 : null;
}

// ---------------------------------------------------------------------
// Competência
// ---------------------------------------------------------------------

const MESES = [
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function mesIso(ano: number, mes0: number): string {
  return `${ano}-${String(mes0 + 1).padStart(2, "0")}-01`;
}

/**
 * "em novembro", "novembro de 2025", "mês passado", "este mês".
 *
 * Mês sem ano é o mais recente que não está no futuro: falando em novembro de
 * 2026, "dezembro" é dezembro de 2025. Lançamento é do que já aconteceu.
 */
export function extrairCompetencia(texto: string, hoje: Date): string | null {
  const t = emPalavras(texto);
  const anoHoje = hoje.getUTCFullYear();
  const mesHoje = hoje.getUTCMonth();

  const nomeado = t.match(new RegExp(` (${MESES.join("|")})(?: de)?(?: (\\d{4}))? `));
  if (nomeado) {
    const mes0 = MESES.indexOf(nomeado[1]);
    const ano = nomeado[2] ? Number(nomeado[2]) : mes0 <= mesHoje ? anoHoje : anoHoje - 1;
    return mesIso(ano, mes0);
  }
  if (/ mes passado /.test(t)) {
    return mesHoje === 0 ? mesIso(anoHoje - 1, 11) : mesIso(anoHoje, mesHoje - 1);
  }
  if (/ (este|esse|neste|nesse) mes /.test(t)) return mesIso(anoHoje, mesHoje);
  return null;
}

// ---------------------------------------------------------------------
// Rubrica e cliente
// ---------------------------------------------------------------------

/** A rubrica com mais termos encontrados. Empate ou nenhum: `null`. */
export function extrairRubrica(texto: string, rubricas: RubricaParaExtracao[]): string | null {
  const t = emPalavras(texto);
  let melhor: { id: string; pontos: number } | null = null;
  let empate = false;
  for (const r of rubricas) {
    const pontos = r.palavras_chave.filter((p) => t.includes(` ${normalizar(p)} `)).length;
    if (pontos === 0) continue;
    if (!melhor || pontos > melhor.pontos) {
      melhor = { id: r.id, pontos };
      empate = false;
    } else if (pontos === melhor.pontos) {
      empate = true;
    }
  }
  return melhor && !empate ? melhor.id : null;
}

const GENERICOS = /^(estancia|fazenda|sitio|granja|chacara|agropecuaria|propriedade) /;

/** Nome da unidade sem o que não se fala: "(provisório)", parênteses em geral. */
function nomeFalado(nome: string): string {
  return normalizar(nome.replace(/\(.*?\)/g, " ")).replace(/[$,.]/g, "").trim();
}

/**
 * A propriedade citada. Primeiro o nome inteiro ("estância aurora"); depois
 * só a parte própria ("aurora"), se ela identificar uma unidade só.
 */
export function extrairUnidade(texto: string, unidades: UnidadeParaExtracao[]): string | null {
  const t = emPalavras(texto);
  const inteiro = unidades.filter((u) => {
    const n = nomeFalado(u.nome);
    return n.length > 0 && t.includes(` ${n} `);
  });
  if (inteiro.length === 1) return inteiro[0].id;
  if (inteiro.length > 1) return null;

  const porParte = unidades.filter((u) => {
    const parte = nomeFalado(u.nome).replace(GENERICOS, "");
    return parte.length >= 4 && parte !== nomeFalado(u.nome) && t.includes(` ${parte} `);
  });
  return porParte.length === 1 ? porParte[0].id : null;
}

// ---------------------------------------------------------------------

/** Descrição sugerida: a própria fala, limpa e curta. A equipe ajusta. */
export function descricaoSugerida(texto: string): string | null {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (!limpo) return null;
  const curto = limpo.length > 200 ? `${limpo.slice(0, 197).trimEnd()}…` : limpo;
  return curto.charAt(0).toUpperCase() + curto.slice(1);
}

export function extrair(
  texto: string,
  contexto: { rubricas: RubricaParaExtracao[]; unidades: UnidadeParaExtracao[]; hoje: Date },
): Extracao {
  const unidade_id = extrairUnidade(texto, contexto.unidades);
  const rubrica_id = extrairRubrica(texto, contexto.rubricas);
  const valor = extrairValor(texto);
  const competencia = extrairCompetencia(texto, contexto.hoje);

  const faltou: Extracao["faltou"] = [];
  if (!unidade_id) faltou.push("cliente");
  if (!rubrica_id) faltou.push("rubrica");
  if (valor === null) faltou.push("valor");
  if (!competencia) faltou.push("competencia");

  return {
    versao: VERSAO_EXTRACAO,
    unidade_id,
    rubrica_id,
    descricao: descricaoSugerida(texto),
    valor,
    competencia,
    faltou,
  };
}
