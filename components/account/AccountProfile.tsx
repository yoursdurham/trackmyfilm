import FilmStockPill from "@/components/FilmStockPill";
import WindowFrame from "@/components/WindowFrame";
import type { AccountOrderView, AccountProfileData, AccountProgressStep } from "@/lib/account-profile";

const STEP_COLORS = ["bg-[#C5AED7]", "bg-[#E4D48A]", "bg-[#A1CC93]"] as const;

const downloadClass =
  "inline-flex items-center justify-center rounded-xl bg-[#A1CC93] px-4 py-2.5 font-jetbrains text-sm font-bold text-neutral-900 transition-colors hover:bg-[#8fbe80] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2";

const signOutClass =
  "inline-flex h-12 items-center justify-center rounded-xl bg-[#C5AED7] px-5 font-jetbrains text-sm font-bold text-neutral-900 transition-colors hover:bg-[#b79dce] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2";

function displayStat(value: string, empty: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : empty;
}

function Progress({ steps }: { steps: AccountProgressStep[] }) {
  return (
    <ol className="grid grid-cols-3 gap-2">
      {steps.map((step, index) => (
        <li key={step.label} className="flex flex-col items-center gap-2 text-center">
          <span
            className={`size-3 rounded-full border-2 border-neutral-900 ${step.reached ? STEP_COLORS[index] : "bg-white"}`}
            aria-hidden="true"
          />
          <span className="font-jetbrains text-xs font-bold leading-snug text-neutral-900">{step.label}</span>
          <span className="sr-only">{step.reached ? "Done" : "Not yet"}</span>
        </li>
      ))}
    </ol>
  );
}

function RollPills({ rolls }: { rolls: AccountOrderView["rolls"] }) {
  if (!rolls.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {rolls.map((roll, index) => (
        <li key={`${roll.stock}-${roll.format ?? "format"}-${index}`}>
          <FilmStockPill stock={roll.stock} format={roll.format} />
        </li>
      ))}
    </ul>
  );
}

function OrderCard({ order, showProgress }: { order: AccountOrderView; showProgress: boolean }) {
  return (
    <WindowFrame
      title={order.orderNumber}
      titleAs="h3"
      trailing={order.dateLabel ? (
        <span className="font-jetbrains text-xs font-bold text-neutral-900">{order.dateLabel}</span>
      ) : null}
      bodyClassName="space-y-4 p-4 sm:p-5"
    >
      {showProgress ? <Progress steps={order.steps} /> : null}
      {order.holdMessage ? (
        <p className="text-center font-jetbrains text-sm leading-relaxed text-neutral-900">{order.holdMessage}</p>
      ) : null}
      <RollPills rolls={order.rolls} />
      {order.scanNotes ? (
        <p className="font-jetbrains text-sm leading-relaxed text-neutral-900">{order.scanNotes}</p>
      ) : null}
      {order.downloads.length ? (
        <div className="flex flex-wrap gap-2">
          {order.downloads.map((download) => (
            <a key={download.href} href={download.href} target="_blank" rel="noopener noreferrer" className={downloadClass}>
              {download.label}
            </a>
          ))}
        </div>
      ) : null}
    </WindowFrame>
  );
}

