    // vite + React (abridged)
import { useState } from 'react';
import * as XLSX from 'xlsx';                // Excel
import * as pdfjs from 'pdfjs-dist/webpack'; // PDF.js build with WASM autoload

export function App() {
  const [log, setLog] = useState<string[]>([]);
  const logLine = (s: string) => setLog(l => [...l, s]);

  async function handleRun() {
    /* 1. pick spreadsheet */
    const [sheetHandle] = await window.showOpenFilePicker({ types:[{description:'Excel', accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}]});
    const sheetBuf = await (await sheetHandle.getFile()).arrayBuffer();
    const wb = XLSX.read(sheetBuf);
    const map: Record<string,string> = {};
    wb.SheetNames.forEach(name=>{
      const sheet = XLSX.utils.sheet_to_json<any>(wb.Sheets[name], {header:1});
      const [header, ...rows] = sheet;
      const dateIdx = header.indexOf('Date');
      const idIdx   = header.indexOf('XML ID');
      rows.forEach(r => map[String(r[dateIdx]).trim()] = String(r[idIdx]).trim());
    });
    logLine(`Loaded ${Object.keys(map).length} map entries`);

    /* 2. pick PDFs */
    const dir = await window.showDirectoryPicker({mode:"read"});
    for await (const entry of dir.values()) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.pdf')) continue;
      const pdfArray = await (await entry.getFile()).arrayBuffer();
      const pdf = await pdfjs.getDocument({data: pdfArray}).promise;

      const xmlId = map[entry.name.replace(/\.pdf$/i,'')];
      if (!xmlId) { logLine(`⚠️  no XML ID for ${entry.name}`); continue; }

      for (let p=1; p<=pdf.numPages; ++p) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({scale:2});      // hi‑dpi
        const canvas = new OffscreenCanvas(viewport.width, viewport.height);
        await page.render({canvasContext:canvas.getContext('2d'), viewport}).promise;

        // simple crop: get data and trim transparent borders
        const data = canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height);
        const bbox = findBBox(data, 250);                  // your JS port
        const trimmed = new OffscreenCanvas(bbox.w, bbox.h);
        trimmed.getContext('2d')!
          .putImageData(data, -bbox.x, -bbox.y);

        const blob = await trimmed.convertToBlob({type:'image/jpeg', quality:0.9});
        const out = await dir.getFileHandle(`${xmlId}-p${p}.jpg`, { create: true });
        const stream = await out.createWritable();
        await stream.write(blob); await stream.close();
      }
      logLine(`✓ ${entry.name} done`);
    }
    logLine('All conversions complete!');
  }

  return (
    <main>
      <button onClick={handleRun}>Select files and convert</button>
      <pre>{log.join('\n')}</pre>
    </main>
  );
}

(Helper findBBox walks the Uint8ClampedArray once per edge, ~20 ms for A4@300 dpi.)
Key browser pieces:

pdfjs-dist/webpack gives you an ES Module and auto‑loads the WASM decoder. 
DEV Community

canvas.convertToBlob() / canvas.toBlob() emit JPEG blobs you can stream to disk. 
MDN Web Docs

showDirectoryPicker() lets you write directly into the user‑chosen folder—no temp downloads. 
web.dev

