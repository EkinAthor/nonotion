import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ImportResult } from '@nonotion/shared';
import { importApi } from '@/api/client';
import { usePageStore } from '@/stores/pageStore';

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type ImportState = 'idle' | 'importing' | 'success' | 'error';

export default function ImportDialog({ isOpen, onClose }: ImportDialogProps) {
  const navigate = useNavigate();
  const { fetchPages } = usePageStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<ImportState>('idle');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const handleClose = useCallback(() => {
    if (state === 'importing') return; // Don't close while importing
    setFile(null);
    setState('idle');
    setResult(null);
    setErrorMessage('');
    fetchPages();
    onClose();
  }, [state, onClose, fetchPages]);

  const handleFileSelect = useCallback((selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.zip')) {
      setErrorMessage('Please select a ZIP file');
      setState('error');
      return;
    }
    setFile(selectedFile);
    setState('idle');
    setErrorMessage('');
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  }, [handleFileSelect]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  }, [handleFileSelect]);

  const handleImport = useCallback(async () => {
    if (!file) return;
    setState('importing');
    setErrorMessage('');

    try {
      const importResult = await importApi.importZip(file);
      setResult(importResult);
      setState('success');
      await fetchPages();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Import failed');
      setState('error');
    }
  }, [file, fetchPages]);

  const handleViewPage = useCallback(() => {
    if (result?.rootPageIds[0]) {
      handleClose();
      navigate(`/page/${result.rootPageIds[0]}`);
    }
  }, [result, navigate, handleClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-notion-text">
            Import from Notion
          </h2>
          <button
            onClick={handleClose}
            disabled={state === 'importing'}
            className="p-1 rounded hover:bg-notion-hover text-notion-text-secondary disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {state === 'success' && result ? (
          /* Success state */
          <div>
            <div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
              <p className="text-sm font-medium text-green-800 mb-2">Import complete!</p>
              <ul className="text-sm text-green-700 space-y-1">
                <li>{result.pagesCreated} page{result.pagesCreated !== 1 ? 's' : ''} created</li>
                {result.databasesCreated > 0 && (
                  <li>{result.databasesCreated} database{result.databasesCreated !== 1 ? 's' : ''} created</li>
                )}
                <li>{result.blocksCreated} block{result.blocksCreated !== 1 ? 's' : ''} created</li>
                {result.imagesUploaded > 0 && (
                  <li>{result.imagesUploaded} image{result.imagesUploaded !== 1 ? 's' : ''} uploaded</li>
                )}
              </ul>
              {result.errors.length > 0 && (
                <div className="mt-3 pt-3 border-t border-green-200">
                  <p className="text-xs font-medium text-amber-700 mb-1">
                    {result.errors.length} warning{result.errors.length !== 1 ? 's' : ''}:
                  </p>
                  <ul className="text-xs text-amber-600 space-y-0.5 max-h-24 overflow-auto">
                    {result.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {result.rootPageIds.length > 0 && (
                <button
                  onClick={handleViewPage}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                >
                  View imported page
                </button>
              )}
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2 bg-notion-hover text-notion-text rounded-md hover:bg-gray-200 text-sm font-medium"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Upload state */
          <div>
            <p className="text-sm text-notion-text-secondary mb-4">
              Upload your Notion export (.zip) to import pages, databases, and images.
            </p>

            {/* Drop zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                border-2 border-dashed rounded-lg p-8 mb-4 text-center cursor-pointer transition-colors
                ${isDragging
                  ? 'border-blue-400 bg-blue-50'
                  : file
                    ? 'border-green-300 bg-green-50'
                    : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                }
                ${state === 'importing' ? 'pointer-events-none opacity-50' : ''}
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleInputChange}
                className="hidden"
              />
              {file ? (
                <div>
                  <svg className="w-8 h-8 mx-auto mb-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-medium text-notion-text">{file.name}</p>
                  <p className="text-xs text-notion-text-secondary mt-1">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
              ) : (
                <div>
                  <svg className="w-8 h-8 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-notion-text-secondary">
                    Drop your ZIP file here or click to browse
                  </p>
                </div>
              )}
            </div>

            {/* Error message */}
            {state === 'error' && errorMessage && (
              <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm text-red-700">{errorMessage}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleImport}
                disabled={!file || state === 'importing'}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {state === 'importing' ? (
                  <>
                    <svg className="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Importing...
                  </>
                ) : (
                  'Import'
                )}
              </button>
              <button
                onClick={handleClose}
                disabled={state === 'importing'}
                className="px-4 py-2 bg-notion-hover text-notion-text rounded-md hover:bg-gray-200 text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
