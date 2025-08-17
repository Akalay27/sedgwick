export interface Settings {
  dateCol: string;
  xmlIdCol: string;
  threshold: number;
  verbose: boolean;
  maxConcurrent: number;
  useExistingNames: boolean;
  pageStartIndex: number;
}

export interface Toast {
  id: string;
  type: "error" | "warning" | "info";
  title: string;
  messages: string[];
  timestamp: number;
}

export interface ProcessingState {
  isProcessing: boolean;
  progress: number;
  total: number;
  currentFile: string;
  logs: string[];
}

export interface SelectedFiles {
  pdfs: File[];
  spreadsheet: File | null;
}