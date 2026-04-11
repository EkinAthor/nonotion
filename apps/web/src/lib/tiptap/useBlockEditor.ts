import { useCallback, useRef, useEffect, useState } from 'react';
import { useEditor, Editor } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { getRealtimeManager } from '@/lib/realtime';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { DOMSerializer } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import type { Block, BlockContent, BlockType } from '@nonotion/shared';
import { getBlockText } from '@nonotion/shared';
import { useBlockStore } from '@/stores/blockStore';
import type { PasteBlockData } from '@/contexts/BlockContext';
import { parseMarkdownLine, getBlockDefinition } from '@/components/blocks/registry';
import { stripOuterPTag } from './html-utils';
import { registerEditor, unregisterEditor } from '@/stores/editorRegistry';
import { inlineMarkdownToHtml } from '@/lib/html-markdown';

function parseLineForBlockType(line: string): PasteBlockData {
  const { type, text, checked } = parseMarkdownLine(line);
  const definition = getBlockDefinition(type);

  // Divider has empty content — don't spread text into it
  if (type === 'divider') {
    return { type: 'divider', content: definition?.defaultContent ?? ({} as BlockContent) };
  }

  // Convert any inline markdown in the text content to HTML
  const htmlText = inlineMarkdownToHtml(text);

  // Use the default content structure from the registry, but with our text
  if (definition) {
    const content = { ...definition.defaultContent, text: htmlText };
    // Handle checklist checked state from markdown
    if (type === 'checklist' && checked !== undefined) {
      (content as { text: string; checked: boolean }).checked = checked;
    }
    return { type, content };
  }

  // Fallback to paragraph
  return { type: 'paragraph', content: { text: htmlText } };
}

interface SlashMenuState {
  isOpen: boolean;
  query: string;
  position: { top: number; left: number };
}

interface UseBlockEditorOptions {
  block: Block;
  placeholder?: string;
  headingLevel?: 1 | 2 | 3;
  readOnly?: boolean;
  onCreateBlockBelow?: (textAfterCursor: string) => Promise<void>;
  onChangeBlockType?: (newType: BlockType, newText?: string, action?: string) => Promise<void>;
  onFocusPreviousBlock?: () => void;
  onFocusNextBlock?: () => void;
  onPasteMultipleBlocks?: (blocks: PasteBlockData[], textAfterCursor: string) => Promise<void>;
  onDeleteAndMergeToPrevious?: (currentText: string) => Promise<void>;
  onIndent?: () => Promise<void>;
  onOutdent?: () => Promise<void>;
  onPasteImage?: (file: File) => Promise<void>;
}

interface UseBlockEditorResult {
  editor: Editor | null;
  slashMenu: SlashMenuState;
  closeSlashMenu: () => void;
  selectSlashCommand: (type: BlockType, action?: string) => void;
}

