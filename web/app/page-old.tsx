/**
 * TenderAgent Dashboard im Pastel-Glass-Stil — sanfter Verlaufshintergrund,
 * weiße Cards mit großem Radius und weichen Schatten, dunkle Buttons, große
 * Zahlen als Eyecatcher. Linke Icon-Leiste navigiert zwischen den Pages.
 */
import Link from "next/link";

const stats = [
  { label: "Active tenders", value: "14", delta: "+3", trend: "up" as const, sub: "vs last week" },
  { label: "Win rate", value: "64%", delta: "+5%", trend: "up" as const, sub: "last 12 months" },
  { label: "Pipeline value", value: "€28M", delta: "+12%", trend: "up" as const, sub: "weighted by fit" },
];

const chartDays = [
  { day: "Mon", value: 5 },
  { day: "Tue", value: 8 },
  { day: "Wed", value: 6 },
  { day: "Thu", value: 9 },
  { day: "Fri", value: 7 },
  { day: "Sat", value: 3 },
  { day: "Sun", value: 4 },
];

const barColors = [
  "#DBEAFE",
  "#BFDBFE",
  "#93C5FD",
  "#60A5FA",
  "#3B82F6",
  "#2563EB",
  "#1D4ED8",
];

const recentTenders = [
  { id: "07", title: "Digitale Transformation Stadt München", org: "Landeshauptstadt München", fit: 87, status: "Ready", value: "€2.4M", deadline: "15 Mar" },
  { id: "06", title: "EU Cloud Migration Framework", org: "European Commission", fit: 64, status: "Drafting", value: "€8.1M", deadline: "22 Mar" },
  { id: "05", title: "BMVI Mobilitäts-Plattform", org: "BMVI", fit: 92, status: "Scanning", value: "€4.7M", deadline: "01 Apr" },
  { id: "04", title: "SBB IT-Audit Programm", org: "Schweizer Bundesbahn", fit: 78, status: "Ready", value: "€3.3M", deadline: "05 Apr" },
];

const upcoming = [
  { date: "01", month: "Apr", title: "BMVI Mobilitäts-Plattform", time: "23:59 CEST" },
  { date: "05", month: "Apr", title: "SBB IT-Audit Programm", time: "12:00 CET" },
  { date: "07", month: "Apr", title: "VW AI Roadmap 2027", time: "17:00 CEST" },
];

const calendarDays = [
  null, null, 1, 2, 3, 4, 5,
  6, 7, 8, 9, 10, 11, 12,
  13, 14, 15, 16, 17, 18, 19,
  20, 21, 22, 23, 24, 25, 26,
  27, 28, 29, 30, null, null, null,
];

const deadlineDays = new Set([1, 5, 7]);
const today = 8;

export default function Dashboard() {
  return (
    <div
      className="min-h-screen text-slate-900"
      style={{
        background: `radial-gradient(ellipse 90% 60% at 0% 0%, #E8F1FE 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 100% 0%, #FDE8E8 0%, transparent 50%), radial-gradient(ellipse 80% 70% at 50% 100%, #EFE5FE 0%, transparent 55%), #F7F3FB`,
      }}
    >
      <TopBar />
      <div className="flex">
        <Sidebar />
        <Main />
      </div>
    </div>
  );
}

function TopBar() {
  return (
    <header className="flex items-center justify-between px-8 py-5">
      <Link href="/" className="flex items-center gap-2.5">
        <div className="grid size-9 place-items-center rounded-2xl bg-slate-900 text-white">
          <LogoMark />
        </div>
        <span className="text-[17px] font-semibold tracking-tight text-slate-900">
          tendr<span className="text-blue-500">.</span>
        </span>
      </Link>
      <AccountButton />
    </header>
  );
}

function LogoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 7l8 5 8-5M4 7l8-4 8 4M4 7v10l8 4 8-4V7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AccountButton() {
  return (
    <button className="flex items-center gap-2 rounded-full border border-white/60 bg-white/60 py-1 pl-1 pr-3 text-sm shadow-[0_2px_12px_rgba(15,23,42,0.04)] backdrop-blur-xl hover:bg-white/80">
      <div className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-blue-400 to-purple-400 text-[13px] font-semibold text-white">
        LK
      </div>
      <span className="font-medium text-slate-700">Lasse</span>
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-slate-500"
      >
        <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function Sidebar() {
  return (
    <aside className="w-[88px] shrink-0 px-3 pt-4">
      <nav className="space-y-2">
        <NavItem icon={<BuildingIcon />} label="Your company" active />
        <NavItem icon={<TenderIcon />} label="Tenders" />
      </nav>
    </aside>
  );
}

function NavItem({
  icon,
  label,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <a
      href="#"
      className={`flex flex-col items-center gap-1.5 rounded-2xl p-3 text-center transition-all ${
        active
          ? "bg-white/80 text-slate-900 shadow-[0_2px_12px_rgba(15,23,42,0.06)] backdrop-blur-xl"
          : "text-slate-500 hover:bg-white/50 hover:text-slate-700"
      }`}
    >
      <div
        className={`grid size-10 place-items-center rounded-xl ${
          active ? "bg-blue-500 text-white" : "bg-white/70 text-slate-600"
        }`}
      >
        {icon}
      </div>
      <span className="text-[10px] font-medium leading-tight">{label}</span>
    </a>
  );
}

function BuildingIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <line x1="9" y1="8" x2="9" y2="8.01" />
      <line x1="15" y1="8" x2="15" y2="8.01" />
      <line x1="9" y1="12" x2="9" y2="12.01" />
      <line x1="15" y1="12" x2="15" y2="12.01" />
      <line x1="9" y1="16" x2="9" y2="16.01" />
      <line x1="15" y1="16" x2="15" y2="16.01" />
    </svg>
  );
}

function TenderIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="14 3 14 9 20 9" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

function Main() {
  return (
    <main className="grid min-w-0 flex-1 grid-cols-1 gap-6 px-6 pb-12 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Greeting />
        <StatsRow />
        <ChartCard />
        <RecentTendersCard />
      </div>
      <div className="space-y-6">
        <CalendarCard />
        <UpcomingCard />
      </div>
    </main>
  );
}

function Greeting() {
  return (
    <div className="flex items-end justify-between">
      <div>
        <p className="text-sm text-slate-500">Wednesday, 8 April 2026</p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-slate-900">
          Good morning, Lasse
        </h1>
      </div>
      <SegmentedControl />
    </div>
  );
}

