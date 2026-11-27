// Inner-page content, EN + ID side by side. Sources (no invented stats, customers or events):
//   apps/web/i18n/en.ts (current site copy: products, steps, audiences, FAQ, contact flow)
//   docs/SKOR.md (every score formula, report metrics, data sources, honest limits)
//   docs/ARCHITECTURE.md (security facts), wa-suite feature set (deals, DP reminders, groups, analytics)
export type L = { en: string; id: string };
const t = (en: string, id: string): L => ({ en, id });

export const APP_URL = process.env.NEXT_PUBLIC_SCRAPING_APP_URL || "http://localhost:3002";
/** Single Raqio sign-in (SSO). After login the app opens the agent launcher, which also links to WA-Suite. */
export const LOGIN_URL = `${APP_URL.replace(/\/+$/, "")}/login?next=%2Fpilih-produk`;
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_RAQIO_CONTACT_EMAIL || "";

export type Item = { title: L; body: L; icon?: string };
export type ProductPage = {
  eyebrow: L; title: L; body: L; image: string; imageAlt: L;
  features: Item[]; steps: L[]; extraTitle?: L; extra?: Item[]; audience: Item[]; note: L; other: { label: L; href: string };
};

export const products: Record<"research" | "customerService" | "marketing" | "seo", ProductPage> = {
  research: {
    eyebrow: t("Research Agent", "Research Agent"),
    title: t("See your market map more clearly.", "Lihat peta pasar Anda dengan jelas."),
    body: t("Find players in an industry and area, compare the results, then build a list of prospects worth following up.", "Temukan semua pemain di industri dan wilayah pilihan Anda, bandingkan hasilnya, lalu susun daftar prospek yang layak ditindaklanjuti."),
    image: "/media/blog-market-canal.jpg", imageAlt: t("Aerial view of a market and canal in Jakarta", "Foto udara pasar dan kanal di Jakarta"),
    features: [
      { icon: "area", title: t("Area research", "Riset wilayah"), body: t("Choose an industry and area to see players and business profiles from public sources.", "Pilih industri dan wilayah untuk melihat pemain serta profil bisnis dari sumber publik.") },
      { icon: "compare", title: t("Compare markets", "Bandingkan pasar"), body: t("Review several areas and compare results before choosing your focus.", "Tinjau beberapa wilayah dan bandingkan hasil riset sebelum menentukan fokus.") },
      { icon: "prospects", title: t("Manage prospects", "Kelola prospek"), body: t("Save interesting businesses, check contacts, and track follow-ups on the prospect board.", "Simpan bisnis yang menarik, cek kontak, dan lacak tindak lanjut di papan prospek.") },
      { icon: "monitor", title: t("Monitor changes", "Pantau perubahan"), body: t("Re-research chosen areas regularly to spot new players.", "Riset ulang wilayah pilihan secara berkala untuk melihat pemain baru.") },
    ],
    steps: [t("Choose an industry and area", "Pilih industri dan wilayah"), t("Run the market research", "Jalankan riset pasar"), t("Compare business profiles", "Bandingkan profil bisnis"), t("Save your chosen prospects", "Simpan prospek pilihan")],
    extraTitle: t("What every report tells you.", "Isi setiap laporan."),
    extra: [
      { title: t("Businesses found", "Jumlah bisnis"), body: t("Maps results after cleaning: duplicates merged, permanently closed and out-of-area businesses removed.", "Hasil Maps setelah dibersihkan: duplikat digabung, yang tutup permanen dan di luar wilayah dibuang.") },
      { title: t("Median reviews", "Median ulasan"), body: t("The middle value of review counts. Fairer than an average, because big players do not drag it up.", "Nilai tengah jumlah ulasan. Lebih adil daripada rata-rata karena tidak terdongkrak pemain besar.") },
      { title: t("Top-3 share", "Porsi 3 teratas"), body: t("Share of reviews held by the three busiest businesses. 50% or more means the market is dominated.", "Persentase ulasan yang dikuasai 3 bisnis teramai. 50% atau lebih berarti pasar dikuasai pemain besar.") },
      { title: t("Digital maturity", "Kematangan digital"), body: t("Share of checked businesses with a website, Instagram and WhatsApp.", "Persentase bisnis yang sudah dicek dan punya website, Instagram, serta WhatsApp.") },
      { title: t("Hidden gems", "Hidden gem"), body: t("Rated 4.7 or higher with 15 to 299 reviews: loved by customers, not big yet.", "Rating 4,7 ke atas dengan 15–299 ulasan: disukai pelanggan, tapi belum besar.") },
      { title: t("Fragile players", "Pemain rapuh"), body: t("Rated under 4.3 with 150 reviews or more: busy, but customers are disappointed.", "Rating di bawah 4,3 dengan 150 ulasan ke atas: ramai, tapi pelanggannya kecewa.") },
    ],
    audience: [
      { title: t("Small business owners", "Pemilik UMKM"), body: t("See who sells similar products around your store.", "Cek siapa saja yang menjual produk sejenis di sekitar toko Anda.") },
      { title: t("Sales teams", "Tim penjualan"), body: t("Build a list of businesses in target areas for your team to contact.", "Susun daftar bisnis di wilayah target untuk dihubungi tim.") },
      { title: t("Research agencies", "Agensi riset"), body: t("Compare players across areas for client research.", "Bandingkan pemain di beberapa wilayah untuk riset klien.") },
      { title: t("Branch expansion", "Ekspansi cabang"), body: t("Check similar businesses around a potential branch location.", "Cek profil bisnis sejenis di sekitar calon lokasi cabang.") },
    ],
    note: t("Research Agent uses public data sources. Availability depends on the industry and area.", "Research Agent menggunakan sumber data publik. Ketersediaan data bergantung pada industri dan wilayah."),
    other: { label: t("Also explore SEO Agent", "Kenali juga SEO Agent"), href: "/agents/seo" },
  },
  customerService: {
    eyebrow: t("Customer Service Agent", "Customer Service Agent"),
    title: t("One inbox for every customer conversation.", "Satu dashboard untuk semua chat pelanggan."),
    body: t("Manage multiple WhatsApp Business numbers, assign agents, and use templates to answer recurring questions.", "Kelola beberapa nomor WhatsApp Business sekaligus, bagi chat ke setiap agen, dan jawab pertanyaan yang berulang dengan template."),
    image: "/media/blog-bakery-phone.jpg", imageAlt: t("A bakery owner answering a customer on the phone", "Pemilik toko kue membalas pelanggan lewat telepon"),
    features: [
      { icon: "inbox", title: t("Multi-number inbox", "Banyak nomor, satu dashboard"), body: t("Connect WhatsApp Business numbers as separate sessions and follow their conversations from the dashboard.", "Tautkan setiap nomor WhatsApp Business sebagai sesi terpisah dan pantau semua chatnya dari satu dashboard.") },
      { icon: "assign", title: t("Agent assignment", "Pembagian chat ke agen"), body: t("Decide who is responsible for each customer conversation.", "Tentukan siapa yang menangani setiap chat pelanggan.") },
      { icon: "templates", title: t("Templates and labels", "Template dan label"), body: t("Save common answers and tag conversations so they are easier to follow up.", "Simpan jawaban yang sering dipakai dan beri label pada chat supaya mudah ditindaklanjuti.") },
      { icon: "rules", title: t("Reply rules", "Aturan balasan"), body: t("Define message patterns and responses for recurring needs.", "Atur balasan untuk pola pesan yang sering muncul.") },
    ],
    steps: [t("A customer chat arrives", "Chat pelanggan masuk"), t("An agent takes the conversation", "Agen mengambil alih chat"), t("The agent replies with a template", "Agen membalas dengan template"), t("The conversation is marked done", "Chat ditandai selesai")],
    extraTitle: t("From conversation to closed deal.", "Dari chat pertama sampai deal closing."),
    extra: [
      { title: t("Deals and down-payment reminders", "Deal dan pengingat DP"), body: t("Track each deal from a chat and send down-payment reminders on time. Reminders skip group chats.", "Lacak setiap deal dari chat asalnya dan kirim pengingat DP tepat waktu. Pengingat tidak pernah dikirim ke grup.") },
      { title: t("Group chat support", "Chat grup"), body: t("Group conversations are recognised and handled separately from one-to-one chats.", "Percakapan grup dikenali dan ditangani terpisah dari chat pribadi.") },
      { title: t("Deal analytics", "Analitik deal"), body: t("Opening hours per day and holidays, chats left unanswered for 4 operating hours, and cash in.", "Jam operasional per hari, hari libur, chat yang 4 jam operasional belum dibalas, dan kas masuk.") },
      { title: t("Session health", "Status koneksi nomor"), body: t("See when a linked number disconnects, so no conversation is silently lost.", "Langsung terlihat saat nomor tertaut terputus, jadi tidak ada chat yang hilang tanpa disadari.") },
    ],
    audience: [
      { title: t("Customer service", "Layanan pelanggan"), body: t("Assign conversations to agents so every customer has someone to help.", "Bagi chat ke agen supaya setiap pelanggan pasti dilayani.") },
      { title: t("Sales teams", "Tim penjualan"), body: t("Label potential buyers and keep the conversation going.", "Beri label pada calon pembeli dan lanjutkan percakapannya.") },
      { title: t("Online stores", "Toko online"), body: t("Answer frequent questions with templates.", "Balas pertanyaan yang sering muncul dengan template.") },
      { title: t("Multi-branch businesses", "Bisnis multi-cabang"), body: t("Manage each branch's number from one dashboard.", "Kelola nomor tiap cabang dari satu dashboard.") },
    ],
    note: t("Connecting a number requires a WhatsApp Business account and access to the owner's device.", "Penautan nomor memerlukan akun WhatsApp Business dan akses ke perangkat pemilik nomor."),
    other: { label: t("Also explore Research Agent", "Kenali juga Research Agent"), href: "/agents/research" },
  },
  marketing: {
    eyebrow: t("Marketing Agent", "Marketing Agent"),
    title: t("Turn research into conversations.", "Ubah hasil riset jadi percakapan dengan calon pelanggan."),
    body: t("Pick prospects from your board. The Marketing Agent writes a personal message for each one, sends it on WhatsApp, Instagram or email, and keeps watch on your competitors.", "Pilih prospek dari papan prospek. Marketing Agent menulis pesan personal untuk setiap prospek, mengirimnya lewat WhatsApp, Instagram, atau email, sekaligus terus memantau pesaing Anda."),
    image: "/media/blog-boutique.jpg", imageAlt: t("A shop owner working on her phone and laptop", "Pemilik toko bekerja dengan ponsel dan laptop"),
    features: [
      { icon: "prospects", title: t("Campaigns from prospects", "Kampanye dari prospek"), body: t("Select prospects by score, area, industry or status, straight from the prospect board.", "Pilih prospek berdasarkan skor, wilayah, industri, atau status, langsung dari papan prospek.") },
      { icon: "templates", title: t("Personal messages", "Pesan personal"), body: t("Templates fill in each business's name, area, gap, rating and reviews, so every message reads as written for them.", "Template otomatis mengisi nama, wilayah, celah, rating, dan jumlah ulasan setiap bisnis, sehingga setiap pesan terasa ditulis khusus untuk mereka.") },
      { icon: "reach", title: t("Three channels", "Tiga saluran"), body: t("WhatsApp (automatic through a gateway or one click), Instagram (copy and open profile) and email. Unsubscribes are always respected.", "WhatsApp (otomatis lewat gateway atau sekali klik), Instagram (salin pesan lalu buka profil), dan email. Permintaan berhenti menerima pesan selalu dipatuhi.") },
      { icon: "monitor", title: t("Competitor alerts", "Peringatan pesaing"), body: t("When a competitor closes or its rating drops, you hear about it by email, Telegram or webhook.", "Saat pesaing tutup atau ratingnya turun, Anda diberi tahu lewat email, Telegram, atau webhook.") },
    ],
    steps: [t("Choose prospects", "Pilih prospek"), t("Pick a message template", "Pilih template pesan"), t("Send on your channel", "Kirim lewat saluran Anda"), t("Track who was contacted", "Lacak siapa yang sudah dihubungi")],
    extraTitle: t("What else it watches.", "Yang juga dipantau."),
    extra: [
      { title: t("Instagram analysis", "Analisis Instagram"), body: t("Profile summaries for up to five accounts at a time.", "Ringkasan profil hingga 5 akun sekaligus.") },
      { title: t("YouTube competitors", "Pesaing di YouTube"), body: t("Channel statistics of competitors through the YouTube Data API.", "Statistik channel pesaing lewat YouTube Data API.") },
      { title: t("Daily lead digest", "Ringkasan lead harian"), body: t("Every morning at 08:00 WIB: the prospects due for a follow-up today.", "Setiap pagi pukul 08.00 WIB: daftar prospek yang jadwal tindak lanjutnya jatuh hari ini.") },
      { title: t("Personal audit link", "Tautan audit personal"), body: t("Each message can carry a page showing that business's position among its nearest competitors.", "Setiap pesan bisa menyertakan halaman yang menunjukkan posisi bisnis tersebut di antara pesaing terdekatnya.") },
    ],
    audience: [
      { title: t("Agencies", "Agensi"), body: t("Find clients with gaps your service can fill, then assign them to your team.", "Temukan calon klien yang punya celah sesuai jasa Anda, lalu bagi ke anggota tim.") },
      { title: t("Sales teams", "Tim penjualan"), body: t("Build lists by area and track who has been contacted.", "Susun daftar per wilayah dan pantau mana yang sudah dihubungi.") },
      { title: t("Freelancers", "Freelancer"), body: t("Write one service profile and get message drafts ready to edit.", "Cukup tulis satu profil jasa, lalu dapatkan draf pesan yang siap diedit.") },
      { title: t("Small business owners", "Pemilik UMKM"), body: t("Keep an eye on the competitors around you.", "Pantau pesaing di sekitar Anda.") },
    ],
    note: t("Automatic WhatsApp sending needs a connected gateway; Instagram messages are sent manually.", "Pengiriman WhatsApp otomatis memerlukan gateway yang tersambung; pesan Instagram dikirim manual."),
    other: { label: t("Also explore Customer Service Agent", "Kenali juga Customer Service Agent"), href: "/agents/customer-service" },
  },
  seo: {
    eyebrow: t("SEO Agent", "SEO Agent"),
    title: t("Be the business customers find first.", "Jadilah bisnis yang pertama ditemukan pelanggan."),
    body: t("See how visible you are in local search next to nearby competitors, close the gaps, and show your public ranking on your own website.", "Ukur visibilitas bisnis Anda di pencarian lokal dibanding pesaing terdekat, perbaiki celahnya, lalu tampilkan peringkat publik di website Anda sendiri."),
    image: "/media/blog-jakarta-aerial.jpg", imageAlt: t("Jakarta skyline at sunset", "Kota Jakarta saat senja"),
    features: [
      { icon: "area", title: t("Local visibility audit", "Audit visibilitas lokal"), body: t("Rating, reviews, website, Instagram and WhatsApp, compared with the businesses nearest to you.", "Rating, jumlah ulasan, website, Instagram, dan WhatsApp Anda, dibandingkan dengan bisnis terdekat.") },
      { icon: "compare", title: t("Public rankings", "Peringkat publik"), body: t("Rankings per industry and area with an open formula: every component is shown so it can be checked.", "Peringkat per industri dan wilayah dengan rumus terbuka: setiap komponen ditampilkan supaya bisa dicek.") },
      { icon: "key", title: t("Website badge", "Lencana website"), body: t("An SVG badge with your rank and score for your own site, always computed from the latest report.", "Lencana SVG berisi peringkat dan skor untuk website Anda, selalu dihitung dari laporan terbaru.") },
      { icon: "research", title: t("Gap list", "Daftar celah"), body: t("Missing website, Instagram not found, too few reviews: the fixes that move you up, in order.", "Belum punya website, Instagram tidak ditemukan, ulasan masih sedikit: daftar perbaikan untuk menaikkan posisi Anda, disusun berurutan.") },
    ],
    steps: [t("Choose your industry and area", "Pilih industri dan wilayah"), t("See your position", "Lihat posisi Anda"), t("Close the gaps", "Perbaiki celahnya"), t("Add your badge", "Pasang lencana Anda")],
    extraTitle: t("How the ranking stays fair.", "Cara kami menjaga peringkat tetap adil."),
    extra: [
      { title: t("60 · 25 · 15", "60 · 25 · 15"), body: t("Quality (Bayesian rating), scale (logarithmic reviews) and reach (website, Instagram, WhatsApp).", "Kualitas (rating Bayesian), skala (ulasan logaritmik), dan jangkauan (website, Instagram, WhatsApp).") },
      { title: t("Spike detection", "Deteksi lonjakan"), body: t("Unusual review jumps are flagged and left out until the next scan.", "Lonjakan ulasan tidak wajar ditandai dan tidak ikut peringkat sampai pemindaian berikutnya.") },
      { title: t("One brand, one row", "Satu brand, satu baris"), body: t("Branches of the same brand in one area are shown once.", "Cabang dari brand yang sama di satu wilayah hanya ditampilkan sekali.") },
      { title: t("Re-scans", "Pindai ulang"), body: t("Monitoring re-runs your area on a schedule so your position stays current.", "Wilayah Anda dipindai ulang sesuai jadwal supaya posisi selalu terbaru.") },
    ],
    audience: [
      { title: t("Local businesses", "Bisnis lokal"), body: t("Know what to fix first to be found on Maps.", "Ketahui apa yang perlu diperbaiki lebih dulu agar mudah ditemukan di Maps.") },
      { title: t("Agencies", "Agensi"), body: t("Show prospects their position with a shareable audit page.", "Tunjukkan posisi prospek lewat halaman audit yang bisa dibagikan.") },
      { title: t("Multi-branch businesses", "Bisnis multi-cabang"), body: t("Compare each branch against the competitors around it.", "Bandingkan setiap cabang dengan pesaing di sekitarnya.") },
      { title: t("Marketing teams", "Tim marketing"), body: t("Track local visibility next to your campaigns.", "Pantau visibilitas lokal sambil menjalankan kampanye.") },
    ],
    note: t("Rankings use public Google Maps data and are always per industry and area.", "Peringkat memakai data publik Google Maps dan selalu dihitung per industri dan wilayah."),
    other: { label: t("Also explore Marketing Agent", "Kenali juga Marketing Agent"), href: "/agents/marketing" },
  },
};

