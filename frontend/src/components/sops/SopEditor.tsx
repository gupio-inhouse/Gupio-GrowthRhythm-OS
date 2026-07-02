import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, UnderlineIcon, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Heading2, Heading3,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

export function SopEditor({ content, onChange, editable = true }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Write the SOP content here…' }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  });

  if (!editor) return null;

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
        </div>
      )}
      <EditorContent
        editor={editor}
        className={cn(
          'prose prose-sm max-w-none px-4 py-3 min-h-[160px] focus:outline-none',
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
