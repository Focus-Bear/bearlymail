import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';

interface UseLinkInputStateArgs {
  editor: Editor | null;
  linkDialogOpen?: boolean;
  onLinkDialogChange?: (open: boolean) => void;
}

export function useLinkInputState({ editor, linkDialogOpen, onLinkDialogChange }: UseLinkInputStateArgs) {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const linkInputRef = useRef<HTMLInputElement | null>(null);

  // Ref pattern to avoid stale closure: always call the latest version of the callback
  // without needing to include it in the effect's dependency array.
  const onLinkDialogChangeRef = useRef(onLinkDialogChange);
  useEffect(() => {
    onLinkDialogChangeRef.current = onLinkDialogChange;
  });

  useEffect(() => {
    if (linkDialogOpen && !showLinkInput) {
      if (!editor) {
        return;
      }
      // Guard against destroyed editor (e.g. component unmounted mid-click)
      if (editor.isDestroyed) {
        onLinkDialogChangeRef.current?.(false);
        return;
      }
      if (editor.isActive('link')) {
        editor.chain().focus().unsetLink().run();
      } else {
        const previousUrl = editor.getAttributes('link').href || '';
        setLinkUrl(previousUrl);
        setShowLinkInput(true);
      }
      onLinkDialogChangeRef.current?.(false);
    }
  }, [linkDialogOpen, showLinkInput, editor]);

  useEffect(() => {
    if (showLinkInput && linkInputRef.current) {
      linkInputRef.current.focus();
    }
  }, [showLinkInput]);

  const handleLinkSubmit = useCallback(() => {
    if (!editor || !linkUrl) {
      return;
    }
    // Guard against destroyed editor in case component unmounts during async flow
    if (editor.isDestroyed) {
      setLinkUrl('');
      setShowLinkInput(false);
      return;
    }
    let url = linkUrl.trim();
    if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    setLinkUrl('');
    setShowLinkInput(false);
  }, [editor, linkUrl]);

  const handleToggleLink = useCallback(() => {
    if (!editor) {
      return;
    }
    // Guard: do not call Tiptap methods on a destroyed editor — this was the
    // root cause of the crash when clicking the link icon after the editor
    // component was torn down (e.g. navigating away or switching email).
    if (editor.isDestroyed) {
      return;
    }
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const previousUrl = editor.getAttributes('link').href || '';
    setLinkUrl(previousUrl);
    setShowLinkInput(true);
  }, [editor]);

  return {
    showLinkInput,
    setShowLinkInput,
    linkUrl,
    setLinkUrl,
    linkInputRef,
    handleLinkSubmit,
    handleToggleLink,
  } as const;
}