function StatCard({ label, value, testId }: { label: string; value: string; testId: string }) {
  const compact = value.trim().length > 6;
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-[1.7rem] border-2 border-neutral-900 bg-white">
      <div className="relative flex min-h-11 items-center bg-[#DDB1B1] py-2 pl-16 pr-3">
        <span className="absolute left-3.5 flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-[#C9B7C6]" />
          <span className="size-2.5 rounded-full bg-[#E4D48A]" />
          <span className="size-2.5 rounded-full bg-[#A9C99A]" />
        </span>
        <h3 className="min-w-0 text-left font-jetbrains text-[0.82rem] font-bold leading-snug text-neutral-900">
          {label}
        </h3>
      </div>
      <div className="flex min-h-24 items-center justify-center bg-white px-3 py-4">
        <p
          data-testid={testId}
          className={`text-center font-jetbrains font-bold leading-tight text-neutral-900 ${compact ? "text-lg sm:text-xl" : "text-3xl"}`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

export default function AccountProfile({
  profile,
  ordersUnavailable = false,
}: {
  profile: AccountProfileData;
  ordersUnavailable?: boolean;
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 pb-16 sm:px-6">
      <header>
        <h1 data-testid="account-greeting" className="font-jetbrains text-3xl font-bold leading-tight text-neutral-900 sm:text-4xl">
          Hi, {profile.greetingName}
        </h1>
        <p className="mt-2 font-jetbrains text-sm leading-relaxed text-neutral-800 sm:text-base">
          Your drop-offs, scans, and the stocks you reach for most.
        </p>
      </header>

      <section aria-label="Your film so far" className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Rolls dropped off" value={displayStat(profile.stats.rolls_dropped_off, "—")} testId="stat-rolls" />
        <StatCard label="Most-used film" value={displayStat(profile.stats.top_stock, "—")} testId="stat-stock" />
        <StatCard label="Days since first drop" value={displayStat(profile.stats.days_since_first_drop, "—")} testId="stat-days" />
      </section>

      <section className="space-y-3" data-testid="current-orders">
        <h2 className="font-jetbrains text-lg font-bold text-neutral-900">Current orders</h2>
        {ordersUnavailable ? (
          <p className="font-jetbrains text-sm leading-relaxed text-neutral-900">We couldn&apos;t load your orders. Try again in a minute.</p>
        ) : profile.current.length ? (
          profile.current.map((order) => <OrderCard key={order.id} order={order} showProgress />)
        ) : (
          <p className="font-jetbrains text-sm leading-relaxed text-neutral-900">Nothing in the lab right now.</p>
        )}
      </section>

      <section className="space-y-3" data-testid="order-history">
        <h2 className="font-jetbrains text-lg font-bold text-neutral-900">Order history</h2>
        {profile.history.length ? (
          profile.history.map((order) => <OrderCard key={order.id} order={order} showProgress={false} />)
        ) : (
          <p className="font-jetbrains text-sm leading-relaxed text-neutral-900">Finished scans will show up here.</p>
        )}
      </section>

      {profile.favorites.length ? (
        <section data-testid="favorites">
          <WindowFrame title="Favorite stocks" titleAs="h2" bodyClassName="p-4 sm:p-5">
            <ul className="flex flex-wrap gap-2">
              {profile.favorites.map((favorite) => (
                <li key={favorite.stock}>
                  {favorite.href ? (
                    <a
                      href={favorite.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex rounded-full bg-white px-3 py-1.5 font-jetbrains text-xs font-medium text-neutral-900 underline-offset-2 ring-1 ring-neutral-900 transition-colors duration-150 ease-out hover:bg-[#C5AED7]/40 hover:underline focus-visible:bg-[#C5AED7]/40 focus-visible:underline focus-visible:outline-none"
                    >
                      {favorite.stock}
                    </a>
                  ) : (
                    <span className="inline-flex rounded-full bg-white px-3 py-1.5 font-jetbrains text-xs font-medium text-neutral-900 ring-1 ring-neutral-900">
                      {favorite.stock}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </WindowFrame>
        </section>
      ) : null}

      <section data-testid="contact">
        <WindowFrame title="Contact" titleAs="h2" bodyClassName="space-y-4 p-4 sm:p-5">
          <dl className="space-y-3 font-jetbrains text-sm leading-relaxed text-neutral-900">
            <div>
              <dt className="font-bold">Name</dt>
              <dd>{profile.contactName || "Not on file"}</dd>
            </div>
            <div>
              <dt className="font-bold">Email</dt>
              <dd>{profile.email}</dd>
            </div>
            <div>
              <dt className="font-bold">Phone</dt>
              <dd>{profile.phone || "Not on file"}</dd>
            </div>
          </dl>
          <form action="/api/auth/logout" method="post">
            <input type="hidden" name="next" value="/account/login" />
            <button type="submit" data-testid="sign-out" className={signOutClass}>Sign out</button>
          </form>
        </WindowFrame>
      </section>
    </main>
  );
}
