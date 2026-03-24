"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };

type State = { hasError: boolean; message: string | null };

export class SteadyErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Steady UI error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-lg font-semibold text-foreground">Something went wrong</p>
          <p className="mt-2 text-sm text-muted">{this.state.message ?? "Unexpected error"}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: null })}
            className="mt-6 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
