import { useState, useCallback, useRef, useEffect } from 'react';
import type { Block, ImageContent } from '@nonotion/shared';
import { useBlockStore } from '@/stores/blockStore';
import { useBlockContext } from '@/contexts/BlockContext';
import { filesApi } from '@/api/client';

interface ImageEditProps {
  block: Block;
  readOnly?: boolean;
}

export default function ImageEdit({ block, readOnly = false }: ImageEditProps) {
  const content = block.content as ImageContent;
  const [url, setUrl] = useState(content.url || '');
  const [alt, setAlt] = useState(content.alt || '');
  const [caption, setCaption] = useState(content.caption || '');
  const [showEditPopover, setShowEditPopover] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const { updateBlock, focusBlockId, setFocusBlock } = useBlockStore();
  const { focusPreviousBlock, focusNextBlock } = useBlockContext();

  // Sync local state when block content changes externally
  useEffect(() => {
    setUrl(content.url || '');
    setAlt(content.alt || '');
    setCaption(content.caption || '');
  }, [content.url, content.alt, content.caption]);

  // Resolve display URL: internal files need auth-fetched blob URLs
  useEffect(() => {
    if (!url) {
      setDisplayUrl(null);
      return;
    }

    if (url.startsWith('/api/files/')) {
      let cancelled = false;
      filesApi.getImageBlobUrl(url).then((blobUrl) => {
        if (!cancelled) {
          // Revoke previous blob URL
          if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
          }
          blobUrlRef.current = blobUrl;
          setDisplayUrl(blobUrl);
        }
      }).catch(() => {
        if (!cancelled) {
          setDisplayUrl(null);
        }
      });
      return () => { cancelled = true; };
    } else {
      setDisplayUrl(url);
    }
  }, [url]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  // Handle focus
  useEffect(() => {
    if (focusBlockId === block.id) {
      if (!url) {
        inputRef.current?.focus();
      }
      setFocusBlock(null);
    }
  }, [focusBlockId, block.id, url, setFocusBlock]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowEditPopover(false);
      }
    };
    if (showEditPopover) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showEditPopover]);

  const handleFileUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    try {
      const result = await filesApi.upload(file);
      setUrl(result.url);
      await updateBlock(block.id, {
        content: { url: result.url, alt: file.name, caption },
      });
      setAlt(file.name);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  }, [block.id, caption, updateBlock]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    // Reset so the same file can be re-selected
    e.target.value = '';
  }, [handleFileUpload]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleFileUpload(file);
          return;
        }
      }
    }
  }, [handleFileUpload]);

  const handleUrlSubmit = useCallback(async () => {
    if (urlInput.trim()) {
      const newUrl = urlInput.trim();
      setUrl(newUrl);
      setUrlInput('');
      await updateBlock(block.id, {
        content: { url: newUrl, alt, caption },
      });
    }
  }, [block.id, urlInput, alt, caption, updateBlock]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleUrlSubmit();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusPreviousBlock();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusNextBlock();
      }
    },
    [handleUrlSubmit, focusPreviousBlock, focusNextBlock]
  );

  const handleSaveEdit = useCallback(async () => {
    await updateBlock(block.id, {
      content: { url, alt, caption },
    });
    setShowEditPopover(false);
  }, [block.id, url, alt, caption, updateBlock]);

  const handleRemoveImage = useCallback(async () => {
    setUrl('');
    setAlt('');
    setCaption('');
    await updateBlock(block.id, {
      content: { url: '', alt: '', caption: '' },
    });
    setShowEditPopover(false);
  }, [block.id, updateBlock]);

  // Empty state - upload + URL input
  if (!url) {
    return (
      <div
        className="border-2 border-dashed border-gray-300 rounded-md p-8 text-center hover:bg-gray-50 transition-colors"
        onPaste={handlePaste}
      >
        <div className="text-gray-400 mb-3">
          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>

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
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={readOnly}
              className="mb-3 px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              Upload image
            </button>
            <div className="text-xs text-notion-text-secondary mb-2">or paste an image from clipboard</div>
            <input
              ref={inputRef}
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Paste image URL and press Enter"
              disabled={readOnly}
              className="w-full max-w-md text-center bg-transparent border-none focus:outline-none text-notion-text placeholder:text-notion-text-secondary"
            />
          </>
        )}
      </div>
    );
  }

  // Image display
  return (
    <figure className="my-2 relative group">
      <img
        src={displayUrl || ''}
        alt={alt || 'Image'}
        className="max-w-full rounded cursor-pointer"
        onClick={() => !readOnly && setShowEditPopover(true)}
        onError={(e) => {
          (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect fill="%23f3f4f6" width="200" height="100"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%239ca3af">Invalid image URL</text></svg>';
        }}
      />

      {/* Edit button overlay */}
      {!readOnly && (
        <button
          onClick={() => setShowEditPopover(true)}
          className="absolute top-2 right-2 p-1.5 bg-white/90 hover:bg-white rounded shadow opacity-0 group-hover:opacity-100 transition-opacity"
          title="Edit image"
        >
          <svg className="w-4 h-4 text-notion-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      )}

      {/* Edit popover */}
      {showEditPopover && (
        <div
          ref={popoverRef}
          className="absolute top-0 left-0 right-0 bg-white rounded-lg shadow-lg border border-notion-border p-4 z-10"
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-notion-text-secondary mb-1">Image URL</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-notion-border rounded focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-notion-text-secondary mb-1">Alt text</label>
              <input
                type="text"
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                placeholder="Describe this image"
                className="w-full px-2 py-1.5 text-sm border border-notion-border rounded focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-notion-text-secondary mb-1">Caption</label>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add a caption"
                className="w-full px-2 py-1.5 text-sm border border-notion-border rounded focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex justify-between pt-2">
              <button
                onClick={handleRemoveImage}
                className="text-sm text-red-500 hover:text-red-600"
              >
                Remove
              </button>
              <div className="space-x-2">
                <button
                  onClick={() => setShowEditPopover(false)}
                  className="px-3 py-1 text-sm text-notion-text-secondary hover:bg-notion-hover rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Caption */}
      {caption && (
        <figcaption className="text-sm text-center text-notion-text-secondary mt-2">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
