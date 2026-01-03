import React, { useState, useEffect, Suspense, useRef, useMemo, useLayoutEffect } from "react";
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
const PREVIEW_SIZE = 2097152; // 2MB Limit for text previews

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

// --- 1. INSTANT PREVIEW COMPONENT (Moved Outside) ---
const InstantCodePreview = ({ content, language }) => {
  const codeRef = useRef(null);

  useLayoutEffect(() => {
    if (codeRef.current && content) {
      try {
        const safeLang = hljs.getLanguage(language) ? language : 'plaintext';
        codeRef.current.innerHTML = hljs.highlight(content, { language: safeLang }).value;
      } catch (e) {
        codeRef.current.innerText = content; // Fallback if highlight fails
      }
    }
  }, [content, language]);

  return (
    <pre className="m-0 p-4 text-sm font-mono leading-relaxed overflow-auto h-full text-gray-200 bg-[#1e1e1e]">
      <code ref={codeRef} />
    </pre>
  );
};

// --- 2. ZIP NAVIGATOR COMPONENT (Moved Outside) ---
const ZipNavigator = ({ zipContent, onFileClick }) => {
  const [currentPath, setCurrentPath] = useState(""); 

  const { folders, files } = useMemo(() => {
    if (!zipContent) return { folders: [], files: [] };
    const folderSet = new Set();
    const fileList = [];

    Object.keys(zipContent.files).forEach((path) => {
      if (!path.startsWith(currentPath)) return; 
      const relativePath = path.slice(currentPath.length);
      if (!relativePath) return; 

      const parts = relativePath.split('/');
      if (parts.length > 1 || (parts.length === 1 && zipContent.files[path].dir)) {
        folderSet.add(parts[0]);
      } else {
        fileList.push({ name: parts[0], fullPath: path });
      }
    });

    return {
      folders: Array.from(folderSet).sort(),
      files: fileList.sort((a, b) => a.name.localeCompare(b.name))
    };
  }, [zipContent, currentPath]);

  const goUp = () => {
    const parts = currentPath.split('/').filter(p => p);
    parts.pop();
    setCurrentPath(parts.length > 0 ? parts.join('/') + '/' : "");
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-3 border-b bg-gray-50 flex items-center gap-2 shadow-sm shrink-0 overflow-x-auto whitespace-nowrap">
        {currentPath ? (
          <button onClick={goUp} className="flex items-center gap-1 text-sm font-bold text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-full transition bg-white border border-blue-100">
            <ArrowLeft size={16} /> Back
          </button>
        ) : (
          <div className="flex items-center gap-1 text-sm font-bold text-gray-500 px-2"><Home size={16} /> Root</div>
        )}
        <span className="text-gray-300">|</span>
        <span className="text-sm font-mono text-gray-700">{currentPath || "/"}</span>
      </div>

      <div className="flex-1 overflow-auto p-2">
        <div className="flex flex-col gap-1 w-max min-w-full">
          {folders.map(folder => (
            <div key={folder} onClick={() => setCurrentPath(prev => prev + folder + "/")} className="flex items-center gap-3 p-3 rounded-lg hover:bg-yellow-50 active:bg-yellow-100 cursor-pointer border border-transparent hover:border-yellow-200 transition min-w-[300px]">
              <FolderOpen size={24} className="text-yellow-500 shrink-0" />
              <span className="font-semibold text-gray-700">{folder}</span>
              <ChevronRight size={16} className="text-gray-400 ml-auto pl-4" />
            </div>
          ))}
          {files.map(file => {
             const ext = file.name.split('.').pop().toLowerCase();
             const Icon = getIconForExt(ext);
             return (
              <div key={file.name} onClick={() => onFileClick(file.fullPath, file.name)} className="flex items-center gap-3 p-3 rounded-lg hover:bg-blue-50 active:bg-blue-100 cursor-pointer border border-transparent hover:border-blue-200 transition min-w-[300px]">
                <Icon size={24} className="text-blue-500 shrink-0" />
                <span className="text-sm font-medium text-gray-700">{file.name}</span>
              </div>
             );
          })}
          {folders.length === 0 && files.length === 0 && <div className="text-center p-8 text-gray-400 italic w-full">Empty Folder</div>}
        </div>
      </div>
    </div>
  );
};