// ── Solutions: one template, eight pages. Each maps real product capabilities to the segment's work. ──
export type Solution = { title: L; body: L; image: string; research: L; reach: L; close: L; steps: L[] };
export const solutions: Record<string, Solution> = {
  clinics: { image: "/media/sol-clinics.jpg",
    title: t("Clinics: know every clinic around you.", "Klinik: kenali setiap klinik di sekitar Anda."),
    body: t("Map clinics in your area, see who customers rate well, and answer every booking chat from one inbox.", "Petakan klinik di wilayah Anda, lihat mana yang dinilai baik oleh pasien, dan balas setiap chat booking dari satu dashboard."),
    research: t("Compare clinics by corrected rating and review count, not by a 5.0 from six reviews.", "Bandingkan klinik berdasarkan rating terkoreksi dan jumlah ulasan, bukan rating 5,0 dari 6 ulasan."),
    reach: t("Booking questions on several numbers land in one team inbox with clear owners.", "Pertanyaan booking dari beberapa nomor masuk ke satu dashboard tim, masing-masing dengan penanggung jawab yang jelas."),
    close: t("Down-payment reminders go out on time; analytics show chats left unanswered.", "Pengingat DP terkirim tepat waktu, dan analitik menunjukkan chat yang belum dibalas."),
    steps: [t("Research clinics in your area", "Riset klinik di wilayah Anda"), t("Find gaps competitors leave open", "Temukan celah yang dibiarkan pesaing"), t("Answer booking chats as a team", "Jawab chat booking bersama tim"), t("Remind patients about down payments", "Ingatkan pasien soal DP")] },
  fnb: { image: "/media/sol-fnb.jpg",
    title: t("Food & beverage: choose where to open with data.", "Kuliner: tentukan lokasi usaha berdasarkan data."),
    body: t("See every café and restaurant in an area, how crowded the market is, and who is loved but still small.", "Lihat semua kafe dan restoran di satu wilayah, seberapa padat pasarnya, dan siapa yang disukai pelanggan tapi masih kecil."),
    research: t("Top-3 share tells you whether a few players dominate; hidden gems show what customers love.", "Porsi 3 teratas menunjukkan apakah pasar dikuasai segelintir pemain, sedangkan hidden gem menunjukkan apa yang disukai pelanggan."),
    reach: t("Orders and reservations from WhatsApp are shared across the team, with templates for the menu.", "Pesanan dan reservasi dari WhatsApp dibagi ke tim, lengkap dengan template untuk menu."),
    close: t("Track catering deals and down payments from the same chat.", "Lacak deal katering dan DP dari chat yang sama."),
    steps: [t("Compare candidate areas", "Bandingkan calon wilayah"), t("Read the competitor map", "Baca peta kompetitor"), t("Open with a clear position", "Buka dengan posisi yang jelas"), t("Serve orders from one inbox", "Layani pesanan dari satu dashboard")] },
  property: { image: "/media/sol-property.jpg",
    title: t("Property: route every enquiry to the right agent.", "Properti: arahkan setiap pertanyaan ke agen yang tepat."),
    body: t("Listing enquiries arrive on WhatsApp at all hours. Raqio puts them in one inbox, assigns them, and keeps the follow-up visible.", "Pertanyaan listing masuk lewat WhatsApp kapan saja. Raqio mengumpulkannya di satu dashboard, membaginya ke agen, dan memastikan setiap tindak lanjut terpantau."),
    research: t("Research agencies and developers in a target area before you open a new office.", "Riset agensi dan developer di wilayah target sebelum membuka kantor baru."),
    reach: t("Assign enquiries per agent and per number; labels mark serious buyers.", "Bagi pertanyaan per agen dan per nomor, lalu beri label pada pembeli yang serius."),
    close: t("Down-payment reminders and deal tracking keep a booking from going cold.", "Pengingat DP dan pelacakan deal menjaga calon pembeli tidak keburu mundur."),
    steps: [t("Connect each agent's number", "Tautkan nomor setiap agen"), t("Assign incoming enquiries", "Bagi pertanyaan yang masuk"), t("Label serious buyers", "Tandai pembeli serius"), t("Track deals to the down payment", "Lacak deal sampai DP")] },
  education: { image: "/media/sol-education.jpg",
    title: t("Education: answer parents before intake closes.", "Pendidikan: jawab orang tua sebelum pendaftaran ditutup."),
    body: t("Courses and schools get the same questions every intake. Templates answer them; reminders handle the down payments.", "Kursus dan sekolah menerima pertanyaan yang sama setiap musim pendaftaran. Template menjawabnya, pengingat mengurus DP-nya."),
    research: t("See other courses in your area and how parents rate them.", "Lihat kursus lain di wilayah Anda dan bagaimana orang tua menilainya."),
    reach: t("Templates for fees, schedules and requirements, shared across admin staff.", "Template untuk biaya, jadwal, dan syarat pendaftaran, dipakai bersama oleh staf admin."),
    close: t("Down-payment reminders before the intake deadline.", "Pengingat DP sebelum batas pendaftaran."),
    steps: [t("Map courses near you", "Petakan kursus di sekitar Anda"), t("Prepare answer templates", "Siapkan template jawaban"), t("Share the inbox with admin staff", "Bagikan dashboard ke staf admin"), t("Remind parents about down payments", "Ingatkan orang tua soal DP")] },
  retail: { image: "/media/sol-retail.jpg",
    title: t("Retail: watch the shops around you.", "Ritel: pantau toko di sekitar Anda."),
    body: t("Know who sells what near your store, re-research the area regularly, and see new players as they appear.", "Ketahui siapa menjual apa di dekat toko Anda, riset ulang wilayah secara berkala, dan lihat pemain baru begitu muncul."),
    research: t("Monitoring re-runs your area on a schedule and shows what changed.", "Riset wilayah dijalankan ulang sesuai jadwal, dan setiap perubahannya langsung terlihat."),
    reach: t("Customer questions on stock and prices answered from one inbox.", "Pertanyaan pelanggan soal stok dan harga dijawab dari satu dashboard."),
    close: t("Labels and deals keep bulk orders on track.", "Label dan deal menjaga pesanan grosir tetap terpantau."),
    steps: [t("Research your area", "Riset wilayah Anda"), t("Set up monitoring", "Atur pemantauan"), t("Spot new players", "Lihat pemain baru"), t("Answer customers as a team", "Jawab pelanggan bersama tim")] },
  sales: { image: "/media/sol-sales.jpg",
    title: t("Sales teams: a list worth calling.", "Tim penjualan: daftar prospek yang layak dihubungi."),
    body: t("Raqio ranks businesses by how worth contacting they are, with the reason shown, so the team starts with the best leads.", "Raqio mengurutkan bisnis dari yang paling layak dihubungi, lengkap dengan alasannya, sehingga tim mulai dari prospek terbaik."),
    research: t("The prospect score rewards reachable, healthy businesses with digital gaps; 40 and above counts as a prospect.", "Skor prospek memberi nilai tinggi pada bisnis sehat yang bisa dihubungi dan punya celah digital. Skor 40 ke atas dihitung sebagai prospek."),
    reach: t("Draft messages from one service profile, then continue in the shared inbox.", "Buat draf pesan dari satu profil jasa, lalu lanjutkan percakapannya di dashboard tim."),
    close: t("Track who was contacted and which deals are moving.", "Lacak siapa yang sudah dihubungi dan deal mana yang berjalan."),
    steps: [t("Pick an industry and area", "Pilih industri dan wilayah"), t("Sort by prospect score", "Urutkan dari skor prospek"), t("Divide the list across the team", "Bagi daftar ke anggota tim"), t("Follow up from one inbox", "Tindak lanjuti dari satu dashboard")] },
  "customer-service": { image: "/media/sol-customer-service.jpg",
    title: t("Customer service: no chat left waiting.", "Layanan pelanggan: tidak ada chat yang dibiarkan menunggu."),
    body: t("Every conversation has an owner, recurring questions have templates, and analytics show what was left unanswered.", "Setiap chat punya penanggung jawab, pertanyaan berulang punya template, dan analitik menunjukkan chat mana yang belum dibalas."),
    research: t("See how competitors are rated for service in their reviews.", "Lihat bagaimana pesaing dinilai soal layanan di ulasan mereka."),
    reach: t("Assignment and templates across several WhatsApp Business numbers.", "Penugasan dan template di beberapa nomor WhatsApp Business."),
    close: t("Unanswered-chat analytics count only operating hours, per day and around holidays.", "Analitik chat tak terjawab hanya menghitung jam operasional, diatur per hari, dan memperhitungkan hari libur."),
    steps: [t("Connect your numbers", "Tautkan nomor Anda"), t("Assign conversations", "Bagi chat ke agen"), t("Reply with templates", "Balas dengan template"), t("Review unanswered chats", "Tinjau chat yang belum dibalas")] },
  owners: { image: "/media/sol-owners.jpg",
    title: t("Owners: the market and the team, in one view.", "Pemilik usaha: pasar dan tim, dalam satu tampilan."),
    body: t("See how your area is changing and how your team is handling customers, without asking for a report.", "Lihat bagaimana wilayah Anda berubah dan bagaimana tim menangani pelanggan, tanpa harus meminta laporan."),
    research: t("A report per area: who leads, who is growing, who is fragile.", "Laporan per wilayah: siapa memimpin, siapa tumbuh, siapa rapuh."),
    reach: t("One dashboard for every branch number.", "Satu dashboard untuk nomor semua cabang."),
    close: t("Deal analytics with cash in and unanswered chats.", "Analitik deal dengan kas masuk dan chat tak terjawab."),
    steps: [t("Research your area", "Riset wilayah Anda"), t("Connect branch numbers", "Tautkan nomor cabang"), t("Let the team work the inbox", "Tim bekerja dari satu dashboard"), t("Read the analytics", "Baca analitiknya")] },
};

