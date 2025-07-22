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

  const log = useCallback((message: string) => {
    setProcessingState((prev) => ({
      ...prev,
      logs: [
        ...prev.logs.slice(-99),
        `${new Date().toLocaleTimeString()}: ${message}`,
      ],
    }));
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
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];

      if (data.length < 2) continue;

      const headers = data[0];
      const dateIdx = headers.indexOf(settings.dateCol);
      const xmlIdIdx = headers.indexOf(settings.xmlIdCol);

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
        log(`No XML ID for '${base}', skipping`);
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
      log(`Error processing '${base}': ${error}`);
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
            const outputName = `${xmlId}-p${i + 1}.jpg`;
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
            const outputName = `${xmlId}-p${i + 1}.jpg`;
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
      log(`Export error: ${err}`);
    }
  };

  const startProcessing = async () => {
    if (!settings.useExistingNames && (!selectedFiles.spreadsheet || selectedFiles.pdfs.length === 0)) {
      log("Please select both spreadsheet and PDF files");
      return;
    }
    
    if (settings.useExistingNames && selectedFiles.pdfs.length === 0) {
      log("Please select PDF files to process");
      return;
    }

    log(`Starting processing of ${selectedFiles.pdfs.length} PDF files...`);

    setProcessingState((prev) => ({
      ...prev,
      isProcessing: true,
      progress: 0,
      total: selectedFiles.pdfs.length,
      currentFile: "",
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
        log("Using existing PDF filenames as XML IDs (no spreadsheet mapping needed)");
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
              return { fileName: file.name, xmlId: result.xmlId, images: result.images };
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
          log("No files were successfully processed - check PDF files and settings");
        } else {
          log("No files were successfully processed - check that PDF filenames match the spreadsheet entries");
        }
      }

      log("All done!");
    } catch (error) {
      log(`Error: ${error}`);
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
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-medium text-gray-900 mb-2">
            PDF to JPEG Converter
          </h1>
          <p className="text-gray-600 text-sm">
            Convert PDFs to cropped JPEGs with optional Excel mapping
          </p>
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
                  <strong>Using existing PDF filenames:</strong> No spreadsheet needed. 
                  PDFs will be processed using their filename (without .pdf) as the XML ID.
                </p>
              </div>
            )}

            <div>
              <button
                onClick={startProcessing}
                disabled={
                  processingState.isProcessing ||
                  (!settings.useExistingNames && !selectedFiles.spreadsheet) ||
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

        {processingState.isProcessing && (
          <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-medium mb-4 text-gray-900">Progress</h3>
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
            <h3 className="text-lg font-medium mb-4 text-gray-900">Processing Log</h3>
            <div className="border border-gray-200 rounded-md p-4 max-h-64 overflow-y-auto bg-gray-50">
              {processingState.logs.map((log, idx) => (
                <div key={idx} className="text-sm text-gray-700 font-mono py-0.5">{log}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