// --- 3. PAGINATED TABLE (Moved Outside) ---
const PaginatedTable = ({ data }) => {
  const [page, setPage] = useState(0);
  const rowsPerPage = 500;
  const totalPages = Math.ceil(data.length / rowsPerPage);
  const currentRows = data.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  const html = `
    <table style="border-collapse: collapse; background: white; width: 100%;">
      ${currentRows.map((row, idx) => `
        <tr style="background: ${idx % 2 === 0 ? '#fff' : '#f9fafb'}; border-bottom: 1px solid #eee;">
          ${row.map((cell) => {
             const tag = (page === 0 && idx === 0) ? 'th' : 'td';
             const bg = (page === 0 && idx === 0) ? 'background:#f3f4f6; font-weight:bold;' : '';
             return `<${tag} style="padding: 8px; border: 1px solid #ddd; ${bg} white-space: nowrap;">${cell ?? ''}</${tag}>`;
          }).join('')}
        </tr>
      `).join('')}
    </table>
  `;

  return (
    <div className="flex flex-col h-full w-max min-w-full bg-white">
      <div className="flex-1 overflow-auto" dangerouslySetInnerHTML={{ __html: html }} />
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-3 border-t bg-gray-50 shrink-0 sticky bottom-0 left-0 w-full">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1 bg-white border rounded shadow-sm disabled:opacity-50">Prev</button>
          <span className="text-sm text-gray-600">Page {page + 1} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1} className="px-3 py-1 bg-white border rounded shadow-sm disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
};

