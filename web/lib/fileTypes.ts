// Helpers fuer Datei-Erkennung in der Document-Galerie. Liefert Mime-Type
// aus Filename, formatiert Bytes lesbar und gibt eine Farbe + Label fuer
// jedes unterstuetzte Format zurueck (PDF, DOCX, XLSX, PPTX, TXT, MD, IMG).

export type FileVisual = {
  label: string;
  color: string;
  bg: string;
};

const EXTENSION_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
  htm: 'text/html',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

const VISUALS: Record<string, FileVisual> = {
  pdf: { label: 'PDF', color: 'text-rose-700', bg: 'bg-rose-100' },
  docx: { label: 'DOCX', color: 'text-blue-700', bg: 'bg-blue-100' },
  xlsx: { label: 'XLSX', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  pptx: { label: 'PPTX', color: 'text-amber-700', bg: 'bg-amber-100' },
  txt: { label: 'TXT', color: 'text-slate-700', bg: 'bg-slate-100' },
  md: { label: 'MD', color: 'text-purple-700', bg: 'bg-purple-100' },
  html: { label: 'HTML', color: 'text-orange-700', bg: 'bg-orange-100' },
  png: { label: 'PNG', color: 'text-fuchsia-700', bg: 'bg-fuchsia-100' },
  jpg: { label: 'JPG', color: 'text-fuchsia-700', bg: 'bg-fuchsia-100' },
  jpeg: { label: 'JPG', color: 'text-fuchsia-700', bg: 'bg-fuchsia-100' },
};

const DEFAULT_VISUAL: FileVisual = {
  label: 'FILE',
  color: 'text-slate-600',
  bg: 'bg-slate-100',
};

export const ALLOWED_EXTENSIONS = Object.keys(EXTENSION_MIME);

export function extensionFromFilename(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx < 0) return '';
  return name.slice(idx + 1).toLowerCase();
}

export function mimeTypeFromFilename(name: string): string {
  return EXTENSION_MIME[extensionFromFilename(name)] || 'application/octet-stream';
}

export function visualForFilename(name: string): FileVisual {
  return VISUALS[extensionFromFilename(name)] || DEFAULT_VISUAL;
}

export function isAllowedFilename(name: string): boolean {
  return extensionFromFilename(name) in EXTENSION_MIME;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_');
}
