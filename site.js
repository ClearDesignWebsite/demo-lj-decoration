/* LJ Décoration — mouvement.

   Trois règles tenues, chacune payée une fois :
   1. Aucun scrub par élément. La version refusée pour lag en comptait 65.
      Ici : un seul scrub pour les colonnes, un pour le hero. Le reste
      est en `once`, donc les déclencheurs se retirent après usage.
   2. Lenis en mode LERP, pas en mode durée. Fadel avait perdu le contrôle
      du défilement avec une inertie de 1,05 s : ici la molette reste
      la molette, le lissage ne fait que gommer les à-coups.
   3. Rattrapage à l'ouverture : si la page s'ouvre déjà défilée (retour
      arrière, ancre), les blocs au dessus ne « rentrent » jamais dans
      l'écran et resteraient invisibles. */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement, body = doc.body;
  var reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var gs = window.gsap, ST = window.ScrollTrigger;
  var lenis = null;

  /* ══ L'ÉCRAN DE CHARGEMENT ═══════════════════════════════
     Le logo part grand au centre et rejoint sa place dans la barre.
     On mesure les deux positions et on interpole : c'est le même
     élément qui voyage, rien n'est dupliqué ni approximé. */
  var rideau = doc.getElementById('rideau');
  function leve() {
    if (!rideau) return;
    var gr = rideau.querySelector('img'), petit = doc.querySelector('.bar .logo img');
    if (!gr || !petit || reduit || !gs) {
      body.classList.add('pret', 'charge');
      setTimeout(function () { if (rideau) rideau.remove(); }, 700);
      return;
    }
    /* On mesure la cible APRÈS avoir figé la barre dans son état de repos :
       sinon on vise une position qui bouge encore, et le logo se pose à côté. */
    body.classList.remove('pose');
    var a = gr.getBoundingClientRect();
    var b = petit.getBoundingClientRect();
    /* `delay` sur la ligne, pas une animation vide : GSAP ignore un tween
       sans propriété, le logo partait donc immédiatement. */
    gs.timeline({ delay: 1.35,
                  onComplete: function () {
                    body.classList.add('pret');
                    rideau.remove();
                    if (ST) ST.refresh();
                  } })
      .to(gr, { x: b.left - a.left, y: b.top - a.top,
                scaleX: b.width / a.width, scaleY: b.height / a.height,
                duration: 1.15, ease: 'power3.inOut' })
      .to(rideau, { opacity: 0, duration: .42, ease: 'power2.inOut' }, '-=0.30')
      .add(function () { body.classList.add('pret'); }, '-=0.34');
  }
  if (rideau) {
    if (doc.readyState === 'complete') requestAnimationFrame(leve);
    else window.addEventListener('load', function () { requestAnimationFrame(leve); });
    /* filet : si une image traîne, on ne bloque jamais plus de 2,5 s */
    setTimeout(function () { if (doc.getElementById('rideau')) leve(); }, 3000);
  } else { body.classList.add('pret'); }

  /* ── la barre : elle se pose dès qu'on quitte le hero ───── */
  var hero = doc.querySelector('.hero');
  function barre(y) {
    body.classList.toggle('pose', y > 40);
    if (hero) body.classList.toggle('sombre', y < hero.offsetHeight - 90);
  }
  if (hero) body.classList.add('sombre');

  /* ── le menu complet ───────────────────────────────────── */
  var plus = doc.querySelector('.plus');
  function ferme() { body.classList.remove('ouvert'); }
  if (plus) plus.addEventListener('click', function () { body.classList.toggle('ouvert'); });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') ferme(); });
  Array.prototype.forEach.call(doc.querySelectorAll('.nappe a'), function (a) {
    a.addEventListener('click', ferme);
  });

  /* ══ LE CARROUSEL ════════════════════════════════════════
     Elle présente son travail en slideshow : c'est la pièce
     maîtresse. Sortante qui se replie, entrante qui se dévoile. */
  var carr = doc.querySelector('.carr'), demarre = null, pauseCarr = null;
  if (carr) {
    var vues = [].slice.call(carr.querySelectorAll('.vue')),
        vign = [].slice.call(doc.querySelectorAll('.vign button')),
        nom = carr.querySelector('.titre .d'),
        meta = carr.querySelector('.titre .meta'),
        num = carr.querySelector('.compte b'),
        jauge = carr.querySelector('.jauge'),
        n = vues.length, ici = 0, occupe = false, minuteur = null, auto = true;
    var DUREE = 6000, tw = null, parti = 0, restant = DUREE, gel = false;

    /* branche l'image d'une vue, et celle d'après : on ne télécharge
       jamais les sept d'un coup (1 066 Ko mesurés avant correction). */
    function branche(i) {
      for (var k = 0; k < 2; k++) {
        var v = vues[(i + k) % n], im2 = v && v.querySelector('img[data-src]');
        if (!im2) continue;
        if (im2.dataset.srcset) im2.srcset = im2.dataset.srcset;
        im2.src = im2.dataset.src;
        im2.removeAttribute('data-src'); im2.removeAttribute('data-srcset');
      }
      /* On DÉCODE la vue suivante pendant qu'on regarde l'actuelle.
         Sans ça, le décodage d'une image de 3200 px tombait au milieu
         de la transition : 46 fps et des pics à 50 ms, mesurés. */
      var apres = vues[(i + 1) % n], ia = apres && apres.querySelector('img');
      if (ia && ia.decode) { try { ia.decode().catch(function () {}); } catch (e) {} }
    }
    function pose(i) {
      branche(i);
      vign.forEach(function (b, k) { b.classList.toggle('actif', k === i); });
      if (nom) nom.textContent = vues[i].dataset.nom || '';
      if (meta) meta.textContent = vues[i].dataset.meta || '';
      if (num) num.textContent = String(i + 1).padStart(2, '0');
    }
    /* L'avance automatique repart de zéro à chaque vue. Passer la souris la
       MET EN PAUSE, sans remettre le compte à zéro : avant, un simple survol
       relançait tout le cycle, et le carrousel semblait se déclencher au
       passage de la souris. */
    function relance() {
      clearTimeout(minuteur);
      if (tw) { tw.kill(); tw = null; }
      if (gel) { if (jauge) jauge.style.transform = 'scaleX(0)'; minuteur = null; return; }
      if (!auto || reduit || !gs || !jauge) { if (jauge) jauge.style.transform = 'scaleX(0)'; return; }
      restant = DUREE;
      gs.set(jauge, { scaleX: 0 });
      tw = gs.to(jauge, { scaleX: 1, duration: DUREE / 1000, ease: 'none' });
      parti = Date.now();
      minuteur = setTimeout(function () { va(1); }, DUREE);
    }
    function suspend() {
      if (!auto) return;
      if (!minuteur) { if (tw) tw.pause(); return; }
      clearTimeout(minuteur); minuteur = null;
      if (tw) tw.pause();
      restant = Math.max(400, restant - (Date.now() - parti));
    }
    function reprend() {
      if (!auto || gel || minuteur || occupe) return;
      if (tw) tw.resume();
      parti = Date.now();
      minuteur = setTimeout(function () { va(1); }, restant);
    }
    /* `cible` permet d'atteindre une vignette lointaine en UNE transition.
       Sans elle, on avançait d'un cran à la fois et le clic s'arrêtait en route. */
    function va(sens, cible) {
      if (occupe || n < 2) return;
      occupe = true;
      var sort = vues[ici];
      ici = (cible === undefined) ? (ici + sens + n) % n : cible;
      var entre = vues[ici];
      pose(ici);
      if (!gs || reduit) {
        sort.classList.remove('active'); entre.classList.add('active');
        occupe = false; relance(); return;
      }
      gs.set(vues, { zIndex: 0 });
      gs.set(sort, { zIndex: 1 });
      gs.set(entre, { zIndex: 2, opacity: 1 });
      entre.classList.add('active');
      /* Fondu enchaîné avec une poussée douce. L'ancienne version balayait
         par un bord net : le raccord se voyait et la photo passait trop vite.
         Ici les deux images coexistent, l'entrante avance, la sortante recule. */
      var im2 = entre.querySelector('img');
      /* Fondu par OPACITÉ seule, plus un léger glissement horizontal.
         Le `scale` a été retiré : mettre une image à l'échelle force le
         navigateur à la re-rastériser à chaque image. Mesuré avec scale :
         45 fps et 128 images au dessus de 20 ms. L'opacité et la
         translation, elles, se règlent sur le compositeur : c'est gratuit. */
      gs.set(entre, { willChange: 'opacity' });
      gs.set(im2, { willChange: 'transform', force3D: true });
      gs.timeline({ onComplete: function () {
                      sort.classList.remove('active');
                      gs.set([sort, im2], { clearProps: 'transform,opacity,willChange' });
                      occupe = false; relance();
                    } })
        .fromTo(entre, { opacity: 0 },
                       { opacity: 1, duration: .52, ease: 'power2.inOut' }, 0)
        .fromTo(im2, { xPercent: sens > 0 ? 2.2 : -2.2 },
                     { xPercent: 0, duration: .78, ease: 'power2.out' }, 0)
        .to(sort, { opacity: 0, duration: .52, ease: 'power2.inOut' }, 0);
    }
    function vaA(i) {
      if (i === ici) return;
      va(i > ici ? 1 : -1, i);
    }
    carr.querySelector('.suiv').addEventListener('click', function () { va(1); });
    carr.querySelector('.prec').addEventListener('click', function () { va(-1); });
    vign.forEach(function (b, k) {
      b.addEventListener('click', function () { vaA(k); });
    });
    carr.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') va(1);
      if (e.key === 'ArrowLeft') va(-1);
    });
    /* glisser au doigt */
    var x0 = null;
    carr.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    carr.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var d = e.changedTouches[0].clientX - x0;
      if (Math.abs(d) > 44) va(d < 0 ? 1 : -1);
      x0 = null;
    }, { passive: true });
    /* Le carrousel continue de tourner sous la souris : le survol ne
       l'arrête plus. Il ne se met en pause que dans deux cas où il n'y
       a personne pour le voir : la visionneuse ouverte, ou l'onglet caché. */
    /* on ne fait pas tourner un carrousel que personne ne regarde */
    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden) suspend(); else reprend();
    });
    vues[0].classList.add('active');
    pose(0);
    demarre = relance;
    pauseCarr = function (oui) { gel = oui; if (oui) suspend(); else reprend(); };
  }

  /* ══ LA VISIONNEUSE ══════════════════════════════════════
     Toute photo de son travail s'ouvre en grand. On sert la version
     pleine résolution, pas la vignette : c'est le but même du plein écran. */
  var loupe = doc.querySelector('.loupe');
  if (loupe) {
    var lim = loupe.querySelector('img'), lg = loupe.querySelector('.lg');
    var jeu = [], rang = 0, avant = null;

    function grande(im) {
      /* on remonte au fichier natif : « x-s.webp » et « x-t.webp » sont
         des réductions, l'original est « x.webp » */
      var s = im.getAttribute('src') || im.getAttribute('data-src') || '';
      return s.replace(/-(s|t)\.webp$/, '.webp');
    }
    function montre(i) {
      if (!jeu.length) return;
      rang = (i + jeu.length) % jeu.length;
      var im = jeu[rang], url = grande(im);
      lg.textContent = (im.getAttribute('alt') || '') +
        (jeu.length > 1 ? '   ·   ' + (rang + 1) + ' / ' + jeu.length : '');
      /* On décode HORS écran avant d'afficher : poser directement une image
         de 3200 px faisait tomber l'ouverture à 55 fps. */
      var pre = new Image();
      pre.src = url;
      var pose = function () { lim.src = url; lim.alt = im.getAttribute('alt') || ''; };
      if (pre.decode) pre.decode().then(pose).catch(pose); else pose();
      /* et on prépare la suivante pendant qu'on regarde celle-ci */
      var apres = jeu[(rang + 1) % jeu.length];
      if (apres) { var q = new Image(); q.src = grande(apres); }
    }
    /* On ne montre que les photos du MÊME ensemble : le carrousel qu'on
       regardait, le projet qu'on lisait, ou la bande d'images. Sinon un clic
       ouvrait les 44 photos de la page, tous sujets mélangés. */
    function ensemble(im) {
      var p = im.closest('.carr') || im.closest('.pj') || im.closest('.bande')
              || im.closest('.duo2') || im.closest('.hero');
      var l = p ? [].slice.call(p.querySelectorAll('[data-loupe]')) : [im];
      return l.length ? l : [im];
    }
    function ouvre(im) {
      jeu = ensemble(im);
      avant = doc.activeElement;
      loupe.hidden = false;
      body.style.overflow = 'hidden';
      if (lenis) lenis.stop();
      /* on arrête le carrousel : le laisser tourner derrière la visionneuse
         coûtait des images pour rien (55 fps mesurés à l'ouverture). */
      if (pauseCarr) pauseCarr(true);
      montre(jeu.indexOf(im));
      requestAnimationFrame(function () { loupe.classList.add('ouvert'); });
      loupe.querySelector('.fermer').focus();
    }
    function ferme2() {
      loupe.classList.remove('ouvert');
      body.style.overflow = '';
      if (lenis) lenis.start();
      if (pauseCarr) pauseCarr(false);
      setTimeout(function () { loupe.hidden = true; lim.removeAttribute('src'); }, 420);
      if (avant && avant.focus) avant.focus();
    }
    doc.addEventListener('click', function (e) {
      var im = e.target.closest ? e.target.closest('[data-loupe]') : null;
      if (im) { e.preventDefault(); ouvre(im); }
    });
    loupe.querySelector('.fermer').addEventListener('click', ferme2);
    loupe.querySelector('.prec').addEventListener('click', function () { montre(rang - 1); });
    loupe.querySelector('.suiv').addEventListener('click', function () { montre(rang + 1); });
    loupe.addEventListener('click', function (e) {
      if (e.target === loupe || e.target.classList.contains('fond-clic')) ferme2();
    });
    doc.addEventListener('keydown', function (e) {
      if (loupe.hidden) return;
      if (e.key === 'Escape') ferme2();
      if (e.key === 'ArrowRight') montre(rang + 1);
      if (e.key === 'ArrowLeft') montre(rang - 1);
    });
  }

  /* ── les lignes d'avis, arrêtables au doigt ──────────────
     Sur téléphone il n'y a pas de survol : sans ça, personne ne peut
     figer une ligne pour finir de lire un avis. Un appui l'arrête,
     un second la relance. */
  Array.prototype.forEach.call(doc.querySelectorAll('.fil'), function (f) {
    f.addEventListener('click', function (e) {
      if (e.target.closest('a')) return;
      f.classList.toggle('stop');
    });
  });

  /* ── révélations ───────────────────────────────────────── */
  function toutPoser() {
    Array.prototype.forEach.call(doc.querySelectorAll('.r,.voile,.cadre,.mot'), function (e) {
      e.classList.add('on');
    });
  }
  if (reduit || !gs || !ST) {
    root.classList.remove('anim'); toutPoser();
    window.addEventListener('scroll', function () { barre(window.scrollY); }, { passive: true });
    barre(window.scrollY);
    if (demarre) demarre();
    return;
  }
  root.classList.add('anim');
  gs.registerPlugin(ST);

  /* ══ LENIS ═══════════════════════════════════════════════
     Mode LERP : pas de durée, donc pas d'inertie qui traîne.
     La molette répond au doigt, le lissage ne gomme que les à-coups. */
  if (window.Lenis && !reduit) {
    lenis = new window.Lenis({
      lerp: 0.11,            /* plus haut = plus direct. 0,11 lisse sans retarder */
      wheelMultiplier: 1,    /* on ne change PAS la course de la molette */
      touchMultiplier: 1.6,
      smoothWheel: true,
      smoothTouch: false     /* sur mobile, le défilement natif reste meilleur */
    });
    lenis.on('scroll', function (e) { ST.update(); barre(e.animatedScroll || window.scrollY); });
    gs.ticker.add(function (t) { lenis.raf(t * 1000); });
    gs.ticker.lagSmoothing(0);
  } else {
    window.addEventListener('scroll', function () { barre(window.scrollY); }, { passive: true });
  }
  /* Filet : un défilement restauré par le navigateur (retour arrière, ancre)
     ne passe PAS par Lenis, donc ScrollTrigger gardait des positions périmées
     et quatre cases ne se révélaient jamais. Mesuré après un cran de molette. */
  window.addEventListener('scroll', function () {
    ST.update(); barre(window.scrollY);
  }, { passive: true });
  barre(window.scrollY);

  /* Déclencheur 1 — toutes les révélations, en un seul lot. */
  ST.batch('.r, .voile, .cadre, .mot', {
    start: 'top 90%', once: true,
    onEnter: function (lot) {
      lot.forEach(function (e, i) { setTimeout(function () { e.classList.add('on'); }, i * 85); });
    }
  });
  /* le titre du hero part tout de suite, il est déjà à l'écran */
  requestAnimationFrame(function () {
    Array.prototype.forEach.call(doc.querySelectorAll('.hero .mot'), function (e, i) {
      setTimeout(function () { e.classList.add('on'); }, 140 + i * 110);
    });
  });

  /* Rattrapage : page ouverte déjà défilée. */
  function rattrape() {
    if (window.scrollY < 10) return;
    var bas = window.innerHeight * 0.9;
    Array.prototype.forEach.call(doc.querySelectorAll('.r,.voile,.cadre,.mot'), function (e) {
      if (!e.classList.contains('on') && e.getBoundingClientRect().top < bas) e.classList.add('on');
    });
  }
  requestAnimationFrame(rattrape);
  setTimeout(rattrape, 300);
  window.addEventListener('load', rattrape);
  window.addEventListener('scroll', rattrape, { passive: true, once: true });

  /* ══ LA LUEUR SUR TÉLÉPHONE ══════════════════════════════
     Sur un écran tactile il n'y a pas de survol : rien ne dit qu'une
     case réagit. Une lueur passe donc sur chacune à son tour, au
     dévoilement puis toutes les dix secondes, tant qu'elle est à l'écran. */
  var tactile = window.matchMedia('(hover: none)').matches || window.innerWidth <= 900;
  if (tactile && !reduit) {
    var cases = [].slice.call(doc.querySelectorAll('.card, .carte-im, .presta a'));
    if (cases.length) {
      var brille = function (e) {
        if (!e) return;
        e.classList.remove('lueur');
        void e.offsetWidth;               /* on relance l'animation */
        e.classList.add('lueur');
        setTimeout(function () { e.classList.remove('lueur'); }, 1500);
      };
      /* au dévoilement */
      ST.batch('.card, .carte-im, .presta a', {
        start: 'top 88%', once: true,
        onEnter: function (lot) {
          lot.forEach(function (e, i) { setTimeout(function () { brille(e); }, 340 + i * 150); });
        }
      });
      /* puis toutes les dix secondes, sur celles qui sont à l'écran */
      var tour = 0;
      setInterval(function () {
        if (doc.hidden) return;
        var vues2 = cases.filter(function (e) {
          var r = e.getBoundingClientRect();
          return r.top < window.innerHeight - 40 && r.bottom > 40;
        });
        if (!vues2.length) return;
        brille(vues2[tour % vues2.length]);
        tour++;
      }, 10000);
    }
  }

  /* Déclencheur 2 — le hero respire pendant qu'on le quitte. */
  var fond = doc.querySelector('.hero .fond');
  if (fond) {
    var poseF = gs.quickSetter(fond, 'y', 'px');
    ST.create({
      trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.5,
      onUpdate: function (s) { poseF(s.progress * window.innerHeight * 0.16); }
    });
  }

  /* Déclencheur 3 — les colonnes, à trois vitesses.
     Un seul déclencheur pour les trois, un seul quickSetter chacune. */
  var bloc = doc.querySelector('.colonnes');
  if (bloc && window.innerWidth > 860) {
    var cols = [].slice.call(bloc.querySelectorAll('.cl'));
    var poseurs = cols.map(function (c) { return gs.quickSetter(c, 'y', 'px'); });
    var ampl = [34, -46, 12];   /* faible : au delà, les bords font des dents de scie */
    ST.create({
      trigger: bloc, start: 'top bottom', end: 'bottom top', scrub: 0.55,
      onUpdate: function (s) {
        var p = s.progress - 0.5;
        for (var i = 0; i < poseurs.length; i++) poseurs[i](p * (ampl[i % 3] || 0));
      }
    });
  }

  if (demarre) demarre();

  /* ── retour arrière (bfcache Safari) ────────────────────── */
  window.addEventListener('pagehide', ferme);
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    ferme(); toutPoser(); ST.refresh(); if (lenis) lenis.resize();
  });
  window.addEventListener('load', function () { ST.refresh(); if (lenis) lenis.resize(); });
})();
