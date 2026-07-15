import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Download, FileText, ExternalLink } from 'lucide-react';

type Attachment = { name: string; url: string } | null;

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
const OFFICE_EXT = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

function extOf(name: string) {
  return name.split('.').pop()?.toLowerCase() || '';
}

interface Props {
  attachment: Attachment;
  onClose: () => void;
}

export function DocumentPreviewDialog({ attachment, onClose }: Props) {
  if (!attachment) return null;
  const ext = extOf(attachment.name);
  const isImage = IMAGE_EXT.includes(ext);
  const isPdf = ext === 'pdf';
  const isOffice = OFFICE_EXT.includes(ext);
  const isText = ext === 'txt' || ext === 'csv';

  return (
    <Dialog open={!!attachment} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl h-[85vh] p-0 gap-0 overflow-hidden rounded-2xl flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-violet-600 shrink-0" />
            <DialogTitle className="text-sm font-semibold truncate">{attachment.name}</DialogTitle>
          </div>
          <a
            href={attachment.url}
            download={attachment.name}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 shrink-0 h-8 px-3 rounded-lg border border-border/60 bg-white text-xs font-semibold text-muted-foreground hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-all mr-8"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </a>
        </div>

        <div className="flex-1 min-h-0 bg-muted/20">
          {isImage ? (
            <div className="h-full w-full flex items-center justify-center overflow-auto p-4">
              <img src={attachment.url} alt={attachment.name} className="max-w-full max-h-full object-contain rounded-lg" />
            </div>
          ) : isPdf || isText ? (
            <iframe src={attachment.url} title={attachment.name} className="w-full h-full border-0" />
          ) : isOffice ? (
            <iframe
              src={`https://docs.google.com/gview?url=${encodeURIComponent(attachment.url)}&embedded=true`}
              title={attachment.name}
              className="w-full h-full border-0"
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-6 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40" />
              <div>
                <p className="text-sm font-semibold text-foreground/70">Preview not available for this file type</p>
                <p className="text-xs mt-1">Download it to view, or open it directly.</p>
              </div>
              <a
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border/60 bg-white text-xs font-semibold hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-all"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
