import { PageItem } from "./readerTypes";

/**
 * Client-side parser for local .cbz / .zip files.
 * Reads the central directory and local headers of a ZIP file,
 * extracts image files (jpg, png, webp, gif, avif) in alphabetical/numerical order,
 * and creates Object URLs for instant reader mounting.
 */
export async function parseLocalCbzFile(file: File): Promise<{ title: string; pages: PageItem[] }> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Find End of Central Directory (EOCD) signature: 0x06054b50
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error("Arquivo ZIP/CBZ inválido ou corrompido");
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirSize = view.getUint32(eocdOffset + 12, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  const decoder = new TextDecoder();
  const extractedFiles: { name: string; blob: Blob }[] = [];

  let curOffset = centralDirOffset;
  for (let i = 0; i < totalEntries && curOffset < eocdOffset; i++) {
    const sig = view.getUint32(curOffset, true);
    if (sig !== 0x02014b50) break; // central dir signature

    const method = view.getUint16(curOffset + 10, true);
    const compSize = view.getUint32(curOffset + 20, true);
    const uncompSize = view.getUint32(curOffset + 24, true);
    const nameLen = view.getUint16(curOffset + 28, true);
    const extraLen = view.getUint16(curOffset + 30, true);
    const commentLen = view.getUint16(curOffset + 32, true);
    const localHeaderOffset = view.getUint32(curOffset + 42, true);

    const nameBytes = bytes.subarray(curOffset + 46, curOffset + 46 + nameLen);
    const fileName = decoder.decode(nameBytes);

    // Filter images only
    const lower = fileName.toLowerCase();
    const isImage = /\.(jpe?g|png|webp|gif|avif)$/i.test(lower) && !lower.startsWith("__macosx") && !lower.includes("/.");

    if (isImage) {
      // Read local header to get precise data offset
      const localNameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;

      const rawData = bytes.subarray(dataStart, dataStart + compSize);

      let blobData: Uint8Array = rawData;
      let contentType = "image/jpeg";
      if (lower.endsWith(".png")) contentType = "image/png";
      else if (lower.endsWith(".webp")) contentType = "image/webp";
      else if (lower.endsWith(".gif")) contentType = "image/gif";
      else if (lower.endsWith(".avif")) contentType = "image/avif";

      if (method === 0) {
        // Stored (no compression) — standard for most CBZs
        blobData = rawData;
      } else if (method === 8) {
        // Deflated — use browser DecompressionStream if available
        if (typeof DecompressionStream !== "undefined") {
          try {
            const ds = new DecompressionStream("deflate-raw");
            const writer = ds.writable.getWriter();
            writer.write(rawData as any);
            writer.close();
            const response = new Response(ds.readable);
            blobData = new Uint8Array(await response.arrayBuffer());
          } catch {
            // fallback
            blobData = rawData;
          }
        }
      }

      extractedFiles.push({
        name: fileName,
        blob: new Blob([blobData as any], { type: contentType }),
      });
    }

    curOffset += 46 + nameLen + extraLen + commentLen;
  }

  // Sort files naturally (01.jpg, 02.jpg, 10.jpg)
  extractedFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));

  if (extractedFiles.length === 0) {
    throw new Error("Nenhuma imagem suportada (.jpg, .png, .webp) encontrada dentro do arquivo CBZ");
  }

  const pages: PageItem[] = extractedFiles.map((file, idx) => ({
    id: `local-cbz-${idx + 1}`,
    url: URL.createObjectURL(file.blob),
  }));

  const safeTitle = file.name.replace(/\.(cbz|zip)$/i, "");
  return { title: safeTitle, pages };
}
