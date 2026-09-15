export type ExtractedPdfSource = {
  name: string;
  text: string;
  pageCount: number;
  extractedPages: number;
  truncated: boolean;
};

const MAX_PAGES_PER_PDF = 80;
const MAX_CHARACTERS_PER_PDF = 120_000;

export async function extractPdfText(name: string, href: string): Promise<ExtractedPdfSource> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const response = await fetch(href, { cache: "no-store" });
  if (!response.ok) throw new Error(`Não foi possível ler “${name}”.`);
  const bytes = await response.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: bytes.slice(0) });
  const document = await loadingTask.promise;
  const pageCount = document.numPages;
  const pageLimit = Math.min(pageCount, MAX_PAGES_PER_PDF);
  const sections: string[] = [];
  let characterCount = 0;
  let extractedPages = 0;
  let truncated = pageCount > pageLimit;

  try {
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => "str" in item ? item.str : "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (!pageText) continue;
      const section = `[Página ${pageNumber}]\n${pageText}`;
      if (characterCount + section.length > MAX_CHARACTERS_PER_PDF) {
        const remaining = Math.max(0, MAX_CHARACTERS_PER_PDF - characterCount);
        if (remaining) sections.push(section.slice(0, remaining));
        truncated = true;
        break;
      }
      sections.push(section);
      characterCount += section.length;
      extractedPages += 1;
    }
  } finally {
    await document.destroy();
  }

  return {
    name,
    text: sections.join("\n\n"),
    pageCount,
    extractedPages,
    truncated,
  };
}
