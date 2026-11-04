// Built by Foxdusk
(() => {
  'use strict';

  // Contact details. WhatsApp: digits with country code, e.g. '60123456789'.
  // While it is empty, the WhatsApp buttons fall back to email.
  const CONTACT = { whatsapp: '60176982032', email: 'admin@foxdusk.com' };

  const $ = (id) => document.getElementById(id);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const ease = (t) => t * t * (3 - 2 * t);

  // ---------- Contact links ----------

  function contactHref(message) {
    if (CONTACT.whatsapp) return `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(message)}`;
    return `mailto:${CONTACT.email}?subject=${encodeURIComponent('Foxdusk AIOS question')}&body=${encodeURIComponent(message)}`;
  }

  $('whatsappLink').querySelector('.btn-label').textContent = CONTACT.whatsapp ? 'Message us on WhatsApp' : 'Email us';
  $('whatsappLink').href = contactHref('Hi Foxdusk, I have a question about Foxdusk AIOS:');
  $('waFloat').href = contactHref('Hi Foxdusk, I have a question about Foxdusk AIOS:');
  $('emailLink').textContent = CONTACT.email;
  $('emailLink').href = `mailto:${CONTACT.email}`;

  const root = document.documentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wideScreen = matchMedia('(min-width: 961px)');
  const inQuad = (t) => t * t;
  const outQuad = (t) => t * (2 - t);
  const inOutQuad = (t) => (t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const fade = (v, from, to, curve = inOutQuad) => curve(clamp((v - from) / (to - from), 0, 1));

  root.classList.add('js');

  // Value along a timeline of [position, value, curve] stops. Each stop's curve shapes the stretch after it.
  function along(pos, stops) {
    if (pos <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (pos < stops[i][0]) {
        const [from, a, curve = inOutQuad] = stops[i - 1];
        return lerp(a, stops[i][1], curve((pos - from) / (stops[i][0] - from)));
      }
    }
    return stops[stops.length - 1][1];
  }

  // ---------- 1. Hero: a long scene, timed in screen heights (vh) scrolled ----------

  const DARK = [41, 37, 33];
  const LIGHT = [243, 237, 228];
  const intro = $('intro');
  const stage = $('introStage');
  const rig = $('rig');
  const device = $('device');
  const mess = $('mess');
  const fan = $('fan');
  const heroText = $('heroText');
  const fanLayers = [...fan.children].map((el) => ({ el, sx: Number(el.dataset.sx) }));

  function paintIntro() {
    const vh = stage.clientHeight / 100;
    const vw = stage.clientWidth / 100;
    const s = Math.max(0, -intro.getBoundingClientRect().top) / vh;
    const wide = wideScreen.matches;
    const W = device.offsetWidth;
    const H = device.offsetHeight;
    const devLeft = (stage.clientWidth - W) / 2;
    const devTop = (stage.clientHeight - H) / 2;

    heroText.style.opacity = along(s, [[0, 1], [50, 0]]);
    $('down').style.opacity = along(s, [[0, 1], [25, 0]]);

    // The product rises from below and grows to full size.
    const rise = fade(s, 0, 50, outQuad);
    device.style.transform = `translate3d(0, ${(lerp(100, 0, rise) * H / 100 + (wide ? 0 : (1 - rise) * 20 * vh)).toFixed(1)}px, 0) scale(${lerp(.5, 1, rise).toFixed(4)})`;

    device.style.opacity = wide ? 1 : along(s, [[0, 0], [15, 1]]);

    // The group chat starts as the big card, then settles inside the product and dissolves into the clean screen.
    const restW = wide ? W * .52 : W - 20;
    const restH = wide ? restW * .5625 : Math.min(H - 20, 220);
    const restX = wide ? devLeft + W * .37 : devLeft + 10;
    const restY = wide ? devTop + H * .22 : devTop + 10;
    const cardW = wide ? 71.11 * vh : stage.clientWidth - 40;
    const cardH = wide ? cardW * .5625 : restH * (cardW / restW);
    const cardX = (stage.clientWidth - cardW) / 2;
    const cardY = stage.clientHeight + (wide ? 6 * vh : -24) - cardH;
    const move = fade(s, 0, 50);
    mess.style.width = `${restW}px`;
    mess.style.height = `${restH}px`;
    mess.style.transform = `translate3d(${lerp(cardX, restX, move).toFixed(1)}px, ${lerp(cardY, restY, move).toFixed(1)}px, 0) scale(${lerp(cardW / restW, 1, move).toFixed(4)})`;
    const messAlpha = along(s, [[30, 1], [40, 0]]);
    mess.style.opacity = messAlpha;
    mess.style.visibility = messAlpha ? 'visible' : 'hidden';

    const bg = wide ? along(s, [[50, 0], [100, 1]]) : along(s, [[20, 0], [55, 1]]);
    stage.style.background = `rgb(${DARK.map((v, i) => Math.round(lerp(v, LIGHT[i], bg))).join(',')})`;

    // Phones: the next section slides up over the empty space below the product.
    root.style.setProperty('--intro-gap', wide ? '0px' : `${Math.max(0, stage.clientHeight - devTop - H - 28).toFixed(0)}px`);

    if (wide) {
      // The fanned cards squeeze and lift away, the nearest ones least, with a slight mouse drift.
      const lift = fade(s, 0, 50);
      fan.style.opacity = along(s, [[0, 1], [50, 0]]);
      fanLayers.forEach(({ el, sx }) => {
        el.style.transform = `translateY(${(-lift * (cardY - devTop)).toFixed(1)}px) scale(${lerp(1, sx, lift).toFixed(3)}, ${lerp(1, .75, lift).toFixed(3)}) translateY(${(-30 * lift).toFixed(1)}%)`;
      });

      // Left half a device, hold, cross to the right, then the whole stage scrolls away with the page.
      const x = along(s, [[50, 0], [100, -.5], [160, -.5], [225, .5], [240, .5]]) * W;
      rig.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
      rig.style.opacity = 1;
      $('screenB').style.opacity = along(s, [[180, 0], [190, 1]]);

      $('blockA').style.opacity = along(s, [[80, 0], [100, 1], [150, 1], [175, 0]]);
      $('blockB').style.opacity = along(s, [[205, 0], [225, 1]]);
    } else {
      rig.style.transform = '';
      rig.style.opacity = 1;
      $('screenB').style.opacity = 0;
    }
  }

  // Cards drift gently with the mouse, easing towards it.
  const decoItems = [...fan.querySelectorAll('[data-m]')].map((el) => ({ el, m: Number(el.dataset.m) }));
  const mouse = { x: .5, y: .5, nowX: .5, nowY: .5 };

  function paintDeco() {
    mouse.nowX += (mouse.x - mouse.nowX) * .08;
    mouse.nowY += (mouse.y - mouse.nowY) * .08;
    for (const { el, m } of decoItems) {
      el.style.transform = `translate3d(${(mouse.nowX * m * 30).toFixed(1)}px, ${(mouse.nowY * m * 30).toFixed(1)}px, 0)`;
    }
    if (scrollY < innerHeight) requestAnimationFrame(paintDeco);
    else decoRunning = false;
  }

  let decoRunning = false;
  function runDeco() {
    if (decoRunning || reducedMotion || !matchMedia('(hover: hover)').matches) return;
    decoRunning = true;
    requestAnimationFrame(paintDeco);
  }

  addEventListener('mousemove', (e) => {
    mouse.x = e.clientX / innerWidth;
    mouse.y = e.clientY / innerHeight;
  }, { passive: true });

  // ---------- 2. Phones swing through; devices slide in from the side ----------

  const phones = $('phones');
  const phoneLeft = $('phoneLeft');
  const phoneRight = $('phoneRight');
  const sliders = [...document.querySelectorAll('[data-slide]')];

  function paintFeatures() {
    if (wideScreen.matches) {
      // Across the whole time the section is on screen, so the phones are always in view.
      const box = phones.getBoundingClientRect();
      const vh = innerHeight / 100;
      const t = clamp((innerHeight - box.top) / (innerHeight + box.height), 0, 1);
      phoneLeft.style.transform = `translate3d(${(-6 * t * vh).toFixed(1)}px, ${(lerp(26, -26, t) * vh).toFixed(1)}px, 0) rotate(${lerp(18, 0, t).toFixed(2)}deg)`;
      phoneRight.style.transform = `translate3d(0, ${(lerp(46, -30, t) * vh).toFixed(1)}px, 0) rotate(${lerp(-20, 10, t).toFixed(2)}deg)`;
    } else {
      phoneLeft.style.transform = '';
      phoneRight.style.transform = '';
    }
    for (const el of sliders) {
      const box = el.parentElement.getBoundingClientRect();
      // Starts as the row's top enters; arrives when the row is centred on screen.
      const t = fade(innerHeight - box.top, 0, innerHeight / 2 + box.height / 2);
      el.style.transform = wideScreen.matches ? `translate3d(${((1 - t) * 100 * Number(el.dataset.slide)).toFixed(2)}%, 0, 0)` : '';
    }
  }

  // ---------- 3. Sunset: scrolling moves the sun along an arc and behind the hill ----------

  const scene = $('scene');
  const sceneStage = $('sceneStage');
  const sceneSun = $('sceneSun');
  const sceneText = $('sceneText');
  const SUN_HIGH = [251, 132, 36];
  const SUN_LOW = [169, 75, 11];
  const SCENE_DARK = [41, 37, 33];
  const SCENE_LIGHT = [243, 237, 228];
  const mixRgb = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));

  function paintScene() {
    const box = scene.getBoundingClientRect();
    if (box.bottom < -50 || box.top > innerHeight + 50) return;
    const range = box.height - innerHeight;
    const t = clamp(-box.top / range, 0, 1);
    const w = sceneStage.clientWidth;
    const h = sceneStage.clientHeight;
    const wide = wideScreen.matches;

    // An arc: quick across at first, then falling straight down below the hilltop.
    const fall = inQuad(t);
    const x = lerp(w * (wide ? .07 : .08), w * (wide ? .24 : .5), outQuad(t));
    const y = lerp(h * (wide ? .12 : .46), h * 1.08, fall);
    sceneSun.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${lerp(.86, 1.14, t).toFixed(3)})`;
    const colour = mixRgb(SUN_HIGH, SUN_LOW, fade(t, .1, .8));
    sceneSun.style.background = `rgb(${colour.join(',')})`;
    sceneSun.style.setProperty('--sun-glow', `rgb(${colour.join(' ')} / .22)`);

    // Once the sun is going down, the sky falls into the dark of the next section.
    // Phones keep the sky and text, so no empty dark screen sits before the next section.
    const dusk = wide ? fade(t, .6, 1) : 0;
    sceneStage.style.background = `rgb(${mixRgb(SCENE_LIGHT, SCENE_DARK, dusk).join(',')})`;
    sceneText.style.opacity = wide ? 1 - fade(t, .5, .7) : 1;
  }

  // Details inside each feature come alive as the row reaches the middle of the screen.
  const chartBars = [...document.querySelectorAll('.feature .chart')].map((chart) => ({ chart, bars: [...chart.children] }));
  const rings = [...document.querySelectorAll('.features .ring, .intro-stage .ring')];
  const phoneRows = [...document.querySelectorAll('#phones .phone-list li')];
  const siteFields = [...document.querySelectorAll('.site-fields i')];

  function rowProgress(el) {
    return clamp((innerHeight * .95 - el.getBoundingClientRect().top) / (innerHeight * .55), 0, 1);
  }

  function paintDetails() {
    for (const { chart, bars } of chartBars) {
      const t = reducedMotion ? 1 : rowProgress(chart);
      bars.forEach((bar, i) => { bar.style.transform = `scaleY(${fade(t, i * .06, .5 + i * .06, outQuad).toFixed(3)})`; });
    }
    for (const ring of rings) {
      const t = reducedMotion ? 1 : (ring.closest('.block') ? 1 : rowProgress(ring));
      ring.style.setProperty('--fill', `${Math.round(t * 75)}%`);
    }
    const rowT = reducedMotion ? 1 : rowProgress(phones);
    phoneRows.forEach((row, i) => {
      const t = fade(rowT, i * .05, .45 + i * .05);
      row.style.opacity = t.toFixed(3);
      row.style.transform = `translateY(${((1 - t) * 14).toFixed(1)}px)`;
    });
    siteFields.forEach((field, i) => {
      const t = reducedMotion ? 1 : fade(rowProgress(field), i * .15, .5 + i * .15);
      field.style.opacity = lerp(.25, 1, t).toFixed(3);
      field.style.transform = `translateY(${((1 - t) * 12).toFixed(1)}px)`;
    });
  }

  // Scene background moves slower than the page; the dark split sinks under the next section.
  const shifters = [...document.querySelectorAll('[data-shift]')];
  const unders = [...document.querySelectorAll('[data-under]')];

  function paintDepth() {
    for (const el of shifters) {
      const box = el.parentElement.getBoundingClientRect();
      if (box.bottom < -200 || box.top > innerHeight + 200) continue;
      const t = (box.top + box.height / 2 - innerHeight / 2) / innerHeight;
      el.style.transform = `translate3d(0, ${(t * Number(el.dataset.shift) * 2).toFixed(1)}px, 0)`;
    }
    for (const el of unders) {
      const box = el.getBoundingClientRect();
      const inner = el.children;
      const t = fade(innerHeight - box.bottom, 0, innerHeight, inQuad);
      for (const child of inner) child.style.transform = `translate3d(0, ${(t * 20).toFixed(2)}vh, 0)`;
    }
  }

  // ---------- 5. Steps: the list scrolls; the product and lens answer to it ----------

  const howScreens = [...$('howScreens').children];
  const howSteps = [...$('howSteps').children].map((el) => ({ el, text: el.querySelector('p'), badge: el.querySelector('.num') }));
  const lensWords = [...$('lens').children];
  const LENS = [[.97, .08], [.03, .92], [.97, .9], [.03, .1]];
  const GREY = [243, 237, 228];
  const BADGE = [41, 37, 33];

  function paintHow() {
    const wide = wideScreen.matches;
    const mid = innerHeight / 2;
    // Position through the list in steps: 0 when step one is at mid-screen, 1 for step two, and so on.
    const first = howSteps[0].el.getBoundingClientRect();
    const size = first.height || 1;
    const pos = clamp((mid - first.top - size / 2) / size, 0, howSteps.length - 1);

    howSteps.forEach(({ el, text, badge }, i) => {
      const on = 1 - fade(Math.abs(pos - i), .25, .75);
      text.style.opacity = wide ? lerp(.45, 1, on).toFixed(3) : '';
      const lit = wide ? fade(pos, i - .5, i - .1) : 1;
      badge.style.background = `rgb(${GREY.map((v, n) => Math.round(lerp(v, BADGE[n], lit))).join(',')})`;
      badge.style.color = lit > .5 ? '#fff' : '#8f857b';
      el.style.opacity = wide ? (i < pos - .6 ? lerp(1, .35, fade(pos - i, .6, 1)).toFixed(3) : 1) : '';
    });

    howScreens.forEach((el, i) => {
      el.style.opacity = wide ? fade(pos, i - .55, i - .05).toFixed(3) : (i === 0 ? 1 : 0);
    });

    if (wide) {
      const whole = Math.min(LENS.length - 2, Math.floor(pos));
      const t = inOutQuad(clamp((pos - whole - .1) / .8, 0, 1));
      const box = howScreens[0].parentElement;
      const x = lerp(LENS[whole][0], LENS[whole + 1][0], t) * box.offsetWidth;
      const y = lerp(LENS[whole][1], LENS[whole + 1][1], t) * box.offsetHeight;
      $('lens').style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      lensWords.forEach((word, i) => { word.style.opacity = (1 - fade(Math.abs(pos - i), .2, .5)).toFixed(3); });
    }
  }

  // ---------- 6. Why: each card takes 90vh of scrolling to fold into a tab ----------

  const why = $('why');
  const whyCards = [...$('whyCards').children];
  const TAB = 70;
  const GAP = 8;

  function paintWhy() {
    if (!wideScreen.matches) {
      whyCards.forEach((card) => {
        card.classList.remove('done');
        card.querySelector('.why-title').style.transform = '';
      });
      return;
    }
    const scrolled = Math.max(0, -why.getBoundingClientRect().top) / (innerHeight * .9);
    const room = $('whyCards').clientWidth;
    const full = room - (whyCards.length - 1) * (TAB + GAP);
    const height = $('whyCards').clientHeight;
    whyCards.forEach((card, i) => {
      const folded = i === whyCards.length - 1 ? 0 : fade(scrolled, i, i + 1);
      card.style.setProperty('--full', `${full}px`);
      card.style.setProperty('--w', `${lerp(full, TAB, folded).toFixed(1)}px`);
      card.style.setProperty('--open', (1 - fade(folded, .05, .5)).toFixed(3));
      card.classList.toggle('done', folded > .85);
      // The title swings round and drops to the bottom of the tab.
      const y = lerp(0, height - 40, folded);
      const x = lerp(0, 4, folded);
      card.querySelector('.why-title').style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${(-90 * folded).toFixed(2)}deg)`;
    });
  }

  // ---------- 8. What we build: cards light up one after another ----------

  const buildCards = [...$('buildCards').children];

  function paintBuild() {
    const box = $('buildCards').getBoundingClientRect();
    const pos = 100 * (box.top + box.height / 2) / innerHeight;
    buildCards.forEach((card, i) => {
      card.style.setProperty('--progress', wideScreen.matches && !reducedMotion ? fade(pos, 120 - i * 8, 95 - i * 8).toFixed(3) : 1);
    });
  }

  // ---------- Soft reveals ----------

  let unrevealed = [...document.querySelectorAll('.reveal')];

  function reveal() {
    unrevealed = unrevealed.filter((el) => {
      if (!reducedMotion && el.getBoundingClientRect().top > innerHeight * .92) return true;
      el.classList.add('in');
      return false;
    });
  }

  // ---------- Closing wall ----------

  const TILES = [
    ['Transcribe', 'Transcript added.'],
    ['Remove dead air', 'Removed in 48 places'],
    ['Fix mistakes', '10 cuts selected'],
    ['Captions', 'Adding captions'],
    ['Motion graphics', 'Claude finished building your video.'],
    ['Finish & download', 'Saving final'],
  ];

  function fillWall() {
    const make = (list) => [...list, ...list].map(([label, text]) => {
      const tile = document.createElement('div');
      tile.className = 'wall-tile';
      const span = document.createElement('span');
      span.textContent = label;
      const b = document.createElement('b');
      b.textContent = text;
      tile.append(span, b);
      return tile;
    });
    [TILES, [...TILES].reverse()].forEach((list) => {
      const col = document.createElement('div');
      col.className = 'wall-col';
      col.append(...make(list));
      $('wall').append(col);
    });
  }

  // ---------- Sample screen: a Foxdusk Studio project moving through its steps ----------

  const STEPS = [
    { id: '2', title: 'Transcribe', sub: 'Words with timings' },
    { id: '3', title: 'Remove dead air', sub: 'Trim long pauses' },
    { id: '4', title: 'Fix mistakes', sub: 'Remove stutters and mistakes' },
    { id: '5', title: 'Captions', sub: 'Words on screen' },
  ];
  let doneSteps = 2;

  function paintScreen() {
    $('screenRows').replaceChildren(...STEPS.map((step, i) => {
      const li = document.createElement('li');
      const status = document.createElement('span');
      status.className = 'status';
      // Like Studio's step list: a finished step shows a tick instead of its number.
      status.textContent = step.sub;
      if (i < doneSteps) status.dataset.done = '';
      const id = document.createElement('span');
      id.className = 'id';
      id.textContent = i < doneSteps ? '✓' : step.id;
      const owner = document.createElement('span');
      owner.className = 'owner';
      owner.textContent = step.title;
      li.append(id, owner, status);
      return li;
    }));
    // The numbers Remove dead air shows after trimming.
    $('statOpen').textContent = '14:32';
    $('statWaiting').textContent = '12:08';
    $('statDone').textContent = '2:24';
  }

  paintScreen();
  if (!reducedMotion) {
    setInterval(() => {
      doneSteps = (doneSteps + 1) % (STEPS.length + 1);
      paintScreen();
    }, 2200);
  }

  // ---------- Workflow X-ray: one working day, played out two ways ----------

  // Each problem has its own stages, typical numbers and starting assumption. `stuck` is the slow stage.
  const PROBLEMS = [
    {
      label: 'Cutting dead air by hand',
      now: ['Scrub', 'Find pauses', 'Cut', 'Recheck'], system: ['Transcript', 'Auto cut', 'Review', 'Done'],
      stuck: 1, jobs: 5, people: 1, minutes: 45, save: 70,
    },
    {
      label: 'Finding retakes and stutters',
      now: ['Watch it all', 'Spot retakes', 'Cut', 'Rewatch'], system: ['Transcript', 'Flagged', 'Approve', 'Done'],
      stuck: 1, jobs: 4, people: 1, minutes: 60, save: 60,
    },
    {
      label: 'Typing captions by hand',
      now: ['Listen', 'Type', 'Sync', 'Fix typos'], system: ['Transcript', 'Captions', 'Brand style', 'Burned in'],
      stuck: 2, jobs: 6, people: 1, minutes: 40, save: 75,
    },
    {
      label: 'Making titles and graphics',
      now: ['Open app', 'Design', 'Keyframe', 'Export'], system: ['Prompt', 'Claude builds', 'Preview', 'Render'],
      stuck: 2, jobs: 3, people: 1, minutes: 90, save: 55,
    },
    {
      label: 'Waiting on an editor',
      now: ['Send file', 'Wait', 'Feedback', 'Wait again'], system: ['Record', 'Edit yourself', 'Review', 'Post'],
      stuck: 1, jobs: 4, people: 1, minutes: 120, save: 50,
    },
  ];
  const DAY_START = 9;
  const DUSK = 18;
  const DAY_LIMIT = 24;
  const PLAY_MS = 5200;
  const DOTS = 9;
  const SLOW_SHARE = .62;

  const fields = {
    jobs: $('jobs'), people: $('people'), minutes: $('minutes'), rate: $('rate'), save: $('save'),
  };
  const lanes = {
    now: { el: $('laneNow'), status: $('statusNow') },
    system: { el: $('laneSystem'), status: $('statusSystem') },
  };

  for (const lane of Object.values(lanes)) {
    lane.fill = lane.el.querySelector('.lane-fill');
    lane.track = lane.el.querySelector('.lane-track');
    lane.stops = lane.el.querySelector('.lane-stops');
    const dots = lane.el.querySelector('.lane-dots');
    lane.dots = Array.from({ length: DOTS }, () => dots.appendChild(document.createElement('i')));
  }

  $('choices').append(...PROBLEMS.map((problem, i) => {
    const label = document.createElement('label');
    label.className = 'choice';
    const input = document.createElement('input');
    Object.assign(input, { type: 'radio', name: 'problem', value: i, checked: i === 0 });
    const span = document.createElement('span');
    span.textContent = problem.label;
    label.append(input, span);
    return label;
  }));

  const currentProblem = () => PROBLEMS[Number(document.querySelector('[name="problem"]:checked').value)];

  // Hours as a clock, carrying past midnight into the next day's wording elsewhere.
  function clockText(hours) {
    const minutes = Math.round(hours * 60);
    return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }

  function durationText(hours) {
    const minutes = Math.round(hours * 60);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (!h) return `${m} min`;
    return m ? `${h}h ${m}min` : `${h}h`;
  }

  const money = (value) => `RM ${Math.round(value).toLocaleString('en-US')}`;

  function workOut() {
    const jobs = Number(fields.jobs.value);
    const people = Number(fields.people.value);
    const minutes = Number(fields.minutes.value);
    const rate = Number(fields.rate.value);
    const save = Number(fields.save.value) / 100;
    const hoursNow = jobs * minutes / people / 60;
    const hoursSystem = hoursNow * (1 - save);
    // Staff hours across everyone, not hours on the clock.
    const lostHoursMonth = jobs * minutes / 60 * save * 22;
    return {
      jobs, people, minutes, rate, save,
      hoursNow,
      hoursSystem,
      finishNow: DAY_START + hoursNow,
      finishSystem: DAY_START + hoursSystem,
      lostHoursMonth,
      lostMoneyYear: lostHoursMonth * rate * 12,
      lostDaysMonth: lostHoursMonth / 8,
    };
  }

  // Where a job has got to along the track. The slow stage takes most of the time on today's lane.
  function warp(t, slowSegment) {
    if (slowSegment === null) return t;
    const others = (1 - SLOW_SHARE) / 2;
    const shares = [0, 1, 2].map((i) => (i === slowSegment ? SLOW_SHARE : others));
    let done = 0;
    for (let i = 0; i < 3; i++) {
      if (t <= done + shares[i] || i === 2) return (i + clamp((t - done) / shares[i], 0, 1)) / 3;
      done += shares[i];
    }
    return 1;
  }

  function paintLane(lane, clock, finish, slowSegment) {
    const p = clamp((clock - DAY_START) / (finish - DAY_START), 0, 1);
    const width = lane.track.clientWidth;
    lane.fill.style.transform = `scaleX(${warp(p, slowSegment).toFixed(4)})`;
    lane.dots.forEach((dot, i) => {
      const t = clamp(p * 1.5 - (i / DOTS) * .5, 0, 1);
      dot.style.transform = `translate3d(${(warp(t, slowSegment) * width).toFixed(1)}px, 0, 0)`;
    });
    const done = clock >= finish;
    const late = finish > DUSK;
    if (done) {
      lane.status.textContent = finish >= DAY_LIMIT ? 'Runs into tomorrow' : `Done at ${clockText(finish)}${late ? ', after dusk' : ''}`;
    } else {
      lane.status.textContent = 'Working…';
    }
  }

  function paintSky(clock, end) {
    const sky = $('simSky');
    const w = sky.clientWidth;
    const h = sky.clientHeight;
    const toX = (time) => (time - DAY_START) / (end - DAY_START) * w;
    const x = toX(clock);
    // A simple arc: highest at midday, touching the ground at dusk, below it afterwards.
    const arc = 1 - ((clock - 13.5) / 4.5) ** 2;
    const y = h - 14 - clamp(arc, -.6, 1) * (h - 40);
    $('simSun').style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    $('simDusk').style.left = `${toX(DUSK).toFixed(1)}px`;
    const night = fade(clock, 16.5, 19);
    sky.style.background = `rgb(${[58, 52, 46].map((v, i) => Math.round(lerp(v, [31, 27, 24][i], night))).join(',')})`;
    $('simClock').textContent = clockText(clock);
  }

  function verdictText(result) {
    const verdict = $('simVerdict');
    const { finishNow, finishSystem } = result;
    const lines = document.createDocumentFragment();
    const em = (text) => {
      const node = document.createElement('em');
      node.textContent = text;
      return node;
    };
    if (result.hoursNow < 1) {
      verdict.textContent = `This takes your team about ${durationText(Math.max(result.hoursNow, 1 / 60))} a day, so it is probably not your bottleneck. Try the step that really eats your time.`;
      return;
    }
    if (finishNow >= DAY_LIMIT) {
      lines.append('This work does not fit in one day. ');
    } else if (finishNow > DUSK) {
      lines.append(`Your team finishes at ${clockText(finishNow)}, ${durationText(finishNow - DUSK)} after dusk. `);
    } else {
      lines.append(`This one job takes your team until ${clockText(finishNow)}. `);
    }
    if (finishSystem >= DUSK) {
      lines.append('Even with Foxdusk AIOS it is too much for one day, so this one needs more than software.');
    } else {
      lines.append('With Foxdusk AIOS: ', em(`${clockText(finishSystem)}, ${durationText(DUSK - finishSystem)} before dusk.`));
    }
    verdict.replaceChildren(lines);
  }

  function paintStops(problem) {
    const write = (lane, names, stuck) => lane.stops.replaceChildren(...names.map((name, i) => {
      const li = document.createElement('li');
      li.textContent = name;
      if (i === stuck) li.className = 'stuck';
      return li;
    }));
    write(lanes.now, problem.now, problem.stuck);
    write(lanes.system, problem.system, null);
  }

  let playStart = 0;
  let playing = false;
  let shown = null;

  function endOfDay(result) {
    return clamp(Math.max(DUSK + 1, result.finishNow + .25), DUSK + 1, DAY_LIMIT);
  }

  function paintTime(clock, result, problem) {
    const end = endOfDay(result);
    paintSky(clock, end);
    paintLane(lanes.now, clock, Math.min(result.finishNow, DAY_LIMIT), problem.stuck);
    paintLane(lanes.system, clock, Math.min(result.finishSystem, DAY_LIMIT), null);
  }

  function paintStats(result, amount) {
    $('statHours').textContent = Math.round(result.lostHoursMonth * amount).toLocaleString('en-US');
    $('statMoney').textContent = money(result.lostMoneyYear * amount);
    $('statDays').textContent = Math.round(result.lostDaysMonth * amount).toLocaleString('en-US');
  }

  function playFrame(now) {
    if (!playing) return;
    const t = clamp((now - playStart) / PLAY_MS, 0, 1);
    const end = endOfDay(shown.result);
    paintTime(lerp(DAY_START, end, t), shown.result, shown.problem);
    paintStats(shown.result, fade(t, .55, 1));
    $('simVerdict').style.opacity = fade(t, .7, 1);
    if (t < 1) requestAnimationFrame(playFrame);
    else playing = false;
  }

  function playDay() {
    const problem = currentProblem();
    const result = workOut();
    shown = { problem, result };
    paintStops(problem);
    verdictText(result);
    if (reducedMotion) {
      paintTime(endOfDay(result), result, problem);
      paintStats(result, 1);
      $('simVerdict').style.opacity = 1;
      return;
    }
    playStart = performance.now();
    if (!playing) {
      playing = true;
      requestAnimationFrame(playFrame);
    }
  }

  function paintTool() {
    const result = workOut();
    const problem = currentProblem();
    $('jobsOut').textContent = result.jobs;
    $('peopleOut').textContent = result.people;
    $('minutesOut').textContent = result.minutes;
    $('rateOut').textContent = money(result.rate);
    $('saveOut').textContent = `${Math.round(result.save * 100)}%`;
    $('simMini').textContent = result.finishNow >= DAY_LIMIT
      ? 'Today: runs into tomorrow'
      : `Today: done at ${clockText(result.finishNow)}. With Foxdusk AIOS: ${clockText(result.finishSystem)}.`;
    void problem; // The result button now goes to the order form.
  }

  function loadProblem() {
    const problem = currentProblem();
    fields.jobs.value = problem.jobs;
    fields.people.value = problem.people;
    fields.minutes.value = problem.minutes;
    fields.save.value = problem.save;
    paintTool();
    playDay();
  }

  // Dragging a slider updates the numbers at once and replays the day once the hand stops.
  let replayTimer = 0;
  $('tool').addEventListener('input', (event) => {
    if (event.target.name === 'problem') {
      loadProblem();
      return;
    }
    paintTool();
    const result = workOut();
    paintStats(result, 1);
    verdictText(result);
    $('simVerdict').style.opacity = 1;
    clearTimeout(replayTimer);
    replayTimer = setTimeout(playDay, 350);
  });
  $('simReplay').addEventListener('click', playDay);
  $('simGo').addEventListener('click', () => {
    simStarted = true;
    document.querySelector('.sim').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    setTimeout(playDay, reducedMotion ? 0 : 500);
  });
  fields.rate.value = 20;

  // The first day plays when the panel comes into view.
  let simStarted = false;
  function startSimWhenSeen() {
    if (simStarted) return;
    const box = document.querySelector('.sim').getBoundingClientRect();
    if (box.top < innerHeight * .6 && box.bottom > 0) {
      simStarted = true;
      playDay();
    }
  }

  // ---------- Clients and selected work, from projects.json ----------

  const clientTrack = $('clientTrack');
  let litClient = null;
  let litTimer = 0;

  function lightClient(item) {
    if (litClient) litClient.classList.remove('lit');
    litClient = item;
    if (!item) return;
    item.classList.add('lit');
    clearTimeout(litTimer);
    litTimer = setTimeout(() => lightClient(null), 1800);
  }

  // A tap anywhere on a name lights it, on any touch screen.
  clientTrack.addEventListener('touchstart', (event) => {
    const item = event.target.closest('li');
    if (item) lightClient(item);
  }, { passive: true });

  function fillMarquee(names) {
    const items = (group) => names.map((name) => {
      const li = document.createElement('li');
      // A client is a name, or { "name": "...", "logo": "logos/name.png" } once there is a logo.
      const client = typeof name === 'string' ? { name } : name;
      if (client.logo) {
        const logo = document.createElement('img');
        logo.src = client.logo;
        logo.alt = client.name;
        logo.loading = 'lazy';
        li.append(logo);
      } else {
        li.textContent = client.name;
      }
      if (group) li.setAttribute('aria-hidden', 'true');
      else li.tabIndex = 0;
      return li;
    });
    clientTrack.replaceChildren(...items(false));
    if (reducedMotion) return;
    // Repeat until one half is wider than any screen, then double it so the loop has no seam.
    const unit = Math.max(clientTrack.scrollWidth, 1);
    const repeats = Math.max(1, Math.ceil((innerWidth * 1.4) / unit));
    for (let i = 1; i < repeats * 2; i++) clientTrack.append(...items(true));
    // Keep one speed, however many clients there are.
    clientTrack.style.setProperty('--marquee-time', `${Math.max(16, unit * repeats / 45).toFixed(0)}s`);
  }

  window.foxduskProjects.load().then(({ clients, projects }) => {
    if (clients.length) fillMarquee(clients);
    const ready = projects.filter(window.foxduskProjects.isComplete);
    const featured = ready.filter((project) => project.featured).slice(0, window.foxduskProjects.MAX_FEATURED);
    if (featured.length) {
      $('featuredGrid').replaceChildren(...featured.map((project) => window.foxduskProjects.card(project, false)));
      $('featured').hidden = false;
    }
    $('seeAllWork').hidden = ready.length < window.foxduskProjects.MIN_FOR_WORK_PAGE;
    $('navWork').hidden = $('seeAllWork').hidden;
  });

  // ---------- Run ----------

  function paint() {
    paintIntro();
    paintFeatures();
    paintDetails();
    paintScene();
    paintDepth();
    paintHow();
    paintWhy();
    paintBuild();
    reveal();
    startSimWhenSeen();
    if (scrollY < innerHeight) runDeco();
  }

  let queued = false;
  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      paint();
    });
  }

  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  if (document.fonts) document.fonts.ready.then(queue);

  // Smooth wheel scrolling. The page still works normally if the library fails to load.
  if (window.Lenis && !reducedMotion) {
    const lenis = new window.Lenis({ lerp: .1, anchors: { offset: -60 } });
    const raf = (time) => {
      lenis.raf(time);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }

  // Phones skip the hero's sideways scene, so these rows carry copies of its two screens.
  document.querySelectorAll('[data-screen]').forEach((row) => {
    const source = row.dataset.screen === 'orders' ? device.querySelector('.screen') : $('screenB');
    const copy = source.cloneNode(true);
    copy.querySelectorAll('.mess, .screen-over').forEach((el) => el.remove());
    copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    copy.removeAttribute('id');
    copy.classList.remove('screen-over');
    copy.style.opacity = '';
    const frame = document.createElement('div');
    frame.className = 'device';
    frame.setAttribute('aria-hidden', 'true');
    frame.append(copy);
    row.append(frame);
  });

  fillWall();
  loadProblem();
  paint();
  setTimeout(reveal, 80);
})();
