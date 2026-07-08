import { forwardRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import Highlight from '@tiptap/extension-highlight';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import {
  Bold, Italic, UnderlineIcon, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Heading2, Heading3,
  Table as TableIcon, Rows3, Columns3, Trash2, Palette, Highlighter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';

interface Props {
  content: string;
  onChange?: (html: string) => void;
  editable?: boolean;
}

const ToolbarBtn = ({
  onClick, active, title, children,
}: {
  onClick: () => void; active?: boolean; title: string; children: React.ReactNode;
}) => (
  <button
    type="button"
    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    title={title}
    className={cn(
      'h-7 w-7 flex items-center justify-center rounded-md text-sm transition-colors',
      active
        ? 'bg-indigo-100 text-indigo-700'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    )}
  >
    {children}
  </button>
);

// Radix's `PopoverTrigger asChild` clones its child and merges a native `onClick` + `ref`
// onto it, so the trigger must forward both instead of intercepting `onClick` as a custom prop.
const PopoverToolbarTrigger = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
>(({ active, className, children, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    onMouseDown={(e) => e.preventDefault()}
    className={cn(
      'h-7 w-7 flex items-center justify-center rounded-md text-sm transition-colors',
      active
        ? 'bg-indigo-100 text-indigo-700'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      className,
    )}
    {...props}
  >
    {children}
  </button>
));
PopoverToolbarTrigger.displayName = 'PopoverToolbarTrigger';

const MenuItem = ({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) => (
  <button
    type="button"
    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    className={cn(
      'w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
      danger ? 'text-red-600 hover:bg-red-50' : 'text-foreground hover:bg-muted',
    )}
  >
    {children}
  </button>
);

const TEXT_COLORS = [
  { label: 'Default', value: null },
  { label: 'Red', value: '#EF4444' },
  { label: 'Orange', value: '#F97316' },
  { label: 'Amber', value: '#F59E0B' },
  { label: 'Green', value: '#10B981' },
  { label: 'Cyan', value: '#06B6D4' },
  { label: 'Blue', value: '#3B82F6' },
  { label: 'Indigo', value: '#6366F1' },
  { label: 'Violet', value: '#8B5CF6' },
  { label: 'Pink', value: '#EC4899' },
];

const HIGHLIGHT_COLORS = [
  { label: 'Yellow', value: '#FEF08A' },
  { label: 'Green', value: '#BBF7D0' },
  { label: 'Blue', value: '#BFDBFE' },
  { label: 'Pink', value: '#FBCFE8' },
  { label: 'Purple', value: '#E9D5FF' },
  { label: 'Orange', value: '#FED7AA' },
];

const FONT_FAMILIES = [
  { label: 'Default', value: 'default' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: "'Times New Roman', serif" },
  { label: 'Courier New', value: "'Courier New', monospace" },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
];

export function SopEditor({ content, onChange, editable = true }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Write the SOP content here…' }),
      TextStyle,
      Color,
      FontFamily,
      Highlight.configure({ multicolor: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content,
    editable,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  });

  // Keep the editor in sync when `content` changes from outside (e.g. after AI beautify
  // replaces it) — TipTap only consumes the `content` prop once, on initial mount.
  useEffect(() => {
    if (!editor) return;
    if (content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  if (!editor) return null;

  const inTable = editor.isActive('table');
  const activeFont = FONT_FAMILIES.find((f) => f.value !== 'default' && editor.isActive('textStyle', { fontFamily: f.value }))?.value ?? 'default';

  return (
    <div className={cn('rounded-xl border border-border/60 overflow-hidden', editable && 'focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-300')}>
      {editable && (
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border/60 bg-muted/30">
          <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
            <Bold className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
            <Italic className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
            <UnderlineIcon className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <div className="w-px h-4 bg-border/60 mx-0.5" />

          <Select
            value={activeFont}
            onValueChange={(value) => {
              if (value === 'default') editor.chain().focus().unsetFontFamily().run();
              else editor.chain().focus().setFontFamily(value).run();
            }}
          >
            <SelectTrigger className="h-7 w-[132px] px-2 text-xs border-none bg-transparent hover:bg-muted focus:ring-1 focus:ring-indigo-500/30">
              <SelectValue placeholder="Font" />
            </SelectTrigger>
            <SelectContent>
              {FONT_FAMILIES.map((f) => (
                <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value === 'default' ? undefined : f.value }}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <PopoverToolbarTrigger active={!!editor.getAttributes('textStyle').color} title="Text color">
                <Palette className="h-3.5 w-3.5" />
              </PopoverToolbarTrigger>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start">
              <div className="grid grid-cols-5 gap-1.5">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    title={c.label}
                    onClick={() => {
                      if (c.value) editor.chain().focus().setColor(c.value).run();
                      else editor.chain().focus().unsetColor().run();
                    }}
                    className="h-6 w-6 rounded-full border border-border/60 flex items-center justify-center"
                    style={{ backgroundColor: c.value ?? 'transparent' }}
                  >
                    {!c.value && <span className="text-[9px] text-muted-foreground">A</span>}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <PopoverToolbarTrigger active={editor.isActive('highlight')} title="Highlight">
                <Highlighter className="h-3.5 w-3.5" />
              </PopoverToolbarTrigger>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start">
              <div className="grid grid-cols-6 gap-1.5">
                <button
                  type="button"
                  title="Remove highlight"
                  onClick={() => editor.chain().focus().unsetHighlight().run()}
                  className="h-6 w-6 rounded-full border border-border/60 flex items-center justify-center text-[9px] text-muted-foreground"
                >
                  ×
                </button>
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    title={c.label}
                    onClick={() => editor.chain().focus().toggleHighlight({ color: c.value }).run()}
                    className="h-6 w-6 rounded-full border border-border/60"
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <div className="w-px h-4 bg-border/60 mx-0.5" />

          <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
            <Heading2 className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">
            <Heading3 className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <div className="w-px h-4 bg-border/60 mx-0.5" />
          <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
            <List className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <div className="w-px h-4 bg-border/60 mx-0.5" />
          <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align left">
            <AlignLeft className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align center">
            <AlignCenter className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align right">
            <AlignRight className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <div className="w-px h-4 bg-border/60 mx-0.5" />

          <Popover>
            <PopoverTrigger asChild>
              <PopoverToolbarTrigger active={inTable} title="Table">
                <TableIcon className="h-3.5 w-3.5" />
              </PopoverToolbarTrigger>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1.5" align="start">
              {!inTable ? (
                <MenuItem onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
                  Insert 3×3 table
                </MenuItem>
              ) : (
                <div className="space-y-0.5">
                  <MenuItem onClick={() => editor.chain().focus().addRowAfter().run()}>
                    <span className="inline-flex items-center gap-1.5"><Rows3 className="h-3 w-3" /> Add row below</span>
                  </MenuItem>
                  <MenuItem onClick={() => editor.chain().focus().addColumnAfter().run()}>
                    <span className="inline-flex items-center gap-1.5"><Columns3 className="h-3 w-3" /> Add column right</span>
                  </MenuItem>
                  <MenuItem onClick={() => editor.chain().focus().deleteRow().run()}>
                    Delete row
                  </MenuItem>
                  <MenuItem onClick={() => editor.chain().focus().deleteColumn().run()}>
                    Delete column
                  </MenuItem>
                  <div className="h-px bg-border/60 my-1" />
                  <MenuItem danger onClick={() => editor.chain().focus().deleteTable().run()}>
                    <span className="inline-flex items-center gap-1.5"><Trash2 className="h-3 w-3" /> Delete table</span>
                  </MenuItem>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      )}
      <EditorContent
        editor={editor}
        className={cn(
          'sop-editor-content prose prose-sm max-w-none px-4 py-3 min-h-[160px] focus:outline-none',
          '[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[140px]',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground/50',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none',
          '[&_.ProseMirror_h2]:text-base [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h2]:mt-4 [&_.ProseMirror_h2]:mb-1',
          '[&_.ProseMirror_h3]:text-sm [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:mt-3 [&_.ProseMirror_h3]:mb-1',
          '[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5',
          '[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5',
        )}
      />
    </div>
  );
}
