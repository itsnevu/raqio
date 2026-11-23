import Link from "next/link";
import Brand from "@/components/Brand";
import type {ReactNode} from "react";

export default function AccessLayout({children}:{children:ReactNode}){
  return <main className="loginp access-shell">
    <div className="access-stack">
      <div className="access-split">
        <aside className="access-brand">
          <svg className="access-contours" viewBox="0 0 380 440" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            {Array.from({length:12},(_,i)=><path key={i}
              transform={`translate(275 95) scale(${.42+i*.16})`}
              d="M-121-30C-105-76-73-101-28-99S35-130 79-115 102-71 124-40 144 17 111 45 74 47 47 81-10 118-40 90-51 52-87 48-139 12-121-30Z"
              vectorEffect="non-scaling-stroke"/>)}
          </svg>
          <Brand />
          <p>Riset pasar dan kelola prospek.</p>
        </aside>
        <div className="access-form">
          <Link className="access-back" href="/">
            <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5m7 7-7-7 7-7"/>
            </svg>
            Kembali ke beranda
          </Link>
          {children}
        </div>
      </div>
      <footer className="access-legal" aria-label="Informasi legal">
        <p>Dengan menggunakan RAQIO, Anda menyetujui</p>
        <p><Link href="/terms">Syarat &amp; Ketentuan</Link> dan <Link href="/privacy">Kebijakan Privasi</Link>.</p>
      </footer>
    </div>
  </main>;
}
