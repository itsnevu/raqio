import SitePage from "../../components/SitePage";
import ContactForm from "../../components/ContactForm";
import {contactEmail} from "../../content";
export const metadata={title:"Kontak dan demo"};
export default function ContactPage(){return <SitePage title="Mulai bersama RAQIO." intro="Ceritakan kebutuhan tim Anda untuk membahas produk atau demo.">
  <section className="shell section"><ContactForm email={contactEmail}/></section>
</SitePage>;}
