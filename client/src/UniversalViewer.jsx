import React, { useState, useEffect, Suspense, useRef, useMemo, useLayoutEffect } from "react";
import JSZip from "jszip";
import * as XLSX from "xlsx"; 
import mammoth from "mammoth";
import { Loader2, Download, FileText, FolderOpen, ArrowLeft, FileQuestion, ChevronLeft, ChevronRight, FileCode, FileImage, Home, FileJson, FileTerminal, Database, Music, Video, Box } from "lucide-react";

// Lazy Load Components
const Editor = React.lazy(() => import("@monaco-editor/react"));
const ModelViewer = React.lazy(() => import("./ModelViewer"));
const PdfRenderer = React.lazy(() => import("./PdfRenderer"));

// --- HELPERS ---
const LoadingSpinner = ({ text }) => (
  <div className="flex flex-col items-center justify-center h-full text-blue-500 gap-3 p-6 text-center">
    <Loader2 className="w-10 h-10 animate-spin" />
    <span className="font-semibold text-lg">{text || "Processing Locally..."}</span>
  </div>
);

// --- 1. EXTENSION MAP (Categorized for Icons & Editor) ---
const EXT_MAP = {
  // Text / Code
  c: 'c', cpp: 'cpp', cc: 'cpp', h: 'cpp', hpp: 'cpp',
  java: 'java', class: 'java', 
  py: 'python', pyc: 'python', pyw: 'python',
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', mjs: 'javascript',
  html: 'html', htm: 'html', css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml', toml: 'ini', ini: 'ini', env: 'properties',
  sql: 'sql', md: 'markdown', tex: 'latex',
  sh: 'shell', bat: 'bat', ps1: 'powershell', dockerfile: 'dockerfile',
  txt: 'plaintext', csv: 'csv', log: 'plaintext', rtf: 'plaintext',

  // Binary / Complex
  office: ['docx', 'xlsx', 'xls', 'odt'], 
  notebook: ['ipynb'],
  image: ['jpg','jpeg','png','gif','bmp','webp','svg','ico'],
  video: ['mp4','mkv','avi','mov','webm'],
  audio: ['mp3','wav','ogg','m4a'],
  model: ['stl','obj'],
  pdf: ['pdf'],
  archive: ['zip', 'jar', '7z', 'rar', 'tar', 'gz']
};

// --- 2. UNIFIED FILE PROCESSOR (The Core Logic) ---
// This function handles BOTH single files and files inside ZIPs
const processFile = async (blob, ext) => {
  const fileUrl = URL.createObjectURL(blob);

  // 1. PDF (Native)
  if (EXT_MAP.pdf.includes(ext)) {
    return { type: 'pdf', url: fileUrl };
  }

  // 2. Images (Native)
  if (EXT_MAP.image.includes(ext)) {
    return { type: 'image', url: fileUrl };
  }

  // 3. Video/Audio (Native)
  if (EXT_MAP.video.includes(ext)) return { type: 'video', url: fileUrl };
  if (EXT_MAP.audio.includes(ext)) return { type: 'audio', url: fileUrl };
  if (EXT_MAP.model.includes(ext)) return { type: 'model', url: fileUrl };

  // 4. Excel / CSV (Local Parse)
  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    try {
      if (ext === 'csv') {
        const text = await blob.text();
        const rows = text.split(/\r?\n/).map(r => r.split(',')).filter(r => r.length > 1);
        return { type: 'table', content: rows };
      } else {
        const arrayBuffer = await blob.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
        return { type: 'table', content: rows };
      }
    } catch (e) { return { type: 'error', message: 'Could not parse spreadsheet.' }; }
  }

  // 5. Word Documents (Local Parse)
  if (['docx', 'odt'].includes(ext)) {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      return { type: 'html_doc', content: result.value };
    } catch (e) { return { type: 'error', message: 'Could not parse document.' }; }
  }

  // 6. Jupyter Notebooks (Local Parse)
  if (ext === 'ipynb') {
    try {
      const text = await blob.text();
      const json = JSON.parse(text);
      let html = '<div style="padding: 20px; font-family: sans-serif; min-width: 100%; width: fit-content;">';
      json.cells?.forEach(cell => {
        if (cell.cell_type === 'code') {
          const src = (Array.isArray(cell.source) ? cell.source.join('') : cell.source).trim();
          if(src) html += `<div style="background:#f8fafc; padding:10px; border:1px solid #e2e8f0; border-radius:4px; margin-bottom:10px; font-family:monospace; font-size:13px; overflow-x:auto;">${src}</div>`;
          cell.outputs?.forEach(o => {
             if(o.text) html += `<pre style="font-size:12px; color:#475569; margin:0 0 10px 10px; overflow-x:auto;">${(Array.isArray(o.text) ? o.text.join('') : o.text)}</pre>`;
             if(o.data?.['image/png']) html += `<img src="data:image/png;base64,${(Array.isArray(o.data['image/png']) ? o.data['image/png'].join('') : o.data['image/png'])}" style="max-width:100%; margin:10px 0;" />`;
          });
        } else if (cell.cell_type === 'markdown') {
          const src = (Array.isArray(cell.source) ? cell.source.join('') : cell.source);
          html += `<div style="margin-bottom:10px; line-height:1.6;">${src.replace(/\n/g, '<br>')}</div>`;
        }
      });
      html += '</div>';
      return { type: 'html_doc', content: html };
    } catch (e) { return { type: 'error', message: 'Invalid Notebook file.' }; }
  }

  // 7. Code / Text (Fallback)
  // Check if extension is in our known text map OR try to read as text
  try {
    const text = await blob.text();
    // Safety check: If file contains many null bytes, it's likely a binary we can't read (like .exe or .pptx)
    if ((text.match(/\0/g)||[]).length > 10) {
       return { type: 'download', url: fileUrl }; // Binary -> Force Download
    }
    return { type: 'text_content', content: text, ext: ext };
  } catch (e) {
    return { type: 'download', url: fileUrl };
  }
};

