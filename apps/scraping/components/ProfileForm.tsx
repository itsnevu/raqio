"use client";
// Formulir profil bisnis: dipakai di Pengaturan dan di tab Prospek saat profil belum ada.
import { useEffect, useId, useState } from "react";
import "./profile-form.css";
import { useToast } from "@/components/Shell";
import { errMsg } from "@/lib/api";
import { getMe } from "@/lib/me";
import { type BusinessProfile, hasProfile, KINDS, SOLVES } from "@/lib/profile";
import { getOffer, getProfile, isDefaultOffer, loadSettings, saveProfile } from "@/lib/settings";

type Props = { onSaved?: (profile: BusinessProfile, offer: string) => void };

export default function ProfileForm({ onSaved }: Props) {
  const id = useId();
  const toast = useToast();
  const [profile, setProfile] = useState<BusinessProfile>({});
  const [offer, setOffer] = useState("");
  const [canEdit, setCanEdit] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadSettings().then(() => {
      if (!alive) return;
      setProfile(getProfile());
      setOffer(isDefaultOffer() ? "" : getOffer());
      setReady(true);
    });
    getMe().then((m) => alive && setCanEdit(m.role === "owner" || m.role === "admin")).catch(() => {});
    return () => { alive = false; };
  }, []);

  const set = (patch: BusinessProfile) => setProfile((p) => ({ ...p, ...patch }));
  const solves = profile.solves || [];
  const off = !ready || !canEdit;
  const field = (key: "customers" | "area" | "strengths" | "avoid", label: string, placeholder: string, max = 200) => (
    <label htmlFor={id + key}>{label}
      <input id={id + key} disabled={off} maxLength={max} value={profile[key] || ""} placeholder={placeholder} onChange={(e) => set({ [key]: e.target.value })} />
    </label>
  );

  return (
    <form className="profile-form" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      try {
        await saveProfile(profile, offer.trim());
        toast("Profil bisnis disimpan");
        onSaved?.(profile, offer.trim());
      } catch (err) {
        toast(errMsg(err, "Gagal menyimpan profil"));
      } finally {
        setBusy(false);
      }
    }}>
      <fieldset className="pf-kinds" disabled={off}>
        <legend>Kamu mewakili</legend>
        {KINDS.map(([value, label, hint]) => (
          <label key={value} className={profile.kind === value ? "on" : ""}>
            <input type="radio" name={id + "kind"} checked={profile.kind === value} onChange={() => set({ kind: value })} />
            <span>{label}<small>{hint}</small></span>
          </label>
        ))}
      </fieldset>
      <div className="pf-grid">
        <label htmlFor={id + "name"}>{profile.kind === "perorangan" ? "Nama kamu" : "Nama bisnis"}
          <input id={id + "name"} disabled={off} required maxLength={120} value={profile.name || ""} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label htmlFor={id + "offer"}>Yang kamu tawarkan
          <input id={id + "offer"} disabled={off} required maxLength={300} value={offer} placeholder="mis. bikin website dan katalog online" onChange={(e) => setOffer(e.target.value)} />
        </label>
        {field("customers", "Pelanggan yang dicari", "mis. salon dan kafe milik perorangan")}
        {field("area", "Wilayah layanan", "mis. Jakarta Selatan, bisa online")}
        {field("strengths", "Kelebihan atau bukti", "mis. 12 klien salon, selesai 7 hari", 300)}
        {field("avoid", "Jenis bisnis yang tidak dicari", "pisahkan dengan koma, mis. hewan, klinik")}
      </div>
      <fieldset className="pf-solves" disabled={off}>
        <legend>Masalah yang bisa kamu bantu</legend>
        {SOLVES.map(([value, label]) => (
          <label key={value} className={solves.includes(value) ? "on" : ""}>
            <input type="checkbox" checked={solves.includes(value)} onChange={(e) => set({ solves: e.target.checked ? [...solves, value] : solves.filter((s) => s !== value) })} />
            {label}
          </label>
        ))}
      </fieldset>
      <p className="pf-note">{canEdit ? "Isi yang benar saja. Draf pesan, urutan prospek, dan asisten memakai data ini; yang kosong tidak akan ditebak." : "Hanya owner atau admin yang bisa mengubah profil bisnis."}</p>
      {canEdit && <button className="btn" disabled={off || busy || !hasProfile(profile) || !offer.trim()}>{busy ? "Menyimpan…" : "Simpan profil"}</button>}
    </form>
  );
}
