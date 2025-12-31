import React, { useState, useEffect, Suspense } from "react";
import JSZip from "jszip";
import { Loader2, Download, FileText, FolderOpen, ArrowLeft, FileQuestion } from "lucide-react";

// Lazy Load Components (Keeps the app fast)
const Editor = React.lazy(() => import("@monaco-editor/react"));
const ModelViewer = React.lazy(() => import("./ModelViewer"));
const PdfRenderer = React.lazy(() => import("./PdfRenderer"));

const LoadingSpinner = ({ text }) => (
  <div className="flex items-center justify-center h-full text-blue-500 gap-2">
    <Loader2 className="w-8 h-8 animate-spin" />
    <span>{text || "Loading..."}</span>
  </div>
);

const UniversalViewer = ({ file, fileType, fileContent, backendData }) => {
  const [zipContent, setZipContent] = useState(null);
  const [selectedZipFile, setSelectedZipFile] = useState(null); // The file inside zip we are viewing
  const [internalFileType, setInternalFileType] = useState('');
  const [internalFileUrl, setInternalFileUrl] = useState(null);
  const [internalFileContent, setInternalFileContent] = useState(null);

  // --- 1. ZIP HANDLING LOGIC ---
  useEffect(() => {
    if ((fileType === 'zip' || fileType === 'jar') && file) {
      JSZip.loadAsync(file).then((zip) => {
        setZipContent(zip);
      });
    }
  }, [file, fileType]);

  const handleZipFileClick = async (relativePath) => {
    if (!zipContent) return;
    const zipObj = zipContent.files[relativePath];
    if (zipObj.dir) return; // Ignore folders

    // Determine type of the internal file
    const ext = relativePath.split('.').pop().toLowerCase();
    setInternalFileType(ext);

    // Extract file content based on type
    const blob = await zipObj.async("blob");
    const url = URL.createObjectURL(blob);
    setInternalFileUrl(url);
    setSelectedZipFile(relativePath);

    // If it's text/code, read it as text string for the Editor
    const textExts = ['txt','md','js','py','html','css','json','java','c','cpp','h','xml','sql','sh','bat'];
    if (textExts.includes(ext)) {
      const text = await zipObj.async("string");
      setInternalFileContent(text);
    } else {
      setInternalFileContent(null);
    }
  };

  const closeInternalFile = () => {
    setSelectedZipFile(null);
    setInternalFileUrl(null);
    setInternalFileContent(null);
  };

  // --- 2. UNIVERSAL RENDERER (Handles both Main files and Zip files) ---
  const renderContent = (type, url, content, data, fileName) => {
    
    // A. Backend Content (Office, Excel, HTML)
    if (data?.type === 'html_table' || data?.type === 'html_doc') {
      return <div dangerouslySetInnerHTML={{ __html: data.content }} className="prose max-w-none p-4 overflow-auto h-full" />;
    }

    // B. Images
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(type) || data?.type === 'image_pass') {
      return <img src={url} className="max-w-full max-h-full object-contain mx-auto" />;
    }

    // C. Audio / Video
    if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(type)) return <video controls src={url} className="w-full max-h-full" />;
    if (['mp3', 'wav', 'ogg', 'flac'].includes(type)) return <div className="flex items-center justify-center h-full"><audio controls src={url} /></div>;

    // D. PDF
    if (type === 'pdf' || data?.type === 'pdf_pass') {
       return (
         <Suspense fallback={<LoadingSpinner text="Loading PDF..." />}>
           <PdfRenderer url={url} />
         </Suspense>
       );
    }

    // E. 3D Models
    if (['stl', 'obj'].includes(type)) {
      return (
        <div className="h-[500px]">
          <Suspense fallback={<LoadingSpinner text="Loading 3D Engine..." />}>
            <ModelViewer url={url} />
          </Suspense>
        </div>
      );
    }

    // F. Code & Text
    // Language Mapping
    const getLanguage = (ext) => {
        const map = {
          js:'javascript', mjs:'javascript', jsx:'javascript', ts:'typescript', tsx:'typescript',
          py:'python', pyw:'python', ipynb:'python',
          java:'java', kt:'kotlin',
          c:'c', cpp:'cpp', cc:'cpp', cxx:'cpp', h:'cpp', hpp:'cpp', cs:'csharp',
          go:'go', rs:'rust', swift:'swift', dart:'dart',
          php:'php', rb:'ruby',
          html:'html', htm:'html', css:'css', scss:'scss', less:'less',
          json:'json', yaml:'yaml', yml:'yaml', xml:'xml', sql:'sql',
          sh:'shell', bash:'shell', zsh:'shell', bat:'bat', ps1:'powershell',
          md:'markdown', dockerfile:'dockerfile',
          r:'r', clj:'clojure', ex:'elixir'
        };
        return map[ext] || "plaintext";
    };

    if (content || data?.type === 'text_content') {
      const displayContent = data?.type === 'text_content' ? data.content : content;
      return (
        <Suspense fallback={<LoadingSpinner text="Loading Editor..." />}>
          <Editor 
            height="100%" 
            language={getLanguage(type)} 
            value={displayContent} 
            theme="vs-dark" 
            options={{ readOnly: true, minimap: { enabled: false } }} 
          />
        </Suspense>
      );
    }

    // G. Fallback (The Download Card)
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50 text-gray-600 p-6 text-center">
        <div className="bg-white p-6 rounded-full shadow-md mb-4"><FileQuestion className="w-12 h-12 text-gray-400" /></div>
        <h2 className="text-xl font-semibold mb-2">Preview Unavailable</h2>
        <p className="mb-6 max-w-sm">We cannot display this file type (.{type}) directly.</p>
        <a href={url} download={fileName} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition shadow-lg">
          <Download className="w-5 h-5" /> Download File
        </a>
      </div>
    );
  };

  // --- 3. MAIN RENDER SWITCH ---

  // I. If viewing a file INSIDE a zip (The new interactive part)
  if (selectedZipFile) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-gray-100 p-2 border-b flex items-center gap-2">
          <button onClick={closeInternalFile} className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-800">
            <ArrowLeft size={16} /> Back to Archive
          </button>
          <span className="text-gray-500 text-sm truncate">/ {selectedZipFile}</span>
        </div>
        <div className="flex-1 overflow-hidden">
          {renderContent(internalFileType, internalFileUrl, internalFileContent, null, selectedZipFile)}
        </div>
      </div>
    );
  }

  // II. Viewing the ZIP Archive List (Clickable!)
  if ((fileType === 'zip' || fileType === 'jar') && zipContent) {
    return (
      <div className="p-4 h-full overflow-auto bg-gray-50">
         <h3 className="font-bold mb-4 flex items-center gap-2 text-lg text-gray-800">
           <FolderOpen className="text-yellow-500" /> Archive Contents:
         </h3>
         <div className="grid gap-2">
           {Object.keys(zipContent.files).map((path) => {
             const isDir = zipContent.files[path].dir;
             return (
               <div 
                 key={path} 
                 onClick={() => !isDir && handleZipFileClick(path)}
                 className={`p-3 rounded-lg border flex items-center gap-3 transition ${
                   isDir ? 'bg-gray-200 text-gray-600' : 'bg-white hover:bg-blue-50 cursor-pointer shadow-sm hover:shadow-md'
                 }`}
               >
                 {isDir ? <FolderOpen size={20} /> : <FileText size={20} className="text-blue-500" />}
                 <span className="font-mono text-sm truncate select-none">{path}</span>
               </div>
             );
           })}
         </div>
      </div>
    );
  }

  // III. Handling 7z Files (Special Download Screen)
  if (fileType === '7z') {
     return (
       <div className="flex flex-col items-center justify-center h-full text-center p-6 bg-gray-50">
         <div className="bg-white p-6 rounded-full shadow-md mb-4">
            <FolderOpen className="w-16 h-16 text-yellow-600" />
         </div>
         <h2 className="text-xl font-bold mb-2">7-Zip Archive (.7z)</h2>
         <p className="max-w-md text-gray-600 mb-6">
           Browsing .7z files directly in the browser is extremely heavy and can crash mobile devices. 
           Please download and extract this file locally.
         </p>
         <a href={URL.createObjectURL(file)} download={file.name} className="bg-yellow-600 text-white px-6 py-3 rounded-lg hover:bg-yellow-700 transition shadow-lg flex items-center gap-2">
           <Download size={20} /> Download .7z File
         </a>
       </div>
     );
  }

  // IV. Standard File View (Everything else)
  return renderContent(fileType, file ? URL.createObjectURL(file) : null, fileContent, backendData, file?.name);
};

export default UniversalViewer;