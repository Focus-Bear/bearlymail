/**
 * Regression tests for "BearlyMail keeps reverting my typing" (Safari + iOS).
 *
 * The reply composer debounces its draft state, so the controlled `content` prop
 * reaches the real TipTap editor several keystrokes behind what the user typed.
 * These drive the actual editor and assert that such stale values never
 * overwrite newer text or move the caret, while genuinely external content
 * (a restored draft) still lands.
 */
import React from 'react';
import { act, render } from '@testing-library/react';
import { Editor } from '@tiptap/core';

import { RichTextEditor } from 'components/rich-text/RichTextEditor';

type EditorElement = HTMLElement & { editor?: Editor };

function getEditor(container: HTMLElement): Editor {
  const element = container.querySelector<EditorElement>('.ProseMirror');
  if (!element?.editor) {
    throw new Error('TipTap editor did not mount');
  }
  return element.editor;
}

function typeText(editor: Editor, text: string) {
  act(() => {
    editor.commands.insertContent(text);
  });
}

function renderEditor(content: string) {
  const onChange = vi.fn();
  const utils = render(<RichTextEditor content={content} onChange={onChange} />);
  const rerenderWithContent = (nextContent: string) =>
    utils.rerender(<RichTextEditor content={nextContent} onChange={onChange} />);
  return { ...utils, onChange, editor: getEditor(utils.container), rerenderWithContent };
}

describe('RichTextEditor — controlled content sync', () => {
  it('keeps text typed after the debounced draft value when that stale value arrives', () => {
    const { editor, onChange, rerenderWithContent } = renderEditor('');

    typeText(editor, 'Got it');
    const debouncedDraft = onChange.mock.lastCall?.[0] as string;
    typeText(editor, '. What time');
    const caretBeforeEcho = editor.state.selection.from;

    rerenderWithContent(debouncedDraft);

    expect(editor.getHTML()).toBe('<p>Got it. What time</p>');
    expect(editor.state.selection.from).toBe(caretBeforeEcho);
  });

  it('keeps the caret where the user is editing when an older echo arrives', () => {
    const { editor, onChange, rerenderWithContent } = renderEditor('<p>Hi Ryan</p>');

    act(() => {
      editor.commands.setTextSelection(3);
    });
    typeText(editor, 'X');
    const firstEcho = onChange.mock.lastCall?.[0] as string;
    typeText(editor, 'Y');
    const caretBeforeEcho = editor.state.selection.from;

    rerenderWithContent(firstEcho);

    expect(editor.getHTML()).toBe('<p>HiXY Ryan</p>');
    expect(editor.state.selection.from).toBe(caretBeforeEcho);
  });

  it('does not re-apply the unchanged prop when a composition ends', async () => {
    const { editor } = renderEditor('<p>Hi</p>');
    act(() => {
      editor.commands.focus('end');
    });
    typeText(editor, ' there');

    await act(async () => {
      editor.view.dom.dispatchEvent(new CompositionEvent('compositionend'));
      await Promise.resolve();
    });

    expect(editor.getHTML()).toBe('<p>Hi there</p>');
  });

  it('still writes genuinely external content (a restored draft) into the editor', () => {
    const { editor, rerenderWithContent } = renderEditor('');

    rerenderWithContent('<p>Restored draft</p>');

    expect(editor.getHTML()).toBe('<p>Restored draft</p>');
  });
});
