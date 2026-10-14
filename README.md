# Yarıkonomi — Alacak / Verecek Takibi

Kişisel kullanım için Windows masaüstü uygulaması. Tauri v2 + React + TypeScript + Vite + Tailwind CSS + Framer Motion. Veriler yerel bir SQLite dosyasında tutulur.

## Özellikler

- **Takvim (3 seviye):** Yıllar → Aylar → Günler. Seviyeler arasında iPhone Takvim tarzı yakınlaşma/uzaklaşma animasyonu var.
  - Ay kartları net değere göre renklenir: artıysa yeşil, eksiyse kırmızı, kayıt yoksa ya da net 0 ise gri. Kartta alacak (yeşil) ve verecek (kırmızı) noktaları gösterilir; 14 noktadan fazlası `+N` olarak yazılır.
  - Günler ekranı Pazartesi ile başlar. Her satırın solunda ISO hafta numarası (41, 42 …) görünür. Üstte ayın toplam alınacak, verilecek ve net özeti durur. Bir güne tıklayınca alt panel açılır; panelden kayıt eklenir, düzenlenir, silinir ve ödendi olarak işaretlenir.
- **Kayıtlar:** tüm kayıtlar tarihe göre (yeni üstte) gruplanmış liste. Her günün başlığında o günün neti görünür. Soldaki daireye tıklayarak kayıt ödendi/ödenmedi işaretlenir; kişi/açıklama araması ve durum filtresi vardır.
- **Çek takibi:** Kayıt formunda "Çek / ileri tarihli" seçilirse tarih alanı **vade tarihi** olur ve çek no ile banka girilebilir. Çekler takvimde (gün hücresinde ve ay kartındaki günde turuncu işaretle), Kayıtlar listesinde "ÇEK" etiketiyle görünür; Kayıtlar'da "Sadece çekler" filtresi vardır. Çek satırında **Aldım / Alamadım** (verecek çekte Ödedim / Ödeyemedim) düğmeleri vardır. "Alamadım" denen çek kırmızı "Alınamadı" olur, toplamlara ve kişinin açık bakiyesine girmez; sonradan tahsil edilirse "Aldım" ile düzeltilebilir. Yeni kayıt eklerken aynı kişinin, kayıt tarihinden önce vadesi gelmiş alınmamış çekleri formda "Alınmamış çekler" altında listelenir; işaretlenenler kayıt kaydedilirken o tarihte alınmış/ödenmiş olur.
- **Kredi ödemesi:** Kayıt formunda "Kredi ödemesi" seçilirse yön otomatik *verecek* olur, kişi yerine listeden **banka** seçilir (listede yoksa "Diğer" ile elle yazılır). Banka, Kişiler'de tüzel kişi olarak otomatik oluşturulur; taksit bilgisi açıklamaya yazılır (ör. "Taksit 3/12"). Satırlarda mavi "KREDİ" etiketi görünür; Kayıtlar'da "Sadece krediler" filtresi vardır.
- **Kayıtlar sıralaması:** Tarih (günlere gruplu), Tutar, Firma/kişi. Seçili sıralamaya tekrar tıklayınca yön değişir.
- **Ay ekranı (yılın içi):** Duvar takvimi görünümü: solda dikey büyük yıl rakamları, yanında 4 × 3 ay ızgarası; her yıl bir ekran yüksekliğindedir, aşağı kaydırınca sonraki yıl gelir. Günler düz sayı olarak görünür; kaydı olan günler net tutara göre yeşil / kırmızı / sarı daire olur, çekli günlerde turuncu nokta bulunur. Ay adının yanında (varsa) aylık net gösterilir. Yazılar ay hücresinin boyutuna göre ölçeklenir.
- **Renk körlüğü modu:** Ayarlar'dan açılır. Yeşil/kırmızı yerine mavi/turuncu (Okabe-Ito) paleti kullanılır; ayrıca verecek noktaları kare olur ve eksi günler çizgili zeminle gösterilir.
- **Arayüz boyutu:** Ayarlar'da **1080p** ve **2K (1440p ve üzeri)** ekranlar için ayrı ayrı %85 – %175 arası seçilir (WebView yakınlaştırması). Uygulama pencerenin bulunduğu monitörün fiziksel çözünürlüğünü algılar ve onun ayarını uygular; pencere başka monitöre taşınınca ayar da değişir. Varsayılan: 1080p %100, 2K %125.
- **Geniş ekran:** Takvim pencerenin tamamını kullanır (sol kenara kadar): ay kartları kareye yakın kalır, geniş ekranda sütun sayısı artar (1080p'de 6 sütun × 2 satır); gün ekranında hücreler yayvanlaşmasın diye genişlik yüksekliğe göre sınırlanır. Diğer sayfalar en fazla 1180 px genişliğinde ve ortalı gösterilir.
- **Kişi türü:** Kişi eklerken **Gerçek kişi** (ad soyad zorunlu, T.C. kimlik no) ya da **Tüzel kişi** (firma unvanı zorunlu, vergi kimlik no) seçilir. Numara isteğe bağlıdır; girilirse T.C. no 11 haneli ve sağlama kuralına uygun, VKN 10 haneli olmalıdır. Eski kişiler adı varsa gerçek, yalnızca firması varsa tüzel kişi olarak yükseltilir.
- **Kişiler:** arama, filtre (bana verecek / ben vereceğim), ekleme, düzenleme, silme. Detay sayfasında kişinin bilgileri, bakiyesi ve tüm kayıtları görünür.
- **Kayıt formu:** kişi seçimi (kişi yoksa formdan çıkmadan eklenebilir), yön, tutar, tarih, açıklama, durum ve ödeme tarihi.
- **Ayarlar:** tema (Sistem / Açık / Koyu), yedek klasörünü değiştirme, elle yedek alma, yedekten geri yükleme, JSON olarak dışa ve içe aktarma.
- **Menü:** Sol menü yerine ekranın altında ortada yüzen, yalnızca ikonlu, "liquid glass" görünümlü bir menü vardır. Kayıt/gün paneli açılınca kaybolur, kapanınca geri gelir.
- **Rapor indirme (Excel / PDF):** İndirme simgesi yıl başlığında ve yıl kartında, ay kartının üzerine gelince, ay ekranının başlığında, günün panelinde bulunur; hafta numarasına (ay ekranının solundaki sütun) tıklamak o haftanın raporunu indirir. Rapor, dönemdeki tüm kayıtları ve toplam alacak / verecek / net / bekleyen tutarlarını içerir; yıl raporunda ayrıca aylık özet vardır. **Cari ekstre**, Kişiler ekranında bir kişinin sayfasındaki *Cari ekstre* düğmesinden (ya da listedeki indirme simgesinden) alınır; tüm kayıtlar, tarih aralığı ya da bu yıl seçilebilir. Kalan bakiye yalnızca ödenmemiş kayıtlarla hesaplanır, alınamayan çekler toplamlara girmez. İndirme penceresindeki **Önizle** düğmesi raporu PDF görüntüleyici tarzında gösterir; beğenince oradan Excel ya da PDF olarak indirilir. PDF'de Türkçe karakterler için Windows'un Segoe UI (yoksa Arial) yazı tipi kullanılır.
- **Ödeme zamanı belirsiz müşteriler:** Kişi formunda *Ödeme zamanı belirsiz* açılır (ör. borcu 1.000.000 ₺ olmadan çek vermeyen müşteri) ve isteğe bağlı *Tahsilat eşiği* girilir. Bu kişinin faturaları normal alacak olarak girilmeye devam eder, ama ödenene kadar **"VADESİZ"** rozetiyle soluk gösterilir ve takvimdeki aylık / günlük toplamlara, net ve renklere girmez (ay ekranında yalnızca soluk nokta olarak görünür; gün ekranında ayın özetinde *Vadesiz* tutarı ayrıca yazar). Kişi sayfasında eşik ilerleme çubuğu gösterilir; açık alacak eşiğe ulaşınca kişi listesinde ve takvimin üstünde **"eşiğe ulaştı"** uyarısı çıkar. Çek geldiğinde kişi sayfasındaki **Tahsilat al** ile tutar girilir; en eski tarihli faturadan başlayarak kapatılır (son fatura tam kapanmazsa kısmen ödenmiş kalır). Ödeme yapılacak taraf için **Ödeme yap** aynı şekilde çalışır. Çekler toplu dağıtıma dahil edilmez.
- **Kısmi ödeme:** Bir kayıt satırının üstüne gelince çıkan **+** simgesi, o kayda kısmi tahsilat / ödeme ekler; satırda *Kısmen* etiketi ve "Kalan" tutar görünür. Toplam ödenen tek bir tutar olarak saklanır (ayrıntılı ödeme geçmişi tutulmaz). Kalan sıfırlanınca kayıt *Ödendi* olur; durumu geri alırsanız ödenen kısım sıfırlanır. Kişilerdeki bakiyeler, açık bakiye ve cari ekstre kalan tutarı kullanır.
- **Kısayollar:** `Ctrl+1/2/3/4` ekranlar arasında geçer. Takvimde `←` `→` ay veya yıl değiştirir, `Backspace` ya da Ctrl + tekerlek geri bir üst seviyeye çıkar (gün ekranında Ctrl + tekerlek yukarı günün kayıtlarını açar, aşağı kapatır), `Esc` açık paneli kapatır.

## Veri saklama

| Ne | Nerede |
|---|---|
| Veritabanı | `Belgeler\Muhasebe\veri.db` |
| Otomatik yedekler | `Belgeler\Muhasebe\Yedekler\veri_YYYY-AA-GG_SS-DD-ss.db` (yedek klasörü Ayarlar'dan değiştirilebilir) |
| Uygulama ayarları | `%APPDATA%\com.kisisel.muhasebe\settings.json` |

- Belgeler klasörünün yolu sabit yazılmadı. Tauri'nin `document_dir()` API'si kullanılıyor; bu API Windows'un Known Folder kaydını okur, bu yüzden Belgeler klasörü OneDrive'a yönlendirilmişse oradaki gerçek klasörü bulur.
- **Yedekleme:** Uygulama her açıldığında bir yedek alınır. Yazma işlemlerinden sonra da en fazla dakikada bir yedek alınır; arka plandaki iş parçacığı her 5 saniyede bir bekleyen değişiklik olup olmadığına bakar. Kapanırken kaydedilmemiş değişiklik varsa son bir yedek daha alınır. En yeni 30 yedek saklanır, eskileri silinir. Yedekler SQLite `VACUUM INTO` komutuyla alındığı için kopyalar her zaman tutarlıdır.
- **Migration:** Şema sürümü `PRAGMA user_version` içinde tutulur. Yeni migration eklemek için `src-tauri/src/db.rs` içindeki `MIGRATIONS` dizisinin sonuna bir SQL bloğu ekleyin; mevcut blokları değiştirmeyin. Her migration kendi transaction'ı içinde çalışır.
- **Veritabanı bulunamazsa ya da bozuksa** uygulama çökmez, bir kurtarma ekranı açar. Bu ekrandan otomatik yedeklerden biri, başka bir `.db` dosyası ya da JSON yedeği geri yüklenebilir. "Tekrar dene" seçeneği, OneDrive senkronizasyonu gecikmişse işe yarar. "Boş veritabanıyla başla" seçildiğinde bozuk dosya silinmez, `veri_bozuk_<tarih>.db` adıyla saklanır.
- Bir yedeğe dönmeden ya da JSON içe aktarmadan önce mevcut verinin yedeği otomatik olarak alınır.

## Geliştirme

Gereksinimler (Windows):

1. **Node.js** 20 veya üstü
2. **Rust** (stable, MSVC): `winget install Rustlang.Rustup`
3. **Visual Studio Build Tools**: "Desktop development with C++" iş yükü
4. **WebView2**: Windows 10/11'de yüklü gelir

```powershell
cd E:\Projects\muhasebe-app
npm install
npm run tauri dev      # uygulamayı geliştirme modunda açar
```

Testler:

```powershell
npm test                          # TS birim testleri (para formatı, takvim ızgarası, net/ay özetleri)
cd src-tauri; cargo test          # Rust testleri (migration, bakiye, JSON, yedek rotasyonu, kayıp/bozuk DB kurtarma)
```

## Derleme (installer üretme)

```powershell
npm run tauri build
```

Çıktılar:

- NSIS: `src-tauri\target\release\bundle\nsis\Muhasebe_0.1.1_x64-setup.exe`

Tauri, NSIS ve WiX araçlarını ilk derlemede kendisi indirir; bu yüzden ilk derlemede internet bağlantısı gerekir. Yalnızca birini üretmek için:

```powershell
npm run tauri build -- --bundles nsis
```

NSIS kurulumu yönetici izni istemez, uygulamayı kullanıcının kendi profiline kurar (`installMode: currentUser`).

## Proje yapısı

```
src/
  lib/          saf mantık: money.ts (kuruş↔TL), dates.ts (Türkçe takvim), summary.ts (net/ay özetleri), api.ts (Tauri komutları)
  components/   UI parçaları: Dock (alttaki yüzen menü), EntryForm, ContactForm, DaySheet, EntryRow, ui.tsx (Sheet, Segmented, Button…)
  views/        CalendarView (Years/Months/Days), ContactsView, SettingsView, RecoveryScreen
  state.tsx     global durum: yenileme sayacı, bildirimler, onay penceresi, form açıcılar
src-tauri/src/
  db.rs         şema, migration'lar, sorgular, JSON dışa/içe aktarma
  store.rs      ayarlar, açılış, yedekleme/rotasyon, geri yükleme
  commands.rs   frontend'in çağırdığı Tauri komutları
```

## Varsayımlar ve kararlar

- **Proje klasörü:** İstekte `C:\Projeler\muhasebe-app` yazıyordu. Proje, mevcut çalışma klasörü olan `E:\Projects\muhasebe-app` içinde kuruldu; bu yolda da Türkçe karakter ya da boşluk yok. Klasör herhangi bir yere taşınabilir.
- **SQLite erişimi:** `tauri-plugin-sql` yerine Rust tarafında **rusqlite** (bundled) kullanıldı. Bu sayede transaction, migration, `VACUUM INTO` ile yedekleme ve kayıp dosya tespiti tek bir yerde, güvenilir biçimde yapılıyor. Frontend veritabanına doğrudan SQL göndermez, yalnızca tanımlı komutları çağırır.
- **Journal modu:** `DELETE` kullanıldı, WAL kullanılmadı. Böylece `veri.db` her zaman tek dosya olarak kalır; bu, OneDrive gibi senkronize klasörlerde daha güvenlidir.
- **Ay neti** ödeme durumundan bağımsız hesaplanır: o ayın tüm alacakları eksi tüm verecekleri.
- **Kişi bakiyesi** yalnızca ödenmemiş kayıtlarla hesaplanır, yani "şu an kim kime ne kadar borçlu" sorusunu cevaplar. Detay sayfasında tüm kayıtların neti de ayrıca gösterilir.
- Net değeri tam 0 olan ay (kaydı varsa) sarı gösterilir; hiç kaydı olmayan ay gri kalır.
- Kişide "ad soyad" veya "firma adı" alanlarından en az biri zorunludur. Her kaydın bir kişiye bağlı olması gerekir.
- Bir kişi silinince ona ait kayıtlar da silinir. Silmeden önce kaç kaydın silineceği gösterilip onay istenir.
- Kayıt "Ödenmedi" durumuna alındığında ödeme tarihi temizlenir. "Ödendi" olarak işaretlenirken tarih seçilmezse bugünün tarihi yazılır.
- Bugünün tarihi mavi daireyle gösterilir. iOS bu iş için kırmızı kullanır, ama bu uygulamada kırmızı "verecek" anlamına geldiği için karışıklık olmasın diye mavi seçildi.
- Tutar girişi `1.234,56`, `1234,5` ve `1234` biçimlerini kabul eder. Tek nokta ve ardından 1–2 hane gelirse (ör. `12.5`) nokta ondalık ayırıcı sayılır.
- Yıllar ekranı, kaydı olan yılları ve bugünün bir yıl öncesi ile bir yıl sonrasını gösterir.
- Yedek klasörü ayarı veritabanının içinde değil, `settings.json` dosyasında tutulur. Böylece veritabanı kaybolsa bile yedeklerin yeri bilinir.

## Sürüm yayınlama ve otomatik güncelleme

- Uygulama her açılışta GitHub'daki son sürümü denetler (`https://github.com/atifereny/yarikonomi/releases/latest/download/latest.json`). Yeni sürüm varsa köşede "Şimdi güncelle" kartı çıkar; ağ yoksa sessizce geçilir. Ayarlar > Güncelleme bölümünden elle de denetlenebilir.
- Güncelleme paketleri imzalıdır. Açık anahtar `tauri.conf.json` içindedir; **gizli anahtar** `%USERPROFILE%\.tauri\yarikonomi.key` dosyasında durur, depoya girmez. Kaybedilirse mevcut kurulumlara güncelleme gönderilemez, bu yüzden yedekleyin.
- Yeni sürüm: `src-tauri	auri.conf.json`, `src-tauri\Cargo.toml` ve `package.json` içindeki sürümü artırın, sonra `powershell -File scripts
elease.ps1 -Notes "Neler değişti"` çalıştırın. Betik test eder, derler, imzalar, `latest.json` üretir ve GitHub Release oluşturur (`gh` kurulu ve giriş yapılmış olmalı).
- Güncelleme için deponun **herkese açık** olması gerekir (uygulama indirirken giriş yapamaz).
- Veri klasörü eski adıyla (`Belgeler\Muhasebe`) kalır; ad değişikliği verilerinizi etkilemez.
