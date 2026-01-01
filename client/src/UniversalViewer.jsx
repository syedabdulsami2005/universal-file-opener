import React, { useState, useEffect, Suspense, useRef, useMemo } from "react";
import JSZip from "jszip";
import axios from "axios";
import * as XLSX from "xlsx"; 
import mammoth from "mammoth";
import { Loader2, Download, FileText, FolderOpen, ArrowLeft, FileQuestion, ChevronLeft, ChevronRight, FileCode, FileImage, Home } from "lucide-react";

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

// --- 1. SMART ZIP NAVIGATOR (Folder Logic) ---
const ZipNavigator = ({ zipContent, onFileClick }) => {
  const [currentPath, setCurrentPath] = useState(""); // Root is empty string

  // Calculate folder contents based on currentPath
  const { folders, files } = useMemo(() => {
    if (!zipContent) return { folders: [], files: [] };

    const folderSet = new Set();
    const fileList = [];

    Object.keys(zipContent.files).forEach((path) => {
      if (!path.startsWith(currentPath)) return; // Not in this folder

      const relativePath = path.slice(currentPath.length);
      if (!relativePath) return; // Is the current folder itself

      const parts = relativePath.split('/');
      
      if (parts.length > 1 || (parts.length === 1 && zipContent.files[path].dir)) {
        // It's a subfolder (e.g., "Module-1/")
        const folderName = parts[0];
        if (folderName) folderSet.add(folderName);
      } else {
        // It's a file in this folder
        fileList.push({ name: parts[0], fullPath: path });
      }
    });

    return {
      folders: Array.from(folderSet).sort(),
      files: fileList.sort((a, b) => a.name.localeCompare(b.name))
    };
  }, [zipContent, currentPath]);

  const enterFolder = (folderName) => {
    setCurrentPath(prev => prev + folderName + "/");
  };

  const goUp = () => {
    const parts = currentPath.split('/').filter(p => p);
    parts.pop();
    setCurrentPath(parts.length > 0 ? parts.join('/') + '/' : "");
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Navigation Bar */}
      <div className="p-3 border-b bg-gray-50 flex items-center gap-2 shadow-sm shrink-0 overflow-x-auto whitespace-nowrap">
        {currentPath ? (
          <button onClick={goUp} className="flex items-center gap-1 text-sm font-bold text-blue-600 hover:bg-blue-100 px-2 py-1 rounded">
            <ArrowLeft size={16} /> Back
          </button>
        ) : (
          <div className="flex items-center gap-1 text-sm font-bold text-gray-500 px-2">
            <Home size={16} /> Root
          </div>
        )}
        <span className="text-gray-400">|</span>
        <span className="text-sm font-mono text-gray-700">{currentPath || "/"}</span>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2">
        <div className="grid gap-1">
          {/* Folders */}
          {folders.map(folder => (
            <div 
              key={folder} 
              onClick={() => enterFolder(folder)}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-yellow-50 active:bg-yellow-100 cursor-pointer border border-transparent hover:border-yellow-200 transition"
            >
              <FolderOpen size={24} className="text-yellow-500 shrink-0" />
              <span className="font-semibold text-gray-700 truncate flex-1">{folder}</span>
              <ChevronRight size={16} className="text-gray-400" />
            </div>
          ))}

          {/* Files */}
          {files.map(file => {
             let Icon = FileText;
             const ext = file.name.split('.').pop().toLowerCase();
             if (['png','jpg','jpeg','gif'].includes(ext)) Icon = FileImage;
             if (['js','py','html','css','java','cpp'].includes(ext)) Icon = FileCode;

             return (
              <div 
                key={file.name} 
                onClick={() => onFileClick(file.fullPath)}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-blue-50 active:bg-blue-100 cursor-pointer border border-transparent hover:border-blue-200 transition"
              >
                <Icon size={24} className="text-blue-500 shrink-0" />
                {/* min-w-0 allows truncate to work inside flex */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                </div>
              </div>
             );
          })}

          {folders.length === 0 && files.length === 0 && (
             <div className="text-center p-8 text-gray-400 italic">Empty Folder</div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- 2. INSTANT IPYNB PARSER ---
const convertIpynbToHtml = async (blob) => {
  try {
    const text = await blob.text();
    const json = JSON.parse(text);
    let html = '<div style="padding: 16px; font-family: -apple-system, sans-serif; max-width: 100%; box-sizing: border-box;">';
    
    if (json.cells) {
      json.cells.forEach((cell) => {
        if (cell.cell_type === 'code') {
           const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
           if (source && source.trim()) {
             html += `
               <div style="margin-bottom: 12px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
                 <div style="background: #f8fafc; padding: 6px 12px; border-bottom: 1px solid #e5e7eb; font-size: 11px; color: #64748b; font-family: monospace;">In [${cell.execution_count || ' '}]:</div>
                 <div style="background: #ffffff; padding: 12px; overflow-x: auto;">
                   <pre style="margin: 0; font-size: 13px; font-family: monospace; color: #334155;">${source}</pre>
                 </div>
               </div>`;
           }
        } else if (cell.cell_type === 'markdown') {
           const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
           // Simple Markdown Formatter
           let formatted = source
              .replace(/### (.*)/g, '<h3 style="font-weight:600; font-size:1.1em; margin:16px 0 8px;">$1</h3>')
              .replace(/## (.*)/g, '<h2 style="font-weight:600; font-size:1.25em; margin:20px 0 10px; border-bottom:1px solid #eee;">$1</h2>')
              .replace(/# (.*)/g, '<h1 style="font-weight:700; font-size:1.5em; margin:24px 0 12px; border-bottom:1px solid #eee;">$1</h1>')
              .replace(/\*\*(.*)\*\*/g, '<b>$1</b>')
              .replace(/`([^`]*)`/g, '<code style="background:#f1f5f9; padding:2px 4px; borderRadius:4px; font-family:monospace; color:#d946ef;">$1</code>')
              .replace(/\n/g, '<br>');
           html += `<div style="padding: 4px 8px; color: #1f2937; line-height: 1.6;">${formatted}</div>`;
        }
        if (cell.outputs) {
           cell.outputs.forEach(out => {
             if (out.text) {
               const txt = Array.isArray(out.text) ? out.text.join('') : out.text;
               html += `<div style="margin-left: 4px; margin-bottom: 12px; font-size: 12px; font-family: monospace; color: #475569; white-space: pre-wrap; background: #f8fafc; padding: 8px;">${txt}</div>`;
             }
             if (out.data && out.data['image/png']) {
                 const imgData = Array.isArray(out.data['image/png']) ? out.data['image/png'].join('') : out.data['image/png'];
                 html += `<div style="margin: 12px 0;"><img src="data:image/png;base64,${imgData}" style="max-width: 100%; height: auto; border-radius: 4px;" /></div>`;
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

// --- 3. PAGINATED TABLE RENDERER ---
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
    <div className="flex flex-col h-full w-full bg-white">
      <div className="flex-1 overflow-auto" dangerouslySetInnerHTML={{ __html: html }} />
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white border-t p-3 shrink-0">
          <button onClick={prevPage} disabled={page === 0} className="px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50"><ChevronLeft size={16} /></button>
          <span className="text-xs font-medium text-gray-500">Page {page + 1} / {totalPages}</span>
          <button onClick={nextPage} disabled={page === totalPages - 1} className="px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
};

// --- 4. SMART GESTURE ZOOM WRAPPER (Zoom-to-Point) ---
const ZoomWrapper = ({ children, className = "" }) => {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const state = useRef({ scale: 1, startDist: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateTransform = (originX, originY) => {
      const content = contentRef.current;
      if (!content) return;
      
      const { scale } = state.current;
      content.style.transform = `scale(${scale})`;
      // Expand width to allow scrolling to edges
      content.style.width = scale > 1 ? `${scale * 100}%` : '100%';
      content.style.transformOrigin = "top left";
    };

    const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
        // e.preventDefault(); // Allow browser defaults slightly to reduce conflict
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
           
           state.current.scale = newScale;
           state.current.startDist = newDist; 
           updateTransform();
        }
      }
    };

    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.001; 
        let newScale = state.current.scale + delta;
        newScale = Math.max(1.0, Math.min(newScale, 5.0));

        // Logic to keep mouse focused
        const rect = container.getBoundingClientRect();
        const offsetX = e.clientX - rect.left + container.scrollLeft;
        const offsetY = e.clientY - rect.top + container.scrollTop;

        // Ratio of change
        const ratio = newScale / state.current.scale;

        state.current.scale = newScale;
        updateTransform();

        // Adjust scroll to keep focus
        container.scrollLeft = offsetX * ratio - (e.clientX - rect.left);
        container.scrollTop = offsetY * ratio - (e.clientY - rect.top);
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
    <div ref={containerRef} className={`relative w-full h-full overflow-auto bg-gray-50 touch-pan-x touch-pan-y ${className}`}>
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

  const renderContent = (type, url, content, data, tableData, fileName) => {
    
    // A. TABLE DATA
    if (tableData) {
       return <ZoomWrapper><PaginatedTable data={tableData} fileName={fileName} /></ZoomWrapper>;
    }
    // B. HTML DOCUMENTS (Word, Notebooks)
    if (data?.type === 'html_table' || data?.type === 'html_doc') {
      return (
        <ZoomWrapper>
           <div dangerouslySetInnerHTML={{ __html: data.content }} className="prose max-w-none bg-white shadow-sm p-4 w-full h-full" />
        </ZoomWrapper>
      );
    }
    // C. IMAGES
    if (EXT_MAP.image.includes(type) || data?.type === 'image_pass') {
      return (
        <ZoomWrapper>
          <img src={url} className="max-w-full max-h-none object-contain mx-auto my-4 shadow-md" style={{ minWidth: 'auto' }} />
        </ZoomWrapper>
      );
    }

    // D. PDF (FIXED: Uses ZoomWrapper for Pinch, but forces white background & fit)
    if (type === 'pdf' || data?.type === 'pdf_pass') {
       return (
         <ZoomWrapper className="bg-gray-200">
             <div className="flex flex-col items-center min-h-screen pt-4 pb-12">
                <div className="bg-white shadow-xl w-full md:w-[800px] lg:w-[900px] max-w-full">
                    <Suspense fallback={<LoadingSpinner />}><PdfRenderer url={url} /></Suspense>
                </div>
             </div>
         </ZoomWrapper>
       );
    }

    // E. CODE (FIXED: 100% dimensions, no zoom wrapper to break layout)
    if (content || data?.type === 'text_content') {
      const displayContent = data?.type === 'text_content' ? data.content : content;
      const getLanguage = (e) => ({ js:'javascript', py:'python', java:'java', html:'html', css:'css', json:'json', sql:'sql', md:'markdown' }[e] || "plaintext");
      return (
        <div className="flex-1 w-full h-full bg-[#1e1e1e] overflow-hidden flex flex-col"> 
          <Suspense fallback={<LoadingSpinner text="Loading Editor..." />}>
             <Editor 
                height="100%" 
                width="100%"
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
    
    // F. MODELS/MEDIA/FALLBACK
    if (EXT_MAP.model.includes(type)) return <div className="h-[500px] w-full"><Suspense fallback={<LoadingSpinner />}><ModelViewer url={url} /></Suspense></div>;
    if (EXT_MAP.video.includes(type)) return <div className="flex items-center justify-center h-full bg-black"><video controls src={url} className="max-w-full max-h-full" /></div>;
    if (EXT_MAP.audio.includes(type)) return <div className="flex items-center justify-center h-60"><audio controls src={url} /></div>;

    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50 text-gray-600 p-6 text-center">
        <FileQuestion className="w-12 h-12 text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Preview Unavailable</h2>
        <a href={url} download={fileName} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"><Download className="w-5 h-5" /> Download File</a>
      </div>
    );
  };

  // --- INTERNAL ZIP VIEW ---
  if (selectedZipFile) {
    return (
      <div className="flex flex-col h-full bg-gray-100">
        <div className="bg-white p-3 border-b flex items-center gap-3 shadow-sm z-20 shrink-0">
          <button onClick={closeInternalFile} className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-800 transition"><ArrowLeft size={18} /> Back</button>
          <span className="text-gray-700 text-