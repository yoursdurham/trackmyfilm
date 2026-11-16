import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RewardPunchCard, {
  PUNCH_EASE,
  PUNCH_STAGGER_MS,
  punchFlourishDelay,
  punchShownCount,
} from "@/components/account/RewardPunchCard";

describe("reward punch card", () => {
  it("draws ten spots and names the count for an empty, partial, and full card", () => {
    const empty = renderToStaticMarkup(<RewardPunchCard punched={0} />);
    const seven = renderToStaticMarkup(<RewardPunchCard punched={7} />);
    const full = renderToStaticMarkup(<RewardPunchCard punched={10} />);
    expect(seven.match(/<li[\s>]/g)).toHaveLength(10);
    expect(empty).toContain('aria-label="0 of 10 — 10 more rolls until your free dev + high-res scan"');
    expect(seven).toContain('aria-label="7 of 10 — 3 more rolls until your free dev + high-res scan"');
    expect(full).toContain('aria-label="10 of 10 — your free dev + high-res scan is ready"');
    expect(full).toContain(">Free<");
    expect(seven.match(/<svg/g)).toHaveLength(17);
    expect(seven).not.toContain("<circle");
    expect(seven.match(/width="26" height="40" rx="1"/g)).toHaveLength(17);
    expect(seven).toContain("M34 20 H49 L55 27 V40 H34 Z");
    expect(empty).not.toContain("data-earned-roll");
    expect(seven.match(/data-earned-roll/g)).toHaveLength(7);
    expect(full.match(/data-earned-roll/g)).toHaveLength(10);
    expect(full.match(/data-reward-spot/g)).toHaveLength(1);
    expect(seven).not.toContain("opacity:0");
    expect(seven).toContain(">7 of 10 — 3 more rolls until your free dev + high-res scan<");
  });

  it("staggers each earned roll and saves the flourish for a full card", () => {
    expect(PUNCH_STAGGER_MS).toBeGreaterThanOrEqual(80);
    expect(PUNCH_STAGGER_MS).toBeLessThanOrEqual(150);
    expect(PUNCH_EASE).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
    expect(punchShownCount(-10, 7)).toBe(1);
    expect(punchShownCount(0, 7)).toBe(1);
    expect(punchShownCount(PUNCH_STAGGER_MS * 3, 7)).toBe(4);
    expect(punchShownCount(10_000, 7)).toBe(7);
    expect(punchShownCount(0, 0)).toBe(0);
    expect(punchFlourishDelay(7, 10)).toBeNull();
    expect(punchFlourishDelay(10, 10)).toBe(9 * PUNCH_STAGGER_MS + 420);
  });
});
