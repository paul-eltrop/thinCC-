import Link from 'next/link';

interface BreadcrumbProps {
  tenderName: string;
  onDelete?: () => void;
}

export function Breadcrumb({ tenderName, onDelete }: BreadcrumbProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <Link href="/" className="hover:text-slate-900">
          Tenders
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-medium">{tenderName}</span>
      </div>
      <button
        onClick={onDelete}
        className="text-sm text-rose-600 hover:text-rose-700 font-medium"
      >
        Delete tender
      </button>
    </div>
  );
}