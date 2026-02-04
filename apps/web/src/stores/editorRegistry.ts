import type { Editor } from '@tiptap/react';

const editorMap = new Map<string, Editor>();

export function registerEditor(blockId: string, editor: Editor): void {
  editorMap.set(blockId, editor);
}

export function unregisterEditor(blockId: string): void {
  editorMap.delete(blockId);
}

export function getEditor(blockId: string): Editor | undefined {
  return editorMap.get(blockId);
}

export function getEditors(): Map<string, Editor> {
  return editorMap;
}
