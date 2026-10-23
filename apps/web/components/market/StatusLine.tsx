"use client";
import Link from "next/link";
import { ageText } from "@/lib/market/progress";
import type { StatusMsg } from "@/lib/market/types";
import Progress from "./Progress";

type Props = { status: StatusMsg; log: string; started: number | null; queue?: string[]; onStop: () => Promise<void> | void; onRescan: () => void };

export default function StatusLine({ status, log, started, queue, onStop, onRescan }: Props) {
  if (status.kind === "running") return <div className="status"><Progress log={log} started={started} queue={queue} onStop={onStop} /></div>;
  return (
    <div className="status" role={status.kind === "error" ? "alert" : "status"} aria-live="polite">
      {status.kind === "info" && status.text}
      {status.kind === "error" && (
        <span className="err">
          {status.text}
          {status.upgrade && <> <Link className="mini" href="/settings">Upgrade paket →</Link></>}
        </span>
      )}
      {status.kind === "cached" && (
        <span>
          Hasil instan dari pemindaian {ageText(status.ageHours)} lalu, tanpa memakai kuota.{" "}
          <button type="button" className="mini" onClick={onRescan}>Pindai ulang sekarang</button>
        </span>
      )}
    </div>
  );
}
