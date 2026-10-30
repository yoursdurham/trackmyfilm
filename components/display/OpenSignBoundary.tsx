"use client";

import { Component, type ReactNode } from "react";

/**
 * A failure inside the Open sign must not replace the kiosk with the cream
 * global error page. Show the screen's normal mode instead.
 */
export default class OpenSignBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    console.error("[open-sign]", error);
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
