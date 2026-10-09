import type { DisplayPayload } from "@/lib/display";
import { sanitizeFilmDepartures } from "@/lib/film-departures";
import FilmDeparturesBoard from "@/components/display/FilmDeparturesBoard";

const FONT = '"Helvetica Neue Condensed", "HelveticaNeue-CondensedBold", "Arial Narrow", "Nimbus Sans Narrow", "Franklin Gothic Medium", sans-serif';

export default function AirportBoard({
  payload,
  notice,
}: {
  payload: DisplayPayload;
  notice?: string | null;
}) {
  const board = notice ? null : sanitizeFilmDepartures(payload.data.departures);

  return (
    <div
      data-display-mode={notice ? "idle" : payload.mode}
      data-display-theme="airport"
      className="relative h-dvh w-full overflow-hidden bg-[#070b14] text-white uppercase select-none"
      style={{
        fontFamily: FONT,
        fontStretch: "condensed",
        fontWeight: 700,
        backgroundImage: "linear-gradient(180deg, #0c1424 0%, #070b14 28%, #070b14 100%)",
      }}
    >
      {board ? (
        <FilmDeparturesBoard board={board} />
      ) : (
        <div className="flex h-full items-center justify-center px-[8vw] text-center">
          <p className="text-[2rem] leading-snug tracking-[0.14em] text-[#FFC627]">
            {notice || "The board will be back in a moment."}
          </p>
        </div>
      )}
    </div>
  );
}
