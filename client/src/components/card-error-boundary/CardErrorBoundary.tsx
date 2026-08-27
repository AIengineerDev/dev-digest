"use client";

import React from "react";

/**
 * A boundary around ONE card, so a render throw costs that card and not the
 * page around it.
 *
 * `client/INSIGHTS.md` records a deliberate position: this client has no error
 * boundaries, and per-component boundaries should not be scattered as a first
 * move. That still holds. This is the specific case it leaves room for — a card
 * whose payload is written by a model. `PrBriefCard` renders `risks[]`,
 * `review_focus[]` and free prose that arrive over the wire; the grounding gate
 * drops unresolvable refs but cannot guarantee every field is the shape the
 * component expects. Without a boundary a single malformed payload blanks the
 * whole Overview tab, taking Intent, Blast Radius and the PR description with
 * it — three sections that had nothing to do with the failure.
 *
 * Deliberately dependency-free and tiny: no logging service, no retry, no
 * reset-on-props. It renders a one-line explanation in place of the card. If
 * this ever needs to become the app-wide strategy, that is a decision to take
 * once, not by accretion.
 */
interface Props {
  children: React.ReactNode;
  /** Rendered in place of the card. Keep it a plain string — this component
   *  must not itself depend on anything that can throw. */
  fallback: string;
}

interface State {
  failed: boolean;
}

export class CardErrorBoundary extends React.Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    // The client has no error-reporting sink; the console is what a developer
    // actually has. Swallowing it entirely would make this boundary a way to
    // hide bugs rather than contain them.
    console.error("[CardErrorBoundary]", error);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section role="status" style={{ padding: "12px 14px", borderRadius: 8, background: "var(--bg-hover)", color: "var(--text-muted)", fontSize: 13 }}>
        {this.props.fallback}
      </section>
    );
  }
}
