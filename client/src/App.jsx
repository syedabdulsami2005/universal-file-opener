import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { FileUp, Loader2, X } from 'lucide-react'; 
import UniversalViewer from './UniversalViewer';

// API URL (Your live backend)
const API_URL = "https://universal-file-opener.onrender.com";

export default function App() {
  const [file, setFile] = useState(null);
  const [content, setContent] = useState(null);
  const [fileType, setFileType] = useState('');
  const [backendData, setBackendData] = useState(null);
  const [loading, setLoading] = useState(false);

  const onDrop = useCallback(async (acceptedFiles) => {
    const uploadedFile = acceptedFiles[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setBackendData(null);
    setContent(null); 
    setLoading(true);

    const ext = uploadedFile.name.split('.').pop().toLowerCase();
    setFileType(ext);

    // List of files we can read safely as text in the browser
    const codeExts = [
      'c','cpp','cc','cxx','h','hpp','hh','hxx',
      'java','jar','class',
      'py','pyw',
      'cs','csproj','sln',
      'rs','go','ts','tsx','php','rb','jsx','vue','svelte','erb',
      'kt','xml','gradle','swift','m','dart',
      'json','yaml','yml','toml','ini','cfg','conf','env','sql','db','sqlite','psql','md','tex','rst',
      'sh','bash','zsh','bat','cmd','ps1','vbs','dockerfile','makefile','cmake','vagrantfile',
      'hs','scala','erl','ex','exs','clj','v','r','jl',
      'txt','rtf','log','svg','html','htm','css','js','mjs'
    ];

    // 1. Try to read text locally
    if (codeExts.includes(ext)) {
      try {
        const text = await uploadedFile.text();
        setContent(text);
        setLoading(false);
      } catch (e) {
        setContent(null);
      }
    } else {
      setContent(null);
    }

    // 2. Send to Backend (for complex docs) or just finish loading
    const needsBackend = ['pptx','ppt','doc','odp'].includes(ext);
    
    if (needsBackend) {
      const formData = new FormData();
      formData.append('file', uploadedFile);
      try {
        const res = await axios.post(`${API_URL}/detect-and-convert`, formData);
        setBackendData(res.data);
      } catch (e) {
        console.error("Backend error:", e);
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }

  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  // --- 1. VIEWER SCREEN (File is Loaded) ---
  if (file) {
    return (
      <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
        {/* Header Bar */}
        <div className="h-16 bg-white border-b flex items-center justify-between px-6 shadow-sm shrink-0 z-50">
           <div className="flex items-center gap-3">
             {/* UPDATED TO PNG */}
             <img src="/logo.png" alt="Fylix Logo" className="w-10 h-10 object-contain drop-shadow-sm" />
             <span className="font-bold text-2xl text-gray-800 tracking-tight pb-1">Fylix</span>
           </div>
           
           <div className="flex items-center gap-4">
             <span className="text-sm font-medium text-gray-500 hidden sm:block">{file.name}</span>
             <button 
               onClick={() => setFile(null)} 
               className="flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 px-4 py-2 rounded-lg transition font-medium text-sm"
             >
               <X size={18} /> Close File
             </button>
           </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden relative">
           {loading ? (
              <div className="flex flex-col items-center justify-center h-full bg-white text-blue-600">
                 <Loader2 className="w-16 h-16 animate-spin mb-4" />
                 <h2 className="text-xl font-semibold">Processing File...</h2>
                 <p className="text-gray-400 text-sm mt-2">Optimizing for instant view</p>
              </div>
           ) : (
              <UniversalViewer file={file} fileType={fileType} fileContent={content} backendData={backendData} />
           )}
        </div>
      </div>
    );
  }

  // --- 2. LANDING SCREEN (No File) ---
  return (
    <div className="flex flex-col h-screen w-screen bg-gray-50 items-center justify-center p-6">
      
      {/* Branding Section */}
      <div className="text-center mb-10 animate-fade-in-up">
        <div className="relative inline-block group">
           <div className="absolute -inset-4 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-full blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
           {/* UPDATED TO PNG */}
           <img 
             src="/logo.png" 
             alt="Fylix Logo" 
             className="relative w-32 h-32 mx-auto transform transition duration-500 hover:scale-110 mb-6 object-contain" 
           />
        </div>
        
        <h1 className="text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-700 mb-3 tracking-tight pb-4">
          Fylix
        </h1>
        <p className="text-gray-500 text-xl font-medium">The Universal File Opener</p>
      </div>

      {/* Dropzone Area */}
      <div 
        {...getRootProps()} 
        className={`
          w-full max-w-2xl bg-white border-3 border-dashed rounded-3xl cursor-pointer transition-all duration-300 ease-in-out
          flex flex-col items-center justify-center p-12 text-center shadow-sm hover:shadow-xl
          ${isDragActive ? 'border-blue-500 bg-blue-50 scale-105' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}
        `}
      >
        <input {...getInputProps()} />
        
        <div className="bg-blue-100 p-4 rounded-full mb-4">
          <FileUp className={`w-10 h-10 text-blue-600 ${isDragActive ? 'animate-bounce' : ''}`} />
        </div>
        
        <h3 className="text-2xl font-bold text-gray-700 mb-2">
          {isDragActive ? "Drop it like it's hot!" : "Click to Upload or Drag & Drop"}
        </h3>
        <p className="text-gray-400 text-sm max-w-md mx-auto">
          Supports Code, Office Docs, PDFs, Images, Videos, Archives & more. 
          <br/>Instant preview directly in your browser.
        </p>
      </div>

      {/* Footer */}
      <div className="mt-12 text-gray-400 text-xs">
        &copy; 2026 Fylix. Powered by WebAssembly & React.
      </div>
    </div>
  );
}