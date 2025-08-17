import { useState, useCallback } from "react";
import { ProcessingState, Settings, SelectedFiles, Toast } from "../types";
import { buildDateToXmlMap, processPDF, exportResults } from "../utils/pdfProcessor";

export const useProcessing = (
  addToast: (type: Toast["type"], title: string, message: string) => void,
  setToasts: (toasts: Toast[]) => void
) => {
  const [processingState, setProcessingState] = useState<ProcessingState>({
    isProcessing: false,
    progress: 0,
    total: 0,
    currentFile: "",
    logs: [],
  });

  const log = useCallback(
    (message: string, type: "info" | "warning" | "error" = "info") => {
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

  const startProcessing = async (
    settings: Settings,
    selectedFiles: SelectedFiles
  ) => {
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
        dateMap = await buildDateToXmlMap(selectedFiles.spreadsheet!, settings, log);
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
            const result = await processPDF(file, settings, log, dateMap);
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
        await exportResults(results, settings, log);
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

  return {
    processingState,
    startProcessing,
  };
};