// --- 4. PRECISE ZOOM WRAPPER (Moved Outside) ---
const ZoomWrapper = ({ children }) => {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const state = useRef({ scale: 1, startDist: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateZoom = (newScale, centerX, centerY) => {
        const content = contentRef.current;
        if (!content) return;
        const oldScale = state.current.scale;
        const ratio = newScale / oldScale;
        const rect = container.getBoundingClientRect();
        const scrollLeft = container.scrollLeft;
        const scrollTop = container.scrollTop;
        const mouseX = centerX - rect.left;
        const mouseY = centerY - rect.top;

        content.style.transform = `scale(${newScale})`;
        content.style.width = newScale > 1 ? `${newScale * 100}%` : 'fit-content';
        content.style.minWidth = '100%';
        content.style.transformOrigin = "top left";
        state.current.scale = newScale;

        container.scrollLeft = (scrollLeft + mouseX) * ratio - mouseX;
        container.scrollTop = (scrollTop + mouseY) * ratio - mouseY;
    };

    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.001; 
        let newScale = state.current.scale + delta;
        newScale = Math.max(1.0, Math.min(newScale, 5.0));
        updateZoom(newScale, e.clientX, e.clientY);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-auto bg-gray-50 touch-pan-x touch-pan-y">
      <div ref={contentRef} className="origin-top-left will-change-transform min-h-full" style={{ width: '100%', transition: 'transform 0.05s linear' }}>{children}</div>
    </div>
  );
};

// --- 5. RENDERER COMPONENT (Moved Outside) ---
const FileRenderer = ({ viewState, viewMode, setViewMode }) => {
    if (!viewState) return null;
    const { type, content, url, ext, name, data } = viewState;

    switch (type) {
      case 'image': 
        return <div className="flex items-center justify-center h-full bg-gray-900"><img src={url} className="max-w-full max-h-full object-contain" alt={name} /></div>;
      
      case 'video':
        return <div className="flex items-center justify-center h-full bg-black"><video controls src={url} className="max-w-full max-h-full" /></div>;
      
      case 'audio':
        return <div className="flex items-center justify-center h-full bg-gray-900"><audio controls src={url} /></div>;

      case 'pdf':
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
        return <ZoomWrapper><PaginatedTable data={data} /></ZoomWrapper>;

      case 'html_doc':
        return <ZoomWrapper><div className="h-full overflow-auto bg-white p-8 prose max-w-none w-full" dangerouslySetInnerHTML={{ __html: content }} /></ZoomWrapper>;

      case 'model':
        return <div className="h-full"><Suspense fallback={<Loader2 />}><ModelViewer url={url} /></Suspense></div>;

      case 'download':
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4 p-6">
            <FileQuestion size={48} />
            <div className="text-center">
                <h2 className="text-xl font-semibold mb-1">Preview Unavailable</h2>
                <p className="text-sm mb-4">The file <b>.{ext}</b> is binary or complex.</p>
            </div>
            {url && <a href={url} download={name} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium"><Download size={18}/> Download File</a>}
          </div>
        );
    }
};

// --- 6. MAIN CONTROLLER ---
const UniversalViewer = ({ file, fileType }) => {
  const [zipContent, setZipContent] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [viewMode, setViewMode] = useState("preview");
  const [loading, setLoading] = useState(false);

  // Initial Load
  useEffect(() => {
    if (!file) return;
    const init = async () => {
      if (['zip', 'jar'].includes(fileType)) {
        try {
          const zip = await JSZip.loadAsync(file);
          setZipContent(zip);
        } catch (e) { console.error("Zip Error", e); }
      } else {
        await processFile(file, file.name);
      }
    };
    init();
  }, [file, fileType]);

  // Unified File Processor
  const processFile = async (fileInput, fileName) => {
    setLoading(true);
    setSelectedFile(null);
    setViewMode("preview");

    try {
      const ext = fileName.split('.').pop().toLowerCase();
      let blob = fileInput;
      
      if (fileInput.async) { 
        const isText = ['txt','md','js','py','html','css','json','xml','c','cpp','java','csv','sql','sh','bat','gradle','properties','log'].includes(ext);
        blob = await fileInput.async(isText ? "string" : "blob");
      }

      const fileUrl = (blob instanceof Blob) ? URL.createObjectURL(blob) : null;
      let result = { name: fileName, ext, url: fileUrl, type: 'unknown' };

      // 1. Media
      if (['jpg','jpeg','png','gif','webp','svg','bmp','ico'].includes(ext)) result.type = 'image';
      else if (['mp4','webm','mkv','mov'].includes(ext)) result.type = 'video';
      else if (['mp3','wav','ogg','m4a'].includes(ext)) result.type = 'audio';
      // 2. PDF
      else if (ext === 'pdf') result.type = 'pdf';
      // 3. Code/Text
      else if (typeof blob === 'string' || ['txt','md','js','jsx','ts','tsx','py','java','c','cpp','h','cs','go','rs','php','rb','html','css','scss','json','xml','yaml','sql','sh','bat','gradle','properties','log'].includes(ext)) {
        result.type = 'code';
        result.content = typeof blob === 'string' ? blob : await blob.text();
      }
      // 4. Excel/CSV
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
      // 5. Word
      else if (['docx'].includes(ext)) {
        const ab = await (blob instanceof Blob ? blob.arrayBuffer() : new TextEncoder().encode(blob));
        const { value } = await mammoth.convertToHtml({ arrayBuffer: ab });
        result.type = 'html_doc';
        result.content = value;
      }
      // 6. 3D
      else if (['stl','obj'].includes(ext)) result.type = 'model';
      // 7. Download
      else result.type = 'download';

      setSelectedFile(result);

    } catch (e) {
      console.error("Processing failed", e);
      setSelectedFile({ name: fileName, type: 'download', url: null }); // Fallback to download if processing fails
    } finally {
      setLoading(false);
    }
  };

  const handleZipClick = (path, name) => {
     processFile(zipContent.files[path], name);
  };

  // --- VIEW STATES ---
  if (loading) return <div className="h-full flex items-center justify-center"><LoadingSpinner /></div>;

  if (selectedFile) {
    return (
      <div className="flex flex-col h-full bg-gray-100 relative">
        {zipContent && (
          <div className="bg-white p-3 border-b flex items-center gap-3 shadow-sm z-20 shrink-0">
            <button onClick={() => setSelectedFile(null)} className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-800"><ArrowLeft size={18} /> Back</button>
            <span className="text-gray-700 text-sm font-medium truncate flex-1">/ {selectedFile.name}</span>
          </div>
        )}
        <div className="flex-1 overflow-hidden relative w-full h-full">
          <FileRenderer viewState={selectedFile} viewMode={viewMode} setViewMode={setViewMode} />
        </div>
      </div>
    );
  }

  if (zipContent) return <ZipNavigator zipContent={zipContent} onFileClick={handleZipClick} />;
  
  if (fileType === '7z' || fileType === 'rar') return <div className="flex flex-col items-center justify-center h-full text-center p-6 bg-gray-50"><FolderOpen className="w-16 h-16 text-yellow-600 mb-4" /><h2 className="text-xl font-bold mb-2">7-Zip/Rar Archive</h2><a href={file ? URL.createObjectURL(file) : "#"} download={file?.name} className="bg-yellow-600 text-white px-6 py-3 rounded-lg hover:bg-yellow-700 transition flex items-center gap-2"><Download size={20} /> Download</a></div>;

  return <div className="h-full flex items-center justify-center text-gray-400">No file loaded</div>;
};

export default UniversalViewer;