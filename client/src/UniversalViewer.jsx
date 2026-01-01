import React, { useState, useEffect, Suspense, useRef, useCallback } from "react";
import JSZip from "jszip";
import axios from "axios";
import * as XLSX from "xlsx"; 
import mammoth from "mammoth";
import { Loader2, Download, FileText, FolderOpen, ArrowLeft, FileQuestion, ChevronLeft, ChevronRight, FileCode, FileImage, FileDigit } from "lucide-react";

// Lazy Load Components
const Editor = React.lazy(() => import("@monaco-editor/react"));
const ModelViewer = React.lazy(() => import("./ModelViewer"));
const PdfRenderer = React.lazy(() => import("./PdfRenderer"));

const API_URL = "https://universal-file-opener.onrender.com";

// --- HELPERS ---
const LoadingSpinner = ({ text }) => (
  <div className="flex flex-col items-center justify-center h-full text-blue-500 gap-3 p-6 text-center">
    <Loader2 className="w-10 h-10 animate-spin" />
    <span className="font-semibold text-lg">{text || "Processing..."}</span>
  </div>
);

// --- 1. INSTANT IPYNB PARSER ---
const convertIpynbToHtml = async (blob) => {
  try {
    const text = await blob.text();
    const json = JSON.parse(text);
    let html = '<div style="padding: 16px; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 100%; box-sizing: border-box;">';
    
    if (json.cells) {
      json.cells.forEach((cell) => {
        if (cell.cell_type === 'code') {
           const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
           if (source && source.trim()) {
             html += `
               <div style="margin-bottom: 12px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
                 <div style="background: #f8fafc; padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 11px; color: #64748b; font-family: monospace; display:flex; gap:8px;">
                   <span style="font-weight:700; color:#3b82f6;">In [${cell.execution_count || ' '}]:</span>
                   <span>Code</span>
                 </div>
                 <div style="background: #ffffff; padding: 12px; overflow-x: auto;">
                   <pre style="margin: 0; font-size: 13px; color: #334155; font-family: 'Menlo', 'Monaco', 'Courier New', monospace; line-height: 1.5;">${source}</pre>
                 </div>
               </div>`;
           }
        } 
        else if (cell.cell_type === 'markdown') {
           const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
           let formatted = source
              .replace(/### (.*)/g, '<h3 style="font-weight:600; font-size:1.1em; margin-top:16px; margin-bottom:8px;">$1</h3>')
              .replace(/## (.*)/g, '<h2 style="font-weight:600; font-size:1.25em; margin-top:20px; margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:4px;">$1</h2>')
              .replace(/# (.*)/g, '<h1 style="font-weight:700; font-size:1.5em; margin-top:24px; margin-bottom:12px; border-bottom:1px solid #eee; padding-bottom:6px;">$1</h1>')
              .replace(/\*\*(.*)\*\*/g, '<b>$1</b>')
              .replace(/`([^`]*)`/g, '<code style="background:#f1f5f9; padding:2px 5px; borderRadius:4px; font-family:monospace; font-size:0.9em; color:#d946ef;">$1</code>')
              .replace(/\n/g, '<br>');
           html += `<div style="padding: 4px 8px; color: #1f2937; line-height: 1.6;">${formatted}</div>`;
        }
  
        if (cell.outputs) {
           cell.outputs.forEach(out => {
             if (out.text) {
               const txt = Array.isArray(out.text) ? out.text.join('') : out.text;
               html += `<div style="margin-left: 4px; margin-bottom: 12px; font-size: 12px; font-family: monospace; color: #475569; white-space: pre-wrap; background: #f8fafc; padding: 8px; border-radius: 4px;">${txt}</div>`;
             }
             if (out.data) {
               if (out.data['text/plain'] && !out.data['image/png']) {
                  const txt = Array.isArray(out.data['text/plain']) ? out.data['text/plain'].join('') : out.data['text/plain'];
                  html += `<div style="margin-left: 4px; margin-bottom: 12px; font-size: 12px; font-family: monospace; color: #475569; white-space: pre-wrap;">${txt}</div>`;
               }
               if (out.data['image/png']) {
                 const imgData = Array.isArray(out.data['image/png']) ? out.data['image/png'].join('') : out.data['image/png'];
                 html += `<div style="margin: 12px 0;"><img src="data:image/png;base64,${imgData}" style="max-width: 100%; height: auto; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" /></div>`;
               }
             }
           });
        }
      });
    }
    html += '</div>';
    return html;
  } catch (e) {
    return `<div style="padding:20px; color:red;">Error parsing Notebook: ${e.message}</div>`;
  }
};

// --- 2. PAGINATED TABLE RENDERER ---
const PaginatedTable = ({ data, fileName }) => {
  const [page, setPage] = useState(0);
  const rowsPerPage = 500;
  const totalPages = Math.ceil(data.length / rowsPerPage);
  const currentRows = data.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  const nextPage = () => setPage(p => Math.min(totalPages - 1, p + 1));
  const prevPage = () => setPage(p => Math.max(0, p - 1));

  let html = '<div style="font-family: sans-serif; font-size: 13px;">';
  html += '<table style="border-collapse: collapse; background: white; min-width: 100%; table-layout: auto;">';
  
  currentRows.forEach((row, index) => {
     const globalIndex = (page * rowsPerPage) + index;
     html += `<tr style="background-color: ${globalIndex % 2 === 0 ? '#ffffff' : '#f8fafc'}; border-bottom: 1px solid #e2e8f0;">`;
     row.forEach((cell) => {
       const cellText = cell !== null && cell !== undefined ? String(cell) : "";
       if (globalIndex === 0) {
         html += `<th style="border: 1px solid #cbd5e1; padding: 8px 12px; background: #f1f5f9; text-align: left; font-weight: 600; color: #334155; white-space: nowrap;">${cellText}</th>`;
       } else {
         html += `<td style="border: 1px solid #e2e8f0; padding: 6px 12px; white-space: nowrap; color: #475569;">${cellText}</td>`;
       }
     });
     html += '</tr>';
  });
  html += '</table></div>';

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex-1 overflow-auto bg-white" dangerouslySetInnerHTML={{ __html: html }} />
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white border-t border-gray-200 p-3 shadow-sm z-10">
          <button onClick={prevPage} disabled={page === 0} className="flex items-center gap-1 px-4 py-2 bg-gray-50 border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 text-sm font-medium text-gray-700 transition"><ChevronLeft size={16} /> Prev</button>
          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">Page {page + 1} / {totalPages}</span>
          <button onClick={nextPage} disabled={page === totalPages - 1} className="flex items-center gap-1 px-4 py-2 bg-gray-50 border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 text-sm font-medium text-gray-700 transition">Next <ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
};

// --- 3. SMART GESTURE ZOOM WRAPPER (Zoom-to-Point Fixed) ---
const ZoomWrapper = ({ children, isPdf = false }) => {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const state = useRef({ scale: 1, startDist: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Apply Zoom using transform-origin 0 0 and correcting Scroll Left/Top
    // This creates the "Zoom towards mouse" effect
    const applyZoom = (newScale, centerX, centerY) => {
        const content = contentRef.current;
        if (!content) return;

        const oldScale = state.current.scale;
        const scaleRatio = newScale / oldScale;

        // Calculate visual change dimensions
        // If content is transformed, getting current scroll is tricky.
        // Simplified approach: Just update scale and width. 
        // For true Google Maps zoom, we need complex scroll math.
        // Here we use a balanced approach: Scale around center of viewport if simple.
        
        state.current.scale = newScale;
        content.style.transform = `scale(${newScale})`;
        
        // IMPORTANT: Allow width to expand so horizontal scroll works
        content.style.width = newScale > 1 ? `${newScale * 100}%` : '100%'; 

        // PDF specific adjustment to remove black bars
        if (isPdf && newScale > 1) {
             content.style.marginTop = "0px"; // Force top alignment
        }
    };

    const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        state.current.startDist = Math.hypot(t1.pageX - t2.pageX, t1.pageY - t2.pageY);
      }
    };

    const handleTouchMove = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const newDist = Math.hypot(t1.pageX - t2.pageX, t1.pageY - t2.pageY);
        if (state.current.startDist > 0) {
           const scaleChange = newDist / state.current.startDist;
           let newScale = state.current.scale * scaleChange;
           newScale = Math.max(1.0, Math.min(newScale, 5.0)); // Increased Max Zoom
           
           // Center of pinch
           const centerX = (t1.pageX + t2.pageX) / 2;
           const centerY = (t1.pageY + t2.pageY) / 2;
           
           applyZoom(newScale, centerX, centerY);
           state.current.startDist = newDist; 
        }
      }
    };

    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.001; 
        let newScale = state.current.scale + delta;
        newScale = Math.max(1.0, Math.min(newScale, 5.0));
        
        // Mouse position relative to container
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Apply Logic:
        // We want the point under mouse (mouseX) to remain stationary relative to viewport
        // NewScroll = (OldScroll + MousePos) * Ratio - MousePos
        const scrollLeft = container.scrollLeft;
        const scrollTop = container.scrollTop;
        
        const ratio = newScale / state.current.scale;
        
        const newScrollLeft = (scrollLeft + mouseX) * ratio - mouseX;
        const newScrollTop = (scrollTop + mouseY) * ratio - mouseY;

        applyZoom(newScale);
        
        // Apply calculated scroll to keep content centered
        container.scrollLeft = newScrollLeft;
        container.scrollTop = newScrollTop;
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('wheel', handleWheel);
    };
  }, [isPdf]);

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col overflow-auto bg-gray-100 touch-pan-x touch-pan-y custom-scrollbar">
      <div className="min-w-full min-h-full flex flex-col">
        <div 
          ref={contentRef} 
          className="origin-top-left transition-transform duration-75 ease-out will-change-transform flex-1 flex flex-col"
          style={{ width: '100%', minHeight: '100%', backfaceVisibility: 'hidden' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

// --- EXTENSION MAPS ---
const EXT_MAP = {
  code: ['c','cpp','cc','cxx','h','hpp','hh','hxx', 'java','class','jar', 'py','pyc','pyd','pyo','pyw', 'cs','csproj','sln', 'rs', 'go'],
  web: ['html','htm','css','js','mjs', 'ts','tsx', 'php','php3','php4','phtml','rb', 'jsx','vue','svelte','erb', 'sass','scss','less','styl'],
  mobile: ['kt','xml','gradle', 'swift','m', 'dart'],
  data: ['json','yaml','yml','toml','ini','cfg','conf','env', 'sql','db','sqlite','psql', 'md','tex','rst'],
  script: ['sh','bash','zsh', 'bat','cmd','ps1','vbs', 'dockerfile','makefile','cmake','vagrantfile'],
  niche: ['hs','scala','erl','ex','exs','clj', 'v','r','jl', 'txt','rtf','log'],
  local_office: ['docx', 'xlsx', 'xls', 'csv', 'odt', 'ipynb'], 
  server_office: ['pptx','ppt','ppsx', 'odp', 'epub', 'parquet', 'doc'], 
  image: ['jpg','jpeg','png','gif','bmp','tiff','webp','heic','svg','ico'],
  video: ['mp4','mkv','avi','mov','wmv','flv','webm'],
  audio: ['mp3','wav','aac','flac','ogg','m4a','wma'],
  model: ['stl','obj'],
  pdf: ['pdf']
};

const TEXT_EXTS = [...EXT_MAP.code, ...EXT_MAP.web, ...EXT_MAP.mobile, ...EXT_MAP.data, ...EXT_MAP.script, ...EXT_MAP.niche];

const UniversalViewer = ({ file, fileType, fileContent, backendData }) => {
  const [zipContent, setZipContent] = useState(null);
  const [selectedZipFile, setSelectedZipFile] = useState(null);
  const [internalFileType, setInternalFileType] = useState('');
  const [internalFileUrl, setInternalFileUrl] = useState(null);
  const [internalFileContent, setInternalFileContent] = useState(null);
  const [internalTableData, setInternalTableData] = useState(null); 
  const [internalBackendData, setInternalBackendData] = useState(null);
  const [internalLoading, setInternalLoading] = useState(false);

  useEffect(() => {
    if ((fileType === 'zip' || fileType === 'jar') && file) {
      JSZip.loadAsync(file).then((zip) => setZipContent(zip));
    }
  }, [file, fileType]);

  const handleZipFileClick = async (relativePath) => {
    if (!zipContent) return;
    const zipObj = zipContent.files[relativePath];
    if (zipObj.dir) return;

    setInternalLoading(true);
    setInternalBackendData(null);
    setInternalTableData(null); 
    setInternalFileContent(null);
    setSelectedZipFile(relativePath);

    const ext = relativePath.split('.').pop().toLowerCase();
    setInternalFileType(ext);
    
    const blob = await zipObj.async("blob");
    const url = URL.createObjectURL(blob);
    setInternalFileUrl(url);

    try {
      if (ext === 'ipynb') {
        const html = await convertIpynbToHtml(blob);
        setInternalBackendData({ type: 'html_doc', content: html });
      }
      else if (ext === 'pdf') { /* Native Render */ }
      else if (['xlsx', 'xls'].includes(ext)) {
        const arrayBuffer = await blob.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
        setInternalTableData(rows);
      }
      else if (ext === 'csv') {
        const text = await blob.text();
        const rows = text.split(/\r?\n/).map(row => row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim()));
        setInternalTableData(rows.filter(r => r.length > 0));
      }
      else if (ext === 'docx') {
        const arrayBuffer = await blob.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setInternalBackendData({ type: 'html_doc', content: result.value });
      }
      else if (EXT_MAP.server_office.includes(ext)) {
        const formData = new FormData();
        const virtualFile = new File([blob], relativePath, { type: blob.type });
        formData.append('file', virtualFile);
        const res = await axios.post(`${API_URL}/detect-and-convert`, formData);
        setInternalBackendData(res.data);
      } 
      else if (TEXT_EXTS.includes(ext)) {
        const text = await zipObj.async("string");
        setInternalFileContent(text);
      }
    } catch (e) {
      console.error("Local conversion failed", e);
    }
    
    setInternalLoading(false);
  };

  const closeInternalFile = () => {
    setSelectedZipFile(null);
    setInternalFileUrl(null);
    setInternalFileContent(null);
    setInternalBackendData(null);
    setInternalTableData(null);
  };

  // --- MAIN RENDERER ---
  const renderContent = (type, url, content, data, tableData, fileName) => {
    let contentComponent = null;
    let isPdf = false;

    if (tableData) {
       contentComponent = <PaginatedTable data={tableData} fileName={fileName} />;
    }
    else if (data?.type === 'html_table' || data?.type === 'html_doc') {
      contentComponent = <div dangerouslySetInnerHTML={{ __html: data.content }} className="prose max-w-none bg-white shadow-sm p-4 w-full h-full" />;
    }
    else if (EXT_MAP.image.includes(type) || data?.type === 'image_pass') {
      contentComponent = <img src={url} className="max-w-full max-h-none object-contain mx-auto my-4 shadow-md" style={{ minWidth: 'auto' }} />;
    }
    else if (type === 'pdf' || data?.type === 'pdf_pass') {
       isPdf = true;
       // Wrap PDF in a container that forces width to 100% to fix mobile cut-off
       contentComponent = (
         <div className="w-full flex justify-center">
            <Suspense fallback={<LoadingSpinner />}><PdfRenderer url={url} /></Suspense>
         </div>
       );
    }
    else if (EXT_MAP.model.includes(type)) {
      contentComponent = <div className="h-[500px] w-full"><Suspense fallback={<LoadingSpinner />}><ModelViewer url={url} /></Suspense></div>;
    }
    else if (content || data?.type === 'text_content') {
      const displayContent = data?.type === 'text_content' ? data.content : content;
      const getLanguage = (e) => ({ js:'javascript', py:'python', java:'java', html:'html', css:'css', json:'json', sql:'sql', md:'markdown' }[e] || "plaintext");
      contentComponent = (
        <div className="h-[800px] w-full bg-[#1e1e1e] flex flex-col"> 
          <Suspense fallback={<LoadingSpinner text="Loading Editor..." />}>
             {/* Forced 100% width and correct layout */}
             <Editor 
                height="100%" 
                width="100%"
                language={getLanguage(type)} 
                value={displayContent} 
                theme="vs-dark" 
                options={{ readOnly: true, minimap: { enabled: false }, automaticLayout: true }} 
             />
          </Suspense>
        </div>
      );
    }
    else if (EXT_MAP.video.includes(type)) return <div className="flex items-center justify-center h-full bg-black"><video controls src={url} className="max-w-full max-h-full" /></div>;
    else if (EXT_MAP.audio.includes(type)) return <div className="flex items-center justify-center h-60"><audio controls src={url} /></div>;
    else {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-gray-50 text-gray-600 p-6 text-center">
          <FileQuestion className="w-12 h-12 text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Preview Unavailable</h2>
          <p className="mb-6 max-w-sm">Cannot display .{type} files directly.</p>
          <a href={url} download={fileName} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"><Download className="w-5 h-5" /> Download File</a>
        </div>
      );
    }

    return <ZoomWrapper isPdf={isPdf}>{contentComponent}</ZoomWrapper>;
  };

  if (selectedZipFile) {
    return (
      <div className="flex flex-col h-full bg-gray-100">
        <div className="bg-white p-3 border-b flex items-center gap-3 shadow-sm z-20">
          <button onClick={closeInternalFile} className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-800 transition"><ArrowLeft size={18} /> Back</button>
          <span className="text-gray-700 text-sm font-medium truncate flex-1">/ {selectedZipFile}</span>
        </div>
        <div className="flex-1 overflow-hidden relative">
          {internalLoading ? <LoadingSpinner text="Opening..." /> : renderContent(internalFileType, internalFileUrl, internalFileContent, internalBackendData, internalTableData, selectedZipFile)}
        </div>
      </div>
    );
  }

  // --- ZIP LIST LAYOUT FIXED ---
  if ((fileType === 'zip' || fileType === 'jar') && zipContent) {
    return (
      <div className="flex flex-col h-full bg-gray-50">
         <div className="p-4 bg-white border-b shadow-sm">
            <h3 className="font-bold flex items-center gap-2 text-lg text-gray-800"><FolderOpen className="text-yellow-500" /> Archive Contents</h3>
         </div>
         <div className="flex-1 overflow-auto p-4">
            <div className="bg-white rounded-lg border shadow-sm divide-y">
               {Object.keys(zipContent.files).map((path) => {
                 const isDir = zipContent.files[path].dir;
                 const ext = path.split('.').pop();
                 return (
                   <div 
                     key={path} 
                     onClick={() => !isDir && handleZipFileClick(path)}
                     className={`flex items-center gap-3 p-3 transition ${isDir ? 'bg-gray-50 text-gray-500' : 'hover:bg-blue-50 cursor-pointer text-gray-700 hover:text-blue-700'}`}
                   >
                     {isDir ? <FolderOpen size={20} className="flex-shrink-0" /> : <FileText size={20} className="text-blue-500 flex-shrink-0" />}
                     <span className="text-sm font-medium truncate flex-1">{path}</span>
                     {!isDir && <span className="text-xs text-gray-400 font-mono uppercase border px-1 rounded">{ext}</span>}
                   </div>
                 );
               })}
            </div>
         </div>
      </div>
    );
  }

  if (fileType === '7z') return <div className="flex flex-col items-center justify-center h-full text-center p-6 bg-gray-50"><FolderOpen className="w-16 h-16 text-yellow-600 mb-4" /><h2 className="text-xl font-bold mb-2">7-Zip Archive (.7z)</h2><p className="max-w-md text-gray-600 mb-6">Browsing .7z files directly is too heavy for browsers. Please download locally.</p><a href={file ? URL.createObjectURL(file) : "#"} download={file?.name} className="bg-yellow-600 text-white px-6 py-3 rounded-lg hover:bg-yellow-700 transition flex items-center gap-2"><Download size={20} /> Download .7z File</a></div>;

  return renderContent(fileType, file ? URL.createObjectURL(file) : null, fileContent, backendData, null, file?.name);
};

export default UniversalViewer;