// ── Articles (guides, blog, research). Blocks keep the format simple and honest. ──
export type Block = { h?: L; p?: L; list?: L[]; table?: { head: L[]; rows: L[][] }; code?: string; note?: L };
export type Article = { kind: "guide" | "blog" | "research"; title: L; lead: L; image?: string; blocks: Block[] };

export const articles: Record<string, Article> = {
  // research
  "research/scoring": { kind: "research", title: t("How we score", "Cara kami menghitung skor"), lead: t("Every number in Raqio is a fixed formula on public Google Maps data plus a contact check. Nothing is made up, and every component can be checked.", "Setiap angka di Raqio dihitung dengan rumus tetap dari data publik Google Maps dan hasil cek kontak. Tidak ada angka yang dikarang, dan setiap komponennya bisa diperiksa."),
    blocks: [
      { h: t("Prospect score (0 to 100)", "Skor prospek (0 sampai 100)"), p: t("How worth contacting a business is for an offer of digital services, not how good the business is. Calculated only after a contact check; points are added, then clipped to 0–100.", "Mengukur seberapa layak sebuah bisnis ditawari jasa digital, bukan seberapa bagus bisnisnya. Dihitung setelah cek kontak: semua poin dijumlahkan, lalu dibatasi di rentang 0–100.") },
      { table: { head: [t("Condition", "Kondisi"), t("Points", "Poin")], rows: [
        [t("Has a WhatsApp-capable number", "Punya nomor yang bisa WhatsApp"), t("+25", "+25")], [t("Has a phone, not a mobile number", "Punya telepon kantor (bukan HP)"), t("+10", "+10")], [t("Has an email", "Punya email"), t("+5", "+5")],
        [t("No website", "Tidak punya website"), t("+20", "+20")], [t("Instagram not found", "Instagram tidak ditemukan"), t("+15", "+15")], [t("Rating 4.5 or higher", "Rating 4,5 ke atas"), t("+15", "+15")], [t("Rating 4.0 to 4.4", "Rating 4,0 sampai 4,4"), t("+8", "+8")],
        [t("30 to 800 reviews", "Ulasan 30 sampai 800"), t("+15", "+15")], [t("Under 30 reviews", "Ulasan di bawah 30"), t("+5", "+5")], [t("Reviews growing", "Ulasan bertambah"), t("+5", "+5")],
        [t("More than one branch in the area", "Lebih dari satu cabang di wilayah"), t("−25", "−25")], [t("Over 800 reviews (big player)", "Ulasan di atas 800 (pemain besar)"), t("−40", "−40")], [t("No contact at all", "Tidak ada kontak sama sekali"), t("max 20", "maks 20")],
      ] } },
      { p: t("Example: a café rated 4.6 with 120 reviews, reachable on WhatsApp, no website, no Instagram, one branch: 25 + 20 + 15 + 15 + 15 = 90. A business scoring 40 or more counts as a prospect.", "Contoh: kafe dengan rating 4,6 dan 120 ulasan, punya WhatsApp, belum punya website, Instagram tidak ditemukan, dan hanya satu cabang: 25 + 20 + 15 + 15 + 15 = 90. Bisnis dengan skor 40 ke atas dihitung sebagai prospek.") },
      { h: t("Strength score (Bayesian average)", "Skor kekuatan (rata-rata Bayesian)"), p: t("Who is strongest in this market, without being fooled by a 5.0 from six reviews. The fewer reviews, the more the score is pulled toward the market average.", "Menunjukkan siapa yang paling kuat di pasar tanpa tertipu rating 5,0 dari 6 ulasan. Semakin sedikit ulasannya, semakin dekat skornya ke rata-rata pasar."),
        code: "score = (v / (v + m)) × R + (m / (v + m)) × C\nR = business rating, v = its review count\nC = average rating of the market, m = median review count (min. 10)" },
      { p: t("With C = 4.5 and m = 80, a 5.0 with 6 reviews becomes 4.53, while a 4.7 with 1,200 reviews becomes 4.69. The second business really is stronger, and the formula shows it.", "Dengan C = 4,5 dan m = 80, rating 5,0 dari 6 ulasan menjadi 4,53, sedangkan rating 4,7 dari 1.200 ulasan menjadi 4,69. Bisnis kedua memang lebih kuat, dan rumus ini membuktikannya.") },
    ] },
  "research/benchmarks": { kind: "research", title: t("Public ranking score", "Skor peringkat publik"), lead: t("Who customers rate best, fairly: not who is oldest or biggest. Rankings are always per industry and per area.", "Siapa yang terbaik menurut pelanggan, secara adil: bukan siapa yang paling lama atau paling besar. Peringkat selalu per industri dan per wilayah."),
    blocks: [
      { code: "Score = 60 × quality + 25 × scale + 15 × reach\nquality = (Bayesian strength − 1) / 4\nscale   = log10(1 + reviews) / log10(1 + most reviews in area)\nreach   = (website + Instagram + WhatsApp) / 3" },
      { list: [t("Quality 60%: customer judgement matters most, through the Bayesian average.", "Kualitas 60%: penilaian pelanggan paling menentukan, lewat rata-rata Bayesian."), t("Scale 25%, logarithmic: 5,000 reviews must not be worth ten times 500.", "Skala 25%, logaritmik: 5.000 ulasan tidak dihitung sepuluh kali lipat 500 ulasan."), t("Reach 15%: businesses that can be found and contacted are more useful, but this never decides alone.", "Jangkauan 15%: bisnis yang mudah ditemukan dan dihubungi bernilai lebih, tapi faktor ini tidak pernah jadi penentu tunggal.")] },
      { table: { head: [t("Business", "Bisnis"), t("Rating", "Rating"), t("Reviews", "Ulasan"), t("Score", "Skor")], rows: [[t("A", "A"), t("4.8", "4,8"), t("1,200", "1.200"), t("95", "95")], [t("B", "B"), t("4.9", "4,9"), t("40", "40"), t("77", "77")], [t("C", "C"), t("4.2", "4,2"), t("2,000", "2.000"), t("88", "88")]] } },
      { note: t("Worked example from our scoring documentation: area with at most 2,000 reviews and a market average of 4.5. C is busy but its rating dropped, so it sits below A; B is loved but small, so it lands in the middle as a hidden gem.", "Contoh hitungan dari dokumentasi skor kami: wilayah dengan ulasan terbanyak 2.000 dan rata-rata pasar 4,5. C ramai tapi ratingnya turun, jadi berada di bawah A. B sangat disukai tapi masih kecil, jadi berada di tengah dan masuk kategori hidden gem.") },
      { h: t("Rules on the ranking page", "Aturan di halaman peringkat"), list: [t("Branches of one brand in the same area are shown once.", "Cabang satu brand di wilayah yang sama ditampilkan sekali."), t("Unusual review spikes (over 50% in a week, on businesses with 100+ reviews) are flagged and left out until the next scan.", "Lonjakan ulasan tidak wajar (lebih dari 50% dalam seminggu, pada bisnis dengan 100+ ulasan) ditandai dan tidak ikut peringkat sampai pemindaian berikutnya."), t("Every component is shown per row so it can be verified.", "Setiap komponen ditampilkan per baris supaya bisa diverifikasi.")] },
    ] },
  "research/sources": { kind: "research", title: t("Data sources", "Sumber data"), lead: t("Business lists, ratings and review counts always come from Google Maps. Other open sources only fill gaps, and every addition is recorded per business.", "Daftar bisnis, rating, dan jumlah ulasan selalu dari Google Maps. Sumber terbuka lain hanya melengkapi, dan setiap tambahan dicatat per bisnis."),
    blocks: [
      { h: t("Where the data comes from", "Asal data"), list: [t("Google Maps listings: name, category, rating, review count, address.", "Listing Google Maps: nama, kategori, rating, jumlah ulasan, alamat."), t("Contact check: phone, website, Instagram, email.", "Cek kontak: telepon, website, Instagram, email."), t("Open sources (Overture Maps, OpenStreetMap, TomTom) to complete or add businesses.", "Sumber terbuka (Overture Maps, OpenStreetMap, TomTom) untuk melengkapi atau menambah bisnis.")] },
      { h: t("Completing and adding", "Melengkapi dan menambah"), p: t("A Maps business that matches another record (same mobile number, website or Instagram, or within 400 m with a similar name) gets its missing contacts. A business missing from Maps is only added if its category is relevant, it is not closed, confidence is at least 0.5, it has a contact, and its website is live when checked. It is never ranked, because it has no rating.", "Bisnis di Maps yang cocok dengan data dari sumber lain (nomor HP, website, atau Instagram yang sama, atau berjarak ≤ 400 m dengan nama mirip) dilengkapi kontaknya yang masih kosong. Bisnis yang tidak ada di Maps hanya ditambahkan bila kategorinya relevan, masih buka, tingkat keyakinannya minimal 0,5, punya kontak, dan website-nya aktif saat dicek. Bisnis seperti ini tidak pernah ikut peringkat karena tidak punya rating.") },
      { h: t("Cleaning", "Pembersihan"), p: t("Duplicates are merged, permanently closed businesses removed, and out-of-area or irrelevant categories dropped. The raw count stays visible under data quality.", "Duplikat digabung, bisnis yang tutup permanen dibuang, begitu juga bisnis di luar wilayah atau berkategori tidak relevan. Angka mentahnya tetap bisa dilihat di bagian kualitas data.") },
    ] },
  "research/samples": { kind: "research", title: t("Report samples", "Contoh laporan"), lead: t("What a market report contains, section by section. The figures below are illustrative, not from a real scan.", "Isi sebuah laporan pasar, bagian demi bagian. Angka di bawah adalah ilustrasi, bukan hasil pemindaian nyata."),
    blocks: [
      { h: t("Summary", "Ringkasan"), table: { head: [t("Metric", "Metrik"), t("Meaning", "Arti")], rows: [[t("Businesses found", "Jumlah bisnis"), t("Cleaned Maps results", "Hasil Maps setelah dibersihkan")], [t("Average rating", "Rating rata-rata"), t("Simple average of rated businesses", "Rata-rata sederhana bisnis yang punya rating")], [t("Median reviews", "Median ulasan"), t("Middle value of review counts", "Nilai tengah jumlah ulasan")], [t("Top-3 share", "Porsi 3 teratas"), t("Reviews held by the three busiest", "Ulasan yang dipegang 3 teramai")], [t("Digital maturity", "Kematangan digital"), t("Website, Instagram and WhatsApp coverage, from N checked", "Cakupan website, Instagram, WhatsApp, dari N yang dicek")]] } },
      { h: t("Highlights", "Sorotan"), list: [t("Market leaders by strength score.", "Pemimpin pasar menurut skor kekuatan."), t("Hidden gems: 4.7+ with 15–299 reviews.", "Hidden gem: 4,7+ dengan 15–299 ulasan."), t("Fragile players: under 4.3 with 150+ reviews.", "Pemain rapuh: di bawah 4,3 dengan 150+ ulasan."), t("Growing: reviews increased between two scans.", "Sedang tumbuh: ulasan bertambah di antara dua pemindaian.")] },
      { h: t("Prospects tab", "Tab prospek"), p: t("Every business with a prospect score of 40 or more, sorted, with the reasons shown next to the score.", "Setiap bisnis dengan skor prospek 40 ke atas, berurutan, dengan alasan ditampilkan di samping skornya.") },
    ] },
  "research/accuracy": { kind: "research", title: t("Accuracy notes", "Batasan data kami"), lead: t("What our numbers can and cannot tell you.", "Apa yang bisa dan tidak bisa disimpulkan dari angka kami."),
    blocks: [
      { list: [t("Data comes from Google Maps at the time of the scan; a new scan can change the numbers.", "Data berasal dari Google Maps saat dipindai; pemindaian ulang bisa mengubah angka."), t("Ratings and review counts are Google's figures, not Raqio's. We cannot detect fake reviews, only flag unusual spikes.", "Rating dan jumlah ulasan adalah angka Google, bukan Raqio. Kami tidak bisa mendeteksi ulasan palsu, hanya menandai lonjakan tidak wajar."), t("Digital maturity is only as accurate as the sample that was contact-checked.", "Kematangan digital hanya seakurat sampel yang sudah dicek kontaknya."), t("The prospect score is an opinion for selling digital services, not a judgement of business quality.", "Skor prospek adalah penilaian untuk keperluan menjual jasa digital, bukan penilaian kualitas bisnis."), t("Coverage depends on the area and on which sources are available.", "Cakupan bergantung pada wilayah dan sumber yang tersedia.")] },
    ] },
  // guides
  "guides/competitor-map": { kind: "guide", image: "/media/blog-jakarta-aerial.jpg", title: t("Reading a competitor map in ten minutes", "Cara membaca peta kompetitor dalam 10 menit"), lead: t("A market report answers four questions. Read them in this order.", "Setiap laporan pasar menjawab empat pertanyaan. Baca dengan urutan berikut."),
    blocks: [
      { h: t("1. How crowded is it?", "1. Seberapa padat pasarnya?"), p: t("Start with businesses found and total reviews. Then check the top-3 share: 50% or more means a few players dominate, under 30% means competition is spread out.", "Mulai dari jumlah bisnis dan total ulasan. Lalu cek porsi 3 teratas: 50% ke atas berarti segelintir pemain menguasai, di bawah 30% berarti persaingan merata.") },
      { h: t("2. Who really leads?", "2. Siapa yang benar-benar memimpin?"), p: t("Sort by strength score, not by star rating. It corrects ratings with few reviews toward the market average.", "Urutkan dari skor kekuatan, bukan dari bintang. Skor ini mengoreksi rating dengan sedikit ulasan ke arah rata-rata pasar.") },
      { h: t("3. Where are the openings?", "3. Di mana celahnya?"), p: t("Fragile players are busy but disappoint customers. Hidden gems are loved but small. Both tell you what the market wants.", "Pemain rapuh ramai tapi mengecewakan pelanggan. Hidden gem disukai tapi masih kecil. Keduanya menunjukkan apa yang diinginkan pasar.") },
      { h: t("4. Who is worth a call?", "4. Siapa yang layak dihubungi?"), p: t("Open the prospects tab. Each business shows its score and the reasons behind it.", "Buka tab prospek. Setiap bisnis menampilkan skor dan alasannya.") },
    ] },
  "guides/location": { kind: "guide", image: "/media/blog-market-canal.jpg", title: t("Choosing a location with review data", "Memilih lokasi usaha dengan data ulasan"), lead: t("Compare two or three candidate areas side by side before you sign a lease.", "Bandingkan dua atau tiga calon lokasi sebelum menandatangani kontrak sewa."),
    blocks: [
      { list: [t("Run the same industry in each candidate area.", "Jalankan industri yang sama di setiap calon wilayah."), t("Compare businesses found, average rating and median reviews.", "Bandingkan jumlah bisnis, rating rata-rata, dan median ulasan."), t("A lower top-3 share means no single player owns the area.", "Porsi 3 teratas yang lebih rendah berarti tidak ada pemain yang menguasai wilayah itu."), t("Many fragile players suggest customers are waiting for something better.", "Banyak pemain rapuh menandakan pelanggan menunggu yang lebih baik."), t("Re-research the chosen area after opening to watch new players.", "Riset ulang wilayah pilihan setelah buka untuk memantau pemain baru.")] },
      { note: t("Numbers reflect Google Maps at scan time; use them as a starting point to check on the ground.", "Angka mencerminkan Google Maps saat dipindai; pakai sebagai titik awal untuk dicek di lapangan.") },
    ] },
  // blog
  "blog/team-inbox": { kind: "blog", image: "/media/blog-bakery-phone.jpg", title: t("Running a team WhatsApp inbox without losing deals", "Mengelola chat WhatsApp tim tanpa ada deal yang terlewat"), lead: t("When several people answer one number, chats get missed. Ownership fixes most of it.", "Saat beberapa orang membalas dari satu nomor, chat mudah terlewat. Menetapkan penanggung jawab untuk setiap chat menyelesaikan sebagian besar masalahnya."),
    blocks: [
      { list: [t("Give every conversation an owner: an agent takes it, and everyone can see who has it.", "Tetapkan penanggung jawab untuk setiap chat: agen mengambil alih, dan semua anggota tim bisa melihat siapa yang menangani."), t("Turn repeated answers into templates so replies are fast and consistent.", "Jadikan jawaban berulang sebagai template supaya balasan cepat dan konsisten."), t("Label buyers who are serious so follow-ups are easy to find.", "Beri label pembeli serius supaya tindak lanjut mudah ditemukan."), t("Mark conversations done, so the queue only shows what still needs work.", "Tandai percakapan selesai, supaya antrean hanya berisi yang masih perlu dikerjakan.")] },
    ] },
  "blog/dp-reminders": { kind: "blog", image: "/media/blog-boutique.jpg", title: t("Down-payment reminders that customers do not ignore", "Pengingat DP yang tidak diabaikan pelanggan"), lead: t("A reminder works when it arrives on time, in the chat the customer already uses.", "Pengingat berhasil kalau datang tepat waktu, di chat yang sudah dipakai pelanggan."),
    blocks: [
      { list: [t("Track the deal inside the conversation it came from.", "Lacak deal di dalam percakapan asalnya."), t("Send the reminder from the same number, so it reads as a follow-up, not a broadcast.", "Kirim pengingat dari nomor yang sama, supaya terbaca sebagai tindak lanjut, bukan broadcast."), t("Reminders are never sent to group chats.", "Pengingat tidak pernah dikirim ke grup."), t("Attach the payment proof to the deal when it arrives.", "Lampirkan bukti pembayaran ke deal saat diterima.")] },
    ] },
  "blog/unanswered": { kind: "blog", image: "/media/blog-night-market.jpg", title: t("Counting unanswered chats fairly", "Menghitung chat tak terjawab dengan adil"), lead: t("A chat at 23:00 is not late at 23:05. Raqio counts only operating hours.", "Chat jam 23.00 belum terlambat di 23.05. Raqio hanya menghitung jam operasional."),
    blocks: [
      { list: [t("Set opening hours per day of the week.", "Atur jam operasional per hari."), t("Mark holidays, so a closed day does not count against the team.", "Tandai hari libur, supaya hari tutup tidak dihitung sebagai keterlambatan tim."), t("A chat counts as unanswered after 4 operating hours without a reply.", "Chat dihitung tak terjawab setelah 4 jam operasional tanpa balasan."), t("Read it next to cash in to see where conversations stall.", "Baca bersama data kas masuk untuk melihat di tahap mana percakapan berhenti.")] },
    ] },
};

