/* =====================================================================
   ENIGMA — script commun à toutes les pages du site public
   Chaque module se désactive tout seul si son markup n'est pas présent,
   ce qui permet d'utiliser ce fichier unique sur les 7 pages.
   ===================================================================== */
(function () {
  "use strict";

  const reduce  = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine    = matchMedia('(hover:hover) and (pointer:fine)').matches;
  const desktop = () => innerWidth > 980;
  const $  = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const hasGsap = typeof gsap !== 'undefined';
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));

  /* ---------- Client Supabase (lecture publique) ---------- */
  let sb = null;
  try {
    if (window.supabase && window.ENIGMA_SITE)
      sb = window.supabase.createClient(ENIGMA_SITE.supabaseUrl, ENIGMA_SITE.supabaseAnonKey, { auth: { persistSession: false } });
  } catch (e) { /* mode démo */ }

  /* ================= 0. LENIS ================= */
  let lenis = null;
  if (!reduce && typeof Lenis !== 'undefined' && hasGsap) {
    lenis = new Lenis({ lerp: .09, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
      const id = a.getAttribute('href'); if (id.length < 2) return;
      const target = $(id); if (!target) return;
      e.preventDefault(); lenis.scrollTo(target, { offset: -70, duration: 1.4 });
    }));
  }

  /* ================= 1. FOND WEBGL ================= */
  const mouse = { x: .5, y: .5, tx: .5, ty: .5 };
  addEventListener('pointermove', e => { mouse.tx = e.clientX / innerWidth; mouse.ty = 1 - e.clientY / innerHeight; }, { passive: true });
  (function initWebGL() {
    const canvas = $('#webgl');
    if (reduce || !canvas || typeof THREE === 'undefined') return;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' }); } catch (e) { return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const uniforms = {
      u_time: { value: 0 }, u_res: { value: new THREE.Vector2(innerWidth, innerHeight) },
      u_mouse: { value: new THREE.Vector2(.5, .5) }, u_scroll: { value: 0 }, u_torch: { value: fine ? 1 : 0 }
    };
    const frag = `
      precision highp float;
      uniform float u_time; uniform vec2 u_res; uniform vec2 u_mouse; uniform float u_scroll; uniform float u_torch;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v=0., a=.5; mat2 m=mat2(1.6,1.2,-1.2,1.6);
        for(int i=0;i<5;i++){ v+=a*noise(p); p=m*p; a*=.5; } return v; }
      void main(){
        vec2 uv = gl_FragCoord.xy/u_res.xy;
        vec2 p = uv*vec2(u_res.x/u_res.y,1.);
        float t = u_time*.035;
        float q = fbm(p*1.6 + vec2(t, -t*.7));
        float f = fbm(p*2.2 + q*1.4 + vec2(-t*.6, t*.4) + u_scroll*.35);
        vec3 deep  = vec3(0.020,0.027,0.039);
        vec3 fog   = vec3(0.070,0.090,0.120);
        vec3 col = mix(deep, fog, smoothstep(.25,.85,f)*.9);
        float breath = .5+.5*sin(u_time*.35);
        col += vec3(0.30,0.07,0.09) * pow(f,4.) * (0.25+0.35*breath);
        vec2 mp = u_mouse*vec2(u_res.x/u_res.y,1.);
        float d = distance(p, mp);
        float torch = exp(-d*d*4.2) * u_torch;
        col += vec3(0.16,0.17,0.19)*torch*(0.6+0.5*f);
        col += vec3(0.30,0.09,0.10)*torch*torch*0.5;
        float vig = smoothstep(1.35, .35, length(uv-.5));
        col *= vig;
        float dust = step(.9985, hash(floor(p*u_res.y*.5) + floor(u_time*2.)));
        col += dust*vec3(.35)*f;
        gl_FragColor = vec4(col,1.);
      }`;
    const mat = new THREE.ShaderMaterial({ uniforms, fragmentShader: frag, vertexShader: 'void main(){ gl_Position = vec4(position,1.); }' });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    let last = 0, visible = true;
    document.addEventListener('visibilitychange', () => visible = !document.hidden);
    (function frame(ts) {
      requestAnimationFrame(frame);
      if (!visible) return;
      if (ts - last < 1000 / 45) return; last = ts;
      mouse.x += (mouse.tx - mouse.x) * .06; mouse.y += (mouse.ty - mouse.y) * .06;
      uniforms.u_time.value = ts / 1000;
      uniforms.u_mouse.value.set(mouse.x, mouse.y);
      uniforms.u_scroll.value = (scrollY || 0) / innerHeight;
      renderer.render(scene, cam);
    })(0);
    addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); uniforms.u_res.value.set(innerWidth, innerHeight); });
  })();

  /* ================= 2. CURSEUR ================= */
  (function cursor() {
    const cur = $('#cursor');
    if (!fine || reduce || !cur) return;
    document.body.classList.add('no-cursor');
    const label = $('#cursor .label');
    let cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy;
    addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; }, { passive: true });
    (function loop() { cx += (tx - cx) * .22; cy += (ty - cy) * .22; cur.style.transform = `translate3d(${cx}px,${cy}px,0)`; requestAnimationFrame(loop); })();
    document.addEventListener('pointerover', e => {
      const t = e.target.closest('[data-cursor]');
      cur.classList.remove('hover', 'look');
      if (t) { const k = t.dataset.cursor; cur.classList.add(k); if (k === 'look' && label) label.textContent = t.classList.contains('soon') ? 'Bientôt' : 'Entrer'; }
    });
    document.addEventListener('pointerout', e => { if (e.target.closest && e.target.closest('[data-cursor]')) cur.classList.remove('hover', 'look'); });
  })();

  /* =====================================================================
     3. PRÉCHARGEMENT — serrure à combinaison, puis fondu, PUIS logo
     Séquence : molettes qui tournent → « Combinaison trouvée » →
     « Accès autorisé » → fondu complet de la serrure → apparition du
     logo → ouverture des portes.
     ===================================================================== */
  let heroPlayed = false, playHero = () => {};
  (function gateModule() {
    const gate = $('#gate');
    if (!gate) return;

    const tumblers = $('#tumblers'), gateStatus = $('#gateStatus'), skip = $('#gateSkip');
    const WORD = 'ENIGMA', ALPHA = 'AZERTYUIOPQSDFGHJKLMWXCVBN';
    const T0 = performance.now();
    const MIN_MS = 2000;   // durée minimale de la serrure avant le fondu

    if (tumblers) {
      WORD.split('').forEach((ch, i) => {
        const t = document.createElement('div'); t.className = 'tumbler';
        const col = document.createElement('div'); col.className = 'col';
        let s = '';
        for (let k = 0; k < 9; k++) s += `<span>${ALPHA[Math.floor(Math.random() * ALPHA.length)]}</span>`;
        s += `<span>${ch}</span>`;
        col.innerHTML = s;
        col.style.setProperty('--dur', (1.0 + i * .18) + 's');
        t.appendChild(col); tumblers.appendChild(t);
      });
    }

    function finish() {
      if (!gate.isConnected) return;
      gate.remove();
      document.documentElement.classList.remove('is-locked');
      if (lenis) lenis.start();
      playHero();
    }

    let tl = null;

    function openGate() {
      if (gate.dataset.opening) return;
      gate.dataset.opening = '1';
      if (!hasGsap) { finish(); return; }
      if (gateStatus) gateStatus.innerHTML = '<b>Accès autorisé</b>';
      gate.classList.add('can-skip');

      tl = gsap.timeline({ onComplete: finish });
      // (1) fondu complet de l'animation de serrure — plus rien à l'écran
      tl.to('#gate .lock', { opacity: 0, y: -8, duration: .45, ease: 'power2.inOut' }, '+=.35')
        // (2) et SEULEMENT ensuite, apparition du logo
        .fromTo('#gate .mark', { opacity: 0 }, { opacity: 1, duration: .7, ease: 'power2.out' }, '>')
        .fromTo('#gate .mark img', { scale: .93 }, { scale: 1, duration: 1.2, ease: 'expo.out' }, '<')
        // (3) le logo tient une seconde, puis les portes s'ouvrent
        .to('#gate .mark', { opacity: 0, duration: .45, ease: 'power2.in' }, '+=.7')
        .to('#gate .leaf.l', { xPercent: -101, duration: 1, ease: 'expo.inOut' }, '<+.05')
        .to('#gate .leaf.r', { xPercent:  101, duration: 1, ease: 'expo.inOut' }, '<')
        .to('#gate',        { opacity: 0, duration: .25 }, '-=.25');
    }

    // Accélère la fin si le visiteur clique / appuie sur une touche.
    function hurry() {
      if (!gate.isConnected) return;
      if (tl) tl.timeScale(3.2);
      else { gate.dataset.opening = ''; openGate(); if (tl) tl.timeScale(3.2); }
    }

    if (reduce || !hasGsap) { gate.remove(); return; }

    if (lenis) lenis.stop();
    document.documentElement.classList.add('is-locked');
    gsap.to('#gateBar', { scaleX: 1, duration: 2, ease: 'power1.inOut' });
    setTimeout(() => { if (gateStatus && !gate.dataset.opening) gateStatus.textContent = 'Combinaison trouvée'; }, 1350);

    // On n'ouvre jamais avant MIN_MS, même si la page est déjà prête.
    let scheduled = false;
    function schedule() {
      if (scheduled) return; scheduled = true;
      setTimeout(openGate, Math.max(0, MIN_MS - (performance.now() - T0)));
    }
    if (document.readyState === 'complete') schedule();
    else addEventListener('load', schedule);
    setTimeout(schedule, 3200);   // filet de sécurité si une ressource traîne

    gate.addEventListener('click', hurry);
    addEventListener('keydown', hurry, { once: true });
  })();

  /* ================= 4. HERO ================= */
  (function hero() {
    $$('#heroTitle .split').forEach(el => {
      const text = el.textContent; el.textContent = '';
      text.split(' ').forEach((word, wi, arr) => {
        const w = document.createElement('span'); w.className = 'word';
        word.split('').forEach(ch => { const c = document.createElement('span'); c.className = 'ch'; c.textContent = ch; w.appendChild(c); });
        el.appendChild(w);
        if (wi < arr.length - 1) el.appendChild(document.createTextNode(' '));
      });
    });

    playHero = function () {
      if (heroPlayed) return; heroPlayed = true;
      if (!hasGsap || reduce) return;
      const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
      if ($('#heroTitle')) tl.from('#heroTitle .ch', { yPercent: 115, rotate: 6, duration: 1.2, stagger: { each: .035 } });
      if ($('.hero-el'))   tl.from('.hero-el', { y: 30, opacity: 0, duration: 1, stagger: .09 }, '-=.8');
      if ($('#heroBigNum'))tl.from('#heroBigNum', { xPercent: 12, opacity: 0, duration: 1.6, ease: 'power3.out' }, '<');
      if ($('.scroll-cue'))tl.from('.scroll-cue', { opacity: 0, duration: .8 }, '-=.5');
      $$('.num[data-count]').forEach(el => {
        const o = { v: 0 };
        gsap.to(o, { v: +el.dataset.count, duration: 1.4, ease: 'power3.out', delay: .9, onUpdate: () => el.textContent = Math.round(o.v) });
      });
    };

    if (reduce || !hasGsap) { $$('.num[data-count]').forEach(el => el.textContent = el.dataset.count); }
    else gsap.set('.hero-el, #heroTitle .ch, #heroBigNum, .scroll-cue', { opacity: 1 });

    // Pages sans porte de préchargement : on joue le hero tout de suite
    if (!$('#gate')) playHero();
  })();

  /* =====================================================================
     5. ALBUM PHOTO DU HERO (géré depuis le back-office)
     ===================================================================== */
  (function heroAlbum() {
    const album = $('#heroAlbum');
    if (!album) return;
    const dots = $('#heroDots');
    let shots = [], idx = 0, timer = null;

    const FALLBACK = [
      { image_url: '', headline: '' }   // fond uni si aucune photo n'est encore chargée
    ];

    function render(list) {
      shots = list.filter(s => s.image_url);
      if (!shots.length) return;
      album.innerHTML = shots.map((s, i) =>
        `<div class="shot${i === 0 ? ' on' : ''}" style="background-image:url('${encodeURI(s.image_url)}')"></div>`
      ).join('') + '<div class="lines"></div>';
      if (dots && shots.length > 1) {
        dots.innerHTML = shots.map((s, i) => `<button type="button" class="${i === 0 ? 'on' : ''}" data-i="${i}" aria-label="Photo ${i + 1}"></button>`).join('');
        dots.addEventListener('click', e => {
          const b = e.target.closest('button'); if (!b) return;
          go(+b.dataset.i); restart();
        });
      }
      if (hasGsap && !reduce) kenBurns(0);
      restart();
    }

    function kenBurns(i) {
      const el = album.children[i]; if (!el) return;
      gsap.fromTo(el, { scale: 1.12 }, { scale: 1, duration: 9, ease: 'none' });
    }

    function go(n) {
      if (!shots.length || n === idx) return;
      const from = album.children[idx], to = album.children[n];
      idx = n;
      $$('#heroDots button').forEach((b, i) => b.classList.toggle('on', i === idx));
      if (hasGsap && !reduce) {
        gsap.to(from, { opacity: 0, duration: 1.1, ease: 'power2.inOut', onComplete: () => from.classList.remove('on') });
        to.classList.add('on');
        gsap.fromTo(to, { opacity: 0 }, { opacity: 1, duration: 1.1, ease: 'power2.inOut' });
        kenBurns(idx);
      } else {
        from.classList.remove('on'); to.classList.add('on');
      }
    }

    function restart() {
      clearInterval(timer);
      if (shots.length > 1) timer = setInterval(() => go((idx + 1) % shots.length), 6500);
    }

    (async () => {
      if (!sb) return render(FALLBACK);
      try {
        const { data } = await sb.from('site_home_gallery')
          .select('image_url,headline,caption')
          .eq('is_published', true).order('sort_order');
        render(data && data.length ? data : FALLBACK);
      } catch (e) { render(FALLBACK); }
    })();
  })();

  /* ================= 6. DOSSIER 3D (si présent) ================= */
  (function dossier3d() {
    const dossier = $('#dossier'), heroSec = $('#heroSection');
    if (!fine || reduce || !hasGsap || !heroSec) return;
    if (dossier) {
      const rx = gsap.quickTo(dossier, 'rotationX', { duration: .6, ease: 'power3' });
      const ry = gsap.quickTo(dossier, 'rotationY', { duration: .6, ease: 'power3' });
      heroSec.addEventListener('pointermove', e => {
        const r = dossier.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
        rx(gsap.utils.clamp(-10, 10, -py * 14)); ry(gsap.utils.clamp(-10, 10, px * 14));
        dossier.style.setProperty('--gx', ((px + .5) * 100) + '%');
        dossier.style.setProperty('--gy', ((py + .5) * 100) + '%');
      });
      heroSec.addEventListener('pointerleave', () => { rx(0); ry(0); });
      gsap.to(dossier, { y: 80, ease: 'none', scrollTrigger: { trigger: heroSec, start: 'top top', end: 'bottom top', scrub: true } });
    }
    if ($('#heroBigNum')) gsap.to('#heroBigNum', { y: -120, ease: 'none', scrollTrigger: { trigger: heroSec, start: 'top top', end: 'bottom top', scrub: true } });
  })();

  /* ================= 7. MAGNÉTIQUE / TILT ================= */
  if (fine && !reduce && hasGsap) {
    $$('.magnetic').forEach(btn => {
      const x = gsap.quickTo(btn, 'x', { duration: .5, ease: 'power3' }), y = gsap.quickTo(btn, 'y', { duration: .5, ease: 'power3' });
      const inner = btn.querySelector('span');
      const ix = inner ? gsap.quickTo(inner, 'x', { duration: .5, ease: 'power3' }) : null;
      const iy = inner ? gsap.quickTo(inner, 'y', { duration: .5, ease: 'power3' }) : null;
      btn.addEventListener('pointermove', e => {
        const r = btn.getBoundingClientRect(); const mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
        x(mx * .25); y(my * .35); if (ix) { ix(mx * .12); iy(my * .16); }
      });
      btn.addEventListener('pointerleave', () => { x(0); y(0); if (ix) { ix(0); iy(0); } });
    });
    $$('.tilt').forEach(card => {
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--cx', (px * 100).toFixed(1) + '%');
        card.style.setProperty('--cy', (py * 100).toFixed(1) + '%');
        gsap.to(card, { rotationX: (.5 - py) * 5, rotationY: (px - .5) * 6, transformPerspective: 1000, duration: .5, ease: 'power2' });
      });
      card.addEventListener('pointerleave', () => gsap.to(card, { rotationX: 0, rotationY: 0, duration: .7, ease: 'power3' }));
    });
  }

  /* ================= 8. SCROLL / REVEALS / NAV ================= */
  if (hasGsap && !reduce) {
    $$('.reveal').forEach(el => gsap.from(el, { y: 34, opacity: 0, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true } }));
    $$('.lines').forEach(t => gsap.from($$('.ln > span', t), { yPercent: 110, duration: 1.1, ease: 'expo.out', stagger: .1, scrollTrigger: { trigger: t, start: 'top 85%', once: true } }));
    $$('.crack').forEach(c => gsap.to(c, { scaleX: 1, duration: 1.3, ease: 'expo.out', scrollTrigger: { trigger: c, start: 'top 92%', once: true } }));
    if ($('#gear1') && $('#heroSection')) {
      gsap.to('#gear1', { rotation: 180, ease: 'none', scrollTrigger: { trigger: '#heroSection', start: 'top top', end: 'bottom top', scrub: 1 } });
      gsap.to('#gear2', { rotation: -140, ease: 'none', scrollTrigger: { trigger: '#heroSection', start: 'top top', end: 'bottom top', scrub: 1 } });
    }
    if ($('#fuse')) gsap.to('#fuse', { scaleX: 1, ease: 'none', scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: .3 } });
    const nav = $('#siteNav');
    if (nav) ScrollTrigger.create({ start: 'top -60', end: 99999, onUpdate: s => {
      nav.classList.toggle('scrolled', s.scroll() > 40);
      nav.classList.toggle('hidden', s.direction === 1 && s.scroll() > 400 && !document.body.classList.contains('menu-open'));
    }});
    $$('#navLinks a[href^="#"]').forEach(a => {
      const sec = $(a.getAttribute('href')); if (!sec) return;
      ScrollTrigger.create({ trigger: sec, start: 'top 45%', end: 'bottom 45%', onToggle: s => a.classList.toggle('current', s.isActive) });
    });
    if ($('#corridor')) {
      $$('.door svg .draw').forEach(p => { try { p.setAttribute('pathLength', '1'); } catch (e) {} });
      gsap.to('.door svg .draw', { strokeDashoffset: 0, duration: 1.8, ease: 'power2.inOut', stagger: .08, scrollTrigger: { trigger: '#corridor', start: 'top 75%', once: true } });
    }
    if ($('#aboutInner')) gsap.to('#aboutInner', { yPercent: -14, ease: 'none', scrollTrigger: { trigger: '#aboutVisual', start: 'top bottom', end: 'bottom top', scrub: true } });
    const q = $('#quote');
    if (q) {
      q.innerHTML = q.textContent.split(' ').map(w => `<span class="w">${esc(w)}</span>`).join(' ');
      gsap.to('#quote .w', { opacity: 1, stagger: .06, ease: 'none', scrollTrigger: { trigger: q, start: 'top 80%', end: 'bottom 45%', scrub: true } });
    }
    if ($('#footerBig')) gsap.fromTo('#footerBig', { opacity: 0, scale: .9, y: 40 }, { opacity: .9, scale: 1, y: 0, ease: 'none', scrollTrigger: { trigger: '#footerBig', start: 'top 98%', end: 'bottom 100%', scrub: true } });
  } else {
    if (hasGsap) gsap.set('.crack', { scaleX: 1 }); else $$('.crack').forEach(c => c.style.transform = 'none');
    $$('.quote').forEach(q => q.style.opacity = 1);
  }

  // œil qui suit le curseur
  (function eye() {
    const pupil = $('#pupil');
    if (!pupil || !fine || reduce || !hasGsap) return;
    const px = gsap.quickTo(pupil, 'x', { duration: .4 }), py = gsap.quickTo(pupil, 'y', { duration: .4 });
    addEventListener('pointermove', e => {
      const r = pupil.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const ang = Math.atan2(dy, dx), dist = Math.min(14, Math.hypot(dx, dy) / 40);
      px(Math.cos(ang) * dist); py(Math.sin(ang) * dist);
    }, { passive: true });
  })();

  /* ================= 9. COULOIR HORIZONTAL ================= */
  (function corridor() {
    if (!$('#corridorTrack')) return;
    let st = null;
    function build() {
      if (!hasGsap || reduce) return;
      if (st) { st.kill(); gsap.set('#corridorTrack', { clearProps: 'transform' }); st = null; }
      if (!desktop()) return;
      const track = $('#corridorTrack');
      const dist = track.scrollWidth - innerWidth;
      if (dist <= 0) return;
      const tween = gsap.to(track, { x: -dist, ease: 'none', scrollTrigger: {
        trigger: '#corridor', start: 'top top', end: () => '+=' + (dist * 1.15), pin: true, scrub: .6, anticipatePin: 1, invalidateOnRefresh: true,
        onUpdate: s => { const p = $('#corridorProg'); if (p) p.style.transform = `translateX(${(s.progress * 100 / .3) * .7}%)`; }
      }});
      st = tween.scrollTrigger;
      $$('.door').forEach(d => gsap.fromTo(d, { scale: .92, opacity: .6 }, { scale: 1, opacity: 1, ease: 'none', scrollTrigger: { trigger: d, containerAnimation: tween, start: 'left 90%', end: 'left 45%', scrub: true } }));
    }
    build();
    let rw = innerWidth;
    addEventListener('resize', () => { if (Math.abs(innerWidth - rw) > 80) { rw = innerWidth; build(); ScrollTrigger.refresh(); } });
  })();

  /* ================= 10. MENU MOBILE + LIEN COURANT ================= */
  (function menu() {
    const burger = $('#burger');
    if (burger) {
      burger.addEventListener('click', () => {
        const open = document.body.classList.toggle('menu-open');
        burger.setAttribute('aria-expanded', open);
        burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
        if (lenis) { open ? lenis.stop() : lenis.start(); } else document.body.style.overflow = open ? 'hidden' : '';
      });
      const close = () => { document.body.classList.remove('menu-open'); burger.setAttribute('aria-expanded', 'false'); if (lenis) lenis.start(); else document.body.style.overflow = ''; };
      $$('#mobileMenu a').forEach(a => a.addEventListener('click', close));
      addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    }
    // lien de la page en cours
    const here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    $$('#navLinks a, #mobileMenu a').forEach(a => {
      const href = (a.getAttribute('href') || '').split('#')[0].toLowerCase();
      if (href && href === here) a.classList.add('current');
    });
  })();

  /* ================= 11. CHRONO + HORLOGE ================= */
  (function chronoModule() {
    const chrono = $('#chrono'), chronoVal = $('#chronoVal'), bigNum = $('#heroBigNum');
    if (chronoVal || bigNum) {
      let left = 60 * 60;
      setInterval(() => {
        if (left > 0) left--;
        const m = String(Math.floor(left / 60)).padStart(2, '0'), s = String(left % 60).padStart(2, '0');
        if (chronoVal) chronoVal.textContent = m + ':' + s;
        if (bigNum) bigNum.textContent = m + ':' + s;
        if (chrono) chrono.classList.toggle('hot', left < 600);
      }, 1000);
    }
    const clock = $('#localClock');
    if (clock) {
      const tick = () => clock.textContent = 'Abidjan — ' + new Date().toLocaleTimeString('fr-FR', { timeZone: 'Africa/Abidjan', hour: '2-digit', minute: '2-digit' });
      tick(); setInterval(tick, 30000);
    }
  })();

  /* ================= 12. FAQ ================= */
  function bindFaq() {
    $$('.faq-q').forEach(q => {
      if (q.dataset.bound) return; q.dataset.bound = '1';
      const item = q.parentElement, panel = q.nextElementSibling;
      q.setAttribute('aria-expanded', 'false');
      q.addEventListener('click', () => {
        const open = item.classList.contains('open');
        $$('.faq-item.open').forEach(o => {
          o.classList.remove('open');
          o.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
          hasGsap ? gsap.to(o.querySelector('.faq-a'), { height: 0, duration: .5, ease: 'expo.out' }) : (o.querySelector('.faq-a').style.height = 0);
        });
        if (!open) {
          item.classList.add('open'); q.setAttribute('aria-expanded', 'true');
          hasGsap ? gsap.to(panel, { height: 'auto', duration: .6, ease: 'expo.out' }) : (panel.style.height = 'auto');
        }
      });
    });
  }
  bindFaq();

  /* =====================================================================
     13. SALLES — cartes d'accueil + portes du couloir
     ===================================================================== */
  const slug = t => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
  const KEYMAP = { lesimmortels: 'immortels', salle13: 'salle13', saw: 'saw' };
  /* Ordre fixe des 3 salles historiques : sert de clé de repli fiable même si
     l'admin renomme une salle (ex. "SAW : Le poids du premier choix"), auquel
     cas le slug du nom complet ne correspondrait plus à KEYMAP. On se base sur
     le rang (sort_order) plutôt que sur le nom pour ne jamais casser le lien
     entre les données Supabase et les data-room-key du HTML. */
  const ROOM_KEY_ORDER = ['immortels', 'salle13', 'saw'];
  const roomKeyFor = (name, i) => ROOM_KEY_ORDER[i] || KEYMAP[slug(name)] || slug(name);

  (function roomsModule() {
    const cards = $('#roomCards'), corridor = $('#corridorTrack');
    if (!sb || (!cards && !corridor)) return;
    (async () => {
      try {
        const { data: rooms } = await sb.from('rooms')
          .select('id,name,tagline,description,long_desc,theme,cover_url,difficulty,duration_minutes,min_players,max_players,has_extreme_mode,sort_order,is_published')
          .eq('is_active', true).order('sort_order');
        if (!rooms || !rooms.length) return;
        const pub = rooms.filter(r => r.is_published !== false);

        /* Cache global : réutilisé par la fenêtre de détail (modal) plus bas,
           qu'elle ait fini de charger avant ou après ce module. */
        const byKey = {};
        pub.forEach((r, i) => { byKey[roomKeyFor(r.name, i)] = r; });
        window.ENIGMA_ROOMS_CACHE = byKey;
        document.dispatchEvent(new CustomEvent('enigma:rooms-loaded', { detail: byKey }));

        if (cards) {
          cards.innerHTML = pub.map((r, i) => {
            const key = roomKeyFor(r.name, i);
            const lvl = Array.from({ length: 5 }, (_, k) => `<i class="${k < (r.difficulty || 3) ? 'lit' : ''}"></i>`).join('');
            const bg = r.cover_url ? `style="background-image:url('${encodeURI(r.cover_url)}')"` : '';
            return `<a class="room-card reveal" href="salles.html#${key}" data-cursor="look">
              <div class="ph" ${bg}>
                <span class="no">Salle ${String(i + 1).padStart(2, '0')}</span>
                <span class="lvl">${lvl}</span>
                <div class="info">
                  <h3>${esc(r.name)}</h3>
                  <p>${esc(r.tagline || r.description || '')}</p>
                  <div class="meta"><span>${r.duration_minutes || 60} min</span><span>${r.min_players || 2}–${r.max_players || 6} joueurs</span>${r.has_extreme_mode ? '<span>Mode extrême</span>' : ''}</div>
                  <span class="go">Découvrir <span aria-hidden="true">→</span></span>
                </div>
              </div>
            </a>`;
          }).join('');
          if (hasGsap && !reduce) gsap.from('#roomCards .room-card', { y: 30, opacity: 0, duration: .9, stagger: .1, ease: 'expo.out', scrollTrigger: { trigger: cards, start: 'top 88%', once: true } });
        }

        if (corridor) {
          pub.forEach((r, i) => {
            const key = roomKeyFor(r.name, i);
            const door = $(`.door[data-room-key="${key}"]`); if (!door) return;
            door.id = key;
            door.dataset.roomKey = key;
            const t = door.querySelector('.door-title'); if (t) t.textContent = r.name;
            /* Résumé court (comme sur la page d'accueil) : le descriptif complet
               ne s'affiche que dans la fenêtre de détail. */
            const tx = door.querySelector('.door-text'); if (tx && (r.tagline || r.description)) tx.textContent = r.tagline || r.description;
            const dur = door.querySelector('.d-dur'); if (dur) dur.textContent = (r.duration_minutes || 60) + ' min';
            const pl = door.querySelector('.d-players'); if (pl) pl.textContent = `${r.min_players || 2}–${r.max_players || 6} joueurs`;
            const md = door.querySelector('.d-mode'); if (md) { md.textContent = r.theme || 'Mode extrême'; md.style.display = (r.has_extreme_mode || r.theme) ? '' : 'none'; }
            if (r.cover_url) {
              const ph = door.querySelector('.door-photo');
              if (ph) { ph.style.background = `url('${encodeURI(r.cover_url)}') center/cover`; const svg = ph.querySelector('.art svg'); if (svg) svg.style.display = 'none'; }
            }
            const st = door.querySelector('.stamp');
            if (st && r.difficulty) st.innerHTML = Array.from({ length: 5 }, (_, i2) => `<i class="${i2 < r.difficulty ? 'lit' : ''}"></i>`).join('');
          });
        }
      } catch (e) { /* on garde le contenu statique */ }
    })();
  })();

  /* =====================================================================
     13bis. FENÊTRE SALLE — descriptif complet + réservation dédiée
     S'active uniquement si #roomModal est présent (page salles.html).
     Le lien "salles.html#cle" utilisé par les cartes de l'accueil ouvre
     directement cette fenêtre au chargement de la page.
     ===================================================================== */
  (function roomModal() {
    const modal = $('#roomModal');
    if (!modal) return;
    const panel   = modal.querySelector('.room-modal-panel');
    const elCover = $('#rmCover'), elTitle = $('#rmTitle'), elDesc = $('#rmDesc'),
          elNo    = $('#rmNo'),    elLvl   = $('#rmLvl'),
          elDur   = modal.querySelector('.d-dur'),
          elPl    = modal.querySelector('.d-players'),
          elMode  = modal.querySelector('.d-mode');

    let roomsData = window.ENIGMA_ROOMS_CACHE || null;
    document.addEventListener('enigma:rooms-loaded', e => {
      roomsData = e.detail;
      if (modal.classList.contains('open')) {
        const activeTab = modal.querySelector('.room-tab.active');
        const key = activeTab && activeTab.dataset.room;
        const r = key && roomsData[key];
        if (r) fillFromData(r, Object.keys(roomsData).indexOf(key));
      }
    });

    function paragraphs(text) {
      return String(text || '').split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('') || '<p></p>';
    }
    function fillFromData(r, index) {
      elTitle.textContent = r.name;
      elDesc.innerHTML = paragraphs(r.long_desc || r.description || r.tagline);
      if (elDur)  elDur.textContent = (r.duration_minutes || 60) + ' min';
      if (elPl)   elPl.textContent = `${r.min_players || 2}–${r.max_players || 6} joueurs`;
      if (elMode) { elMode.textContent = r.theme || 'Mode extrême'; elMode.style.display = (r.has_extreme_mode || r.theme) ? '' : 'none'; }
      if (elLvl)  elLvl.innerHTML = Array.from({ length: 5 }, (_, k) => `<i class="${k < (r.difficulty || 3) ? 'lit' : ''}"></i>`).join('');
      if (elNo)   elNo.textContent = 'Salle ' + String(index + 1).padStart(2, '0');
      if (elCover) elCover.style.backgroundImage = r.cover_url ? `url('${encodeURI(r.cover_url)}')` : '';
    }
    function fillFromDoor(door) {
      /* Repli si Supabase est indisponible : on reprend le contenu déjà affiché sur la porte. */
      elTitle.textContent = door.querySelector('.door-title')?.textContent || '—';
      elDesc.innerHTML = paragraphs(door.querySelector('.door-text')?.textContent || '');
      const dur = door.querySelector('.d-dur')?.textContent;   if (elDur && dur) elDur.textContent = dur;
      const pl  = door.querySelector('.d-players')?.textContent; if (elPl && pl) elPl.textContent = pl;
      const md  = door.querySelector('.d-mode');
      if (elMode && md) { elMode.textContent = md.textContent; elMode.style.display = md.style.display; }
      const st  = door.querySelector('.stamp');
      if (elLvl && st) elLvl.innerHTML = st.innerHTML;
      const tape = door.querySelector('.tape')?.textContent;
      if (elNo && tape) elNo.textContent = tape;
      const bg  = door.querySelector('.door-photo')?.style.backgroundImage;
      if (elCover) elCover.style.backgroundImage = bg || '';
    }

    function open(key) {
      const r = roomsData && roomsData[key];
      if (r) fillFromData(r, Object.keys(roomsData).indexOf(key));
      else { const door = $(`.door[data-room-key="${key}"]`); if (door) fillFromDoor(door); }

      /* Synchronise le module de réservation existant sur la salle choisie. */
      const tab = modal.querySelector(`.room-tab[data-room="${key}"]`);
      if (tab) tab.click();

      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      document.body.style.overflow = 'hidden';
      document.dispatchEvent(new CustomEvent('enigma:modal-opened'));
      if (hasGsap && !reduce) gsap.fromTo(panel, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: .5, ease: 'expo.out' });
      try { history.replaceState(null, '', '#' + key); } catch (e) {}
    }
    function close() {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
    }

    modal.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('open')) close(); });

    $$('.door[data-room-key]').forEach(door => {
      door.addEventListener('click', e => { e.preventDefault(); open(door.dataset.roomKey); });
      door.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(door.dataset.roomKey); }
      });
    });

    /* Ouverture directe depuis un lien externe (ex. carte de l'accueil → salles.html#immortels). */
    const initial = decodeURIComponent(location.hash.slice(1));
    if (initial && $(`.door[data-room-key="${initial}"]`)) {
      setTimeout(() => open(initial), 250);
    }
  })();

  /* =====================================================================
     14. TÉMOIGNAGES
     ===================================================================== */
  (function testimonials() {
    const box = $('#testiGrid');
    if (!box || !sb) return;
    (async () => {
      try {
        const { data } = await sb.from('site_testimonials').select('author,quote').eq('is_published', true).order('created_at', { ascending: false }).limit(6);
        if (!data || !data.length) return;
        box.innerHTML = data.map(t => `<figure class="testi-card reveal">
          <div class="stars"><i></i><i></i><i></i><i></i><i></i></div>
          <blockquote><p>${esc(t.quote)}</p></blockquote>
          <figcaption class="who">${esc(t.author)}</figcaption>
        </figure>`).join('');
        if (hasGsap && !reduce) gsap.from('#testiGrid .testi-card', { y: 26, opacity: 0, duration: .8, stagger: .1, ease: 'expo.out', scrollTrigger: { trigger: box, start: 'top 88%', once: true } });
      } catch (e) {}
    })();
  })();

  /* =====================================================================
     15. VIDÉOS YOUTUBE (chargement différé de l'iframe)
     ===================================================================== */
  (function videos() {
    const box = $('#videoGrid');
    if (!box) return;
    const limit = +(box.dataset.limit || 0);

    const PLAY = '<span class="play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>';

    function card(v) {
      const id = esc(v.youtube_id);
      const thumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      return `<article class="video-card reveal">
        <button class="video-thumb" data-yt="${id}" style="background-image:url('${thumb}')" aria-label="Lire : ${esc(v.title)}">${PLAY}</button>
        <div class="cap"><h4>${esc(v.title)}</h4>${v.description ? `<p>${esc(v.description)}</p>` : ''}</div>
      </article>`;
    }

    box.addEventListener('click', e => {
      const b = e.target.closest('.video-thumb'); if (!b) return;
      const id = b.dataset.yt;
      const f = document.createElement('iframe');
      f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
      f.title = 'Vidéo Enigma';
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      f.allowFullscreen = true;
      b.replaceWith(f);
    });

    (async () => {
      if (!sb) { box.closest('section')?.classList.add('hidden'); return; }
      try {
        let q = sb.from('site_videos').select('title,youtube_id,description').eq('is_published', true).order('sort_order');
        if (limit) q = q.limit(limit);
        const { data } = await q;
        if (!data || !data.length) { box.closest('section')?.classList.add('hidden'); return; }
        box.innerHTML = data.map(card).join('');
        if (hasGsap && !reduce) gsap.from('#videoGrid .video-card', { y: 26, opacity: 0, duration: .8, stagger: .1, ease: 'expo.out', scrollTrigger: { trigger: box, start: 'top 88%', once: true } });
      } catch (e) { box.closest('section')?.classList.add('hidden'); }
    })();
  })();

  /* =====================================================================
     16. RÉSERVATION
     ===================================================================== */
  (function booking() {
    const dayRow = $('#dayRow'), slotRow = $('#slotRow'), bookingForm = $('#bookingForm');
    const dayPrev = $('#dayPrev'), dayNext = $('#dayNext');
    if (!dayRow || !slotRow || !bookingForm) return;

    const ROOMS = {
      immortels: { name: "Les Immortels", times: ["14:00","15:30","17:00","18:30","20:00","21:30"], open: true, prices: { 2:20000,3:27000,4:32000,5:37500,6:42000 }, extreme: 10000 },
      salle13:   { name: "Salle 13",      times: ["14:30","16:00","17:30","19:00","20:30","22:00"], open: true, prices: { 2:20000,3:27000,4:32000,5:37500,6:42000 }, extreme: 10000 },
      saw:       { name: "SAW",           times: ["14:00","15:30","17:00","18:30","20:00","21:30"], open: true, prices: { 2:20000,3:27000,4:32000,5:37500,6:42000 }, extreme: 10000 }
    };
    const BOOKED = {};
    const DAYS_FR = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
    const state = { room: Object.keys(ROOMS)[0], dayIdx: 0, time: null, days: [] };
    (function buildDays() { const d = new Date(); let g = 0; while (state.days.length < 30 && g < 45) { const dow = d.getDay(); if (dow !== 1 && dow !== 2) state.days.push(new Date(d)); d.setDate(d.getDate() + 1); g++; } })();

    const bookingIntro = $('#bookingIntro'), confirmBox = $('#confirmBox');
    const summaryLine = $('#summaryLine'), confirmDetail = $('#confirmDetail');
    const steps = $$('#process .process-step'), processLine = $('#processLine');

    function setStep(n) {
      if (!steps.length) return;
      steps.forEach(s => s.classList.toggle('on', +s.dataset.step <= n));
      const sx = (n - 1) / (steps.length - 1) + (n === 1 ? .02 : 0);
      hasGsap ? gsap.to(processLine, { scaleX: sx, duration: .8, ease: 'expo.out' }) : (processLine.style.transform = `scaleX(${sx})`);
    }
    function renderDays() {
      dayRow.innerHTML = state.days.map((d, i) =>
        `<button type="button" class="day-pill${i === state.dayIdx ? ' active' : ''}" data-i="${i}" data-cursor="hover"><span class="d">${DAYS_FR[d.getDay()]}</span><span class="n">${d.getDate()}</span></button>`).join('');
      updateDayArrows();
    }
    function updateDayArrows() {
      if (!dayPrev || !dayNext) return;
      const max = dayRow.scrollWidth - dayRow.clientWidth;
      dayPrev.disabled = dayRow.scrollLeft <= 2;
      dayNext.disabled = dayRow.scrollLeft >= max - 2;
    }
    /* Le rendu initial peut avoir lieu pendant que la fenêtre modale est encore
       masquée (display:none), donc dayRow mesure 0×0 et désactiverait la flèche
       « suivant » à tort. On recalcule dès que la taille réelle est connue
       (ouverture de la modale, redimensionnement…). */
    if (window.ResizeObserver) new ResizeObserver(() => updateDayArrows()).observe(dayRow);
    document.addEventListener('enigma:modal-opened', () => requestAnimationFrame(updateDayArrows));
    function renderSlots() {
      const room = ROOMS[state.room]; if (!room) return;
      if (!room.open) { slotRow.innerHTML = `<div class="no-slot" style="grid-column:1/-1">Cette salle n'est pas encore ouverte à la réservation.</div>`; return; }
      const seed = state.dayIdx * 3 + state.room.length;
      const dISO = state.days[state.dayIdx].toISOString().slice(0, 10);
      if (!room.times.length) { slotRow.innerHTML = `<div class="no-slot" style="grid-column:1/-1">Aucun créneau configuré pour cette salle.</div>`; return; }
      slotRow.innerHTML = room.times.map((t, i) => {
        const full = room.id ? !!BOOKED[`${state.room}|${dISO}|${t}`] : ((i * 7 + seed) % 5 === 0);
        const sel = (state.time === t) ? ' selected' : '';
        return `<button type="button" class="slot${full ? ' full' : ''}${sel}" data-time="${t}" data-cursor="hover"${full ? ' disabled aria-disabled="true"' : ''}><span class="dot"></span>${t}</button>`;
      }).join('');
      if (hasGsap && !reduce) gsap.from('.slot', { y: 12, opacity: 0, duration: .5, stagger: .045, ease: 'expo.out', clearProps: 'all' });
    }
    function label() { const d = state.days[state.dayIdx]; return `${ROOMS[state.room].name} — ${DAYS_FR[d.getDay()]}. ${d.getDate()}, ${state.time}`; }
    function updatePrice() {
      const room = ROOMS[state.room]; if (!room) return;
      const n = +$('#joueurs').value, modeSel = $('#mode'), mode = modeSel?.value || 'normale';
      const surcharge = mode === 'extreme' ? (room.extreme || 0) : 0;
      const base = room.prices?.[n]; const total = base != null ? base + surcharge : null;
      $('#priceLine').textContent = total != null ? total.toLocaleString('fr-FR') + ' FCFA' : 'Sur devis';
      const extremeOpt = modeSel?.querySelector('option[value="extreme"]');
      if (extremeOpt) extremeOpt.disabled = !room.extreme;
      if (!room.extreme && mode === 'extreme' && modeSel) modeSel.value = 'normale';
    }
    function show(el) { el.classList.add('show'); if (hasGsap && !reduce) gsap.from(el, { y: 16, opacity: 0, duration: .6, ease: 'expo.out' }); }
    function resetBooking() {
      state.time = null;
      if (bookingIntro) bookingIntro.style.display = 'block';
      bookingForm.classList.remove('show');
      if (confirmBox) confirmBox.classList.remove('show');
      const discField = $('#disclaimerField'); if (discField) discField.classList.remove('err');
      setStep(1); renderSlots();
    }
    function moveInk() {
      const a = $('.room-tab.active'), ink = $('#tabInk'); if (!a || !ink) return;
      hasGsap ? gsap.to(ink, { left: a.offsetLeft, width: a.offsetWidth, duration: .5, ease: 'expo.out' })
              : (ink.style.left = a.offsetLeft + 'px', ink.style.width = a.offsetWidth + 'px');
    }

    const tabs = $('#roomTabs');
    if (tabs) tabs.addEventListener('click', e => {
      const tab = e.target.closest('.room-tab'); if (!tab) return;
      $$('.room-tab').forEach(t => t.classList.remove('active')); tab.classList.add('active');
      state.room = tab.dataset.room; moveInk(); resetBooking();
    });
    dayRow.addEventListener('click', e => {
      if (dayRow.dataset.suppressClick) return;
      const p = e.target.closest('.day-pill'); if (!p) return;
      state.dayIdx = +p.dataset.i;
      $$('.day-pill', dayRow).forEach(el => el.classList.toggle('active', el === p));
      resetBooking();
    });
    if (dayPrev) dayPrev.addEventListener('click', () => dayRow.scrollBy({ left: -dayRow.clientWidth * .8, behavior: 'smooth' }));
    if (dayNext) dayNext.addEventListener('click', () => dayRow.scrollBy({ left: dayRow.clientWidth * .8, behavior: 'smooth' }));
    dayRow.addEventListener('scroll', updateDayArrows, { passive: true });
    addEventListener('resize', updateDayArrows);

    /* Glisser les dates à la souris (en plus des flèches et du swipe tactile natif). */
    (function dayDrag() {
      let drag = null;
      dayRow.addEventListener('dragstart', e => e.preventDefault());
      dayRow.addEventListener('mousedown', e => {
        if (e.target.closest('.day-pill') && e.button !== 0) return;
        drag = { startX: e.clientX, startScroll: dayRow.scrollLeft, moved: 0 };
        dayRow.classList.add('dragging');
      });
      addEventListener('mousemove', e => {
        if (!drag) return;
        const dx = e.clientX - drag.startX;
        drag.moved = Math.max(drag.moved, Math.abs(dx));
        dayRow.scrollLeft = drag.startScroll - dx;
      });
      addEventListener('mouseup', () => {
        if (!drag) return;
        const wasDrag = drag.moved > 6;
        drag = null;
        dayRow.classList.remove('dragging');
        if (wasDrag) { dayRow.dataset.suppressClick = '1'; setTimeout(() => delete dayRow.dataset.suppressClick, 0); }
      });
    })();
    slotRow.addEventListener('click', e => {
      const slot = e.target.closest('.slot'); if (!slot || slot.classList.contains('full')) return;
      state.time = slot.dataset.time;
      $$('.slot').forEach(s => s.classList.toggle('selected', s === slot));
      if (summaryLine) summaryLine.textContent = label();
      updatePrice();
      if (bookingIntro) bookingIntro.style.display = 'none';
      if (confirmBox) confirmBox.classList.remove('show');
      if (!bookingForm.classList.contains('show')) show(bookingForm);
      setStep(2);
    });
    $('#joueurs').addEventListener('change', updatePrice);
    $('#mode').addEventListener('change', updatePrice);

    const fields = [
      { el: $('#nom'),    test: v => v.trim().length >= 2 },
      { el: $('#tel'),    test: v => v.replace(/\D/g, '').length >= 8 },
      { el: $('#email'),  test: v => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v.trim()) },
      { el: $('#equipe'), test: v => v.trim().length >= 2 }
    ];
    fields.forEach(f => f.el.addEventListener('input', () => { if (f.test(f.el.value)) f.el.classList.remove('err'); }));
    const disclaimerEl = $('#disclaimer'), disclaimerField = $('#disclaimerField');
    if (disclaimerEl) disclaimerEl.addEventListener('change', () => {
      if (disclaimerEl.checked) { disclaimerField.classList.remove('err'); setStep(2); }
    });

    bookingForm.addEventListener('submit', async e => {
      e.preventDefault(); let ok = true;
      fields.forEach(f => { const good = f.test(f.el.value); f.el.classList.remove('err'); void f.el.offsetWidth; f.el.classList.toggle('err', !good); if (!good && ok) { f.el.focus(); ok = false; } });
      const discOk = !!(disclaimerEl && disclaimerEl.checked);
      if (disclaimerField) disclaimerField.classList.toggle('err', !discOk);
      if (!discOk && ok) { disclaimerEl.focus(); ok = false; }
      if (!ok) return;
      const room = ROOMS[state.room];
      if (sb && room.id) {
        const { error } = await sb.rpc('site_create_reservation', {
          p_room_id: room.id,
          p_session_date: state.days[state.dayIdx].toISOString().slice(0, 10),
          p_time_slot: state.time,
          p_num_players: +$('#joueurs').value,
          p_game_mode: $('#mode').value,
          p_team_name: $('#equipe').value.trim(),
          p_name: $('#nom').value.trim(),
          p_phone: $('#tel').value.trim(),
          p_email: $('#email').value.trim(),
          p_message: $('#msg').value.trim()
        });
        if (error) { alert('Réservation impossible : ' + (error.message || 'erreur')); return; }
      }
      if (confirmDetail) confirmDetail.textContent = label();
      bookingForm.classList.remove('show');
      if (confirmBox) show(confirmBox);
      if (hasGsap && !reduce) {
        gsap.fromTo('.confirm-box .seal circle', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1, ease: 'power2.inOut' });
        gsap.fromTo('.confirm-box .seal path', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: .6, delay: .7, ease: 'power2.out' });
      } else $$('.confirm-box .seal circle, .confirm-box .seal path').forEach(p => p.style.strokeDashoffset = 0);
      setStep(3);
    });
    const again = $('#againBtn');
    if (again) again.addEventListener('click', () => { resetBooking(); bookingForm.reset(); });

    renderDays(); renderSlots(); moveInk(); addEventListener('resize', moveInk);

    /* — chargement Supabase — */
    (async () => {
      if (!sb) return;
      try {
        const [{ data: rooms, error: e1 }, { data: slots }, { data: prices }, { data: res }] = await Promise.all([
          sb.from('rooms').select('id,name,description,duration_minutes,min_players,max_players,has_extreme_mode,extreme_mode_price_xof,sort_order').eq('is_active', true).order('sort_order'),
          sb.from('time_slots').select('room_id,start_time').eq('is_active', true),
          sb.from('pricing_rules').select('room_id,player_count,price_xof').eq('is_active', true),
          sb.from('public_bookings').select('room_id,session_date,time_slot')
        ]);
        if (e1 || !rooms || !rooms.length) return;
        Object.keys(ROOMS).forEach(k => delete ROOMS[k]);
        if (tabs) $$('.room-tab').forEach(t => t.remove());
        rooms.forEach((r, i) => {
          const key = roomKeyFor(r.name, i);
          ROOMS[key] = {
            id: r.id, name: r.name, open: true,
            extreme: r.has_extreme_mode ? r.extreme_mode_price_xof : 0,
            min: r.min_players, max: r.max_players, dur: r.duration_minutes,
            times: (slots || []).filter(s => s.room_id === r.id).map(s => s.start_time).sort(),
            prices: Object.fromEntries((prices || []).filter(p => p.room_id === r.id).map(p => [p.player_count, p.price_xof]))
          };
          if (tabs) {
            const b = document.createElement('button');
            b.className = 'room-tab' + (i === 0 ? ' active' : '');
            b.dataset.room = key; b.dataset.cursor = 'hover'; b.textContent = r.name;
            tabs.insertBefore(b, $('#tabInk'));
          }
        });
        (res || []).forEach(b => { const key = Object.keys(ROOMS).find(k => ROOMS[k].id === b.room_id); if (key) BOOKED[`${key}|${b.session_date}|${b.time_slot}`] = true; });
        // salle pré-sélectionnée via #ancre (ex. reservation.html#saw)
        const want = decodeURIComponent(location.hash.slice(1));
        state.room = (want && ROOMS[want]) ? want : Object.keys(ROOMS)[0];
        if (tabs) $$('.room-tab').forEach(t => t.classList.toggle('active', t.dataset.room === state.room));
        state.time = null;
        renderSlots(); moveInk(); updatePrice();

        // Temps réel : dès qu'une réservation est validée/annulée côté backend, les créneaux du site public se mettent à jour.
        async function refreshBooked() {
          const { data: res2 } = await sb.from('public_bookings').select('room_id,session_date,time_slot');
          Object.keys(BOOKED).forEach(k => delete BOOKED[k]);
          (res2 || []).forEach(b => { const key = Object.keys(ROOMS).find(k => ROOMS[k].id === b.room_id); if (key) BOOKED[`${key}|${b.session_date}|${b.time_slot}`] = true; });
          renderSlots();
        }
        sb.channel('public-availability')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'reservation_requests' }, refreshBooked)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, refreshBooked)
          .subscribe();
      } catch (e) { console.warn('Supabase indisponible, mode démo', e); }
    })();
  })();

  /* =====================================================================
     17. CLASSEMENT
     ===================================================================== */
  (function ranking() {
    const table = $('#rankTable');
    if (!table) return;
    const DEMO = {
      players: [{n:'Aïcha K.',t:'Les Insomniaques',r:3,p:1420,k:7},{n:'Yao B.',t:'Team Cocody',r:3,p:1310,k:6},{n:'Moussa D.',t:'Les Insomniaques',r:2,p:1180,k:5},{n:'Clara M.',t:'Sans Issue',r:3,p:1120,k:5},{n:'Ismaël T.',t:'Team Cocody',r:2,p:980,k:4},{n:'Nadia S.',t:'Sans Issue',r:2,p:940,k:4},{n:'Franck O.',t:'Les Évadés',r:1,p:720,k:3},{n:'Léa P.',t:'Les Évadés',r:1,p:640,k:3}],
      teams:   [{n:'Les Insomniaques',t:'4 joueurs',r:3,p:3860,k:18},{n:'Team Cocody',t:'5 joueurs',r:3,p:3410,k:15},{n:'Sans Issue',t:'3 joueurs',r:3,p:2980,k:13},{n:'Les Évadés',t:'6 joueurs',r:2,p:2100,k:9},{n:'Bietry Breakers',t:'4 joueurs',r:1,p:1150,k:5}],
      month:   [{n:'Yao B.',t:'Team Cocody',r:2,p:640,k:3},{n:'Aïcha K.',t:'Les Insomniaques',r:1,p:520,k:2},{n:'Nadia S.',t:'Sans Issue',r:1,p:480,k:2},{n:'Franck O.',t:'Les Évadés',r:1,p:300,k:1}]
    };
    const RANK = JSON.parse(JSON.stringify(DEMO));

    function render(kind) {
      const rows = RANK[kind] || []; const max = Math.max(1, ...rows.map(r => r.p));
      const pod = $('#podium');
      if (pod) {
        const order = [rows[1], rows[0], rows[2]];
        pod.innerHTML = order.map((r, i) => r ? `<div class="pod p${[2,1,3][i]}" style="--h:${[55,80,45][i]}%"><div class="place">${[2,1,3][i]}</div><div class="who">${esc(r.n)}</div><div class="team">${esc(r.t)}</div><div class="pts">${r.p.toLocaleString('fr-FR')} pts</div><div class="keys">${'<i></i>'.repeat(Math.min(r.k, 8))}</div></div>` : '').join('');
      }
      $('#rankTable tbody').innerHTML = rows.map((r, i) =>
        `<tr><td class="rk">${String(i + 1).padStart(2, '0')}</td><td class="nm">${esc(r.n)}</td><td>${esc(r.t)}</td><td>${r.r}</td><td><div class="bar"><i style="--w:${Math.round(r.p / max * 100)}%"></i></div></td><td class="pt">${r.p.toLocaleString('fr-FR')}</td></tr>`).join('');
      if (hasGsap && !reduce) {
        gsap.fromTo('#podium .pod', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: .8, stagger: .08, ease: 'expo.out' });
        gsap.fromTo('#rankTable tbody tr', { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: .5, stagger: .04, ease: 'power2.out' });
        gsap.to('#rankTable .bar i', { scaleX: 1, duration: 1.2, stagger: .05, ease: 'expo.out', delay: .2 });
      } else $$('#rankTable .bar i').forEach(b => b.style.transform = 'scaleX(1)');
    }
    $$('.rank-tab').forEach(t => t.addEventListener('click', () => {
      $$('.rank-tab').forEach(x => x.classList.remove('active')); t.classList.add('active'); render(t.dataset.rank);
    }));
    render('players');

    (async () => {
      if (!sb) return;
      try {
        const [{ data: p }, { data: t }, { data: m }] = await Promise.all([
          sb.from('leaderboard_players').select('*').limit(20),
          sb.from('leaderboard_teams').select('*').limit(20),
          sb.from('leaderboard_players_month').select('*').limit(20)
        ]);
        const map = rows => rows.map(r => ({ n: r.display_name || r.team_name, t: r.team_name || `${r.members || ''} joueurs`, r: r.rooms_played || 0, p: r.points || 0, k: r.keys_found || 0 }));
        if (p && p.length) { RANK.players = map(p); RANK.teams = map(t || []); RANK.month = map(m || []); render('players'); }
      } catch (e) {}
    })();
  })();

  /* =====================================================================
     18. CONTENU ÉDITABLE (FAQ + réglages du site)
     ===================================================================== */
  (async function siteContent() {
    if (!sb) return;
    try {
      const faqList = $('#faqList');
      if (faqList) {
        const { data: faq } = await sb.from('site_faq').select('question,answer').eq('is_published', true).order('sort_order');
        if (faq && faq.length) {
          faqList.innerHTML = faq.map(f => `<div class="faq-item reveal"><button class="faq-q" data-cursor="hover">${esc(f.question)}<span class="sign"></span></button><div class="faq-a"><p>${esc(f.answer)}</p></div></div>`).join('');
          bindFaq();
        }
      }
      const { data: st } = await sb.from('site_settings').select('key,value');
      (st || []).forEach(r => {
        const v = r.value || {};
        if (r.key === 'hero') {
          if (v.subtitle) $$('[data-site="hero-sub"]').forEach(el => el.textContent = v.subtitle);
          // Le titre du hero est découpé en lettres par le module 4 : on ne le
          // remplace que si l'animation n'a pas encore eu lieu.
          if (v.title_1) $$('[data-site="hero-t1"]').forEach(el => { if (!el.querySelector('.word')) el.textContent = v.title_1; });
          if (v.title_2) $$('[data-site="hero-t2"]').forEach(el => { if (!el.querySelector('.word')) el.textContent = v.title_2; });
        }
        if (r.key === 'contact') {
          if (v.phone)   $$('[data-site="phone"]').forEach(el => { el.textContent = v.phone; if (el.tagName === 'A') el.href = 'tel:' + v.phone.replace(/\s/g, ''); });
          if (v.email)   $$('[data-site="email"]').forEach(el => { el.textContent = v.email; if (el.tagName === 'A') el.href = 'mailto:' + v.email; });
          if (v.address) $$('[data-site="address"]').forEach(el => el.innerHTML = esc(v.address).replace(/\n/g, '<br>'));
          if (v.instagram) $$('[data-site="instagram"]').forEach(el => el.href = v.instagram);
          if (v.facebook)  $$('[data-site="facebook"]').forEach(el => el.href = v.facebook);
        }
        if (r.key === 'hours' && typeof v === 'object') {
          const NAMES = { lun:'Lundi', mar:'Mardi', mer:'Mercredi', jeu:'Jeudi', ven:'Vendredi', sam:'Samedi', dim:'Dimanche' };
          const rows = Object.keys(NAMES).filter(k => v[k]).map(k => `${NAMES[k]} : ${esc(v[k])}`).join('<br>');
          if (rows) $$('[data-site="hours"]').forEach(el => el.innerHTML = rows);
        }
      });
    } catch (e) {}
  })();

  /* ================= 19. DIVERS ================= */
  const track = $('#tickerTrack');
  if (track) track.innerHTML += track.innerHTML;
  if (hasGsap && document.fonts) document.fonts.ready.then(() => ScrollTrigger.refresh());
})();
