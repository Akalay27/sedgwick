import { useState } from "react";
import { useSettings } from "./hooks/useSettings";
import { useToasts } from "./hooks/useToasts";
import { useFileSelection } from "./hooks/useFileSelection";
import { useProcessing } from "./hooks/useProcessing";
import { Header } from "./components/Header";
import { FileSelection } from "./components/FileSelection";
import { IssuesPanel } from "./components/IssuesPanel";
import { ProgressPanel } from "./components/ProgressPanel";
import { ProcessingLogs } from "./components/ProcessingLogs";
import { GettingStartedModal } from "./components/GettingStartedModal";
import { Footer } from "./components/Footer";

function App() {
  const { settings, setSettings } = useSettings();
  const { toasts, setToasts, addToast, dismissToast } = useToasts();
  const [showSettings, setShowSettings] = useState(false);
  const [showGettingStarted, setShowGettingStarted] = useState(false);

  const { processingState, startProcessing } = useProcessing(addToast, setToasts);
  const { selectedFiles, selectPDFFolder, selectSpreadsheet } = useFileSelection(
    (message: string, type?: "info" | "warning" | "error") => {
      if (!message.includes("⚠️") && !message.includes("Error:") && type !== "error" && type !== "warning") {
        processingState.logs.push(`${new Date().toLocaleTimeString()}: ${message}`);
      }
    }
  );

  const handleStartProcessing = () => {
    startProcessing(settings, selectedFiles);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="min-h-screen p-4">
        <div className="max-w-4xl mx-auto">
          <Header onShowGettingStarted={() => setShowGettingStarted(true)} />

          <FileSelection
            settings={settings}
            setSettings={setSettings}
            showSettings={showSettings}
            setShowSettings={setShowSettings}
            selectedFiles={selectedFiles}
            selectPDFFolder={selectPDFFolder}
            selectSpreadsheet={selectSpreadsheet}
            startProcessing={handleStartProcessing}
            processingState={processingState}
          />

          <IssuesPanel
            toasts={toasts}
            dismissToast={dismissToast}
            setToasts={setToasts}
          />

          <ProgressPanel processingState={processingState} />

          <ProcessingLogs processingState={processingState} />

          <GettingStartedModal
            showGettingStarted={showGettingStarted}
            setShowGettingStarted={setShowGettingStarted}
          />
        </div>
      </div>

      <Footer />
    </div>
  );
}

export default App;
