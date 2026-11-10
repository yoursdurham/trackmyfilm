"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import RewardPunchCard from "@/components/account/RewardPunchCard";
import WindowFrame from "@/components/WindowFrame";
import type { AccountRewardsPayload } from "@/lib/rewards";

function formatExpiry(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "MMMM d, yyyy");
}

export default function AccountRewards({
  rewards,
  unavailable = false,
}: {
  rewards: AccountRewardsPayload | null;
  unavailable?: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const requestCode = async (rewardId: string) => {
    setPendingId(rewardId);
    setError(null);
    try {
      const response = await fetch("/api/account/rewards/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rewardId }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setError(body?.error ?? "Could not create the code. Try again in a minute.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not create the code. Try again in a minute.");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section data-testid="account-rewards" aria-label="Rewards on your account">
      <WindowFrame title="Rewards" titleAs="h2" bodyClassName="space-y-4 p-4 sm:p-5">
        {unavailable || !rewards ? (
          <p className="font-jetbrains text-sm leading-relaxed text-neutral-900">
            Rewards will show on your account once the shop finishes setting them up.
          </p>
        ) : (
          <>
            <RewardPunchCard punched={rewards.rewardReady ? 10 : rewards.progress} />
            {rewards.rewardReady && rewards.progress > 0 ? (
              <div className="space-y-2">
                <p className="font-jetbrains text-sm font-bold text-neutral-900">Toward your next one</p>
                <RewardPunchCard punched={rewards.progress} />
              </div>
            ) : null}
            <p className="font-jetbrains text-sm leading-relaxed text-neutral-800">
              Every 10 rolls on your account earns a free development and high-res scan at Yours,. 35mm, 120, and disposable cameras count. A blank roll does not.
            </p>
            {rewards.cards.length === 0 ? (
              <p className="font-jetbrains text-sm leading-relaxed text-neutral-900">
                No reward is waiting on your account yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {rewards.cards.map((card) => {
                  const expiry = formatExpiry(card.validTo);
                  return (
                    <li key={card.id} className="rounded-2xl border-2 border-neutral-900 bg-[#FFF6D3] p-4">
                      {card.status === "issued" && card.promoCode ? (
                        <div className="space-y-2">
                          <p className="font-jetbrains text-sm font-bold text-neutral-900">Your code</p>
                          <p data-testid="reward-code" className="font-jetbrains text-2xl font-bold tracking-wide text-neutral-900">
                            {card.promoCode}
                          </p>
                          <button
                            type="button"
                            className="font-jetbrains text-sm font-bold text-neutral-900 underline decoration-[#C5AED7] decoration-2 underline-offset-4"
                            onClick={() => {
                              void navigator.clipboard?.writeText(card.promoCode ?? "");
                              setCopied(true);
                            }}
                          >
                            {copied ? "Copied" : "Copy code"}
                          </button>
                          <p className="font-jetbrains text-sm leading-relaxed text-neutral-900">
                            {expiry ? `Good through ${expiry} at Yours,.` : "Use this at Yours,."}
                            {" "}It takes 100% off one development and high-res scan for 35mm, 120, or a disposable camera. One code per checkout, and it applies to the subtotal.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="font-jetbrains text-sm leading-relaxed text-neutral-900">
                            A free development and high-res scan is ready on your account.
                          </p>
                          <button
                            type="button"
                            disabled={!rewards.onlineEnabled || pendingId === card.id}
                            onClick={() => { void requestCode(card.id); }}
                            className="inline-flex items-center justify-center rounded-xl bg-[#A1CC93] px-4 py-2.5 font-jetbrains text-sm font-bold text-neutral-900 transition-colors hover:bg-[#8fbe80] disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-600"
                          >
                            {pendingId === card.id ? "Creating your code…" : "Get an online code"}
                          </button>
                          {!rewards.onlineEnabled && rewards.onlineMessage ? (
                            <p className="font-jetbrains text-sm leading-relaxed text-neutral-800">{rewards.onlineMessage}</p>
                          ) : (
                            <p className="font-jetbrains text-sm leading-relaxed text-neutral-800">
                              Or bring it to the shop and Yours, can apply it to one roll.
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {error ? <p className="font-jetbrains text-sm text-neutral-900">{error}</p> : null}
            {rewards.history.length > 0 ? (
              <div className="space-y-2">
                <h3 className="font-jetbrains text-sm font-bold text-neutral-900">On your account</h3>
                <ul className="space-y-1">
                  {rewards.history.map((item) => (
                    <li key={item.id} className="font-jetbrains text-sm leading-relaxed text-neutral-800">
                      {item.label}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </WindowFrame>
    </section>
  );
}