// --- 3. ZIP NAVIGATOR ---
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
          <button onClick={goUp} className="flex items-center gap-1 text-sm font-bold text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-full transition bg-white border border-blue-100"><ArrowLeft size={16} /> Back</button>
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
             let Icon = FileText;
             const ext = file.name.split('.').pop().toLowerCase();
             if (EXT_MAP.image.includes(ext)) Icon = FileImage;
             else if (EXT_MAP.office.includes(ext) || EXT_MAP.notebook.includes(ext)) Icon = FileText;
             else if (['mp3','wav'].includes(ext)) Icon = Music;
             else if (['mp4','mkv'].includes(ext)) Icon = Video;
             else if (['stl','obj'].includes(ext)) Icon = Box;
             else Icon = FileCode;

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

// --- 4. PRECISE ZOOM WRAPPER ---
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
    <div ref={containerRef} className={`relative w-full h-full overflow-auto bg-gray-50 touch-pan-x touch-pan-y ${className}`}>
      <div ref={contentRef} className="origin-top-left will-change-transform min-h-full" style={{ width: '100%', transition: 'transform 0.05s linear' }}>{children}</div>
    </div>
  );
};

// --- 5. PAGINATED TABLE ---
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

// --- 6. MAIN VIEWER ---
const UniversalViewer = ({ file, fileType, fileContent, backendData }) => {
  const [zipContent, setZipContent] = useState(null);
  const [selectedZipFile, setSelectedZipFile] = useState(null);
  const [viewState, setViewState] = useState(null); // { type, content, url, ext, name }
  const [loading, setLoading] = useState(false);

  // A. INITIAL LOAD (ZIP or SINGLE FILE)
  useEffect(() => {
    const init = async () => {
      if (!file) return;
      
      // 1. IS ZIP?
      if (EXT_MAP.archive.includes(fileType)) {
        if (fileType === 'zip' || fileType === 'jar') {
           JSZip.loadAsync(file).then(setZipContent);
        }
        return; // 7z, rar handled by render fallback
      }

      // 2. SINGLE FILE -> PROCESS IMMEDIATELY
      setLoading(true);
      const result = await processFile(file, fileType);
      setViewState({ ...result, name: file.name });
      setLoading(false);
    };
    init();
  }, [file, fileType]);

  // B. HANDLE ZIP FILE CLICK
  const handleZipFileClick = async (path) => {
    const zipObj = zipContent.files[path];
    if (zipObj.dir) return;

    setLoading(true);
    setSelectedZipFile(path);
    
    const ext = path.split('.').pop().toLowerCase();
    const blob = await zipObj.async("blob");
    const result = await processFile(blob, ext);
    
    setViewState({ ...result, name: path });
    setLoading(false);
  };

  // --- RENDERER ---
  const renderContent = () => {
    if (!viewState) return null;
    const { type, content, url, ext, name } = viewState;

    if (type === 'table') return <ZoomWrapper><PaginatedTable data={content} /></ZoomWrapper>;
    if (type === 'html_doc') return <ZoomWrapper><div dangerouslySetInnerHTML={{ __html: content }} className="prose max-w-none bg-white shadow-sm p-4 w-max min-w-full min-h-full" /></ZoomWrapper>;
    if (type === 'image') return <ZoomWrapper><img src={url} className="max-w-full h-auto mx-auto my-4" /></ZoomWrapper>;
    if (type === 'pdf') return <ZoomWrapper className="bg-white"><div className="flex flex-col items-center min-h-screen pb-12"><div className="w-full md:w-[800px] lg:w-[900px] max-w-full shadow-lg"><Suspense fallback={<LoadingSpinner />}><PdfRenderer url={url} /></Suspense></div></div></ZoomWrapper>;
    if (type === 'text_content') {
       let lang = EXT_MAP[ext] || 'plaintext';
       if(Array.isArray(lang)) lang = 'plaintext';
       return (
        <div className="absolute inset-0 w-full h-full bg-[#1e1e1e]">
           <Suspense fallback={<LoadingSpinner text="Loading Editor..." />}>
             <Editor height="100%" width="100%" language={lang} value={content} theme="vs-dark" options={{ readOnly: true, minimap: { enabled: false }, automaticLayout: true, scrollBeyondLastLine: false, wordWrap: 'off' }} />
           </Suspense>
        </div>
       );
    }
    if (type === 'video') return <div className="flex items-center justify-center h-full bg-black"><video controls src={url} className="max-w-full max-h-full" /></div>;
    if (type === 'audio') return <div className="flex items-center justify-center h-60"><audio controls src={url} /></div>;
    if (type === 'model') return <div className="h-[500px] w-full"><Suspense fallback={<LoadingSpinner />}><ModelViewer url={url} /></Suspense></div>;

    // Fallback / Download
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50 text-gray-600 p-6 text-center">
        <FileQuestion className="w-12 h-12 text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Binary File Detected</h2>
        <a href={url} download={name} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"><Download className="w-5 h-5" /> Download File</a>
      </div>
    );
  };

  // --- VIEW STATES ---
  
  // 1. LOADING
  if (loading) return <LoadingSpinner />;

  // 2. VIEWING FILE (Either Single or from Zip)
  if (viewState) {
    return (
      <div className="flex flex-col h-full bg-gray-100 relative">
        {selectedZipFile && (
          <div className="bg-white p-3 border-b flex items-center gap-3 shadow-sm z-20 shrink-0">
            <button onClick={() => { setViewState(null); setSelectedZipFile(null); }} className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-800"><ArrowLeft size={18} /> Back</button>
            <span className="text-gray-700 text-sm font-medium truncate flex-1">/ {selectedZipFile}</span>
          </div>
        )}
        <div className="flex-1 overflow-hidden relative w-full h-full">
          {renderContent()}
        </div>
      </div>
    );
  }

  // 3. ZIP BROWSER
  if (zipContent) return <ZipNavigator zipContent={zipContent} onFileClick={handleZipFileClick} />;
  
  // 4. UNSUPPORTED ARCHIVE (7z/Rar - Download Only)
  if (fileType === '7z' || fileType === 'rar') return <div className="flex flex-col items-center justify-center h-full text-center p-6 bg-gray-50"><FolderOpen className="w-16 h-16 text-yellow-600 mb-4" /><h2 className="text-xl font-bold mb-2">Archive File</h2><a href={file ? URL.createObjectURL(file) : "#"} download={file?.name} className="bg-yellow-600 text-white px-6 py-3 rounded-lg hover:bg-yellow-700 transition flex items-center gap-2"><Download size={20} /> Download</a></div>;

  return null;
};

export default UniversalViewer;