import React from "react";
import { Toast } from "../types";

interface IssuesPanelProps {
  toasts: Toast[];
  dismissToast: (id: string) => void;
  setToasts: (toasts: Toast[]) => void;
}

export const IssuesPanel: React.FC<IssuesPanelProps> = ({
  toasts,
  dismissToast,
  setToasts,
}) => {
  if (toasts.length === 0) return null;

  return (
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
                          <li key={idx} className="text-sm leading-relaxed">
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
  );
};