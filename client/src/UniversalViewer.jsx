import React, { useState, useEffect, Suspense, useRef, useLayoutEffect } from "react";
import JSZip from "jszip";
import axios from "axios";
import * as XLSX from "xlsx"; 
import mammoth from "mammoth"; 
import { Loader2, Download, FileText, FolderOpen, ArrowLeft, FileQuestion } from "lucide-react";

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

// --- LOCAL IPYNB PARSER ---
const convertIpynbToHtml = async (blob) => {
  const text = await blob.text();
  const json = JSON.parse(text);
  let html = '<div style="padding: 20px; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 100%;">';
  
  if (json.cells) {
    json.cells.forEach((cell) => {
      if (cell.cell_type === 'code') {
         const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
         if (source.trim()) {
           html += `<div style="background: #f8fafc; padding: 10px; border-radius: 4px; margin-bottom: 8px; border: 1px solid #e2e8f0; overflow-x: auto;">
             <div style="color: #64748b; font-weight: bold; font-size: 0.8em; margin-bottom: 5px; font-family: monospace;">In [${cell.execution_count || ' '}]:</div>
             <pre style="margin: 0; font-size: 13px; font-family: monospace; color: #334155;">${source}</pre>
           </div>`;
         }
      } 
      else if (cell.cell_type === 'markdown') {
         const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
         let formatted = source
            .replace(/### (.*)/g, '<h3>$1</h3>')
            .replace(/## (.*)/g, '<h2>$1</h2>')
            .replace(/# (.*)/g, '<h1>$1</h1>')
            .replace(/\*\*(.*)\*\*/g, '<b>$1</b>')
            .replace(/\n/g, '<br>');
         html += `<div style="padding: 8px; margin-bottom: 8px; font-family: sans-serif; line-height: 1.5;">${formatted}</div>`;
      }
      if (cell.outputs) {
         cell.outputs.forEach(out => {
           if (out.text) {
             const txt = Array.isArray(out.text) ? out.text.join('') : out.text;
             html += `<div style="margin-left: 10px; margin-bottom: 10px; font-size: 0.9em; font-family: monospace; color: #475569; white-space: pre-wrap;">${txt}</div>`;
           }
           if (out.data) {
             if (out.data['text/plain'] && !out.data['image/png']) {
                const txt = Array.isArray(out.data['text/plain']) ? out.data['text/plain'].join('') : out.data['text/plain'];
                html += `<div style="margin-left: 10px; margin-bottom: 10px; font-size: 0.9em; font-family: monospace; color: #475569; white-space: pre-wrap;">${txt}</div>`;
             }
             if (out.data['image/png']) {
               const imgData = Array.isArray(out.data['image/png']) ? out.data['image/png'].join('') : out.data['image/png'];
               html += `<div style="margin: 10px 0;"><img src="data:image/png;base64,${imgData}" style="max-width: 100%; height: auto;" /></div>`;
             }
           }
         });
      }
    });
  }
  html += '</div>';
  return html;
};

// --- GESTURE ZOOM WRAPPER (FIXED: Smart Zoom with Scroll Correction) ---
const ZoomWrapper = ({ children }) => {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const state = useRef({ scale: 1, startDist: 0 });

  // useLayoutEffect ensures updates happen before paint to prevent visual jumping
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateZoom = (newScale, centerX, centerY) => {
        const content = contentRef.current;
        if (!content) return;

        const oldScale = state.current.scale;
        const ratio = newScale / oldScale;
        const rect = container.getBoundingClientRect();

        // 1. Get current scroll position
        const scrollLeft = container.scrollLeft;
        const scrollTop = container.scrollTop;
        
        // 2. Calculate mouse position relative to content
        const mouseX = centerX - rect.left;
        const mouseY = centerY - rect.top;

        // 3. Apply Scale
        content.style.transform = `scale(${newScale})`;
        content.style.width = newScale > 1 ? `${newScale * 100}%` : '100%';
        content.style.transformOrigin = "top left";
        state.current.scale = newScale;

        // 4. Adjust Scroll to keep mouse point stable
        container.scrollLeft = (scrollLeft + mouseX) * ratio - mouseX;
        container.scrollTop = (scrollTop + mouseY) * ratio - mouseY;
    };

    const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
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
           newScale = Math.max(1.0, Math.min(newScale, 5.0));
           
           const centerX = (t1.clientX + t2.clientX) / 2;
           const centerY = (t1.clientY + t2.clientY) / 2;

           updateZoom(newScale, centerX, centerY);
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
        updateZoom(newScale, e.clientX, e.clientY);
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
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-auto bg-gray-50 touch-pan-x touch-pan-y">
      <div 
        ref={contentRef} 
        className="origin-top-left transition-transform duration-75 ease-out will-change-transform min-h-full" 
        style={{ width: '100%', backfaceVisibility: 'hidden' }}
      >
        {children}
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
    setInternalFileContent(null);
    setSelectedZipFile(relativePath);

    const ext = relativePath.split('.').pop().toLowerCase();
    setInternalFileType(ext);
    
    const blob = await zipObj.async("blob");
    const url = URL.createObjectURL(blob);
    setInternalFileUrl(url);

    try {
      if (['xlsx', 'xls', 'csv'].includes(ext)) {
        const arrayBuffer = await blob.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const html = XLSX.utils.sheet_to_html(workbook.Sheets[sheetName]);
        setInternalBackendData({ type: 'html_table', content: html });
      }
      else if (['docx'].includes(ext)) {
        const arrayBuffer = await blob.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setInternalBackendData({ type: 'html_doc', content: result.value });
      }
      else if (['ipynb'].includes(ext)) {
        const html = await convertIpynbToHtml(blob);
        setInternalBackendData({ type: 'html_doc', content: html });
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
  };

  const renderContent = (type, url, content, data, fileName) => {
    let contentComponent = null;

    if (data?.type === 'html_table' || data?.type === 'html_doc') {
      contentComponent = (
        <div>
          <style>{`
            table { border-collapse: collapse; background: white; } 
            th, td { border: 1px solid #ccc; padding: 6px; white-space: nowrap; font-size: 13px; color: #333; }
            th { background-color: #f3f4f6; font-weight: bold; text-align: left; }
            tr:nth-child(even) { background-color: #f9fafb; }
          `}</style>
          <div dangerouslySetInnerHTML={{ __html: data.content }} className="prose max-w-none bg-white shadow-sm p-4 inline-block" />
        </div>
      );
    }
    // FIXED: Image now fits screen initially and uses Smart Zoom
    else if (EXT_MAP.image.includes(type) || data?.type === 'image_pass') {
      contentComponent = (
        <div className="flex items-center justify-center min-h-full">
           <img src={url} className="max-w-full max-h-full object-contain shadow-sm" style={{ minWidth: 'auto' }} />
        </div>
      );
    }
    else if (type === 'pdf' || data?.type === 'pdf_pass') {
       return <Suspense fallback={<LoadingSpinner />}><PdfRenderer url={url} /></Suspense>;
    }
    else if (EXT_MAP.model.includes(type)) {
      contentComponent = <div className="h-[500px] w-full"><Suspense fallback={<LoadingSpinner />}><ModelViewer url={url} /></Suspense></div>;
    }
    // FIXED: Code Editor now uses Absolute positioning to fill screen completely
    else if (content || data?.type === 'text_content') {
      const displayContent = data?.type === 'text_content' ? data.content : content;
      const getLanguage = (e) => ({ js:'javascript', py:'python', java:'java', html:'html', css:'css', json:'json', sql:'sql', md:'markdown' }[e] || "plaintext");
      return (
        <div className="absolute inset-0 w-full h-full bg-[#1e1e1e]"> 
          <Suspense fallback={<LoadingSpinner text="Loading Editor..." />}>
             <Editor 
                height="100%" 
                language={getLanguage(type)} 
                value={displayContent} 
                theme="vs-dark" 
                options={{ 
                   readOnly: true, 
                   minimap: { enabled: false }, 
                   automaticLayout: true,
                   scrollBeyondLastLine: false,
                   wordWrap: 'on' 
                }} 
             />
          </Suspense>
        </div>
      );
    }
    else if (EXT_MAP.video.includes(type)) return <video controls src={url} className="max-w-full" />;
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

    return <ZoomWrapper>{contentComponent}</ZoomWrapper>;
  };

  if (selectedZipFile) {
    return (
      <div className="flex flex-col h-full bg-gray-100">
        <div className="bg-white p-2 border-b flex items-center gap-2 shadow-sm shrink-0 z-20">
          <button onClick={closeInternalFile} className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-800"><ArrowLeft size={16} /> Back</button>
          <span className="text-gray-500 text-sm truncate">/ {selectedZipFile}</span>
        </div>
        {/* FIXED: Changed to h-full relative to support absolute child (Editor) */}
        <div className="flex-1 w-full h-full relative overflow-hidden">
          {internalLoading ? <LoadingSpinner text="Opening Locally..." /> : renderContent(internalFileType, internalFileUrl, internalFileContent, internalBackendData, selectedZipFile)}
        </div>
      </div>
    );
  }

  if ((fileType === 'zip' || fileType === 'jar') && zipContent) {
    return (
      <div className="p-4 h-full overflow-auto bg-gray-50">
         <h3 className="font-bold mb-4 flex items-center gap-2 text-lg text-gray-800"><FolderOpen className="text-yellow-500" /> Archive Contents:</h3>
         <div className="grid gap-2">
           {Object.keys(zipContent.files).map((path) => {
             const isDir = zipContent.files[path].dir;
             return (
               <div key={path} onClick={() => !isDir && handleZipFileClick(path)} className={`p-3 rounded-lg border flex items-center gap-3 transition ${isDir ? 'bg-gray-200 text-gray-600' : 'bg-white hover:bg-blue-50 cursor-pointer shadow-sm hover:shadow-md'}`}>
                 {isDir ? <FolderOpen size={20} /> : <FileText size={20} className="text-blue-500" />}
                 {/* FIXED: Added overflow-x-auto to filename to prevent mobile cut-off */}
                 <span className="font-mono text-sm truncate select-none overflow-x-auto">{path}</span>
               </div>
             );
           })}
         </div>
      </div>
    );
  }

  if (fileType === '7z') return <div className="flex flex-col items-center justify-center h-full text-center p-6 bg-gray-50"><FolderOpen className="w-16 h-16 text-yellow-600 mb-4" /><h2 className="text-xl font-bold mb-2">7-Zip Archive (.7z)</h2><p className="max-w-md text-gray-600 mb-6">Browsing .7z files directly is too heavy for browsers. Please download locally.</p><a href={file ? URL.createObjectURL(file) : "#"} download={file?.name} className="bg-yellow-600 text-white px-6 py-3 rounded-lg hover:bg-yellow-700 transition flex items-center gap-2"><Download size={20} /> Download .7z File</a></div>;

  return renderContent(fileType, file ? URL.createObjectURL(file) : null, fileContent, backendData, file?.name);
};

export default UniversalViewer;