function SegmentedControl() {
  const options = ["Week", "Month", "Year"];
  return (
    <div className="flex items-center gap-1 rounded-full border border-white/60 bg-white/50 p-1 shadow-[0_2px_12px_rgba(15,23,42,0.04)] backdrop-blur-xl">
      {options.map((opt, i) => (
        <button
          key={opt}
          className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
            i === 0
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function StatsRow() {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {stats.map((s) => (
        <StatCard key={s.label} stat={s} />
      ))}
    </section>
  );
}

function StatCard({ stat }: { stat: (typeof stats)[number] }) {
  return (
    <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-slate-500">{stat.label}</span>
        <DeltaBadge delta={stat.delta} trend={stat.trend} />
      </div>
      <div className="mt-6 text-[44px] font-semibold leading-none tracking-tight text-slate-900">
        {stat.value}
      </div>
      <p className="mt-2 text-xs text-slate-500">{stat.sub}</p>
    </div>
  );
}

function DeltaBadge({ delta, trend }: { delta: string; trend: "up" | "down" }) {
  const tone =
    trend === "up"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-rose-100 text-rose-700";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}
    >
      {trend === "up" ? "↑" : "↓"} {delta}
    </span>
  );
}

function ChartCard() {
  const max = Math.max(...chartDays.map((d) => d.value));
  return (
    <section className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Tender activity
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            New analyses, drafts and reviews this week
          </p>
        </div>
        <span className="text-xs font-medium text-slate-500">42 actions</span>
      </div>

      <div className="mt-8 flex h-44 items-end justify-between gap-3">
        {chartDays.map((d, i) => {
          const heightPct = (d.value / max) * 100;
          const color = barColors[i];
          return (
            <div
              key={d.day}
              className="group flex flex-1 flex-col items-center gap-3"
            >
              <div className="relative w-full flex-1 flex items-end">
                <div
                  className="w-full rounded-2xl"
                  style={{
                    height: `${heightPct}%`,
                    backgroundImage: `repeating-linear-gradient(45deg, rgba(255,255,255,0.22) 0 4px, transparent 4px 8px), linear-gradient(180deg, ${color}, ${color})`,
                  }}
                />
              </div>
              <span className="text-[11px] font-medium text-slate-500 group-hover:text-slate-900">
                {d.day}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RecentTendersCard() {
  return (
    <section className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">
          Recent tenders
        </h2>
        <button className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
          View all
        </button>
      </div>

      <ul className="mt-5 divide-y divide-slate-200/60">
        {recentTenders.map((t) => (
          <TenderItem key={t.id} tender={t} />
        ))}
      </ul>
    </section>
  );
}

function TenderItem({ tender }: { tender: (typeof recentTenders)[number] }) {
  return (
    <li className="flex items-center gap-4 py-3.5">
      <FitRing fit={tender.fit} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {tender.title}
        </p>
        <p className="truncate text-xs text-slate-500">{tender.org}</p>
      </div>
      <div className="hidden text-right sm:block">
        <p className="text-sm font-semibold text-slate-900">{tender.value}</p>
        <p className="text-xs text-slate-500">due {tender.deadline}</p>
      </div>
      <StatusPill status={tender.status} />
    </li>
  );
}

function FitRing({ fit }: { fit: number }) {
  const color =
    fit >= 80 ? "#3B82F6" : fit >= 60 ? "#94A3B8" : "#CBD5E1";
  return (
    <div
      className="grid size-11 shrink-0 place-items-center rounded-full text-[13px] font-semibold text-white"
      style={{
        background: `conic-gradient(${color} ${fit * 3.6}deg, #F1F5F9 0deg)`,
      }}
    >
      <div className="grid size-9 place-items-center rounded-full bg-white text-slate-900">
        {fit}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "Ready"
      ? "bg-emerald-100 text-emerald-700"
      : status === "Drafting"
        ? "bg-blue-100 text-blue-700"
        : "bg-amber-100 text-amber-700";
  return (
    <span
      className={`hidden rounded-full px-2.5 py-1 text-[11px] font-semibold md:inline-block ${tone}`}
    >
      {status}
    </span>
  );
}

function CalendarCard() {
  return (
    <section className="rounded-3xl border border-white/60 bg-white/70 p-5 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">April 2026</h2>
        <div className="flex items-center gap-1">
          <CalendarNav direction="prev" />
          <CalendarNav direction="next" />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-7 gap-y-1 text-center text-[10px] font-medium text-slate-400">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <div key={d} className="pb-2">
            {d}
          </div>
        ))}
        {calendarDays.map((day, i) => (
          <CalendarDay key={i} day={day} />
        ))}
      </div>
    </section>
  );
}

function CalendarNav({ direction }: { direction: "prev" | "next" }) {
  return (
    <button className="grid size-7 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={direction === "prev" ? "M10 4l-4 4 4 4" : "M6 4l4 4-4 4"} />
      </svg>
    </button>
  );
}

function CalendarDay({ day }: { day: number | null }) {
  if (day === null) return <div />;
  const isToday = day === today;
  const hasDeadline = deadlineDays.has(day);
  return (
    <div className="relative grid place-items-center py-1.5">
      <div
        className={`grid size-8 place-items-center rounded-full text-xs ${
          isToday
            ? "bg-blue-500 font-semibold text-white"
            : hasDeadline
              ? "font-semibold text-slate-900"
              : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        {day}
      </div>
      {hasDeadline && !isToday && (
        <div className="absolute bottom-0.5 size-1 rounded-full bg-blue-500" />
      )}
    </div>
  );
}

function UpcomingCard() {
  return (
    <section className="rounded-3xl border border-white/60 bg-white/70 p-5 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">
          Upcoming deadlines
        </h2>
        <button className="text-xs font-medium text-blue-600 hover:text-blue-700">
          See all
        </button>
      </div>
      <ul className="mt-4 space-y-3">
        {upcoming.map((u, i) => (
          <UpcomingItem key={i} item={u} />
        ))}
      </ul>
    </section>
  );
}

function UpcomingItem({ item }: { item: (typeof upcoming)[number] }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-slate-200/60 bg-white/60 p-3">
      <div className="grid size-11 shrink-0 flex-col place-items-center rounded-xl bg-blue-50 text-blue-700">
        <div className="text-[9px] font-semibold uppercase tracking-wide leading-none">
          {item.month}
        </div>
        <div className="text-base font-bold leading-tight">{item.date}</div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-slate-900">
          {item.title}
        </p>
        <p className="truncate text-[11px] text-slate-500">{item.time}</p>
      </div>
    </li>
  );
}
