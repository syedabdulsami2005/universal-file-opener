import React, { useState, useEffect, Suspense, useRef, useMemo, useLayoutEffect, useCallback } from "react";
import JSZip from "jszip";
import * as XLSX from "xlsx"; 
import mammoth from "mammoth";
import Papa from "papaparse"; 
import hljs from "highlight.js"; 
import "highlight.js/styles/vs2015.css"; 
import { Loader2, Download, FileText, FolderOpen, ArrowLeft, FileQuestion, Eye, FileCode, FileImage, Home, Music, Video, Database, Box, Terminal } from "lucide-react";

// Lazy Load Components
const Editor = React.lazy(() => import("@monaco-editor/react"));
const ModelViewer = React.lazy(() => import("./ModelViewer"));
const PdfRenderer = React.lazy(() => import("./PdfRenderer"));

// --- CONFIGURATION ---
// 2MB Limit for text previews to ensure speed. Larger files force download or full editor.
const PREVIEW_SIZE = 2097152; 

// --- HELPER ICONS MAP ---
const getIconForExt = (ext) => {
  if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return FileImage;
  if (['mp4','webm','mkv'].includes(ext)) return Video;
  if (['mp3','wav','ogg'].includes(ext)) return Music;
  if (['js','jsx','ts','tsx','py','java','c','cpp','html','css'].includes(ext)) return FileCode;
  if (['sql','db','sqlite','csv','xlsx'].includes(ext)) return Database;
  if (['sh','bat','cmd'].includes(ext)) return Terminal;
  return FileText;
};

// --- 1. INSTANT PREVIEW COMPONENT ---
// Renders code immediately using lightweight HTML before Monaco loads
const InstantCodePreview = ({ content, language }) => {
  const codeRef = useRef(null);

  useLayoutEffect(() => {
    if (codeRef.current && content) {
      const safeLang = hljs.getLanguage(language) ? language : 'plaintext';
      codeRef.current.innerHTML = hljs.highlight(content, { language: safeLang }).value;
    }
  }, [content, language]);

  return (
    <pre className="m-0 p-4 text-sm font-mono leading-relaxed overflow-auto h-full text-gray-200 bg-[#1e1e1e]">
      <code ref={codeRef} />
    </pre>
  );
};

