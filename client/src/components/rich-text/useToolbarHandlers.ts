import { useCallback } from 'react';
import { Editor } from '@tiptap/react';

export const useToolbarHandlers = (editor: Editor | null) => {
  const exec = useCallback(
    (editorAction: (ed: Editor) => void) => {
      if (!editor) {
        return;
      }
      try {
        editorAction(editor);
      } catch (err) {
        // swallow - editor may be detached
      }
    },
    [editor]
  );

  return {
    toggleBold: useCallback(() => exec(ed => ed.chain().focus().toggleBold().run()), [exec]),
    toggleItalic: useCallback(() => exec(ed => ed.chain().focus().toggleItalic().run()), [exec]),
    toggleUnderline: useCallback(() => exec(ed => ed.chain().focus().toggleUnderline().run()), [exec]),
    toggleStrike: useCallback(() => exec(ed => ed.chain().focus().toggleStrike().run()), [exec]),
    unsetColor: useCallback(
      () =>
        exec(ed => {
          const currentColor = ed.getAttributes('textStyle').color;
          if (currentColor) {
            ed.chain().focus().unsetColor().run();
          }
        }),
      [exec]
    ),
    setColor: useCallback((value: string) => exec(ed => ed.chain().focus().setColor(value).run()), [exec]),
    toggleBulletList: useCallback(() => exec(ed => ed.chain().focus().toggleBulletList().run()), [exec]),
    toggleOrderedList: useCallback(() => exec(ed => ed.chain().focus().toggleOrderedList().run()), [exec]),
    setTextAlign: useCallback(
      (align: 'left' | 'center' | 'right' | 'justify') => exec(ed => ed.chain().focus().setTextAlign(align).run()),
      [exec]
    ),
    toggleBlockquote: useCallback(() => exec(ed => ed.chain().focus().toggleBlockquote().run()), [exec]),
    toggleCodeBlock: useCallback(() => exec(ed => ed.chain().focus().toggleCodeBlock().run()), [exec]),
    setHorizontalRule: useCallback(() => exec(ed => ed.chain().focus().setHorizontalRule().run()), [exec]),
    undo: useCallback(() => exec(ed => ed.chain().focus().undo().run()), [exec]),
    redo: useCallback(() => exec(ed => ed.chain().focus().redo().run()), [exec]),
    clearFormatting: useCallback(() => exec(ed => ed.chain().focus().clearNodes().unsetAllMarks().run()), [exec]),
    canUndo: () => !!editor && editor.can().undo(),
    canRedo: () => !!editor && editor.can().redo(),
  };
};

export default useToolbarHandlers;
