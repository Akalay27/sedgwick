import React from "react";
import { ProcessingState } from "../types";

interface ProcessingLogsProps {
  processingState: ProcessingState;
}

export const ProcessingLogs: React.FC<ProcessingLogsProps> = ({
  processingState,
}) => {
  if (processingState.logs.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h3 className="text-lg font-medium mb-4 text-gray-900">
        Processing Logs
      </h3>
      <div className="border border-gray-200 rounded-md p-4 max-h-64 overflow-y-auto bg-gray-50">
        {processingState.logs.map((log, idx) => (
          <div key={idx} className="text-sm text-gray-700 font-mono py-0.5">
            {log}
          </div>
        ))}
      </div>
    </div>
  );
};