import DOMPurify from 'dompurify';

import {
  NODE_NAME_SVG,
  NODE_NAME_USE,
} from 'constants/strings';

let hookInstalled = false;

/**
 * Defense-in-depth: strip href / xlink:href from SVG-related elements after
 * DOMPurify sanitizes attributes. The per-call config (FORBID_TAGS: ['use'],
 * FORBID_ATTR: ['xlink:href']) already blocks these vectors, but this hook
 * ensures that any future config relaxation (e.g. allowing safe SVGs) cannot
 * accidentally re-open external-resource exfiltration.
 *
 * Idempotent — safe to call from multiple modules.
 */
export function installSvgHrefStripHook(): void {
  if (hookInstalled) {
    return;
  }
  DOMPurify.addHook('afterSanitizeAttributes', node => {
    const name = node.nodeName.toUpperCase();
    if (name === NODE_NAME_SVG || name === NODE_NAME_USE) {
      (node as Element).removeAttribute('href');
      (node as Element).removeAttribute('xlink:href');
    }
  });
  hookInstalled = true;
}

installSvgHrefStripHook();
