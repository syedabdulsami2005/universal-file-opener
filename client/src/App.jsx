import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { FileUp } from 'lucide-react';
import UniversalViewer from './UniversalViewer';
import bufferingLogo from './assets/buffering-logo.png';

// Change to your live URL
const API_URL = "https://universal-file-opener.onrender.com";

export default function App() {
  const [file, setFile] = useState(null);
  const [content, setContent] = useState(null);
  const [fileType, setFileType] = useState('');
  const [backendData, setBackendData] = useState(null);
  const [loading, setLoading] = useState(false);

  const onDrop = useCallback(async (acceptedFiles) => {
    const uploadedFile = acceptedFiles[0];
    setFile(uploadedFile);
    setBackendData(null);
    setContent(null); // Reset content
    setLoading(true);

    const ext = uploadedFile.name.split('.').pop().toLowerCase();
    setFileType(ext);

    // List of files we can read safely as text in the browser
    const codeExts = [
      'c','cpp','cc','cxx','h','hpp','hh','hxx', // C++
      'java','jar','class', // Java (Source only)
      'py','pyw', // Python
      'cs','csproj','sln', // C#
      'rs','go','ts','tsx','php','rb','jsx','vue','svelte','erb', // Web/Modern
      'kt','xml','gradle','swift','m','dart', // Mobile
      'json','yaml','yml','toml','ini','cfg','conf','env','sql','db','sqlite','psql','md','tex','rst', // Config/Data
      'sh','bash','zsh','bat','cmd','ps1','vbs','dockerfile','makefile','cmake','vagrantfile', // Scripts
      'hs','scala','erl','ex','exs','clj','v','r','jl', // Niche
      'txt','rtf','log','svg','html','htm','css','js','mjs' // Standard
    ];

    // 1. Try to read text locally
    if (codeExts.includes(ext)) {
      try {
        const text = await uploadedFile.text();
        setContent(text);
        setLoading(false);
      } catch (e) {
        setContent(null); // Failed to read text
      }
    } else {
      // 2. If it's NOT a code file, we don't try to read it as text. 
      // This prevents the binary/hex dump from ever being generated.
      setContent(null);
    }

    // 3. Send to Backend (for complex docs) or just finish loading
    const needsBackend = ['xlsx','xls','csv','parquet','docx','pptx','epub','ipynb'].includes(ext);
    
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
    } else if (!codeExts.includes(ext)) {
      // If it's not code and not backend-capable (e.g. PDF, Images, Video), stop loading immediately
      setLoading(false);
    }

  }, []);

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden">
      <div className="w-full h-full p-6 flex flex-col">
        {/* Header */}
        <div {...getRootProps()} className="bg-white border-2 border-dashed border-blue-300 p-4 rounded-xl cursor-pointer hover:bg-blue-50 transition mb-4 flex items-center justify-center gap-3 shadow-sm">
          <input {...getInputProps()} />
          <FileUp className="text-blue-500 w-6 h-6" />
          <span className="font-semibold text-gray-700 text-lg">Click or Drag File Here to Open</span>
        </div>
        
        {/* Main Viewer */}
        <div className="flex-1 bg-white rounded-xl shadow-lg border overflow-hidden relative flex flex-col items-center justify-center">
          {!file ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <FileUp className="w-16 h-16 mb-4 opacity-20" />
              <p>No file loaded</p>
            </div>
          ) : loading ? (
            // Custom Loading Animation
            <div className="flex flex-col items-center justify-center h-full">
               <img src={bufferingLogo} alt="Loading..." className="w-40 h-40 animate-spin drop-shadow-xl" />
            </div>
          ) : (
             <UniversalViewer file={file} fileType={fileType} fileContent={content} backendData={backendData} />
          )}
        </div>
      </div>
    </div>
  );
}