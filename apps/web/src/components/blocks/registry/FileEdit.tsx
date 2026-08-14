import { useState, useCallback, useRef, useEffect } from 'react';
import type { Block, FileContent } from '@nonotion/shared';
import { useBlockStore } from '@/stores/blockStore';
import { useAuthStore } from '@/stores/authStore';
import { filesApi } from '@/api/client';
import { claimPendingUpload } from '@/lib/pending-drop-uploads';

interface FileEditProps {
  block: Block;
  readOnly?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx > 0 ? filename.slice(idx + 1).toLowerCase() : '';
}

function iconFor(filename: string): string {
  switch (fileExtension(filename)) {
    case 'pdf': return '📄';
    case 'doc':
    case 'docx':
    case 'odt':
    case 'rtf':
    case 'md':
    case 'txt':
    case 'log': return '📝';
    case 'xls':
    case 'xlsx':
    case 'ods':
    case 'csv':
    case 'tsv': return '📊';
    case 'ppt':
    case 'pptx':
    case 'odp': return '📽️';
    case 'zip':
    case '7z':
    case 'gz':
    case 'tar':
    case 'rar': return '🗜️';
    case 'json':
    case 'yaml':
    case 'yml':
    case 'xml':
    case 'toml': return '🧾';
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
    case 'heic':
    case 'bmp':
    case 'tiff': return '🖼️';
    case 'mp3':
    case 'wav':
    case 'm4a':
    case 'ogg': return '🎵';
    case 'mp4':
    case 'mov':
    case 'webm': return '🎬';
    case 'epub': return '📚';
    default: return '📎';
  }
}

/** MIME types worth an "Open" (new tab) action — mirrors the server's safe-inline list. */
function canOpenInline(mimeType: string): boolean {
  return ['application/pdf', 'text/plain', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']
    .includes(mimeType.toLowerCase());
}

export default function FileEdit({ block, readOnly = false }: FileEditProps) {
  const content = block.content as FileContent;
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { updateBlock, deleteBlock } = useBlockStore();
  const authConfig = useAuthStore((s) => s.authConfig);

  const allowedExtensions = authConfig?.fileAllowedExtensions ?? [];
  const maxSizeMb = authConfig?.fileMaxSizeMb ?? 0;

  const handleFileUpload = useCallback(async (file: File) => {
    setError(null);

    const ext = fileExtension(file.name);
    if (allowedExtensions.length > 0 && !allowedExtensions.includes(ext)) {
      setError(`File type .${ext || '?'} is not allowed. Accepted: ${allowedExtensions.map((e) => '.' + e).join(', ')}`);
      return;
    }
    if (maxSizeMb > 0 && file.size > maxSizeMb * 1024 * 1024) {
      setError(`File too large: ${formatBytes(file.size)}. Maximum: ${maxSizeMb}MB`);
      return;
    }

    setIsUploading(true);
    try {
      const meta = await filesApi.uploadAttachment(file, block.pageId);
      await updateBlock(block.id, {
        content: {
          fileId: meta.id,
          filename: meta.filename,
          size: meta.size,
          mimeType: meta.mimeType,
        },
      });
      setUnavailable(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }, [block.id, block.pageId, allowedExtensions, maxSizeMb, updateBlock]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = '';
  }, [handleFileUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (readOnly || isUploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  }, [readOnly, isUploading, handleFileUpload]);

  // Canvas drag-and-drop handoff: a file dropped on the page canvas creates
  // this block and stashes the File under its id — claim it and upload.
  const handleFileUploadRef = useRef(handleFileUpload);
  handleFileUploadRef.current = handleFileUpload;
  useEffect(() => {
    if (content.fileId) return;
    return claimPendingUpload(block.id, (file) => handleFileUploadRef.current(file));
  }, [block.id, content.fileId]);

  const openFile = useCallback(async (disposition: 'attachment' | 'inline') => {
    setError(null);
    try {
      const { url } = await filesApi.getDownloadUrl(content.fileId, disposition);
      if (disposition === 'inline') {
        window.open(url, '_blank', 'noopener');
      } else {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = content.filename;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
    } catch {
      setUnavailable(true);
    }
  }, [content.fileId, content.filename]);

  const acceptAttr = allowedExtensions.map((e) => '.' + e).join(',');

  // Empty state — upload prompt
  if (!content.fileId) {
    return (
      <div
        data-file-dropzone
        className="border-2 border-dashed border-gray-300 rounded-md p-6 text-center hover:bg-gray-50 transition-colors"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {isUploading ? (
          <div className="flex items-center justify-center gap-2 text-notion-text-secondary">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Uploading...</span>
          </div>
        ) : (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptAttr || undefined}
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={readOnly}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              Upload file
            </button>
            <div className="text-xs text-notion-text-secondary mt-2">
              or drop a file here
              {allowedExtensions.length > 0 && ` · ${allowedExtensions.map((e) => '.' + e).join(', ')}`}
              {maxSizeMb > 0 && ` · max ${maxSizeMb}MB`}
            </div>
          </>
        )}
        {error && <div className="text-xs text-red-500 mt-2">{error}</div>}
      </div>
    );
  }

  // Filled state — file chip
  return (
    <div className="my-1">
      <div className="group flex items-center gap-3 px-3 py-2 border border-notion-border rounded-md hover:bg-notion-hover transition-colors">
        <span className="text-xl shrink-0" aria-hidden>{iconFor(content.filename)}</span>
        <button
          onClick={() => openFile(canOpenInline(content.mimeType) ? 'inline' : 'attachment')}
          className="flex-1 min-w-0 text-left"
          title={content.filename}
        >
          <div className="text-sm text-notion-text truncate">{content.filename}</div>
          <div className="text-xs text-notion-text-secondary">
            {unavailable ? 'File unavailable' : formatBytes(content.size)}
          </div>
        </button>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {canOpenInline(content.mimeType) && (
            <button
              onClick={() => openFile('inline')}
              className="p-1.5 text-notion-text-secondary hover:bg-gray-200 rounded"
              title="Open in new tab"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          )}
          <button
            onClick={() => openFile('attachment')}
            className="p-1.5 text-notion-text-secondary hover:bg-gray-200 rounded"
            title="Download"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          {!readOnly && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={acceptAttr || undefined}
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="p-1.5 text-notion-text-secondary hover:bg-gray-200 rounded disabled:opacity-50"
                title="Replace file"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={() => deleteBlock(block.id)}
                className="p-1.5 text-notion-text-secondary hover:bg-gray-200 hover:text-red-500 rounded"
                title="Remove file block"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
      {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
      {isUploading && <div className="text-xs text-notion-text-secondary mt-1">Uploading replacement…</div>}
    </div>
  );
}
