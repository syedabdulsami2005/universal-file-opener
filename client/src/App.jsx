import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { FileUp, Loader2 } from 'lucide-react'; // We use Loader2 for the spinner
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
    setFile(uploadedFile);
    setBackendData(null);
    setContent(null); 
    setLoading(true); // Start Loading

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
            // --- NEW CODE-BASED LOADING SCREEN ---
            <div className="flex flex-col items-center justify-center h-full text-blue-600">
               <Loader2 className="w-16 h-16 animate-spin mb-4" />
               <h2 className="text-xl font-semibold">Converting File...</h2>
               <p className="text-gray-400 text-sm mt-2">Please wait a moment</p>
            </div>
          ) : (
             <UniversalViewer file={file} fileType={fileType} fileContent={content} backendData={backendData} />
          )}
        </div>
      </div>
    </div>
  );
}