import { useState } from "react";
import { SelectedFiles } from "../types";

export const useFileSelection = (
  log: (message: string, type?: "info" | "warning" | "error") => void
) => {
  const [selectedFiles, setSelectedFiles] = useState<SelectedFiles>({
    pdfs: [],
    spreadsheet: null,
  });

  const selectPDFFolder = async () => {
    try {
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

  return {
    selectedFiles,
    selectPDFFolder,
    selectSpreadsheet,
  };
};