export const indexes = {
  blog: { title: t("Blog", "Blog"), lead: t("Notes on running customer conversations and closing deals.", "Catatan praktis soal melayani chat pelanggan dan closing deal."), keys: ["blog/team-inbox", "blog/dp-reminders", "blog/unanswered"] },
  guides: { title: t("Guides", "Panduan"), lead: t("Step-by-step guides to reading market reports.", "Panduan langkah demi langkah membaca laporan pasar."), keys: ["guides/competitor-map", "guides/location"] },
  research: { title: t("Research", "Riset"), lead: t("How Raqio collects data and calculates every score.", "Cara Raqio mengumpulkan data dan menghitung setiap skor."), keys: ["research/scoring", "research/benchmarks", "research/sources", "research/samples", "research/accuracy"] },
};

export const about = {
  title: t("We help Indonesian businesses grow by understanding their market and their customers.", "Kami ingin bisnis Indonesia tumbuh dengan memahami pasar dan pelanggannya."),
  body: t("RAQIO helps businesses understand their local market and manage customer conversations. We build AI and automation to lighten the team's routine work.", "Raqio membantu bisnis memahami pasar lokal dan mengelola percakapan pelanggan. Kami mengembangkan AI dan otomasi untuk meringankan pekerjaan rutin tim."),
  principles: [
    { icon: "eye", title: t("Public data, used honestly", "Data publik, dipakai dengan jujur"), body: t("Research Agent uses public sources such as business listings and websites. Coverage depends on the area, so our findings are a starting point to check, not a final decision.", "Research Agent memakai sumber publik seperti listing bisnis dan situs web. Cakupannya bergantung pada wilayah, jadi temuan kami adalah titik awal untuk diperiksa, bukan keputusan akhir.") },
    { icon: "areas", title: t("Every area is different", "Setiap wilayah berbeda"), body: t("The market in Kemang is different from Tebet. We map per area so decisions are made with the right context.", "Pasar di Kemang berbeda dengan Tebet. Kami memetakan per wilayah supaya keputusan dibuat dengan konteks yang tepat.") },
    { icon: "owners", title: t("Clear owners", "Penanggung jawab yang jelas"), body: t("From research to customer conversation, every step has a clear owner. The team knows who does what, and no prospect slips through.", "Dari riset sampai percakapan pelanggan, setiap langkah punya penanggung jawab yang jelas. Tim tahu siapa mengerjakan apa, dan tidak ada prospek yang terlewat.") },
  ],
};

