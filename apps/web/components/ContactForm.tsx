"use client";
import {useEffect,useState} from "react";
import type {FormEvent} from "react";
import {useI18n} from "../i18n/client";
export default function ContactForm({email}:{email?:string}){
  const {t}=useI18n();
  const [opened,setOpened]=useState(false);
  const [reply,setReply]=useState("");
  useEffect(()=>{
    try {
      const saved=sessionStorage.getItem("raqio:reply");
      if(saved) { setReply(saved);sessionStorage.removeItem("raqio:reply"); }
    } catch { /* Storage is optional. */ }
  },[]);
  function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!email)return;
    const f=new FormData(e.currentTarget);
    const body=[t("Nama")+": "+f.get("name"),t("Perusahaan")+": "+f.get("company"),t("Produk")+": "+f.get("product"),t("Kontak")+": "+f.get("reply"),"",String(f.get("message")||"")].join("\n");
    window.location.href="mailto:"+email+"?subject="+encodeURIComponent(t("Permintaan demo RAQIO"))+"&body="+encodeURIComponent(body);
    setOpened(true);
  }
  return <form className="contact-form" onSubmit={submit}>
    <label>{t("Nama")}<input name="name" autoComplete="name" required maxLength={100}/></label>
    <label>{t("Perusahaan")}<input name="company" autoComplete="organization" required maxLength={120}/></label>
    <label>{t("Produk")}<select name="product" required defaultValue=""><option value="" disabled>{t("Pilih produk")}</option><option>Competitor Scraping</option><option>WA-Suite</option><option>{t("Keduanya")}</option></select></label>
    <label>{t("Email atau nomor WhatsApp")}<input name="reply" required maxLength={160} value={reply} onChange={event=>setReply(event.target.value)}/></label>
    <label>{t("Kebutuhan tim")}<textarea name="message" rows={4} maxLength={800}/></label>
    <button className="button button-dark" disabled={!email}>{t("Buka draf email")}</button>
    {!email?<p>{t("Alamat kontak RAQIO belum tersedia.")}</p>:null}
    {opened?<p role="status">{t("Periksa draf di aplikasi email Anda sebelum mengirim.")}</p>:null}
  </form>;
}

export function ContactTeaser(){
  const {t,href}=useI18n();
  function go(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const reply=new FormData(event.currentTarget).get("reply");
    try { if(typeof reply==="string") sessionStorage.setItem("raqio:reply",reply); } catch { /* Storage is optional. */ }
    window.location.assign(href("/kontak"));
  }
  return <form className="contact-teaser" method="post" action={href("/kontak")} onSubmit={go}>
    <label htmlFor="quick-contact">{t("Email atau nomor WhatsApp")}</label>
    <div className="actions"><input id="quick-contact" name="reply" required maxLength={160}/>
    <button className="button button-amber">{t("Lanjut ke kontak")} <span aria-hidden="true">&#8594;</span></button></div>
  </form>;
}
