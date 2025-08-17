import React from "react";
import { Settings as SettingsType } from "../types";

interface SettingsProps {
  settings: SettingsType;
  setSettings: React.Dispatch<React.SetStateAction<SettingsType>>;
  showSettings: boolean;
}

export const Settings: React.FC<SettingsProps> = ({
  settings,
  setSettings,
  showSettings,
}) => {
  if (!showSettings) return null;

  return (
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
  );
};