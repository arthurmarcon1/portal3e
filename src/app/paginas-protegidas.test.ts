import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Toda página das áreas logadas passa por `paginaProtegida`.
 *
 * É o que transforma a regra em padrão: módulo novo que esquecer a guarda
 * quebra a suíte, não a produção. Ver `src/lib/auth/pagina-protegida.tsx`
 * para o porquê de a guarda morar na página e não no layout.
 */

const RAIZ = join(process.cwd(), "src", "app");

const AREAS = {
  "(admin)": "interno",
  "(contratante)": "contratante",
  "(funcionario)": "funcionario",
} as const;

function arquivos(dir: string, nome: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const caminho = join(dir, e.name);
    if (e.isDirectory()) return arquivos(caminho, nome);
    return e.name === nome ? [caminho] : [];
  });
}

describe("páginas das áreas logadas", () => {
  for (const [area, tipo] of Object.entries(AREAS)) {
    const paginas = arquivos(join(RAIZ, area), "page.tsx");

    it(`${area} tem páginas para verificar`, () => {
      expect(paginas.length).toBeGreaterThan(0);
    });

    for (const pagina of paginas) {
      const nome = relative(RAIZ, pagina);

      it(`${nome} exporta paginaProtegida com tipo "${tipo}"`, () => {
        const codigo = readFileSync(pagina, "utf8");
        expect(
          codigo,
          `${nome}: toda página de ${area} precisa de \`export default paginaProtegida({ tipo: "${tipo}", … }, …)\``,
        ).toMatch(new RegExp(`export default paginaProtegida\\(\\s*\\{\\s*tipo: "${tipo}"`));
      });
    }
  }

  it("nenhum layout usa exigirPermissao — no layout, ela vira 500 e não segura a página", () => {
    const layouts = Object.keys(AREAS).flatMap((area) => arquivos(join(RAIZ, area), "layout.tsx"));
    const comGuarda = layouts
      .filter((l) => /exigirPermissao\s*\(/.test(readFileSync(l, "utf8")))
      .map((l) => relative(RAIZ, l));
    expect(comGuarda).toEqual([]);
  });
});
