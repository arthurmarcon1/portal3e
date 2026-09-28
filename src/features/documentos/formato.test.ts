import { describe, expect, it } from "vitest";

import { formatarBytes, formatarData, formatarDataHora } from "./formato";

describe("formato de documento", () => {
  it("data civil sem fuso", () => {
    expect(formatarData("2026-10-03")).toBe("03/10/2026");
    expect(formatarData(null)).toBe("—");
  });

  it("data e hora em Brasília", () => {
    // 01:30 UTC de 29/set = 22:30 de 28/set em Brasília.
    expect(formatarDataHora("2026-09-29T01:30:00Z")).toBe("28/09/2026, 22:30");
  });

  it("tamanho legível", () => {
    expect(formatarBytes(200)).toBe("1 KB");
    expect(formatarBytes(512 * 1024)).toBe("512 KB");
    expect(formatarBytes(3.5 * 1024 * 1024)).toBe("3,5 MB");
  });
});
