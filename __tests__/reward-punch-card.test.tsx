import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RewardPunchCard from "@/components/account/RewardPunchCard";

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
    expect(seven.match(/<svg/g)).toHaveLength(10);
    expect(seven).not.toContain("<circle");
  });
});
