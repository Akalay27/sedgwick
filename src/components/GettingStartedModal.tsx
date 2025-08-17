import React from "react";

interface GettingStartedModalProps {
  showGettingStarted: boolean;
  setShowGettingStarted: (show: boolean) => void;
}

export const GettingStartedModal: React.FC<GettingStartedModalProps> = ({
  showGettingStarted,
  setShowGettingStarted,
}) => {
  if (!showGettingStarted) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Getting Started Guide
            </h2>
            <button
              onClick={() => setShowGettingStarted(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="space-y-6">
            <section>
              <h3 className="text-lg font-medium text-gray-800 mb-3">
                How It Works
              </h3>
              <p className="text-gray-700 mb-3">
                This app converts PDF files into individual JPEG images with
                automatic whitespace cropping. You can use it in two modes:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 pl-4">
                <li>
                  <strong>Excel Mapping Mode:</strong> Uses a spreadsheet to
                  map PDF filenames to XML IDs
                </li>
                <li>
                  <strong>Direct Mode:</strong> Uses PDF filenames directly as
                  XML IDs
                </li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-medium text-gray-800 mb-3">
                Step-by-Step Instructions
              </h3>
              <ol className="list-decimal list-inside space-y-3 text-gray-700 pl-4">
                <li>
                  <strong>Choose your mode:</strong>
                  <ul className="list-disc list-inside mt-1 ml-4 space-y-1 text-sm">
                    <li>
                      For spreadsheet mapping: Keep "PDFs already have correct
                      XML names" unchecked
                    </li>
                    <li>
                      For direct filename use: Check "PDFs already have correct
                      XML names" in Settings
                    </li>
                  </ul>
                </li>
                <li>
                  <strong>Select PDF Folder:</strong> Choose the folder
                  containing your PDF files
                </li>
                <li>
                  <strong>Select Spreadsheet:</strong> (Only if using Excel
                  mapping) Choose your Excel file with Date and XML ID columns
                </li>
                <li>
                  <strong>Adjust Settings:</strong> Configure column names,
                  cropping threshold, and page numbering
                </li>
                <li>
                  <strong>Start Conversion:</strong> Click the button and choose
                  where to save the images
                </li>
              </ol>
            </section>

            <section>
              <h3 className="text-lg font-medium text-gray-800 mb-3">
                Settings Explained
              </h3>
              <ul className="space-y-2 text-gray-700">
                <li>
                  <strong>Date Column:</strong> Excel column name containing
                  dates that match PDF filenames
                </li>
                <li>
                  <strong>XML ID Column:</strong> Excel column name containing
                  the desired output XML IDs
                </li>
                <li>
                  <strong>Crop Threshold:</strong> Lower values = more
                  aggressive cropping (0-255)
                </li>
                <li>
                  <strong>Max Concurrent:</strong> Number of PDFs to process
                  simultaneously
                </li>
                <li>
                  <strong>Page Start Index:</strong> Starting number for page
                  naming (e.g., 0 = -p0, -p1 or 1 = -p1, -p2)
                </li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-medium text-gray-800 mb-3">
                Output Format
              </h3>
              <p className="text-gray-700">
                Images are saved as:{" "}
                <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                  xmlid-p1.jpg
                </code>
                ,
                <code className="bg-gray-100 px-2 py-1 rounded text-sm ml-1">
                  xmlid-p2.jpg
                </code>
                , etc.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-medium text-gray-800 mb-3">
                Troubleshooting
              </h3>
              <ul className="list-disc list-inside space-y-1 text-gray-700 pl-4">
                <li>
                  Check that PDF filenames match your spreadsheet entries
                  exactly
                </li>
                <li>
                  Enable Verbose Logging to see detailed processing information
                </li>
                <li>
                  Review Issues & Warnings panel for specific problems
                </li>
                <li>
                  Try lowering Max Concurrent if you encounter memory issues
                </li>
              </ul>
            </section>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={() => setShowGettingStarted(false)}
              className="w-full px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors font-medium"
            >
              Got It!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};