import { useState } from "react";
import { Settings } from "../types";

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>({
    dateCol: "Date",
    xmlIdCol: "XML ID",
    threshold: 250,
    verbose: false,
    maxConcurrent: Math.min(navigator.hardwareConcurrency || 4, 4),
    useExistingNames: false,
    pageStartIndex: 1,
  });

  return { settings, setSettings };
};