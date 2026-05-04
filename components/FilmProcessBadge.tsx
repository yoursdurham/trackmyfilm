type FilmProcessKind = "color" | "black-and-white" | "default";

function normalizeFilmProcess(process?: string | null): FilmProcessKind {
  if (!process) return "default";

  const normalized = process.toLowerCase().replace(/[^a-z]/g, "");

  if (normalized === "color" || normalized === "c" || normalized === "c41") return "color";
  if (normalized.includes("blackandwhite") || normalized.includes("bw")) return "black-and-white";

  return "default";
}

export default function FilmProcessBadge({
  process,
  className = "",
}: {
  process: string;
  className?: string;
}) {
  const kind = normalizeFilmProcess(process);

  if (kind === "color") {
    return (
      <span className="inline-flex rounded-full bg-white px-2 py-0.5 text-xs font-semibold ring-1 ring-slate-200">
        <span className="bg-gradient-to-r from-red-500 via-yellow-400 to-blue-500 bg-clip-text text-transparent">
          {process}
        </span>
      </span>
    );
  }

  if (kind === "black-and-white") {
    return (
      <span className="inline-flex rounded-full bg-black px-2 py-0.5 text-xs font-medium text-white">
        {process}
      </span>
    );
  }

  return (
    <span className={className}>
      {process}
    </span>
  );
}