export const security = {
  title: t("Security at Raqio", "Keamanan di Raqio"),
  lead: t("How we separate, protect and record your team's data.", "Cara kami memisahkan, melindungi, dan mencatat data tim Anda."),
  items: [
    { icon: "lattice", title: t("Separated per organisation", "Terpisah per organisasi"), body: t("Every business record carries its organisation, and every request is checked against it. One team never sees another team's data.", "Setiap data bisnis membawa identitas organisasinya, dan setiap permintaan dicek terhadapnya. Satu tim tidak pernah melihat data tim lain.") },
    { icon: "roles", title: t("Roles", "Peran"), body: t("Owner, admin, analyst and viewer: each member only gets the access their role needs.", "Owner, admin, analyst, dan viewer: setiap anggota hanya mendapat akses sesuai perannya.") },
    { icon: "key", title: t("Credentials stored as hashes", "Kredensial disimpan sebagai hash"), body: t("Passwords and API keys are stored hashed, never in plain text.", "Password dan API key disimpan dalam bentuk hash, tidak pernah sebagai teks biasa.") },
    { icon: "audit", title: t("Audit log", "Log audit"), body: t("Important actions are recorded with who did them and when.", "Tindakan penting dicatat lengkap dengan siapa yang melakukannya dan kapan.") },
    { icon: "lock", title: t("Encrypted in transit", "Terenkripsi saat dikirim"), body: t("All traffic runs over TLS, with rate limiting at the edge.", "Semua lalu lintas data dienkripsi dengan TLS, dan jumlah permintaan dibatasi (rate limiting) di lapisan terdepan.") },
    { icon: "globe", title: t("Public sources only", "Hanya sumber publik"), body: t("Market research reads public listings and websites. Customer Service Agent links your WhatsApp Business number as a device; it runs separately from the WhatsApp app.", "Riset pasar membaca listing dan situs web publik. Customer Service Agent menautkan nomor WhatsApp Business Anda sebagai perangkat; berjalan terpisah dari aplikasi WhatsApp.") },
  ],
};

