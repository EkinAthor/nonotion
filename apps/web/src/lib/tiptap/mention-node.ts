import { Node } from '@tiptap/core';
import { useUiStore } from '@/stores/uiStore';
import { pageHref, isNewTabClick } from '@/lib/page-links';

export type MentionType = 'page' | 'user';

export interface MentionAttrs {
  mentionType: MentionType;
  mentionId: string;
  label: string;
}

/**
 * Inline @-mention atom node. Persisted HTML shape (the label is the text
 * child, keeping mentions searchable by the server's tag-stripping search):
 *
 *   <span data-mention-type="page" data-mention-id="pg_x">Page Title</span>
 *   <span data-mention-type="user" data-mention-id="usr_x">User Name</span>
 *
 * Byte-stability invariant: renderHTML is the ONLY writer of the persisted
 * shape — fixed attribute order, no classes, no extra attributes. The
 * pending-save echo check and undo text_edit equality both compare exact HTML
 * strings, so getHTML → setContent → getHTML must round-trip byte-identical.
 * All styling and display-only affordances (icons, @ prefix) live in the
 * NodeView, never in the stored HTML.
 */
export const MentionNode = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      mentionType: { default: 'page' },
      mentionId: { default: '' },
      label: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-mention-type][data-mention-id]',
        getAttrs: (el) => {
          const element = el as HTMLElement;
          const mentionType = element.getAttribute('data-mention-type');
          if (mentionType !== 'page' && mentionType !== 'user') return false;
          return {
            mentionType,
            mentionId: element.getAttribute('data-mention-id') ?? '',
            label: element.textContent ?? '',
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    return [
      'span',
      {
        'data-mention-type': node.attrs.mentionType,
        'data-mention-id': node.attrs.mentionId,
      },
      node.attrs.label,
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const { mentionType, mentionId, label } = node.attrs as MentionAttrs;

      // Page mentions render as real anchors in the live editor so the browser's
      // "Open in new tab" / middle-click work. Persisted HTML is untouched:
      // renderHTML/parseHTML keep the byte-stable <span> shape.
      const isPageLink = mentionType === 'page' && !!mentionId;
      const dom: HTMLElement = document.createElement(isPageLink ? 'a' : 'span');
      if (isPageLink) {
        dom.setAttribute('href', pageHref(mentionId));
        (dom as HTMLAnchorElement).draggable = false;
      }
      dom.setAttribute('data-mention-type', mentionType);
      dom.setAttribute('data-mention-id', mentionId);
      dom.setAttribute('contenteditable', 'false');

      if (mentionType === 'user') {
        dom.className =
          'mention cursor-pointer rounded px-0.5 font-medium text-notion-text-secondary hover:bg-notion-hover';
        dom.textContent = `@${label}`;
        dom.title = label;
      } else {
        dom.className =
          'mention cursor-pointer rounded px-0.5 text-notion-text underline decoration-notion-border underline-offset-2 hover:bg-notion-hover';
        const icon = document.createElement('span');
        icon.className = 'mr-0.5 select-none';
        icon.textContent = '📄';
        dom.appendChild(icon);
        dom.appendChild(document.createTextNode(label));
        dom.title = label;
      }

      // Prevent ProseMirror caret placement / selection churn on press.
      // Primary button only — preventing middle-click mousedown would break
      // the native open-in-new-tab chain on the anchor.
      dom.addEventListener('mousedown', (e) => {
        if (e.button === 0) e.preventDefault();
      });

      dom.addEventListener('click', (e) => {
        // Modified/middle clicks fall through to the browser (new tab via href).
        if (isPageLink && isNewTabClick(e)) return;
        e.preventDefault();
        e.stopPropagation();
        if (!mentionId) return;
        if (mentionType === 'page') {
          useUiStore.getState().openPeekPanel(mentionId);
        } else {
          const rect = dom.getBoundingClientRect();
          useUiStore.getState().openUserMentionPopover(mentionId, {
            top: rect.top,
            left: rect.left,
            bottom: rect.bottom,
            right: rect.right,
          });
        }
      });

      return { dom };
    };
  },
});