export function useBlockEditor({
  block,
  placeholder,
  headingLevel,
  readOnly = false,
  onCreateBlockBelow,
  onChangeBlockType,
  onFocusPreviousBlock,
  onFocusNextBlock,
  onPasteMultipleBlocks,
  onDeleteAndMergeToPrevious,
  onIndent,
  onOutdent,
  onPasteImage,
}: UseBlockEditorOptions): UseBlockEditorResult {
  const { updateBlock } = useBlockStore();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [slashMenu, setSlashMenu] = useState<SlashMenuState>({
    isOpen: false,
    query: '',
    position: { top: 0, left: 0 },
  });
  const slashStartPosRef = useRef<number | null>(null);
  const slashMenuOpenRef = useRef(false);
  const blockRef = useRef(block);

  // Keep ref in sync with block prop
  useEffect(() => {
    blockRef.current = block;
  }, [block]);

  // Keep ref in sync with state for use in extension closure
  useEffect(() => {
    slashMenuOpenRef.current = slashMenu.isOpen;
  }, [slashMenu.isOpen]);

  const saveContent = useCallback(
    (text: string) => {
      // Skip saving if we're syncing external content
      if (isSyncingExternalContentRef.current) {
        return;
      }

      // Update last known content to match what we're about to save
      lastKnownContentRef.current = text;

      // Clear existing debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Debounce save by 500ms
      debounceRef.current = setTimeout(async () => {
        const currentBlock = blockRef.current;
        const content: BlockContent = headingLevel
          ? { ...currentBlock.content, text, level: headingLevel }
          : { ...currentBlock.content, text };

        pendingSavesRef.current.add(text);
        try {
          await updateBlock(currentBlock.id, { content });
        } finally {
          pendingSavesRef.current.delete(text);
        }
      }, 500);
    },
    [headingLevel, updateBlock]
  );

  // Flush pending save on unmount instead of discarding
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        // Flush: save immediately instead of discarding
        const currentBlock = blockRef.current;
        const currentEditor = editorRef.current;
        if (currentEditor && !currentEditor.isDestroyed) {
          const html = stripOuterPTag(currentEditor.getHTML());
          const content: BlockContent = headingLevel
            ? { ...currentBlock.content, text: html, level: headingLevel }
            : { ...currentBlock.content, text: html };
          // Fire-and-forget — component is unmounting
          updateBlock(currentBlock.id, { content });
        }
      }
    };
  }, [headingLevel, updateBlock]);

  const editorRef = useRef<Editor | null>(null);
  const pasteCallbackRef = useRef(onPasteMultipleBlocks);
  const changeBlockTypeRef = useRef(onChangeBlockType);
  const mergeCallbackRef = useRef(onDeleteAndMergeToPrevious);
  const indentCallbackRef = useRef(onIndent);
  const outdentCallbackRef = useRef(onOutdent);
  const pasteImageCallbackRef = useRef(onPasteImage);
  // Track the last content we know about to detect external changes
  const lastKnownContentRef = useRef(getBlockText(block.content));
  // Flag to skip saving during external content sync
  const isSyncingExternalContentRef = useRef(false);
  // Track pending saves to prevent false sync triggers from optimistic updates
  const pendingSavesRef = useRef<Set<string>>(new Set());
  // Refs for callbacks - handling things like preserving position of block indent
  const createCallbackRef = useRef(onCreateBlockBelow);
  const focusPrevCallbackRef = useRef(onFocusPreviousBlock);
  const focusNextCallbackRef = useRef(onFocusNextBlock);

  // Keep callback refs in sync
  useEffect(() => {
    pasteCallbackRef.current = onPasteMultipleBlocks;
  }, [onPasteMultipleBlocks]);

  useEffect(() => {
    changeBlockTypeRef.current = onChangeBlockType;
  }, [onChangeBlockType]);

  useEffect(() => {
    mergeCallbackRef.current = onDeleteAndMergeToPrevious;
  }, [onDeleteAndMergeToPrevious]);

  useEffect(() => {
    indentCallbackRef.current = onIndent;
  }, [onIndent]);

  useEffect(() => {
    outdentCallbackRef.current = onOutdent;
  }, [onOutdent]);

  useEffect(() => {
    pasteImageCallbackRef.current = onPasteImage;
  }, [onPasteImage]);

  useEffect(() => {
    createCallbackRef.current = onCreateBlockBelow;
  }, [onCreateBlockBelow]);

  useEffect(() => {
    focusPrevCallbackRef.current = onFocusPreviousBlock;
  }, [onFocusPreviousBlock]);

  useEffect(() => {
    focusNextCallbackRef.current = onFocusNextBlock;
  }, [onFocusNextBlock]);

  const closeSlashMenu = useCallback(() => {
    setSlashMenu({ isOpen: false, query: '', position: { top: 0, left: 0 } });
    slashStartPosRef.current = null;
  }, []);

  const selectSlashCommand = useCallback(
    async (type: BlockType, action?: string) => {
      const currentEditor = editorRef.current;
      if (currentEditor && slashStartPosRef.current !== null) {
        // Delete the slash and query text (slash is at position 1, delete from 1 to cursor)
        const from = slashStartPosRef.current;
        const to = currentEditor.state.selection.from;
        currentEditor.chain().focus().deleteRange({ from, to }).run();

        // Cancel any pending debounced save
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }
        // Clear the ref so the unmount-flush cleanup doesn't fire a stale save
        debounceRef.current = undefined;

        // Save cleaned content for text-based types only.
        // page_link content is set entirely by the action handler — saving
        // paragraph text here would race with it and overwrite linkedPageId.
        if (type !== 'page_link' && type !== 'database_view') {
          const cleanedText = stripOuterPTag(currentEditor.getHTML());
          const currentBlock = blockRef.current;
          const content: BlockContent = headingLevel
            ? { ...currentBlock.content, text: cleanedText, level: headingLevel }
            : { ...currentBlock.content, text: cleanedText };
          updateBlock(currentBlock.id, { content });
        }
      }
      closeSlashMenu();

      if (onChangeBlockType) {
        onChangeBlockType(type, undefined, action);
        // Focus is handled by BlockWrapper setting focusBlockId after type change
      }
    },
    [closeSlashMenu, onChangeBlockType, block.id, headingLevel, updateBlock]
  );

  // Create clipboard extension for paste handling
  const ClipboardExtension = Extension.create({
    name: 'clipboardHandler',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('clipboardHandler'),
          props: {
            handlePaste: (view, event) => {
              const clipboardData = event.clipboardData;
              if (!clipboardData) return false;

              // Check for image data in clipboard before text handling
              if (pasteImageCallbackRef.current) {
                const items = clipboardData.items;
                for (let i = 0; i < items.length; i++) {
                  if (items[i].type.startsWith('image/')) {
                    const file = items[i].getAsFile();
                    if (file) {
                      event.preventDefault();
                      pasteImageCallbackRef.current(file);
                      return true;
                    }
                  }
                }
              }

              // Check for HTML content first (from rich text copy)
              const htmlContent = clipboardData.getData('text/html');
              const text = clipboardData.getData('text/plain');

              if (!text && !htmlContent) return false;

              // If there's HTML content and it's a single-line paste, let TipTap handle it natively
              // This preserves formatting when copying between blocks
              if (htmlContent && text && !text.includes('\n')) {
                // Check if it contains formatting marks we care about
                if (/<(strong|em|u|code|a |span |mark)/.test(htmlContent)) {
                  return false; // Let TipTap handle rich paste natively
                }
              }

              if (!text) return false;

              // Normalize line endings
              const normalizedText = text.replace(/\r\n/g, '\n');
              const lines = normalizedText.split('\n');

              // Check if first line has markdown syntax
              const firstLineData = parseLineForBlockType(lines[0]);
              const firstLineHasMarkdown = firstLineData.type !== 'paragraph';

              // Single line paste
              if (lines.length === 1) {
                // If the line has markdown syntax and we're at the start of an empty block
                if (firstLineHasMarkdown) {
                  const currentText = view.state.doc.textContent;
                  const { from } = view.state.selection;

                  // If block is empty or cursor is at start, convert the block type
                  if (currentText === '' || from === 1) {
                    // Don't insert text into editor - pass it to changeBlockType instead
                    // The editor will be replaced when block type changes
                    if (changeBlockTypeRef.current) {
                      changeBlockTypeRef.current(firstLineData.type, getBlockText(firstLineData.content));
                    }

                    event.preventDefault();
                    return true;
                  }
                }

                // Check for inline markdown in single-line paste
                const inlineHtml = inlineMarkdownToHtml(lines[0]);
                if (inlineHtml !== lines[0]) {
                  // Contains inline markdown - insert as HTML
                  const currentEditor = editorRef.current;
                  if (currentEditor) {
                    currentEditor.commands.insertContent(inlineHtml);
                    event.preventDefault();
                    return true;
                  }
                }

                // Otherwise let TipTap handle single-line paste normally
                return false;
              }

              // Multi-line paste handling
              if (!pasteCallbackRef.current) return false;

              // Get text after cursor in current block
              const { from } = view.state.selection;
              const docEnd = view.state.doc.content.size - 1;
              const textAfterCursor = from < docEnd ? view.state.doc.textBetween(from, docEnd) : '';

              // Delete text after cursor (it will be moved to a new block)
              if (textAfterCursor) {
                const tr = view.state.tr.deleteRange(from, docEnd);
                view.dispatch(tr);
              }

              // Handle first line - if it has markdown and we're at start of empty block, change type
              const currentText = view.state.doc.textContent;
              if (firstLineHasMarkdown && (currentText === '' || from === 1)) {
                // Don't insert text into editor - pass it to changeBlockType instead
                // The editor will be replaced when block type changes
                if (changeBlockTypeRef.current) {
                  changeBlockTypeRef.current(firstLineData.type, getBlockText(firstLineData.content));
                }
              } else {
                // Insert first line as-is at cursor position
                const firstLine = lines[0];
                if (firstLine) {
                  const tr = view.state.tr.insertText(firstLine);
                  view.dispatch(tr);
                }
              }

              // Parse remaining lines into blocks
              const remainingLines = lines.slice(1);
              const blocksToCreate: PasteBlockData[] = remainingLines.map(parseLineForBlockType);

              // Create the remaining blocks (paste callback will handle textAfterCursor as final block)
              pasteCallbackRef.current(blocksToCreate, textAfterCursor);

              event.preventDefault();
              return true;
            },
            // Convert formatting marks to inline markdown when copying as plain text
            clipboardTextSerializer: (slice) => {
              let text = '';
              slice.content.forEach((node) => {
                if (node.isText && node.text) {
                  let chunk = node.text;
                  // Apply marks in markdown notation
                  for (const mark of node.marks) {
                    switch (mark.type.name) {
                      case 'bold':
                        chunk = `**${chunk}**`;
                        break;
                      case 'italic':
                        chunk = `*${chunk}*`;
                        break;
                      case 'code':
                        chunk = `\`${chunk}\``;
                        break;
                      case 'link':
                        chunk = `[${chunk}](${mark.attrs.href})`;
                        break;
                    }
                  }
                  text += chunk;
                } else if (node.isBlock) {
                  // Recurse into block nodes
                  node.content.forEach((child) => {
                    if (child.isText && child.text) {
                      let chunk = child.text;
                      for (const mark of child.marks) {
                        switch (mark.type.name) {
                          case 'bold':
                            chunk = `**${chunk}**`;
                            break;
                          case 'italic':
                            chunk = `*${chunk}*`;
                            break;
                          case 'code':
                            chunk = `\`${chunk}\``;
                            break;
                          case 'link':
                            chunk = `[${chunk}](${mark.attrs.href})`;
                            break;
                        }
                      }
                      text += chunk;
                    }
                  });
                }
              });
              return text;
            },
          },
        }),
      ];
    },
  });

  // Create keyboard extension
  const BlockKeyboardExtension = Extension.create({
    name: 'blockKeyboard',
    addKeyboardShortcuts() {
      return {
        Backspace: ({ editor }) => {
          const { from } = editor.state.selection;
          // Only handle if cursor is at the very start (position 1 in TipTap)
          if (from !== 1) return false;
          if (!mergeCallbackRef.current) return false;

          const text = stripOuterPTag(editor.getHTML());
          mergeCallbackRef.current(text);
          return true;
        },
        Enter: ({ editor }) => {
          // If slash menu is open, don't handle Enter (let menu handle it)
          if (slashMenuOpenRef.current) {
            return true;
          }

          if (!createCallbackRef.current) {
            return false;
          }

          // Get the HTML fragment after cursor
          const { from } = editor.state.selection;
          const docEnd = editor.state.doc.content.size - 1;

          let htmlAfter = '';
          if (from < docEnd) {
            // Extract the content after cursor as a slice
            const slice = editor.state.doc.slice(from, docEnd);
            // Serialize the fragment to HTML
            const serializer = DOMSerializer.fromSchema(editor.schema);
            const fragment = serializer.serializeFragment(slice.content);
            const temp = document.createElement('div');
            temp.appendChild(fragment);
            htmlAfter = temp.innerHTML;
          }

          // Delete text after cursor from current block
          if (from < docEnd) {
            editor.commands.deleteRange({ from, to: docEnd });
          }

          // Call callback to create new block with the HTML content
          createCallbackRef.current?.(htmlAfter);
          return true;
        },
        'Shift-Enter': () => {
          // Insert hard break (newline within block)
          return false; // Let default behavior handle it
        },
        Escape: () => {
          if (slashMenuOpenRef.current) {
            closeSlashMenu();
            return true;
          }
          return false;
        },
        ArrowUp: ({ editor }) => {
          // If slash menu is open, let it handle navigation
          if (slashMenuOpenRef.current) {
            return false;
          }

          if (!focusPrevCallbackRef.current) {
            return false;
          }

          // Check if cursor is on the first line
          const { from } = editor.state.selection;
          const text = editor.getText();
          const firstNewlineIndex = text.indexOf('\n');

          // If no newlines, or cursor is before first newline, we're on first line
          // Position 1 is start of text, so cursor position - 1 = text index
          const textIndex = from - 1;
          if (firstNewlineIndex === -1 || textIndex <= firstNewlineIndex) {
            focusPrevCallbackRef?.current();
            return true;
          }

          return false;
        },
        ArrowDown: ({ editor }) => {
          // If slash menu is open, let it handle navigation
          if (slashMenuOpenRef.current) {
            return false;
          }

          if (!focusNextCallbackRef.current) {
            return false;
          }

          // Check if cursor is on the last line
          const { from } = editor.state.selection;
          const text = editor.getText();
          const lastNewlineIndex = text.lastIndexOf('\n');

          // If no newlines, or cursor is after last newline, we're on last line
          // Position 1 is start of text, so cursor position - 1 = text index
          const textIndex = from - 1;
          if (lastNewlineIndex === -1 || textIndex > lastNewlineIndex) {
            focusNextCallbackRef?.current();
            return true;
          }

          return false;
        },
        // Shift+Arrow handlers for cross-block selection
        'Shift-ArrowUp': ({ editor }) => {
          const { from } = editor.state.selection;
          const text = editor.getText();
          const firstNewlineIndex = text.indexOf('\n');
          const textIndex = from - 1;

          if (firstNewlineIndex === -1 || textIndex <= firstNewlineIndex) {
            // At the top boundary - trigger block selection
            const { getAdjacentBlockId, startMultiSelection, updateMultiSelection } = useBlockStore.getState();
            const prevId = getAdjacentBlockId(block.id, 'prev');

            if (prevId) {
              editor.commands.blur();
              startMultiSelection(block.id);
              updateMultiSelection(prevId);
              return true;
            }
          }
          return false;
        },
        'Shift-ArrowDown': ({ editor }) => {
          const { from } = editor.state.selection;
          const text = editor.getText();
          const lastNewlineIndex = text.lastIndexOf('\n');
          const textIndex = from - 1;

          if (lastNewlineIndex === -1 || textIndex > lastNewlineIndex) {
            // At the bottom boundary - trigger block selection
            const { getAdjacentBlockId, startMultiSelection, updateMultiSelection } = useBlockStore.getState();
            const nextId = getAdjacentBlockId(block.id, 'next');

            if (nextId) {
              editor.commands.blur();
              startMultiSelection(block.id);
              updateMultiSelection(nextId);
              return true;
            }
          }
          return false;
        },
        Tab: () => {
          // Handle indent for list blocks
          if (indentCallbackRef.current) {
            indentCallbackRef.current();
            return true;
          }
          return false;
        },
        'Shift-Tab': () => {
          // Handle outdent for list blocks
          if (outdentCallbackRef.current) {
            outdentCallbackRef.current();
            return true;
          }
          return false;
        },
      };
    },
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable block-level features, keep inline formatting
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        dropcursor: false,
        gapcursor: false,
        // Keep code (inline) enabled - removed code: false
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
      Underline,
      Link.configure({
        openOnClick: true,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
      BlockKeyboardExtension,
      ClipboardExtension,
    ],
    content: getBlockText(block.content),
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      const html = stripOuterPTag(editor.getHTML());
      saveContent(html);

      // Check for divider auto-conversion (---, ***, ___)
      const text = editor.getText();
      if (/^(?:---|\*\*\*|___)$/.test(text)) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        changeBlockTypeRef.current?.('divider', '');
        return;
      }

      // Check for slash command using plain text
      const { from } = editor.state.selection;

      if (slashStartPosRef.current !== null) {
        // Slash menu is tracking - update query (text after the slash)
        // slashStartPosRef.current is position of "/" (1), so +1 gives position after "/"
        const queryStart = slashStartPosRef.current + 1;
        const query = from > queryStart ? editor.state.doc.textBetween(queryStart, from) : '';

        // Close on space or if backspaced past slash
        if (query.includes(' ') || from <= slashStartPosRef.current) {
          closeSlashMenu();
        } else {
          setSlashMenu((prev) => ({ ...prev, query }));
        }
      } else {
        // Check if we should open slash menu
        // Only at start of empty block when "/" is typed
        if (text === '/') {
          const coords = editor.view.coordsAtPos(from);
          // Position 1 is where the "/" character is in the document
          slashStartPosRef.current = 1;
          setSlashMenu({
            isOpen: true,
            query: '',
            position: { top: coords.bottom, left: coords.left },
          });
        }
      }
    },
    onFocus: () => {
      getRealtimeManager()?.updateActiveBlock(block.id);
    },
    onBlur: () => {
      getRealtimeManager()?.updateActiveBlock(null);
    },
    editorProps: {
      attributes: {
        class: 'outline-none',
      },
    },
  });

  // Keep ref in sync with editor
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Register/unregister editor in the global registry
  useEffect(() => {
    if (editor) {
      registerEditor(block.id, editor);
      return () => {
        unregisterEditor(block.id);
      };
    }
  }, [editor, block.id]);

  // Sync editor content when block content changes externally (e.g., from merge operation)
  const blockText = getBlockText(block.content);
  useEffect(() => {
    if (!editor) return;

    const editorHtml = stripOuterPTag(editor.getHTML());

    // Skip sync if blockText matches a pending save (self-echo from optimistic update)
    if (pendingSavesRef.current.has(blockText)) {
      lastKnownContentRef.current = blockText;
      return;
    }

    // If block content changed and it's different from what the editor has,
    // this is an external update - sync the editor
    if (blockText !== lastKnownContentRef.current && blockText !== editorHtml) {
      // Cancel any pending save since we're about to overwrite with external content
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Set flag to prevent onUpdate from saving during sync
      isSyncingExternalContentRef.current = true;

      // Update editor content
      editor.commands.setContent(blockText);

      // Clear the flag after a microtask to allow onUpdate to complete
      queueMicrotask(() => {
        isSyncingExternalContentRef.current = false;
      });
    }

    // Always keep track of the latest block content
    lastKnownContentRef.current = blockText;
  }, [editor, blockText]);

  return { editor, slashMenu, closeSlashMenu, selectSlashCommand };
}