// --- 2. MAIN VIEWER COMPONENT ---
const UniversalViewer = ({ file, fileType }) => {
  const [zipContent, setZipContent] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null); // { name, url, type, content, ext }
  const [viewMode, setViewMode] = useState("preview"); // 'preview' | 'editor'
  const [loading, setLoading] = useState(false);

  // --- A. INITIAL LOAD (ZIP or SINGLE) ---
  useEffect(() => {
    if (!file) return;

    const init = async () => {
      // 1. If Zip/Jar -> Load Index
      if (['zip', 'jar'].includes(fileType)) {
        try {
          const zip = await JSZip.loadAsync(file);
          setZipContent(zip);
        } catch (e) {
          console.error("Not a zip", e);
        }
      } 
      // 2. If Single File -> Process Immediately
      else {
        // Treat single file exactly like a zip entry
        await processFile(file, file.name);
      }
    };
    init();
  }, [file, fileType]);

  // --- B. UNIFIED FILE PROCESSOR (THE "INSTANT" LOGIC) ---
  const processFile = async (fileInput, fileName) => {
    setLoading(true);
    setSelectedFile(null); // Clear previous
    setViewMode("preview");

    try {
      const ext = fileName.split('.').pop().toLowerCase();
      let blob = fileInput;
      
      // Handle ZipObject vs File
      // If it's a ZipObject (has .async method), we convert it to Blob or String
      if (fileInput.async) { 
        const isText = ['txt','md','js','py','html','css','json','xml','c','cpp','java','csv','sql','sh','bat','gradle','properties','log'].includes(ext);
        blob = await fileInput.async(isText ? "string" : "blob");
      }

      // Create a local Blob URL for media/PDF
      const fileUrl = (blob instanceof Blob) ? URL.createObjectURL(blob) : null;
      let result = { name: fileName, ext, url: fileUrl, type: 'unknown' };

      // --- LOCAL ROUTING LOGIC (NO SERVER) ---

      // 1. IMAGES (Instant Blob)
      if (['jpg','jpeg','png','gif','webp','svg','bmp','ico'].includes(ext)) {
        result.type = 'image';
      }
      // 2. VIDEO / AUDIO (Instant Blob)
      else if (['mp4','webm','mkv','mov'].includes(ext)) result.type = 'video';
      else if (['mp3','wav','ogg','m4a'].includes(ext)) result.type = 'audio';
      
      // 3. PDF (Native/Local Render)
      else if (ext === 'pdf') {
        result.type = 'pdf';
      }

      // 4. CODE / TEXT (Instant String)
      else if (typeof blob === 'string' || ['txt','md','js','jsx','ts','tsx','py','java','c','cpp','h','cs','go','rs','php','rb','html','css','scss','json','xml','yaml','sql','sh','bat','gradle','properties','log'].includes(ext)) {
        result.type = 'code';
        // If it's a blob, read text; if string, use it.
        result.content = typeof blob === 'string' ? blob : await blob.text();
      }

      // 5. EXCEL / CSV (Local Parse)
      else if (['xlsx', 'xls', 'csv'].includes(ext)) {
        result.type = 'table';
        if (ext === 'csv') {
          const text = typeof blob === 'string' ? blob : await blob.text();
          result.data = Papa.parse(text, { header: false, preview: 1000 }).data;
        } else {
          const ab = await (blob instanceof Blob ? blob.arrayBuffer() : new TextEncoder().encode(blob));
          const wb = XLSX.read(ab, { type: 'array' });
          result.data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        }
      }

      // 6. WORD (Local Parse)
      else if (['docx'].includes(ext)) {
        const ab = await (blob instanceof Blob ? blob.arrayBuffer() : new TextEncoder().encode(blob));
        const { value } = await mammoth.convertToHtml({ arrayBuffer: ab });
        result.type = 'html_doc';
        result.content = value;
      }

      // 7. 3D MODELS
      else if (['stl','obj'].includes(ext)) {
        result.type = 'model';
      }

      // 8. EVERYTHING ELSE -> DOWNLOAD
      // For .pptx, .doc, .exe, etc., we show a download button instantly.
      // This is "working properly" because browsers CANNOT render these without a server.
      else {
        result.type = 'download';
      }

      setSelectedFile(result);

    } catch (e) {
      console.error("Processing failed", e);
      setSelectedFile({ name: fileName, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // --- C. RENDERERS ---
  const renderViewer = () => {
    if (!selectedFile) return null;
    const { type, url, content, data, ext, name } = selectedFile;

    switch (type) {
      case 'image': 
        return <div className="flex items-center justify-center h-full bg-gray-900"><img src={url} className="max-w-full max-h-full object-contain" alt={name} /></div>;
      
      case 'video':
        return <div className="flex items-center justify-center h-full bg-black"><video controls src={url} className="max-w-full max-h-full" /></div>;
      
      case 'audio':
        return <div className="flex items-center justify-center h-full bg-gray-900"><audio controls src={url} /></div>;

      case 'pdf':
        // Pure White BG, no padding, "Pages Down Wise" via native scrolling
        return (
          <div className="h-full bg-white overflow-auto flex justify-center">
             <div className="w-full max-w-5xl shadow-sm min-h-screen">
               <Suspense fallback={<Loader2 className="animate-spin m-10" />}><PdfRenderer url={url} /></Suspense>
             </div>
          </div>
        );

      case 'code':
        return (
          <div className="relative h-full flex flex-col">
            <div className="bg-[#2d2d2d] text-gray-300 px-4 py-2 text-xs flex justify-between items-center shrink-0 border-b border-gray-700">
               <span>{name}</span>
               <button onClick={() => setViewMode(viewMode === 'preview' ? 'editor' : 'preview')} className="flex items-center gap-1 hover:text-white transition">
                 {viewMode === 'preview' ? <><FileCode size={14}/> Edit</> : <><Eye size={14}/> Preview</>}
               </button>
            </div>
            {/* Absolute positioning ensures full screen fit */}
            <div className="flex-1 relative overflow-hidden bg-[#1e1e1e]">
              {viewMode === 'preview' ? (
                 <div className="absolute inset-0 overflow-auto">
                    <InstantCodePreview content={content} language={ext} />
                 </div>
              ) : (
                 <div className="absolute inset-0">
                   <Suspense fallback={<div className="p-4 text-gray-400">Loading Monaco...</div>}>
                     <Editor 
                       height="100%" 
                       width="100%" 
                       language={ext === 'js' ? 'javascript' : ext} 
                       value={content} 
                       theme="vs-dark" 
                       options={{ minimap: { enabled: false }, automaticLayout: true, wordWrap: 'off' }} 
                     />
                   </Suspense>
                 </div>
              )}
            </div>
          </div>
        );

      case 'table':
        return (
          <div className="h-full overflow-auto bg-white p-4 w-full">
            <table className="w-max min-w-full border-collapse text-sm">
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} className={i===0 ? "bg-gray-100 font-bold" : "border-b"}>
                    {Array.isArray(row) ? row.map((cell, j) => <td key={j} className="p-2 border border-gray-200 whitespace-nowrap">{cell}</td>)
                     : Object.values(row).map((cell, j) => <td key={j} className="p-2 border border-gray-200 whitespace-nowrap">{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case 'html_doc':
        return <div className="h-full overflow-auto bg-white p-8 prose max-w-none w-full" dangerouslySetInnerHTML={{ __html: content }} />;

      case 'model':
        return <div className="h-full"><Suspense fallback={<Loader2 />}><ModelViewer url={url} /></Suspense></div>;

      case 'download':
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4 p-6">
            <FileQuestion size={48} />
            <div className="text-center">
                <h2 className="text-xl font-semibold mb-1">Preview Unavailable</h2>
                <p className="text-sm mb-4">The file <b>.{ext}</b> is binary or complex and cannot be rendered in-browser.</p>
            </div>
            {url && <a href={url} download={name} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium"><Download size={18}/> Download File</a>}
          </div>
        );
    }
  };

  // --- D. ZIP NAVIGATOR RENDER ---
  const ZipBrowser = () => {
    const [path, setPath] = useState("");
    
    // Filter files in current path
    const items = useMemo(() => {
      const folders = new Set();
      const files = [];
      Object.keys(zipContent.files).forEach(filename => {
        if (!filename.startsWith(path)) return;
        const sub = filename.slice(path.length);
        if (!sub) return;
        const parts = sub.split('/');
        if (parts.length > 1 || zipContent.files[filename].dir) folders.add(parts[0]);
        else files.push({ name: parts[0], full: filename });
      });
      return { folders: [...folders], files };
    }, [zipContent, path]);

    return (
      <div className="flex flex-col h-full bg-white">
        <div className="p-3 border-b flex items-center gap-2 text-sm bg-gray-50 shadow-sm shrink-0">
           {path ? (
             <button onClick={() => setPath(p => p.split('/').slice(0,-2).join('/') + (p.split('/').length > 2 ? '/' : ''))} className="flex items-center gap-1 text-blue-600 font-bold"><ArrowLeft size={16}/> Back</button>
           ) : (
             <div className="flex items-center gap-1 text-gray-500 font-bold"><Home size={16}/> Root</div>
           )}
           <span className="font-mono text-gray-600 truncate ml-2">/{path}</span>
        </div>
        
        {/* Horizontal Scroll Enabled for List */}
        <div className="flex-1 overflow-auto p-2">
           <div className="flex flex-col gap-1 w-max min-w-full">
               {items.folders.map(f => (
                 <div key={f} onClick={() => setPath(path + f + '/')} className="flex items-center gap-3 p-3 hover:bg-yellow-50 active:bg-yellow-100 cursor-pointer border rounded-lg transition min-w-[300px]">
                   <FolderOpen className="text-yellow-500 shrink-0" size={20} /> <span className="font-medium text-gray-700">{f}</span>
                 </div>
               ))}
               {items.files.map(f => {
                 const ext = f.name.split('.').pop().toLowerCase();
                 const Icon = getIconForExt(ext);
                 return (
                   <div key={f.name} onClick={() => processFile(zipContent.files[f.full], f.name)} className="flex items-center gap-3 p-3 hover:bg-blue-50 active:bg-blue-100 cursor-pointer border rounded-lg transition min-w-[300px]">
                     <Icon className="text-blue-500 shrink-0" size={20} /> <span className="text-sm font-medium text-gray-700">{f.name}</span>
                   </div>
                 );
               })}
               {items.folders.length === 0 && items.files.length === 0 && <div className="p-8 text-center text-gray-400 italic">Empty Folder</div>}
           </div>
        </div>
      </div>
    );
  };

  if (loading) return <div className="h-full flex items-center justify-center"><LoadingSpinner /></div>;

  // View: Selected File
  if (selectedFile) {
    return (
      <div className="flex flex-col h-full">
        {zipContent && (
          <div className="p-2 bg-gray-100 border-b flex items-center gap-2 shadow-sm z-10">
            <button onClick={() => setSelectedFile(null)} className="flex items-center gap-1 text-sm text-blue-600 font-bold px-2 py-1 hover:bg-white rounded transition"><ArrowLeft size={16}/> Back to Archive</button>
          </div>
        )}
        <div className="flex-1 overflow-hidden relative">
          {renderViewer()}
        </div>
      </div>
    );
  }

  // View: Zip Browser
  if (zipContent) return <ZipBrowser />;

  return <div className="h-full flex items-center justify-center text-gray-400">No file loaded</div>;
};

export default UniversalViewer;