import React, { useState, useEffect, Suspense, useRef, useMemo, useLayoutEffect } from "react";
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

// --- 1. SMART ZIP NAVIGATOR (Folder Logic + Mobile Scroll) ---
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
      {/* Breadcrumb */}
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

      {/* File List (Horizontal Scroll Enabled) */}
      <div className="flex-1 overflow-auto p-2">
        <div className="flex flex-col gap-1 min-w-full w-max">
          {folders.map(folder => (
            <div key={folder} onClick={() => setCurrentPath(prev => prev + folder + "/")} className="flex items-center gap-3 p-3 rounded-lg hover:bg-yellow-50 active:bg-yellow-100 cursor-pointer border border-transparent hover:border-yellow-200 transition min-w-[300px]">
              <FolderOpen size={24} className="text-yellow-500 shrink-0" />
              <span className="font-semibold text-gray-700">{folder}</span>
              <ChevronRight size={16} className="text-gray-400 ml-auto" />
            </div>
          ))}
          {files.map(file => {
             let Icon = FileText;
             const ext = file.name.split('.').pop().toLowerCase();
             if (['png','jpg','jpeg','gif'].includes(ext)) Icon = FileImage;
             if (['js','py','html','css','java','cpp'].includes(ext)) Icon = FileCode;
             return (
              <div key={file.name} onClick={() => onFileClick(file.fullPath)} className="flex items-center gap-3 p-3 rounded-lg hover:bg-blue-50 active:bg-blue-100 cursor-pointer border border-transparent hover:border-blue-200 transition min-w-[300px]">
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

// --- 2. PRECISE ZOOM WRAPPER (Fixed Jumping) ---
const ZoomWrapper = ({ children, className = "" }) => {
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

        // 1. Calculate offset relative to content (before scale)
        // We use container scroll + mouse position relative to container
        const scrollLeft = container.scrollLeft;
        const scrollTop = container.scrollTop;
        
        // Mouse relative to container
        const mouseX = centerX - rect.left;
        const mouseY = centerY - rect.top;

        // 2. Apply Scale
        content.style.transform = `scale(${newScale})`;
        content.style.width = newScale > 1 ? `${newScale * 100}%` : '100%';
        content.style.transformOrigin = "top left";
        state.current.scale = newScale;

        // 3. Adjust Scroll to keep mouse point stable
        // NewScroll = (OldScroll + Mouse) * Ratio - Mouse
        container.scrollLeft = (scrollLeft + mouseX) * ratio - mouseX;
        container.scrollTop = (scrollTop + mouseY) * ratio - mouseY;
    };

    const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
        // e.preventDefault(); // Allow some default handling to prevent lockup
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
    <div ref={containerRef} className={`relative w-full h-full overflow-auto bg-gray-50 touch-pan-x touch-pan-y ${className}`}>
      <div ref={contentRef} className="origin-top-left will-change-transform min-h-full" style={{ width: '100%', transition: 'transform 0.05s linear' }}>
        {children}
      </div>
    </div>
  );
};

// --- 3. PAGINATED TABLE ---
const PaginatedTable = ({ data }) => {
  const [page, setPage] = useState(0);
  const rowsPerPage = 500;
  const totalPages = Math.ceil(data.length / rowsPerPage);
  const currentRows = data.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  const html = `
    <table style="border-collapse: collapse; background: white; width: 100%;">
      ${currentRows.map((row, idx) => `
        <tr style="background: ${idx % 2 === 0 ? '#fff' : '#f9fafb'}; border-bottom: 1px solid #eee;">
          ${row.map((cell, cIdx) => {
             const tag = (page === 0 && idx === 0) ? 'th' : 'td';
             const bg = (page === 0 && idx === 0) ? 'background:#f3f4f6; font-weight:bold;' : '';
             return `<${tag} style="padding: 8px; border: 1px solid #ddd; ${bg} white-space: nowrap;">${cell ?? ''}</${tag}>`;
          }).join('')}
        </tr>
      `).join('')}
    </table>
  `;

  return (
    <div className="flex flex-col h-full w-full bg-white">
      <div className="flex-1 overflow-auto" dangerouslySetInnerHTML={{ __html: html }} />
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-3 border-t bg-gray-50 shrink-0">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1 bg-white border rounded shadow-sm disabled:opacity-50">Prev</button>
          <span className="text-sm text-gray-600">Page {page + 1} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1} className="px-3 py-1 bg-white border rounded shadow-sm disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
};

// --- 4. NOTEBOOK PARSER ---
const convertIpynbToHtml = async (blob) => {
  try {
    const text = await blob.text();
    const json = JSON.parse(text);
    let html = '<div style="padding: 20px; font-family: sans-serif;">';
    json.cells?.forEach(cell => {
      if (cell.cell_type === 'code') {
        const src = (Array.isArray(cell.source) ? cell.source.join('') : cell.source).trim();
        if(src) html += `<div style="background:#f8fafc; padding:10px; border:1px solid #e2e8f0; border-radius:4px; margin-bottom:10px; font-family:monospace; font-size:13px; overflow-x:auto;">${src}</div>`;
        cell.outputs?.forEach(o => {
           if(o.text) html += `<pre style="font-size:12px; color:#475569; margin:0 0 10px 10px;">${(Array.isArray(o.text) ? o.text.join('') : o.text)}</pre>`;
           if(o.data?.['image/png']) html += `<img src="data:image/png;base64,${(Array.isArray(o.data['image/png']) ? o.data['image/png'].join('') : o.data['image/png'])}" style="max-width:100%; margin:10px 0;" />`;
        });
      } else if (cell.cell_type === 'markdown') {
        const src = (Array.isArray(cell.source) ? cell.source.join('') : cell.source);
        html += `<div style="margin-bottom:10px; line-height:1.6;">${src.replace(/\n/g, '<br>')}</div>`;
      }
    });
    return html + '</div>';
  } catch(e) { return `<div style="color:red; padding:20px;">Error reading Notebook</div>`; }
};

// --- 5. MAIN VIEWER ---
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
      JSZip.loadAsync(file).then(setZipContent);
    }
  }, [file, fileType]);

  const handleZipFileClick = async (path) => {
    const zipObj = zipContent.files[path];
    if (zipObj.dir) return;

    setInternalLoading(true);
    setInternalBackendData(null); setInternalTableData(null); setInternalFileContent(null);
    setSelectedZipFile(path);

    const ext = path.split('.').pop().toLowerCase();
    setInternalFileType(ext);
    const blob = await zipObj.async("blob");
    const url = URL.createObjectURL(blob);
    setInternalFileUrl(url);

    try {
      if (ext === 'ipynb') {
         const html = await convertIpynbToHtml(blob);
         setInternalBackendData({ type: 'html_doc', content: html });
      } else if (['xlsx', 'xls'].includes(ext)) {
         const ab = await blob.arrayBuffer();
         const wb = XLSX.read(ab, { type: 'array' });
         setInternalTableData(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }));
      } else if (ext === 'csv') {
         const txt = await blob.text();
         setInternalTableData(txt.split(/\r?\n/).map(r => r.split(',')).filter(r => r.length > 1));
      } else if (ext === 'docx') {
         const ab = await blob.arrayBuffer();
         const res = await mammoth.convertToHtml({ arrayBuffer: ab });
         setInternalBackendData({ type: 'html_doc', content: res.value });
      } else if (['pptx','ppt','doc'].includes(ext)) {
         const fd = new FormData();
         fd.append('file', new File([blob], path, { type: blob.type }));
         const res = await axios.post(`${API_URL}/detect-and-convert`, fd);
         setInternalBackendData(res.data);
      } else if (['js','py','java','c','cpp','html','css','json','md','txt','sql','xml'].includes(ext)) {
         setInternalFileContent(await zipObj.async("string"));
      }
    } catch (e) { console.error(e); }
    setInternalLoading(false);
  };

  const renderContent = (type, url, content, data, tableData, fileName) => {
    // A. Tables
    if (tableData) return <ZoomWrapper><PaginatedTable data={tableData} /></ZoomWrapper>;
    
    // B. Documents (Word, Notebooks)
    if (data?.type === 'html_table' || data?.type === 'html_doc') {
      return <ZoomWrapper><div dangerouslySetInnerHTML={{ __html: data.content }} className="prose max-w-none bg-white shadow-sm p-4 w-full min-h-full" /></ZoomWrapper>;
    }

    // C. Images
    if (['png','jpg','jpeg','gif','bmp','webp'].includes(type) || data?.type === 'image_pass') {
      return <ZoomWrapper><img src={url} className="max-w-full h-auto mx-auto my-4" /></ZoomWrapper>;
    }

    // D. PDF (White BG Fix)
    if (type === 'pdf' || data?.type === 'pdf_pass') {
       return (
         <ZoomWrapper className="bg-white">
             <div className="flex flex-col items-center min-h-screen pt-4 pb-12">
                <div className="w-full md:w-[800px] lg:w-[900px] max-w-full shadow-lg">
                    <Suspense fallback={<LoadingSpinner />}><PdfRenderer url={url} /></Suspense>
                </div>
             </div>
         </ZoomWrapper>
       );
    }

    // E. Code (Full Screen Fixed)
    if (content || ['js','py','java','html','css','json','sql','md'].includes(type)) {
      return (
        <div className="absolute inset-0 w-full h-full bg-[#1e1e1e]">
           <Suspense fallback={<LoadingSpinner text="Loading Editor..." />}>
             <Editor height="100%" width="100%" language={type==='js'?'javascript':type} value={content} theme="vs-dark" options={{ readOnly: true, minimap: { enabled: false }, automaticLayout: true }} />
           </Suspense>
        </div>
      );
    }

    // F. Media
    if (['mp4','webm'].includes(type)) return <div className="flex items-center justify-center h-full bg-black"><video controls src={url} className="max-w-full max-h-full" /></div>;
    
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50 text-gray-600 p-6 text-center">
        <FileQuestion className="w-12 h-12 text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Preview Unavailable</h2>
        <a href={url} download={fileName} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"><Download className="w-5 h-5" /> Download File</a>
      </div>
    );
  };

  if (selectedZipFile) {
    return (
      <div className="flex flex-col h-full bg-gray-100 relative">
        <div className="bg-white p-3 border-b flex items-center gap-3 shadow-sm z-20 shrink-0">
          <button onClick={() => { setSelectedZipFile(null); setInternalFileUrl(null); }} className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-800"><ArrowLeft size={18} /> Back</button>
          <span className="text-gray-700 text-sm font-medium truncate flex-1">/ {selectedZipFile}</span>
        </div>
        <div className="flex-1 overflow-hidden relative w-full h-full">
          {internalLoading ? <LoadingSpinner text="Opening..." /> : renderContent(internalFileType, internalFileUrl, internalFileContent, internalBackendData, internalTableData, selectedZipFile)}
        </div>
      </div>
    );
  }

  if ((fileType === 'zip' || fileType === 'jar') && zipContent) return <ZipNavigator zipContent={zipContent} onFileClick={handleZipFileClick} />;
  
  return renderContent(fileType, file ? URL.createObjectURL(file) : null, fileContent, backendData, null, file?.name);
};

export default UniversalViewer;