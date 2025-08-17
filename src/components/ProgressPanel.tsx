import React from "react";
import { ProcessingState } from "../types";

interface ProgressPanelProps {
  processingState: ProcessingState;
}

export const ProgressPanel: React.FC<ProgressPanelProps> = ({
  processingState,
}) => {
  if (!processingState.isProcessing) return null;

  return (
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
        {processingState.progress} of {processingState.total} files processed
      </p>
      {processingState.currentFile && (
        <p className="text-sm text-gray-800 font-medium">
          {processingState.currentFile}
        </p>
      )}
    </div>
  );
};