export const compare = {
  title: t("Compare Raqio agents.", "Bandingkan agen AI Raqio."),
  lead: t("Four AI agents: two to understand the market, two to act on it.", "Empat agen AI: dua untuk mengenali pasar, dua untuk menjangkau pelanggan."),
  agents: ["Research Agent", "SEO Agent", "Marketing Agent", "Customer Service Agent"],
  rows: [
    [t("For", "Untuk"), t("Owners, sales teams and research agencies.", "Pemilik usaha, tim penjualan, dan agensi riset."), t("Local businesses, agencies and multi-branch businesses.", "Bisnis lokal, agensi, dan bisnis multi-cabang."), t("Agencies, sales teams and freelancers.", "Agensi, tim penjualan, dan freelancer."), t("Customer service and sales teams.", "Tim layanan pelanggan dan penjualan.")],
    [t("What it does", "Fungsinya"), t("Maps businesses in an area and scores them.", "Memetakan bisnis di sebuah wilayah dan memberi skor."), t("Audits local visibility and publishes your ranking.", "Mengaudit visibilitas lokal dan menerbitkan peringkat Anda."), t("Writes and sends personal outreach, watches competitors.", "Menulis dan mengirim pesan personal, memantau pesaing."), t("Runs the shared WhatsApp inbox, deals and analytics.", "Mengelola dashboard WhatsApp tim, deal, dan analitik.")],
    [t("What you get", "Hasilnya"), t("Market reports and prospect lists.", "Laporan pasar dan daftar prospek."), t("Audit page, ranking and website badge.", "Halaman audit, peringkat, dan lencana website."), t("Campaigns, alerts and a daily lead digest.", "Kampanye, alert, dan ringkasan lead harian."), t("A conversation queue, deal tracking and analytics.", "Antrean chat, pelacakan deal, dan analitik.")],
  ],
  plans: [
    { name: t("Research", "Riset"), body: t("Find and choose potential customers.", "Temukan dan pilih calon pelanggan."), items: [t("Research by industry and area", "Riset per industri dan wilayah"), t("Prospect scores and lists", "Skor dan daftar prospek"), t("Monitor market changes", "Pantau perubahan pasar"), t("Message drafts and campaigns", "Draf pesan dan kampanye")] },
    { name: t("Chat", "Chat"), body: t("Handle conversations as a team.", "Layani chat pelanggan bersama tim."), items: [t("Multiple numbers in one inbox", "Beberapa nomor dalam satu dashboard"), t("Agent assignment", "Pembagian chat ke agen"), t("Templates and labels", "Template dan label"), t("Reply rules", "Aturan balasan")] },
    { name: t("Complete", "Lengkap"), body: t("From finding prospects to serving them.", "Dari mencari prospek sampai melayani pelanggan."), items: [t("Everything in Research", "Semua fitur Riset"), t("Everything in Chat", "Semua fitur Chat")] },
  ],
  pricing: t("Contact our team to discuss the options and what your team needs.", "Hubungi tim kami untuk membahas pilihan dan kebutuhan tim Anda."),
};

