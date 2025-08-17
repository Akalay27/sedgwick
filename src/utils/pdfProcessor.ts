import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
import * as fflate from "fflate";
import { Settings } from "../types";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";

export const buildDateToXmlMap = async (
  spreadsheet: File,
  settings: Settings,
  log: (message: string, type?: "info" | "warning" | "error") => void
): Promise<Map<string, string>> => {
  const arrayBuffer = await spreadsheet.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer);
  const mapping = new Map<string, string>();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
    }) as unknown[][];

    if (data.length < 2) continue;

    const headers = data[0].map((header: unknown) =>
      String(header || "").trim()
    );
    const dateIdx = headers.indexOf(settings.dateCol);
    const xmlIdIdx = headers.indexOf(settings.xmlIdCol);

    if (settings.verbose) {
      log(
        `Sheet '${sheetName}' headers: ${headers.slice(0, 10).join(", ")}${
          headers.length > 10 ? "..." : ""
        }`
      );
      log(
        `Looking for '${settings.dateCol}' (found at index ${dateIdx}) and '${settings.xmlIdCol}' (found at index ${xmlIdIdx})`
      );
    }

    if (dateIdx === -1 || xmlIdIdx === -1) {
      log(
        `⚠️ Sheet '${sheetName}' missing column '${settings.dateCol}' or '${settings.xmlIdCol}', skipping`
      );
      continue;
    }

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const dateVal = row[dateIdx];
      const xmlId = row[xmlIdIdx];

      if (dateVal && xmlId) {
        const dateStr = String(dateVal).trim();
        if (mapping.has(dateStr)) {
          log(
            `⚠️ Duplicate date '${dateStr}' in sheet '${sheetName}', overwriting ${mapping.get(
              dateStr
            )} with ${xmlId}`
          );
        }
        mapping.set(dateStr, String(xmlId).trim());
      }
    }

    log(
      `Sheet '${sheetName}' processed: ${data.length - 1} rows, found ${
        Array.from(mapping.keys()).length
      } valid mappings so far`
    );
  }

  return mapping;
};

export const cropWhitespace = (
  canvas: HTMLCanvasElement,
  threshold: number
): HTMLCanvasElement => {
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  let minX = canvas.width,
    minY = canvas.height,
    maxX = 0,
    maxY = 0;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const idx = (y * canvas.width + x) * 4;
      const r = data[idx],
        g = data[idx + 1],
        b = data[idx + 2];
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

      if (gray < threshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (minX >= maxX || minY >= maxY) return canvas;

  const croppedCanvas = document.createElement("canvas");
  const croppedCtx = croppedCanvas.getContext("2d")!;
  croppedCanvas.width = maxX - minX + 1;
  croppedCanvas.height = maxY - minY + 1;

  croppedCtx.drawImage(
    canvas,
    minX,
    minY,
    croppedCanvas.width,
    croppedCanvas.height,
    0,
    0,
    croppedCanvas.width,
    croppedCanvas.height
  );

  return croppedCanvas;
};

export const processPDF = async (
  file: File,
  settings: Settings,
  log: (message: string, type?: "info" | "warning" | "error") => void,
  dateMap?: Map<string, string>
): Promise<{ images: Blob[]; xmlId: string }> => {
  const base = file.name.replace(/\.pdf$/i, "");
  let xmlId: string;

  if (settings.useExistingNames) {
    xmlId = base;
    log(`Processing '${base}' using existing filename as XML ID`);
  } else {
    if (!dateMap) {
      log(`Error: No mapping provided for '${base}'`);
      return { images: [], xmlId: "" };
    }

    const mappedId = dateMap.get(base);

    if (settings.verbose) {
      log(`Processing '${base}', looking for XML ID...`);
    }

    if (!mappedId) {
      log(`No XML ID for '${base}', skipping`, "warning");
      return { images: [], xmlId: "" };
    }

    xmlId = mappedId;
    log(`Processing '${base}' -> '${xmlId}'`);
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const images: Blob[] = [];

    log(`PDF '${base}' has ${pdf.numPages} pages`);

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({
        canvasContext: ctx,
        viewport: viewport,
      }).promise;

      const croppedCanvas = cropWhitespace(canvas, settings.threshold);

      const blob = await new Promise<Blob>((resolve) => {
        croppedCanvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.92);
      });

      images.push(blob);

      if (settings.verbose) {
        log(`Processed page ${i}/${pdf.numPages} of '${base}'`);
      }
    }

    log(`Converted '${base}' to ${images.length} images`);
    return { images, xmlId };
  } catch (error) {
    log(`Error processing '${base}': ${error}`, "error");
    return { images: [], xmlId };
  }
};

export const exportResults = async (
  results: Map<string, { xmlId: string; images: Blob[] }>,
  settings: Settings,
  log: (message: string, type?: "info" | "warning" | "error") => void
) => {
  try {
    const files: Record<string, Uint8Array> = {};
    let totalImages = 0;

    for (const [, { xmlId, images }] of results) {
      for (let i = 0; i < images.length; i++) {
        const outputName = `${xmlId}-p${i + settings.pageStartIndex}.jpg`;
        const arrayBuffer = await images[i].arrayBuffer();
        files[outputName] = new Uint8Array(arrayBuffer);
        totalImages++;
      }
    }

    const zipped = fflate.zipSync(files);
    const blob = new Blob([zipped], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "converted-images.zip";
    a.click();
    URL.revokeObjectURL(url);
    log(`Downloaded zip with ${totalImages} images`);
  } catch (err) {
    log(`Export error: ${err}`, "error");
  }
};