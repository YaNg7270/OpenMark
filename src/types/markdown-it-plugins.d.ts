/**
 * Ambient declarations for markdown-it plugins that ship JavaScript only.
 *
 * Each of these is a plain plugin factory: `(md, options?) => void`. They are typed
 * narrowly here rather than as `any` so a wrong option name is still a compile error
 * at the call site.
 */
declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it';
  interface FootnoteOptions {
    /** Prefix used for footnote back-reference ids. */
    docId?: string;
    /** Text of the "back to reference" link. */
    backrefText?: string;
    /** Addition to the `<a>` anchor text for the footnote's back-reference. */
    label?: string;
  }
  const plugin: (md: MarkdownIt, options?: FootnoteOptions) => void;
  export default plugin;
}

declare module 'markdown-it-deflist' {
  import type MarkdownIt from 'markdown-it';
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}

declare module 'markdown-it-sub' {
  import type MarkdownIt from 'markdown-it';
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}

declare module 'markdown-it-sup' {
  import type MarkdownIt from 'markdown-it';
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}

declare module 'markdown-it-mark' {
  import type MarkdownIt from 'markdown-it';
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}

declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it';
  interface TaskListOptions {
    /** When false, checkboxes render with the `disabled` attribute (reading mode). */
    enabled?: boolean;
    /** Wrap the item's contents in a `<label>`. */
    label?: boolean;
    /** Place the label after the checkbox instead of before. */
    labelAfter?: boolean;
  }
  const plugin: (md: MarkdownIt, options?: TaskListOptions) => void;
  export default plugin;
}
