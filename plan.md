| Piece                      | JS‑side equivalent                                                                                             | Notes                                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Read the Excel mapping** | `xlsx` / **SheetJS**                                                                                           | Browser build (<14 kB gzipped). Read `File` → `arrayBuffer()` → `XLSX.read` → iterate sheets and build `{date → xmlId}` map. ([docs.sheetjs.com][1])        |
| **Pick files / folders**   | File System Access API (`showDirectoryPicker`, `showOpenFilePicker`) with a `<input webkitdirectory>` fallback | Lets you read and *write* anywhere the user chooses. Chrome/Edge/Opera from v 86+, fallback uses classic “download” links on Safari/Firefox. ([web.dev][2]) |
| **Convert each page**      | `pdfjs-dist` (PDF.js 5.x) → `page.render({ canvasContext, viewport })` → `canvas.toBlob('image/jpeg', 0.92)`   | Pure WASM/JS, no Poppler. Supports large‑page tiling and ICC profiles as of 5.0. ([GitHub][3], [Mozilla GitHub Page][4])                                    |
| **Crop whitespace**        | Read `ImageData` → scan from edges until pixel < threshold → draw trimmed region to a new canvas → `toBlob`    | Same idea as your Pillow routine; in JS it’s a handful of `Uint32Array` ops.                                                                                |
| **Parallelism / progress** | Web Workers + `Comlink` or `thread-loader`; keep a single “UI” worker that posts `{done, total}`               | Browser threads are limited, so chunk big PDFs (e.g., 4 pages/worker) to stay under 1 GB RAM.                                                               |
| **Save results**           | `FileSystemWritableFileStream` **or** bundle to a `.zip` with `fflate` and trigger an `<a download>`           | Both keep everything local.                                                                                                                                 |
| **Offline‑first**          | `vite-plugin-pwa` adds a Service Worker in one line and caches `pdf.js`, `xlsx`, etc.                          | After first load the app opens instantly, even without internet.                                                                                            |

[1]: https://docs.sheetjs.com/docs/demos/static/vitejs/?utm_source=chatgpt.com "ViteJS Spreadsheet Plugins - SheetJS Community Edition"
[2]: https://web.dev/patterns/files/open-a-directory?utm_source=chatgpt.com "How to open a directory | Files and directories patterns - web.dev"
[3]: https://github.com/mozilla/pdf.js/releases?utm_source=chatgpt.com "Releases · mozilla/pdf.js - GitHub"
[4]: https://mozilla.github.io/pdf.js/examples/?utm_source=chatgpt.com "PDF.js - Examples"
implement the functionality of this CLI tool in      │
│   this app. It needs to run completely locally. And    │
│   be somewhat stylish. For the pdf import, you should  │
│   be able to select folder(s) of PDFS. For the         │
│   export, you should be able to select a folder to     │
│   export to (showDirectoryPicker). Technical detail suggestions in plan.md