import { useState, useCallback, useRef, useEffect } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-sql';
import type { Block, CodeBlockContent } from '@nonotion/shared';
import { useBlockStore } from '@/stores/blockStore';
import { useBlockContext } from '@/contexts/BlockContext';

interface CodeBlockEditProps {
  block: Block;
  readOnly?: boolean;
}

const LANGUAGES = [
  { value: '', label: 'Plain text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'css', label: 'CSS' },
  { value: 'html', label: 'HTML' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Bash' },
  { value: 'sql', label: 'SQL' },
];

export default function CodeBlockEdit({ block, readOnly = false }: CodeBlockEditProps) {
  const content = block.content as CodeBlockContent;
  const [isEditing, setIsEditing] = useState(false);
  const [code, setCode] = useState(content.code || '');
  const [language, setLanguage] = useState(content.language || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { updateBlock, focusBlockId, focusPosition, setFocusBlock } = useBlockStore();
  const { focusNextBlock, focusPreviousBlock } = useBlockContext();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync local state when block content changes externally
  useEffect(() => {
    setCode(content.code || '');
    setLanguage(content.language || '');
  }, [content.code, content.language]);

  // Handle focus
  useEffect(() => {
    if (focusBlockId === block.id) {
      setIsEditing(true);
      setFocusBlock(null);
    }
  }, [focusBlockId, block.id, setFocusBlock]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      if (focusPosition === 'start') {
        textareaRef.current.setSelectionRange(0, 0);
      } else {
        textareaRef.current.setSelectionRange(code.length, code.length);
      }
    }
  }, [isEditing, code.length, focusPosition]);

  const saveContent = useCallback(
    (newCode: string, newLanguage: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(async () => {
        await updateBlock(block.id, {
          content: { code: newCode, language: newLanguage || undefined },
        });
      }, 500);
    },
    [block.id, updateBlock]
  );

  const handleCodeChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newCode = e.target.value;
      setCode(newCode);
      saveContent(newCode, language);
    },
    [language, saveContent]
  );

  const handleLanguageChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newLanguage = e.target.value;
      setLanguage(newLanguage);
      saveContent(code, newLanguage);
    },
    [code, saveContent]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const textarea = textareaRef.current;
        if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const newCode = code.substring(0, start) + '  ' + code.substring(end);
          setCode(newCode);
          saveContent(newCode, language);
          // Set cursor position after tab
          setTimeout(() => {
            textarea.setSelectionRange(start + 2, start + 2);
          }, 0);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsEditing(false);
      } else if (e.key === 'ArrowUp' && textareaRef.current) {
        const textarea = textareaRef.current;
        const cursorPos = textarea.selectionStart;
        // If cursor is on the first line (no newline before cursor position)
        const textBeforeCursor = code.substring(0, cursorPos);
        if (!textBeforeCursor.includes('\n')) {
          e.preventDefault();
          setIsEditing(false);
          focusPreviousBlock();
        }
      } else if (e.key === 'ArrowDown' && textareaRef.current) {
        const textarea = textareaRef.current;
        const cursorPos = textarea.selectionStart;
        // If cursor is on the last line (no newline after cursor position)
        const textAfterCursor = code.substring(cursorPos);
        if (!textAfterCursor.includes('\n')) {
          e.preventDefault();
          setIsEditing(false);
          focusNextBlock();
        }
      }
    },
    [code, language, saveContent, focusPreviousBlock, focusNextBlock]
  );

  // Get highlighted HTML
  const getHighlightedCode = useCallback(() => {
    if (!code) return '';
    if (!language || !Prism.languages[language]) {
      return Prism.util.encode(code) as string;
    }
    return Prism.highlight(code, Prism.languages[language], language);
  }, [code, language]);

  return (
    <div className="bg-gray-100 rounded-md overflow-hidden my-1">
      {/* Language selector header */}
      <div className="flex justify-between items-center px-3 py-1.5 bg-gray-200/50">
        <select
          value={language}
          onChange={handleLanguageChange}
          disabled={readOnly}
          className="text-xs bg-transparent text-notion-text-secondary hover:text-notion-text cursor-pointer focus:outline-none"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      {/* Code area */}
      {isEditing && !readOnly ? (
        <textarea
          ref={textareaRef}
          value={code}
          onChange={handleCodeChange}
          onKeyDown={handleKeyDown}
          onBlur={() => setIsEditing(false)}
          className="w-full p-4 bg-transparent font-mono text-sm text-notion-text resize-none focus:outline-none"
          style={{
            minHeight: '100px',
            lineHeight: '1.5',
          }}
          placeholder="Write your code here..."
          spellCheck={false}
        />
      ) : (
        <pre
          className="p-4 font-mono text-sm overflow-x-auto cursor-text"
          style={{ minHeight: '100px', lineHeight: '1.5' }}
          onClick={() => !readOnly && setIsEditing(true)}
        >
          <code
            className={language ? `language-${language}` : ''}
            dangerouslySetInnerHTML={{ __html: getHighlightedCode() || '<span class="text-notion-text-secondary">Click to add code...</span>' }}
          />
        </pre>
      )}
    </div>
  );
}
