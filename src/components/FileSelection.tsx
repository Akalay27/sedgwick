import React from "react";
import { Settings as SettingsType, ProcessingState, SelectedFiles } from "../types";
import { Settings } from "./Settings";

interface FileSelectionProps {
  settings: SettingsType;
  setSettings: React.Dispatch<React.SetStateAction<SettingsType>>;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  selectedFiles: SelectedFiles;
  selectPDFFolder: () => void;
  selectSpreadsheet: () => void;
  startProcessing: () => void;
  processingState: ProcessingState;
}

export const FileSelection: React.FC<FileSelectionProps> = ({
  settings,
  setSettings,
  showSettings,
  setShowSettings,
  selectedFiles,
  selectPDFFolder,
  selectSpreadsheet,
  startProcessing,
  processingState,
}) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-medium text-gray-900">File Selection</h2>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="px-3 py-1.5 border border-gray-400 text-gray-700 rounded-md hover:border-gray-500 hover:bg-gray-50 hover:shadow-sm transition-all text-sm font-medium"
        >
          Settings
        </button>
      </div>

      <Settings
        settings={settings}
        setSettings={setSettings}
        showSettings={showSettings}
      />

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
              <strong>Using existing PDF filenames:</strong> No spreadsheet
              needed. PDFs will be processed using their filename (without
              .pdf) as the XML ID.
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
            {processingState.isProcessing ? "Processing..." : "Start Conversion"}
          </button>
        </div>
      </div>
    </div>
  );
};