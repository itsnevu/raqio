import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap">
      <div className="empty-cta">
        <b>Halaman tidak ditemukan</b>Alamat yang kamu buka tidak ada atau sudah dipindah.
        <div>
          <Link className="btn" href="/market">Ke halaman riset</Link>
        </div>
      </div>
    </div>
  );
}
