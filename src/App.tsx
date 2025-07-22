import { useState, useCallback } from "react";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
import * as fflate from "fflate";

// PDF.js worker setup
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";

interface Settings {
  dateCol: string;
  xmlIdCol: string;
  threshold: number;
  verbose: boolean;
  maxConcurrent: number;
  useExistingNames: boolean;
  pageStartIndex: number;
}

interface Toast {
  id: string;
  type: "error" | "warning" | "info";
  title: string;
  messages: string[];
  timestamp: number;
}

interface ProcessingState {
  isProcessing: boolean;
  progress: number;
  total: number;
  currentFile: string;
  logs: string[];
}

function App() {
  const [settings, setSettings] = useState<Settings>({
    dateCol: "Date",
    xmlIdCol: "XML ID",
    threshold: 250,
    verbose: false,
    maxConcurrent: Math.min(navigator.hardwareConcurrency || 4, 4),
    useExistingNames: false,
    pageStartIndex: 1,
  });

  const [showSettings, setShowSettings] = useState(false);
  const [processingState, setProcessingState] = useState<ProcessingState>({
    isProcessing: false,
    progress: 0,
    total: 0,
    currentFile: "",
    logs: [],
  });

  const [selectedFiles, setSelectedFiles] = useState<{
    pdfs: File[];
    spreadsheet: File | null;
  }>({
    pdfs: [],
    spreadsheet: null,
  });

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showGettingStarted, setShowGettingStarted] = useState(false);

  const addToast = useCallback(
    (type: Toast["type"], title: string, message: string) => {
      const toastId = Date.now().toString();
      setToasts((prev) => {
        // Check if we should group this toast with existing ones
        if (type === "warning" && title === "Duplicate Entries") {
          const existingToast = prev.find(
            (t) => t.title === title && t.type === type
          );
          if (existingToast) {
            return prev.map((t) =>
              t.id === existingToast.id
                ? {
                    ...t,
                    messages: [...t.messages, message],
                    timestamp: Date.now(),
                  }
                : t
            );
          }
        }

        const newToast: Toast = {
          id: toastId,
          type,
          title,
          messages: [message],
          timestamp: Date.now(),
        };

        return [...prev.slice(-4), newToast]; // Keep max 5 toasts
      });

      // No auto-dismiss since they're now contextual in the main pane
      // Users can manually dismiss when ready
    },
    []
  );

  const log = useCallback(
    (message: string, type: "info" | "warning" | "error" = "info") => {
      // Handle different message types
      if (message.includes("⚠️")) {
        if (message.includes("Duplicate date")) {
          const match = message.match(/Duplicate date '([^']+)'/);
          const date = match ? match[1] : "unknown";
          addToast(
            "warning",
            "Duplicate Entries",
            `Date "${date}" appears multiple times`
          );
        } else if (message.includes("missing column")) {
          const match = message.match(/Sheet '([^']+)'/);
          const sheet = match ? match[1] : "unknown";
          addToast(
            "warning",
            "Missing Columns",
            `Sheet "${sheet}" missing required columns`
          );
        } else {
          addToast("warning", "Warning", message.replace("⚠️ ", ""));
        }
      } else if (
        message.includes("Error:") ||
        message.includes("error") ||
        type === "error"
      ) {
        addToast("error", "Processing Error", message.replace("Error: ", ""));
      } else if (
        message.includes("No XML ID") ||
        message.includes("skipping")
      ) {
        addToast("warning", "Skipped Files", message);
      } else if (
        message.includes("Failed to") ||
        message.includes("Could not")
      ) {
        addToast("error", "Processing Failed", message);
      }

      // Only add non-warning/error messages to the main log
      if (
        !message.includes("⚠️") &&
        !message.includes("Error:") &&
        type !== "error" &&
        type !== "warning"
      ) {
        setProcessingState((prev) => ({
          ...prev,
          logs: [
            ...prev.logs.slice(-99),
            `${new Date().toLocaleTimeString()}: ${message}`,
          ],
        }));
      }
    },
    [addToast]
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const selectPDFFolder = async () => {
    try {
      if ("showDirectoryPicker" in window) {
        const dirHandle = await (
          window as unknown as {
            showDirectoryPicker: (options: any) => Promise<any>;
          }
        ).showDirectoryPicker({
          mode: "read",
        });

        const files: File[] = [];
        for await (const [name, handle] of dirHandle) {
          if (handle.kind === "file" && name.toLowerCase().endsWith(".pdf")) {
            files.push(await handle.getFile());
          }
        }

        setSelectedFiles((prev) => ({ ...prev, pdfs: files }));
        log(`Selected ${files.length} PDF files`);
      } else {
        const input = document.createElement("input");
        input.type = "file";
        input.webkitdirectory = true;
        input.accept = ".pdf";
        input.onchange = (e) => {
          const files = Array.from(
            (e.target as HTMLInputElement).files || []
          ).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
          setSelectedFiles((prev) => ({ ...prev, pdfs: files }));
          log(`Selected ${files.length} PDF files`);
        };
        input.click();
      }
    } catch (err) {
      log(`Error selecting PDFs: ${err}`);
    }
  };

  const selectSpreadsheet = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        setSelectedFiles((prev) => ({ ...prev, spreadsheet: file }));
        log(`Selected spreadsheet: ${file.name}`);
      }
    };
    input.click();
  };

  const buildDateToXmlMap = async (
    spreadsheet: File
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

      // Convert headers to strings for reliable comparison
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

  const cropWhitespace = (
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

  const processPDF = async (
    file: File,
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

  const exportResults = async (
    results: Map<string, { xmlId: string; images: Blob[] }>
  ) => {
    try {
      if ("showDirectoryPicker" in window) {
        const dirHandle = await (
          window as unknown as {
            showDirectoryPicker: (options: any) => Promise<any>;
          }
        ).showDirectoryPicker({
          mode: "readwrite",
        });

        const exportPromises: Promise<void>[] = [];

        for (const [, { xmlId, images }] of results) {
          for (let i = 0; i < images.length; i++) {
            const outputName = `${xmlId}-p${i + settings.pageStartIndex}.jpg`;
            const promise = (async () => {
              const fileHandle = await dirHandle.getFileHandle(outputName, {
                create: true,
              });
              const writable = await fileHandle.createWritable();
              await writable.write(images[i]);
              await writable.close();
            })();
            exportPromises.push(promise);
          }
        }

        await Promise.all(exportPromises);

        log(
          `Exported ${Array.from(results.values()).reduce(
            (sum, r) => sum + r.images.length,
            0
          )} images`
        );
      } else {
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
      }
    } catch (err) {
      log(`Export error: ${err}`, "error");
    }
  };

  const startProcessing = async () => {
    if (
      !settings.useExistingNames &&
      (!selectedFiles.spreadsheet || selectedFiles.pdfs.length === 0)
    ) {
      log("Please select both spreadsheet and PDF files");
      return;
    }

    if (settings.useExistingNames && selectedFiles.pdfs.length === 0) {
      log("Please select PDF files to process");
      return;
    }

    log(`Starting processing of ${selectedFiles.pdfs.length} PDF files...`);

    // Clear existing toasts
    setToasts([]);

    setProcessingState((prev) => ({
      ...prev,
      isProcessing: true,
      progress: 0,
      total: selectedFiles.pdfs.length,
      currentFile: "",
      logs: [],
    }));

    try {
      let dateMap: Map<string, string> | undefined;

      if (!settings.useExistingNames) {
        log("Reading mapping from spreadsheet...");
        dateMap = await buildDateToXmlMap(selectedFiles.spreadsheet!);
        log(`→ ${dateMap.size} entries loaded`);

        if (settings.verbose) {
          log(
            `Available mappings: ${Array.from(dateMap.keys())
              .slice(0, 5)
              .join(", ")}${dateMap.size > 5 ? "..." : ""}`
          );
          log(
            `Selected PDF names: ${selectedFiles.pdfs
              .slice(0, 3)
              .map((f) => f.name.replace(/\.pdf$/i, ""))
              .join(", ")}${selectedFiles.pdfs.length > 3 ? "..." : ""}`
          );
        }
      } else {
        log(
          "Using existing PDF filenames as XML IDs (no spreadsheet mapping needed)"
        );
        if (settings.verbose) {
          log(
            `PDF names to process: ${selectedFiles.pdfs
              .slice(0, 5)
              .map((f) => f.name.replace(/\.pdf$/i, ""))
              .join(", ")}${selectedFiles.pdfs.length > 5 ? "..." : ""}`
          );
        }
      }

      const results = new Map<string, { xmlId: string; images: Blob[] }>();
      const maxConcurrent = settings.maxConcurrent;

      log(`Processing in batches of ${maxConcurrent}...`);

      const processBatch = async (files: File[]) => {
        log(
          `Processing batch of ${files.length} files: ${files
            .map((f) => f.name)
            .join(", ")}`
        );

        const batchResults = await Promise.all(
          files.map(async (file) => {
            const result = await processPDF(file, dateMap);
            if (result.images.length > 0 && result.xmlId) {
              return {
                fileName: file.name,
                xmlId: result.xmlId,
                images: result.images,
              };
            }
            return null;
          })
        );

        let successCount = 0;
        batchResults.forEach((result) => {
          if (result) {
            results.set(result.fileName, {
              xmlId: result.xmlId,
              images: result.images,
            });
            successCount++;
          }
        });

        log(
          `Batch completed: ${successCount}/${files.length} files processed successfully`
        );

        setProcessingState((prev) => ({
          ...prev,
          progress: prev.progress + files.length,
        }));
      };

      for (let i = 0; i < selectedFiles.pdfs.length; i += maxConcurrent) {
        const batch = selectedFiles.pdfs.slice(i, i + maxConcurrent);
        const batchNum = Math.floor(i / maxConcurrent) + 1;
        const totalBatches = Math.ceil(
          selectedFiles.pdfs.length / maxConcurrent
        );

        setProcessingState((prev) => ({
          ...prev,
          currentFile: `Processing batch ${batchNum}/${totalBatches}...`,
        }));

        await processBatch(batch);
      }

      setProcessingState((prev) => ({
        ...prev,
        progress: selectedFiles.pdfs.length,
        currentFile: "Processing complete",
      }));

      log(
        `Processing complete! Successfully processed ${results.size}/${selectedFiles.pdfs.length} files`
      );

      if (results.size > 0) {
        log("Starting export...");
        await exportResults(results);
        log("Export complete!");
      } else {
        if (settings.useExistingNames) {
          log(
            "No files were successfully processed - check PDF files and settings"
          );
        } else {
          log(
            "No files were successfully processed - check that PDF filenames match the spreadsheet entries"
          );
        }
      }

      log("All done!");
    } catch (error) {
      log(`${error}`, "error");
      console.error("Processing error:", error);
    } finally {
      setProcessingState((prev) => ({
        ...prev,
        isProcessing: false,
        currentFile: "",
      }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="min-h-screen p-4">
        <div className="max-w-4xl mx-auto">
          <header className="text-center mb-8">
            <h1 className="text-3xl font-medium text-gray-900 mb-2">
              PDF to JPEG Converter
            </h1>
            <p className="text-gray-600 text-sm mb-4">
              Made for CMS Letter Processing
            </p>
            <button
              onClick={() => setShowGettingStarted(true)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:border-gray-400 hover:bg-gray-50 transition-all text-sm font-medium"
            >
              Getting Started
            </button>
          </header>

          <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-medium text-gray-900">
                File Selection
              </h2>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="px-3 py-1.5 border border-gray-400 text-gray-700 rounded-md hover:border-gray-500 hover:bg-gray-50 hover:shadow-sm transition-all text-sm font-medium"
              >
                Settings
              </button>
            </div>

            {showSettings && (
              <div className="border border-gray-200 rounded-md p-4 mb-6">
                <h3 className="text-lg font-medium mb-4 text-gray-900">
                  Processing Settings
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date Column
                    </label>
                    <input
                      type="text"
                      value={settings.dateCol}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          dateCol: e.target.value,
                        }))
                      }
                      disabled={settings.useExistingNames}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-gray-400 focus:border-gray-400 disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      XML ID Column
                    </label>
                    <input
                      type="text"
                      value={settings.xmlIdCol}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          xmlIdCol: e.target.value,
                        }))
                      }
                      disabled={settings.useExistingNames}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-gray-400 focus:border-gray-400 disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Crop Threshold (0-255)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="255"
                      value={settings.threshold}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          threshold: parseInt(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max Concurrent Processing
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="8"
                      value={settings.maxConcurrent}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          maxConcurrent: parseInt(e.target.value) || 1,
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Number of PDFs to process simultaneously
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Page Start Index
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="99"
                      value={settings.pageStartIndex}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          pageStartIndex: parseInt(e.target.value) || 1,
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Starting number for page naming (e.g., 1 = -p1, -p2, etc.)
                    </p>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="useExistingNames"
                      checked={settings.useExistingNames}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          useExistingNames: e.target.checked,
                        }))
                      }
                      className="mr-2"
                    />
                    <label
                      htmlFor="useExistingNames"
                      className="text-sm font-medium text-gray-700"
                    >
                      PDFs already have correct XML names
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="verbose"
                      checked={settings.verbose}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          verbose: e.target.checked,
                        }))
                      }
                      className="mr-2"
                    />
                    <label
                      htmlFor="verbose"
                      className="text-sm font-medium text-gray-700"
                    >
                      Verbose Logging
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <button
                  onClick={selectPDFFolder}
                  className="w-full px-4 py-3 border-2 border-gray-300 text-gray-800 rounded-md hover:border-gray-500 hover:bg-white hover:shadow-sm transition-all font-semibold"
                >
                  Select PDF Folder ({selectedFiles.pdfs.length} files selected)
                </button>
              </div>

              {!settings.useExistingNames && (
                <div>
                  <button
                    onClick={selectSpreadsheet}
                    className="w-full px-4 py-3 border-2 border-gray-300 text-gray-800 rounded-md hover:border-gray-500 hover:bg-white hover:shadow-sm transition-all font-semibold"
                  >
                    Select Spreadsheet{" "}
                    {selectedFiles.spreadsheet
                      ? `(${selectedFiles.spreadsheet.name})`
                      : ""}
                  </button>
                </div>
              )}

              {settings.useExistingNames && (
                <div className="border border-gray-200 rounded-md p-4 bg-gray-50">
                  <p className="text-sm text-gray-700">
                    <strong>Using existing PDF filenames:</strong> No
                    spreadsheet needed. PDFs will be processed using their
                    filename (without .pdf) as the XML ID.
                  </p>
                </div>
              )}

              <div>
                <button
                  onClick={startProcessing}
                  disabled={
                    processingState.isProcessing ||
                    (!settings.useExistingNames &&
                      !selectedFiles.spreadsheet) ||
                    selectedFiles.pdfs.length === 0
                  }
                  className="w-full px-4 py-3 bg-gray-900 text-white rounded-md hover:bg-gray-800 hover:shadow-md disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-all font-semibold"
                >
                  {processingState.isProcessing
                    ? "Processing..."
                    : "Start Conversion"}
                </button>
              </div>
            </div>
          </div>

          {/* Issues Panel */}
          {toasts.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Issues & Warnings ({toasts.length})
                </h3>
                <button
                  onClick={() => setToasts([])}
                  className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-md hover:border-gray-400 hover:bg-gray-50 transition-all"
                >
                  Clear All
                </button>
              </div>
              <div className="space-y-3">
                {toasts.map((toast) => (
                  <div
                    key={toast.id}
                    className={`border-l-4 rounded-md p-4 transition-all duration-300 ${
                      toast.type === "error"
                        ? "border-red-500 bg-red-50"
                        : toast.type === "warning"
                        ? "border-yellow-500 bg-yellow-50"
                        : "border-blue-500 bg-blue-50"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center">
                          <span
                            className={`text-sm font-medium ${
                              toast.type === "error"
                                ? "text-red-800"
                                : toast.type === "warning"
                                ? "text-yellow-800"
                                : "text-blue-800"
                            }`}
                          >
                            {toast.type === "error"
                              ? "⚠️"
                              : toast.type === "warning"
                              ? "⚠️"
                              : "ℹ️"}{" "}
                            {toast.title}
                          </span>
                        </div>
                        <div className="mt-2">
                          {toast.messages.length === 1 ? (
                            <p className="text-sm text-gray-700">
                              {toast.messages[0]}
                            </p>
                          ) : (
                            <div className="text-sm text-gray-700">
                              <p className="mb-2 font-medium">
                                {toast.messages.length} issues:
                              </p>
                              <ul className="list-disc list-inside space-y-1 pl-4">
                                {toast.messages.slice(0, 10).map((msg, idx) => (
                                  <li
                                    key={idx}
                                    className="text-sm leading-relaxed"
                                  >
                                    {msg}
                                  </li>
                                ))}
                                {toast.messages.length > 10 && (
                                  <li className="text-sm text-gray-500 italic">
                                    ...and {toast.messages.length - 10} more
                                  </li>
                                )}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => dismissToast(toast.id)}
                        className="ml-4 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                        title="Dismiss"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {processingState.isProcessing && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-medium mb-4 text-gray-900">
                Progress
              </h3>
              <div className="w-full bg-gray-200 rounded-md h-2 mb-4">
                <div
                  className="bg-gray-700 h-2 rounded-md transition-all duration-300"
                  style={{
                    width: `${
                      (processingState.progress / processingState.total) * 100
                    }%`,
                  }}
                ></div>
              </div>
              <p className="text-sm text-gray-600">
                {processingState.progress} of {processingState.total} files
                processed
              </p>
              {processingState.currentFile && (
                <p className="text-sm text-gray-800 font-medium">
                  {processingState.currentFile}
                </p>
              )}
            </div>
          )}

          {processingState.logs.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-medium mb-4 text-gray-900">
                Processing Logs
              </h3>
              <div className="border border-gray-200 rounded-md p-4 max-h-64 overflow-y-auto bg-gray-50">
                {processingState.logs.map((log, idx) => (
                  <div
                    key={idx}
                    className="text-sm text-gray-700 font-mono py-0.5"
                  >
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Getting Started Modal */}
          {showGettingStarted && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-gray-900">
                      Getting Started Guide
                    </h2>
                    <button
                      onClick={() => setShowGettingStarted(false)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-6">
                    <section>
                      <h3 className="text-lg font-medium text-gray-800 mb-3">
                        How It Works
                      </h3>
                      <p className="text-gray-700 mb-3">
                        This app converts PDF files into individual JPEG images
                        with automatic whitespace cropping. You can use it in
                        two modes:
                      </p>
                      <ul className="list-disc list-inside space-y-2 text-gray-700 pl-4">
                        <li>
                          <strong>Excel Mapping Mode:</strong> Uses a
                          spreadsheet to map PDF filenames to XML IDs
                        </li>
                        <li>
                          <strong>Direct Mode:</strong> Uses PDF filenames
                          directly as XML IDs
                        </li>
                      </ul>
                    </section>

                    <section>
                      <h3 className="text-lg font-medium text-gray-800 mb-3">
                        Step-by-Step Instructions
                      </h3>
                      <ol className="list-decimal list-inside space-y-3 text-gray-700 pl-4">
                        <li>
                          <strong>Choose your mode:</strong>
                          <ul className="list-disc list-inside mt-1 ml-4 space-y-1 text-sm">
                            <li>
                              For spreadsheet mapping: Keep "PDFs already have
                              correct XML names" unchecked
                            </li>
                            <li>
                              For direct filename use: Check "PDFs already have
                              correct XML names" in Settings
                            </li>
                          </ul>
                        </li>
                        <li>
                          <strong>Select PDF Folder:</strong> Choose the folder
                          containing your PDF files
                        </li>
                        <li>
                          <strong>Select Spreadsheet:</strong> (Only if using
                          Excel mapping) Choose your Excel file with Date and
                          XML ID columns
                        </li>
                        <li>
                          <strong>Adjust Settings:</strong> Configure column
                          names, cropping threshold, and page numbering
                        </li>
                        <li>
                          <strong>Start Conversion:</strong> Click the button
                          and choose where to save the images
                        </li>
                      </ol>
                    </section>

                    <section>
                      <h3 className="text-lg font-medium text-gray-800 mb-3">
                        Settings Explained
                      </h3>
                      <ul className="space-y-2 text-gray-700">
                        <li>
                          <strong>Date Column:</strong> Excel column name
                          containing dates that match PDF filenames
                        </li>
                        <li>
                          <strong>XML ID Column:</strong> Excel column name
                          containing the desired output XML IDs
                        </li>
                        <li>
                          <strong>Crop Threshold:</strong> Lower values = more
                          aggressive cropping (0-255)
                        </li>
                        <li>
                          <strong>Max Concurrent:</strong> Number of PDFs to
                          process simultaneously
                        </li>
                        <li>
                          <strong>Page Start Index:</strong> Starting number for
                          page naming (e.g., 0 = -p0, -p1 or 1 = -p1, -p2)
                        </li>
                      </ul>
                    </section>

                    <section>
                      <h3 className="text-lg font-medium text-gray-800 mb-3">
                        Output Format
                      </h3>
                      <p className="text-gray-700">
                        Images are saved as:{" "}
                        <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                          xmlid-p1.jpg
                        </code>
                        ,
                        <code className="bg-gray-100 px-2 py-1 rounded text-sm ml-1">
                          xmlid-p2.jpg
                        </code>
                        , etc.
                      </p>
                    </section>

                    <section>
                      <h3 className="text-lg font-medium text-gray-800 mb-3">
                        Troubleshooting
                      </h3>
                      <ul className="list-disc list-inside space-y-1 text-gray-700 pl-4">
                        <li>
                          Check that PDF filenames match your spreadsheet
                          entries exactly
                        </li>
                        <li>
                          Enable Verbose Logging to see detailed processing
                          information
                        </li>
                        <li>
                          Review Issues & Warnings panel for specific problems
                        </li>
                        <li>
                          Try lowering Max Concurrent if you encounter memory
                          issues
                        </li>
                      </ul>
                    </section>
                  </div>

                  <div className="mt-6 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => setShowGettingStarted(false)}
                      className="w-full px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors font-medium"
                    >
                      Got It!
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer - only visible when scrolling */}
      <footer className="bg-gray-100 border-t border-gray-200 py-8">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-gray-600 text-sm">Made by Adam Kalayjian 2025</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
