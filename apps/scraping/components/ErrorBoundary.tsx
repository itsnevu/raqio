"use client";
// Boundary kecil untuk bagian halaman (grafik, panel) supaya satu bagian yang gagal tidak menjatuhkan seluruh halaman.
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; label?: string; fallback?: ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[raqio] bagian gagal dirender:", this.props.label || "", error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <div className="part-err" role="alert">
        <b>{this.props.label ? `${this.props.label} gagal ditampilkan.` : "Bagian ini gagal ditampilkan."}</b>
        <button type="button" className="btn ghost" onClick={() => this.setState({ error: null })}>
          Coba lagi
        </button>
      </div>
    );
  }
}
