export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let path = url.pathname;

    if (path.length > 1 && path.endsWith('/')) {
      return Response.redirect(url.origin + path.slice(0, -1) + url.search, 301);
    }

    if (path === '/robots.txt') {
      return new Response(`User-agent: *\nAllow: /\nSitemap: ${url.origin}/sitemap.xml`, {
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    if (path === '/sitemap.xml') {
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${url.origin}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>`;
      return new Response(sitemap, { headers: { 'Content-Type': 'application/xml' } });
    }

    if (path === '/api/contact' && request.method === 'POST') {
      try {
        const data = await request.json();
        const { name, email, phone, message, package_interest } = data;
        if (!name || !email) {
          return new Response(JSON.stringify({ error: 'Name and email required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        await env.DB.prepare('INSERT INTO contact_submissions (name, email, phone, message, package_interest) VALUES (?, ?, ?, ?, ?)')
          .bind(name, email, phone || '', message || '', package_interest || '').run();

        if (env.NOTIFY) {
          try {
            const { EmailMessage } = await import('cloudflare:email');
            const notifyMsg = new EmailMessage(
              'hello@keystonepdx.com',
              'bryan@keystonepdx.com',
              `From: "Keystone PDX Leads" <hello@keystonepdx.com>\r\nTo: bryan@keystonepdx.com\r\nSubject: New Lead: ${name} - ${package_interest || 'No package selected'}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nNew contact form submission on keystonepdx.com\r\n\r\nName: ${name}\r\nEmail: ${email}\r\nPhone: ${phone || 'Not provided'}\r\nPackage Interest: ${package_interest || 'Not sure yet'}\r\nMessage: ${message || 'None'}\r\n\r\nSubmitted: ${new Date().toLocaleString('en-US', {timeZone: 'America/Los_Angeles'})}\r\n\r\n---\r\nReply directly to this person at: ${email}`
            );
            await env.NOTIFY.send(notifyMsg);
          } catch (emailErr) { console.log('Notification email failed:', emailErr); }
        }

        if (env.REPLY) {
          try {
            const { EmailMessage } = await import('cloudflare:email');
            const pkg = package_interest ? {haven:'Haven',sanctuary:'Sanctuary',stronghold:'Stronghold'}[package_interest] || package_interest : '';
            const replyMsg = new EmailMessage(
              'hello@keystonepdx.com',
              email,
              `From: "Keystone PDX" <hello@keystonepdx.com>\r\nTo: ${email}\r\nSubject: Thanks for reaching out, ${name}!\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHi ${name},\r\n\r\nThanks for contacting Keystone PDX. We've received your request${pkg ? ' for information about our ' + pkg + ' package' : ''} and will be in touch within 24 hours to schedule your free home walkthrough.\r\n\r\nIn the meantime, here's what to expect:\r\n\r\n1. We'll call or email you to find a convenient time\r\n2. During the walkthrough, we'll assess your home's layout and your privacy goals\r\n3. You'll receive a detailed proposal with recommended hardware and pricing\r\n4. No pressure, no obligation - the walkthrough is always free\r\n\r\nIf you have any questions before then, reply to this email or call us.\r\n\r\nPrivacy starts at the door.\r\n\r\nBryan Lozano\r\nKeystone PDX\r\nkeystonepdx.com`
            );
            await env.REPLY.send(replyMsg);
          } catch (replyErr) { console.log('Auto-reply email failed:', replyErr); }
        }

        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Submission failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

    const settingsRows = await env.DB.prepare('SELECT key, value FROM site_settings').all();
    const s = {};
    for (const row of settingsRows.results) s[row.key] = row.value;

    if (path === '/') {
      return new Response(renderPage(s, url), { headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'public, max-age=60, s-maxage=300', 'X-Content-Type-Options': 'nosniff' } });
    }

    return new Response(render404(s), { status: 404, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }
};

function render404(s) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Not Found | ${s.site_name}</title><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"></head><body style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0c1a2b;color:#fff"><div style="text-align:center"><h1 style="font-size:4rem;margin:0;font-weight:800">404</h1><p>Page not found</p><a href="/" style="color:#c49a52">Return home</a></div></body></html>`;
}

// K monogram SVG for inline use
const kMonogramSVG = `<svg width="32" height="34" viewBox="0 0 64 68" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 12C4 5.4 9.4 0 16 0H48C54.6 0 60 5.4 60 12V52C60 58.6 55.2 64 49 65L32 68L15 65C8.8 64 4 58.6 4 52V12Z" fill="#c49a52"/><path d="M20 14V50H27V36L38 50H47L34.5 34.5L46 14H37.5L27 30V14H20Z" fill="#0c1a2b"/></svg>`;

function renderPage(s, url) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${s.site_name} | Privacy-First Smart Home Installation Portland OR</title>
<meta name="description" content="${s.meta_description}">
<meta name="keywords" content="smart home Portland, private smart home, local control smart home, Home Assistant installer Portland, privacy smart home Oregon, smart home installation PDX, security camera installation Portland">
<link rel="canonical" href="${url.origin}/">
<meta property="og:title" content="${s.site_name} — ${s.tagline}">
<meta property="og:description" content="${s.meta_description}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url.origin}/">
<meta property="og:locale" content="en_US">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"LocalBusiness","name":"${s.site_name}","description":"${s.meta_description}","url":"${url.origin}","telephone":"${s.phone}","email":"${s.email}","address":{"@type":"PostalAddress","addressLocality":"Portland","addressRegion":"OR","addressCountry":"US"},"areaServed":{"@type":"City","name":"Portland"},"serviceType":["Smart Home Installation","Home Security Installation","Home Automation","Network Security"],"priceRange":"$$"}
</script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--charcoal:#0c1a2b;--deep:#111f33;--slate-dark:#1a2d45;--gold:#c49a52;--gold-light:#d4af6e;--gold-dim:rgba(196,154,82,.12);--sand:#f4efe7;--warm:#faf8f5;--text:#2a2a2a;--muted:#6b7280;--border:#e2ddd4;--white:#fff;--radius:10px}
html{scroll-behavior:smooth}
body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:var(--text);background:var(--warm);line-height:1.6}
.container{max-width:1100px;margin:0 auto;padding:0 24px}
a{color:var(--gold);text-decoration:none}a:hover{text-decoration:underline}
nav{background:var(--charcoal);padding:14px 0;position:sticky;top:0;z-index:100;border-bottom:1px solid rgba(196,154,82,.2)}
nav .container{display:flex;justify-content:space-between;align-items:center}
.nav-brand{display:flex;align-items:center;gap:10px;text-decoration:none}
.nav-brand-text{font-size:1.2rem;letter-spacing:-0.03em;color:var(--white);line-height:1}
.nav-brand-text strong{font-weight:800}
.nav-brand-text span{font-weight:300;color:var(--gold)}
.nav-links{display:flex;gap:24px;align-items:center}
.nav-links a{color:rgba(255,255,255,.6);font-size:.85rem;font-weight:500;transition:color .2s}.nav-links a:hover{color:var(--white);text-decoration:none}
.nav-cta{background:var(--gold);color:var(--charcoal)!important;padding:8px 20px;border-radius:8px;font-weight:700;font-size:.85rem;transition:all .2s}.nav-cta:hover{background:var(--gold-light);text-decoration:none!important}
@media(max-width:700px){.nav-links a:not(.nav-cta){display:none}}
.hero{background:linear-gradient(170deg,var(--charcoal) 0%,var(--deep) 55%,var(--slate-dark) 100%);padding:100px 0 88px;text-align:center;position:relative;overflow:hidden}
.hero::before{content:'';position:absolute;top:-40%;right:-15%;width:500px;height:500px;background:radial-gradient(circle,rgba(196,154,82,.06) 0%,transparent 70%);border-radius:50%}
.hero::after{content:'';position:absolute;bottom:-30%;left:-10%;width:400px;height:400px;background:radial-gradient(circle,rgba(196,154,82,.04) 0%,transparent 70%);border-radius:50%}
.hero-label{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.2em;color:var(--gold);margin-bottom:16px;position:relative}
.hero h1{font-size:clamp(2rem,5vw,3rem);font-weight:800;color:var(--white);max-width:780px;margin:0 auto 20px;line-height:1.18;position:relative;letter-spacing:-0.03em}
.hero p{font-size:clamp(.95rem,2vw,1.1rem);color:rgba(255,255,255,.55);max-width:600px;margin:0 auto 36px;line-height:1.7;font-weight:400}
.hero-cta{display:inline-block;background:var(--gold);color:var(--charcoal);padding:14px 38px;border-radius:10px;font-size:1.05rem;font-weight:700;transition:all .25s;box-shadow:0 4px 24px rgba(196,154,82,.25);letter-spacing:.01em}
.hero-cta:hover{background:var(--gold-light);transform:translateY(-2px);text-decoration:none;box-shadow:0 6px 32px rgba(196,154,82,.35)}
.trust-row{margin-top:44px;display:flex;justify-content:center;gap:36px;flex-wrap:wrap}
.trust-item{color:rgba(255,255,255,.3);font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.1em}
.packages{padding:80px 0}
.s-label{text-align:center;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.18em;color:var(--gold);margin-bottom:8px}
.s-title{text-align:center;font-size:clamp(1.7rem,4vw,2.4rem);font-weight:800;margin-bottom:12px;letter-spacing:-0.02em}
.s-sub{text-align:center;color:var(--muted);max-width:560px;margin:0 auto 48px;font-size:1rem}
.pkg-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
@media(max-width:800px){.pkg-grid{grid-template-columns:1fr;max-width:400px;margin:0 auto}}
.pkg{background:var(--white);border:1.5px solid var(--border);border-radius:var(--radius);overflow:hidden;transition:all .3s;position:relative}
.pkg:hover{transform:translateY(-4px);box-shadow:0 12px 40px rgba(12,26,43,.06)}
.pkg.featured{border-color:var(--gold);box-shadow:0 4px 20px rgba(196,154,82,.1)}
.pkg-badge{position:absolute;top:0;right:18px;background:var(--gold);color:var(--charcoal);font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:4px 12px 5px;border-radius:0 0 7px 7px}
.pkg-head{padding:26px 22px 18px;text-align:center;border-bottom:1px solid var(--border)}
.pkg-icon{font-size:2rem;margin-bottom:6px}
.pkg-name{font-size:1.5rem;font-weight:800;margin-bottom:2px;letter-spacing:-0.02em}
.pkg-price{font-size:1.05rem;font-weight:700;color:var(--gold)}
.pkg-tag{font-size:.82rem;color:var(--muted);font-style:italic;margin-top:3px}
.pkg-body{padding:18px 22px 22px}
.pkg-body ul{list-style:none}
.pkg-body li{font-size:.87rem;padding:5px 0 5px 22px;position:relative;color:var(--muted)}
.pkg-body li::before{content:'\\2713';position:absolute;left:0;color:var(--gold);font-weight:700;font-size:.8rem}
.pkg-body li strong{color:var(--text);font-weight:600}
.pkg-cta{display:block;text-align:center;padding:11px;margin:14px 0 0;border:2px solid var(--gold);border-radius:8px;color:var(--gold);font-weight:600;font-size:.9rem;transition:all .2s}
.pkg-cta:hover{background:var(--gold);color:var(--charcoal);text-decoration:none}
.pkg.featured .pkg-cta{background:var(--gold);color:var(--charcoal)}.pkg.featured .pkg-cta:hover{background:var(--gold-light)}
.promise{padding:80px 0;background:var(--sand)}
.pr-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}
@media(max-width:700px){.pr-grid{grid-template-columns:repeat(2,1fr)}}
.pr-item{text-align:center;padding:20px 14px}
.pr-icon{font-size:2.2rem;margin-bottom:8px}
.pr-label{font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text);margin-bottom:5px}
.pr-desc{font-size:.82rem;color:var(--muted);line-height:1.5}
.diff{padding:80px 0}
.diff-grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center}
@media(max-width:768px){.diff-grid{grid-template-columns:1fr}}
.diff-content h3{font-size:1.7rem;font-weight:800;margin-bottom:14px;letter-spacing:-0.02em}
.diff-content p{color:var(--muted);margin-bottom:14px;line-height:1.7}
.diff-table{width:100%;border-collapse:collapse;font-size:.82rem}
.diff-table th{text-align:left;padding:9px 11px;background:var(--charcoal);color:var(--white);font-size:.7rem;text-transform:uppercase;letter-spacing:.06em}
.diff-table td{padding:9px 11px;border-bottom:1px solid #eee}
.diff-table tr:nth-child(even) td{background:var(--sand)}
.diff-table .them{color:#999}.diff-table .us{color:var(--gold);font-weight:600}
.contact{padding:80px 0;background:var(--charcoal)}
.contact .s-label{color:var(--gold-light)}.contact .s-title{color:var(--white)}.contact .s-sub{color:rgba(255,255,255,.45)}
.form-wrap{max-width:540px;margin:0 auto}
.form-row{margin-bottom:14px}
.form-row label{display:block;font-size:.75rem;font-weight:600;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}
.form-row input,.form-row textarea,.form-row select{width:100%;padding:11px 15px;border:1.5px solid rgba(255,255,255,.1);border-radius:8px;background:rgba(255,255,255,.05);color:var(--white);font-family:inherit;font-size:.92rem;transition:border-color .2s}
.form-row input:focus,.form-row textarea:focus,.form-row select:focus{outline:none;border-color:var(--gold)}
.form-row select option{background:var(--charcoal);color:var(--white)}
.form-row textarea{resize:vertical;min-height:90px}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:500px){.form-grid{grid-template-columns:1fr}}
.form-submit{display:block;width:100%;padding:13px;background:var(--gold);color:var(--charcoal);border:none;border-radius:8px;font-size:1rem;font-weight:700;cursor:pointer;transition:background .2s;margin-top:6px;letter-spacing:.01em}
.form-submit:hover{background:var(--gold-light)}
.form-success{display:none;text-align:center;padding:36px 20px}
.form-success h3{font-size:1.4rem;font-weight:800;color:var(--white);margin-bottom:6px}
.form-success p{color:rgba(255,255,255,.5)}
footer{background:var(--deep);padding:36px 0;border-top:1px solid rgba(255,255,255,.05)}
footer .container{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px}
.f-brand{display:flex;align-items:center;gap:8px}
.f-brand-text{font-size:1rem;color:var(--white);letter-spacing:-0.02em}
.f-brand-text strong{font-weight:800}
.f-brand-text span{font-weight:300;color:var(--gold)}
.f-info{color:rgba(255,255,255,.35);font-size:.78rem;text-align:right;line-height:1.7}.f-info a{color:var(--gold-light)}
</style>
</head>
<body>

<nav><div class="container">
  <a href="/" class="nav-brand">
    ${kMonogramSVG}
    <div class="nav-brand-text"><strong>KEYSTONE</strong> <span>PDX</span></div>
  </a>
  <div class="nav-links">
    <a href="#packages">Packages</a>
    <a href="#promise">Our Promise</a>
    <a href="#difference">Why Us</a>
    <a href="#contact" class="nav-cta">${s.hero_cta}</a>
  </div>
</div></nav>

<section class="hero"><div class="container">
  <div class="hero-label">${s.tagline}</div>
  <h1>${s.hero_headline}</h1>
  <p>${s.hero_subheadline}</p>
  <a href="#contact" class="hero-cta">${s.hero_cta}</a>
  <div class="trust-row">
    <span class="trust-item">No Cloud Dependency</span>
    <span class="trust-item">No Data Sales</span>
    <span class="trust-item">Works Offline</span>
    <span class="trust-item">Portland, OR</span>
  </div>
</div></section>

<section class="packages" id="packages"><div class="container">
  <div class="s-label">Smart Home Packages</div>
  <h2 class="s-title">Choose Your Level of Protection</h2>
  <p class="s-sub">Every package runs on open standards, local control, and hardware you own. No mandatory subscriptions for core features.</p>
  <div class="pkg-grid">
    <div class="pkg">
      <div class="pkg-head"><div class="pkg-icon">\u{1F6E1}</div><div class="pkg-name">Haven</div><div class="pkg-price">${s.haven_price}</div><div class="pkg-tag">${s.haven_tagline}</div></div>
      <div class="pkg-body"><ul>
        <li><strong>Cove security system</strong> \u2014 no PII sold, ever</li>
        <li><strong>Smart lock</strong> \u2014 keyless entry, local control</li>
        <li><strong>Smart thermostat</strong> \u2014 remote climate management</li>
        <li><strong>Video doorbell</strong> \u2014 local storage, no cloud fees</li>
        <li><strong>Motion & entry sensors</strong> \u2014 full perimeter</li>
        <li>Professional installation & configuration</li>
        <li>24/7 cellular monitoring via Cove</li>
      </ul><a href="#contact" class="pkg-cta">Get Started</a></div>
    </div>
    <div class="pkg featured">
      <div class="pkg-badge">Most Popular</div>
      <div class="pkg-head"><div class="pkg-icon">\u{1F3DB}</div><div class="pkg-name">Sanctuary</div><div class="pkg-price">${s.sanctuary_price}</div><div class="pkg-tag">${s.sanctuary_tagline}</div></div>
      <div class="pkg-body"><ul>
        <li><strong>Everything in Haven</strong>, plus:</li>
        <li><strong>Home Assistant hub</strong> \u2014 one dashboard, zero cloud</li>
        <li><strong>Smart lighting</strong> \u2014 8\u201312 zones, local control</li>
        <li><strong>PoE security cameras</strong> \u2014 local recording, no subscriptions</li>
        <li><strong>Network segmentation</strong> \u2014 IoT isolated from personal devices</li>
        <li><strong>Unified automation</strong> \u2014 all devices work together locally</li>
        <li>Functions even when internet goes down</li>
      </ul><a href="#contact" class="pkg-cta">Get Started</a></div>
    </div>
    <div class="pkg">
      <div class="pkg-head"><div class="pkg-icon">\u{1F3F0}</div><div class="pkg-name">Stronghold</div><div class="pkg-price">${s.stronghold_price}</div><div class="pkg-tag">${s.stronghold_tagline}</div></div>
      <div class="pkg-body"><ul>
        <li><strong>Everything in Sanctuary</strong>, plus:</li>
        <li><strong>Home server</strong> \u2014 local file storage & media</li>
        <li><strong>Network-wide ad blocking</strong> \u2014 every device protected</li>
        <li><strong>VPN access</strong> \u2014 secure remote connection home</li>
        <li><strong>Local voice assistant</strong> \u2014 no Amazon, no Google</li>
        <li><strong>Automated backups</strong> \u2014 your data, your control</li>
        <li>Complete digital sovereignty</li>
      </ul><a href="#contact" class="pkg-cta">Get Started</a></div>
    </div>
  </div>
</div></section>

<section class="promise" id="promise"><div class="container">
  <div class="s-label">The Keystone Promise</div>
  <h2 class="s-title">What Makes Us Different</h2>
  <p class="s-sub">We only install products and systems that respect your privacy by design.</p>
  <div class="pr-grid">
    <div class="pr-item"><div class="pr-icon">\u{1F512}</div><div class="pr-label">Zero Cloud</div><div class="pr-desc">Your data stays on hardware you own, inside your home. No corporate servers, no third-party access.</div></div>
    <div class="pr-item"><div class="pr-icon">\u{1F6AB}</div><div class="pr-label">No Data Sales</div><div class="pr-desc">Every product we install has a verified privacy policy. We never use hardware that sells or monetizes your information.</div></div>
    <div class="pr-item"><div class="pr-icon">\u{1F4E1}</div><div class="pr-label">Works Offline</div><div class="pr-desc">Locks, lights, security, climate \u2014 core functions operate even when your internet goes down.</div></div>
    <div class="pr-item"><div class="pr-icon">\u{1F513}</div><div class="pr-label">Open Standards</div><div class="pr-desc">Matter, Zigbee, Z-Wave \u2014 open protocols that prevent vendor lock-in. Your system grows with you.</div></div>
  </div>
</div></section>

<section class="diff" id="difference"><div class="container">
  <div class="diff-grid">
    <div class="diff-content">
      <div class="s-label" style="text-align:left">Why Keystone PDX</div>
      <h3>Not Another Ring & Nest Installer</h3>
      <p>Every other smart home company in Portland installs cloud-first systems that send your video, voice, and behavioral data to corporate servers. We do the opposite.</p>
      <p>We\u2019re Portland\u2019s privacy-first smart home installer. We use open-source platforms like Home Assistant, cameras with local storage, and network architecture that keeps your data inside your walls.</p>
      <p>If you\u2019re spending $15,000+ remodeling your home, your smart technology should respect the space you\u2019re creating \u2014 not surveil it.</p>
    </div>
    <div>
      <table class="diff-table">
        <thead><tr><th>Feature</th><th>Ring / Nest / ADT</th><th>Keystone PDX</th></tr></thead>
        <tbody>
          <tr><td>Data Storage</td><td class="them">Corporate cloud</td><td class="us">Your home</td></tr>
          <tr><td>Video Access</td><td class="them">Company can view</td><td class="us">Only you</td></tr>
          <tr><td>Third-Party Sharing</td><td class="them">Partners & police</td><td class="us">Nobody</td></tr>
          <tr><td>Works Offline</td><td class="them">Most features fail</td><td class="us">Core functions work</td></tr>
          <tr><td>Monthly Cloud Fees</td><td class="them">$5\u2013$60/mo</td><td class="us">$0 for core features</td></tr>
          <tr><td>Vendor Lock-In</td><td class="them">Proprietary</td><td class="us">Open standards</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div></section>

<section class="contact" id="contact"><div class="container">
  <div class="s-label">Get Started</div>
  <h2 class="s-title">Book a Free Home Walkthrough</h2>
  <p class="s-sub">We\u2019ll assess your home, recommend the right package, and answer every question \u2014 no pressure, no obligation.</p>
  <div class="form-wrap">
    <form id="cf">
      <div class="form-grid">
        <div class="form-row"><label for="name">Name</label><input type="text" id="name" name="name" required placeholder="Your name"></div>
        <div class="form-row"><label for="email">Email</label><input type="email" id="email" name="email" required placeholder="you@email.com"></div>
      </div>
      <div class="form-grid">
        <div class="form-row"><label for="phone">Phone</label><input type="tel" id="phone" name="phone" placeholder="(503) 555-1234"></div>
        <div class="form-row"><label for="pkg">Package Interest</label><select id="pkg" name="package_interest"><option value="">Not sure yet</option><option value="haven">Haven (From $1,500)</option><option value="sanctuary">Sanctuary (From $3,500)</option><option value="stronghold">Stronghold (From $7,000)</option></select></div>
      </div>
      <div class="form-row"><label for="msg">Tell us about your home</label><textarea id="msg" name="message" placeholder="Recently remodeled? Specific privacy concerns? What matters most to you?"></textarea></div>
      <button type="submit" class="form-submit">Request Free Walkthrough</button>
    </form>
    <div class="form-success" id="fs"><h3>We\u2019ll be in touch!</h3><p>Thanks for reaching out. We typically respond within 24 hours to schedule your free walkthrough.</p></div>
  </div>
</div></section>

<footer><div class="container">
  <div class="f-brand">
    <svg width="24" height="25" viewBox="0 0 64 68" fill="none"><path d="M4 12C4 5.4 9.4 0 16 0H48C54.6 0 60 5.4 60 12V52C60 58.6 55.2 64 49 65L32 68L15 65C8.8 64 4 58.6 4 52V12Z" fill="#c49a52"/><path d="M20 14V50H27V36L38 50H47L34.5 34.5L46 14H37.5L27 30V14H20Z" fill="#0c1a2b"/></svg>
    <div class="f-brand-text"><strong>KEYSTONE</strong> <span>PDX</span></div>
  </div>
  <div class="f-info"><a href="mailto:${s.email}">${s.email}</a><br>${s.phone}<br>${s.city} \u00B7 CCB License #Pending</div>
</div></footer>

<script>
document.getElementById('cf').addEventListener('submit',async function(e){
  e.preventDefault();const f=e.target,b=f.querySelector('.form-submit');b.textContent='Sending...';b.disabled=true;
  try{const r=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.name.value,email:f.email.value,phone:f.phone.value,package_interest:f.package_interest.value,message:f.message.value})});
  if(r.ok){f.style.display='none';document.getElementById('fs').style.display='block'}else{b.textContent='Something went wrong \u2014 try again';b.disabled=false}}
  catch(err){b.textContent='Connection error \u2014 try again';b.disabled=false}});
</script>
</body></html>`;
}
