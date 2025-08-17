import React from "react";

interface HeaderProps {
  onShowGettingStarted: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onShowGettingStarted }) => {
  return (
    <header className="text-center mb-8">
      <h1 className="text-3xl font-medium text-gray-900 mb-2">
        PDF to JPEG Converter
      </h1>
      <p className="text-gray-600 text-sm mb-4">
        Made for CMS Letter Processing
      </p>
      <p className="text-sm text-gray-700 mb-4">
        This app runs completely on your device. All files stay on your
        computer and are never uploaded or shared anywhere.
      </p>
      <button
        onClick={onShowGettingStarted}
        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:border-gray-400 hover:bg-gray-50 transition-all text-sm font-medium"
      >
        Getting Started
      </button>
    </header>
  );
};