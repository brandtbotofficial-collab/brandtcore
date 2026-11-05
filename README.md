# Brandt Core — website + admin

Uebfaqe statike (HTML + CSS + JS) me panel admini te `/admin`. Pa framework, pa build.

## Nisja lokale

```bash
cd brandt-core-website
python -m http.server 8000
```

- Faqja: http://localhost:8000
- Admini: http://localhost:8000/admin/

Admini nuk punon nëse e hap skedarin direkt (file://). Duhet patjetër serveri.

## Struktura

```
index.html, about.html, contact.html, journal.html, post.html, login.html, 404.html
services/            7 faqe shërbimesh + index
ventures/            Brandt Bot, Projekto, Ustahu, Atropics + index
content.json         TË GJITHA ndryshimet nga admini (tekste, foto, blog, settings)
assets/css/style.css stilet; ngjyrat dhe fontet janë në fillim (:root)
assets/js/main.js    menuja, animacionet, leximi i content.json, blogu
assets/uploads/      fotot dhe videot që ngarkon nga admini
admin/               paneli i adminit
```

## Paneli i adminit (/admin)

- **Pages:** hap çdo faqe dhe kliko mbi çdo tekst për ta ndryshuar. Kliko mbi foto, thumbnail-at e produkteve ose kutitë gri për t'i zëvendësuar me foto ose video. Ndryshimet në header/footer vlejnë për të gjitha faqet. Mund ta shohësh faqen edhe si Desktop / Tablet / Mobile.
- **Blog:** shkruan artikuj me tituj, listë, citat, link dhe foto, me cover, kategori, datë dhe Draft/Published. Faqja Journal i shfaq automatikisht.
- **Media:** të gjitha fotot dhe videot. Fotot zvogëlohen vetë në 2400 px.
- **Settings:** email, linku i rezervimit, Instagram, LinkedIn, TikTok dhe Behance, si dhe lidhja për publikim.
- **Preview:** e sheh faqen me ndryshimet para se t'i publikosh.

Ndryshimet ruhen si draft vetëm në browser-in tënd, derisa të shtypësh **Publish**.

## Publikimi me një klik (GitHub + Netlify), rekomandohet

1. Krijo një repository në GitHub dhe ngarko aty këtë folder (p.sh. `brandt-core-website`).
2. Në Netlify zgjidh **Add new site → Import from Git**, zgjidh repository-n, lëre build command bosh dhe publish directory `/`.
3. Krijo token në GitHub: **Settings → Developer settings → Fine-grained tokens → Generate**.
   Te *Repository access* zgjidh vetëm këtë repo. Te *Permissions → Contents* zgjidh **Read and write**.
4. Te admini hap **Settings → Publishing**, plotëso user, repo, branch (`main`) dhe token-in, pastaj **Save & test connection**.
5. Tani, sa herë që shtyp **Publish**, admini ruan `content.json` dhe fotot e reja në GitHub. Netlify e përditëson faqen brenda rreth një minute.

Token-i ruhet vetëm në browser-in tënd. Pa token askush nuk mund të publikojë, edhe nëse e hap `/admin`.
Nëse do që askush të mos e shohë fare `/admin`, mbroje me Cloudflare Access (falas) ose me Netlify password protection.

## Publikimi manual (pa GitHub)

Te admini hap **Settings → Download content.json** dhe **Download new media**.
Zëvendëso `content.json` në folder, vendos skedarët e rinj te `assets/uploads/`, pastaj ngarkoje përsëri folderin në Netlify.

## Para publikimit

Kërko `[` në kod ose ndrysho direkt nga admini: partnerët 4–6, Atropics, citimin e klientit, numrat, fotot dhe linkun e rezervimit (te Settings).
Domeni `https://brandtcore.com` është vendosur te `<link rel="canonical">` dhe te `sitemap.xml`. Ndryshoje nëse do të përdorësh domen tjetër.