export const demo = {
  start: { title: t("Let's grow together.", "Mulai bersama Raqio."), lead: t("Tell us about your business. We set up your agents and walk you through them on a short call.", "Ceritakan bisnis Anda. Kami siapkan agen AI-nya dan memandu Anda lewat panggilan singkat.") },
  book: { title: t("Book a demo.", "Jadwalkan demo."), lead: t("See a live report for your industry and area, and how the agents work on it.", "Lihat laporan untuk industri dan wilayah Anda secara langsung, beserta cara kerja setiap agen.") },
  fields: {
    first: t("First name", "Nama depan"), last: t("Last name", "Nama belakang"), company: t("Company name", "Nama perusahaan"), job: t("Job title", "Jabatan"),
    contact: t("Work email or WhatsApp number", "Email kerja atau nomor WhatsApp"),
    country: t("Country", "Negara"), type: t("What best describes your business?", "Apa yang paling menggambarkan bisnis Anda?"), hear: t("How did you hear about Raqio?", "Dari mana Anda tahu Raqio?"),
    agents: t("Which agents are you interested in?", "Agen mana yang Anda minati?"), all: t("All agents", "Semua agen"),
    privacy: t("By submitting this form, your information is handled as described on our", "Dengan mengirim formulir ini, data Anda diproses sesuai penjelasan di halaman"), privacyLink: t("Security page", "Keamanan"),
    submit: t("Submit", "Kirim"), check: t("Your email app opens with the details filled in. Check them before sending.", "Aplikasi email Anda akan terbuka dengan data yang sudah terisi. Periksa dulu sebelum mengirim."),
    missing: t("The RAQIO contact address is not available yet.", "Alamat kontak Raqio belum tersedia."), subject: t("RAQIO: get started", "Raqio: mulai"), choose: t("Select", "Pilih"),
  },
  options: {
    country: [t("Indonesia", "Indonesia"), t("Malaysia", "Malaysia"), t("Singapore", "Singapura"), t("Other", "Lainnya")],
    type: [t("Small business (UMKM)", "UMKM"), t("Multi-branch business", "Bisnis multi-cabang"), t("Agency", "Agensi"), t("Enterprise", "Perusahaan besar"), t("Freelancer", "Freelancer"), t("Other", "Lainnya")],
    hear: [t("Search engine", "Mesin pencari"), t("Social media", "Media sosial"), t("Friend or colleague", "Teman atau rekan"), t("Event", "Acara"), t("Other", "Lainnya")],
  },
  panel: {
    quote: t("We want Indonesian businesses to grow by understanding their market and their customers.", "Kami ingin bisnis Indonesia tumbuh dengan memahami pasar dan pelanggannya."),
    by: t("Raqio", "Raqio"), role: t("Our mission", "Misi kami"), next: t("What happens next", "Langkah selanjutnya"),
  },
  after: [
    { title: t("Tell us your needs", "Ceritakan kebutuhan"), body: t("A general idea is enough, no technical details needed.", "Cukup gambaran umum, tidak perlu detail teknis.") },
    { title: t("We review it", "Kami pelajari kebutuhannya"), body: t("The Raqio team reads your needs and prepares a relevant example.", "Tim Raqio membaca kebutuhan Anda dan menyiapkan contoh yang relevan.") },
    { title: t("Discussion and demo", "Diskusi dan demo"), body: t("We show the agents on your own area and industry.", "Kami tunjukkan cara kerja agen langsung pada wilayah dan industri Anda.") },
  ],
  faq: [
    { q: t("What is Raqio?", "Apa itu Raqio?"), a: t("Four AI agents for local businesses: Research, SEO, Marketing and Customer Service.", "Empat agen AI untuk bisnis lokal: Research, SEO, Marketing, dan Customer Service Agent.") },
    { q: t("Where does the research data come from?", "Dari mana data riset berasal?"), a: t("Public sources, including Google Maps listings and business websites. Coverage depends on the area and available sources.", "Sumber publik, termasuk listing Google Maps dan situs bisnis. Cakupan bergantung pada wilayah dan ketersediaan sumber.") },
    { q: t("How is WhatsApp Business used?", "Bagaimana WhatsApp Business dipakai?"), a: t("The Customer Service Agent connects a WhatsApp Business number as a linked device. The dashboard runs separately from the WhatsApp app.", "Customer Service Agent menautkan nomor WhatsApp Business sebagai perangkat tertaut. Dashboard berjalan terpisah dari aplikasi WhatsApp.") },
    { q: t("How much does it cost?", "Berapa biayanya?"), a: t("Contact our team to discuss the options and what your team needs.", "Hubungi tim kami untuk membahas pilihan dan kebutuhan tim Anda.") },
  ],
};

export const common = {
  requestDemo: t("Request a demo", "Minta demo"), tryIt: t("Try it now", "Coba sekarang"), features: t("What you can do.", "Yang bisa Anda lakukan."),
  steps: t("Four steps, from start to finish.", "Empat langkah, dari awal sampai selesai."), audience: t("Who it's made for.", "Cocok untuk siapa saja."),
  howRaqio: t("How Raqio helps.", "Cara Raqio membantu."), research: t("Research", "Riset"), reach: t("Reach", "Jangkau"), close: t("Close", "Closing"),
  readMore: t("Read", "Baca"), back: t("Back", "Kembali"), faq: t("Frequently asked questions.", "Pertanyaan yang sering diajukan."), after: t("After you send", "Setelah Anda mengirim"),
  plans: t("Choose what you need.", "Pilih yang Anda butuhkan."), plansLead: t("Use one product or both. Our team will help you choose.", "Pakai satu produk atau keduanya. Tim kami akan membantu memilih yang paling sesuai."),
  kinds: { guide: t("Guide", "Panduan"), blog: t("Blog", "Blog"), research: t("Research", "Riset") },
  principles: t("What we hold to.", "Prinsip kami."),
};
