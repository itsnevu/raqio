"use client";
import {useEffect,useState} from "react";
import type {FormEvent} from "react";
export default function ContactForm({email}:{email?:string}){
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
    const body=["Nama: "+f.get("name"),"Perusahaan: "+f.get("company"),"Produk: "+f.get("product"),"Kontak: "+f.get("reply"),"",String(f.get("message")||"")].join("\n");
    window.location.href="mailto:"+email+"?subject="+encodeURIComponent("Permintaan demo RAQIO")+"&body="+encodeURIComponent(body);
    setOpened(true);
  }
  return <form className="contact-form" onSubmit={submit}>
    <label>Nama<input name="name" autoComplete="name" required maxLength={100}/></label>
    <label>Perusahaan<input name="company" autoComplete="organization" required maxLength={120}/></label>
    <label>Produk<select name="product" required defaultValue=""><option value="" disabled>Pilih produk</option><option>Competitor Scraping</option><option>WA-Suite</option><option>Keduanya</option></select></label>
    <label>Email atau nomor WhatsApp<input name="reply" required maxLength={160} value={reply} onChange={event=>setReply(event.target.value)}/></label>
    <label>Kebutuhan tim<textarea name="message" rows={4} maxLength={800}/></label>
    <button className="button button-dark" disabled={!email}>Buka draf email</button>
    {!email?<p>Alamat kontak RAQIO belum tersedia.</p>:null}
    {opened?<p role="status">Periksa draf di aplikasi email Anda sebelum mengirim.</p>:null}
  </form>;
}

export function ContactTeaser(){
  function go(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const reply=new FormData(event.currentTarget).get("reply");
    try { if(typeof reply==="string") sessionStorage.setItem("raqio:reply",reply); } catch { /* Storage is optional. */ }
    window.location.assign("/kontak");
  }
  return <form className="contact-teaser" method="post" action="/kontak" onSubmit={go}>
    <label htmlFor="quick-contact">Email atau nomor WhatsApp</label>
    <div className="actions"><input id="quick-contact" name="reply" required maxLength={160}/>
    <button className="button button-amber">Lanjut ke kontak <span aria-hidden="true">&#8594;</span></button></div>
  </form>;
}
