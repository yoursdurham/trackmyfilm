import { YOURS_BLEND_GRADIENT } from "@/lib/brand-colors";

/**
 * What a customer account is for. Sits beside the form on a wide screen and
 * above it on a phone, with the same pink-to-green blend as the wordmark.
 */
export default function AccountLoginExplainer() {
  return (
    <section
      aria-labelledby="account-explainer-heading"
      className="rounded-2xl border-2 border-neutral-900 px-4 py-3 text-neutral-900 sm:px-5 sm:py-4 md:px-6 md:py-5"
      style={{ backgroundColor: "#F3E4D0", backgroundImage: YOURS_BLEND_GRADIENT }}
    >
      <h2
        id="account-explainer-heading"
        className="font-jetbrains text-base font-bold leading-snug text-neutral-900 sm:text-lg"
      >
        Your film, all together
      </h2>
      <p className="mt-1.5 font-jetbrains text-sm leading-relaxed text-neutral-900">
        Your account keeps every roll you&apos;ve dropped off at Yours, in one place: all your orders, where each one is, and the film stocks you&apos;ve shot.
      </p>
      <p className="mt-1.5 font-jetbrains text-sm leading-relaxed text-neutral-900">
        No password needed. Enter the email you use at drop-off and we&apos;ll send you a sign-in link. Your past orders show up as soon as you sign in.
      </p>
    </section>
  );
}
