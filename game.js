(() => {
  'use strict';

  const SAVE_KEY = 'brokenWagonPrototype_v1';
  const PHASE_SECONDS = 60 * 60;
  const DEV_SPEED = new URLSearchParams(location.search).has('dev') ? 60 : 1;
  const TOTAL_MILES = 3400;

  const route = [
    { name: 'Boston', short: 'BOS', mile: 0 },
    { name: 'Albany', short: 'ALB', mile: 170 },
    { name: 'Buffalo', short: 'BUF', mile: 460 },
    { name: 'Cleveland', short: 'CLE', mile: 650 },
    { name: 'Chicago', short: 'CHI', mile: 1000 },
    { name: 'St. Louis', short: 'STL', mile: 1300 },
    { name: 'Independence', short: 'IND', mile: 1550 },
    { name: 'Fort Kearny', short: 'KNY', mile: 1840 },
    { name: 'Fort Laramie', short: 'LAR', mile: 2150 },
    { name: 'South Pass', short: 'SPS', mile: 2400 },
    { name: 'Fort Bridger', short: 'BRG', mile: 2500 },
    { name: 'Salt Lake', short: 'SLC', mile: 2600 },
    { name: 'Humboldt', short: 'HMB', mile: 2950 },
    { name: 'Sierra Nevada', short: 'SIE', mile: 3250 },
    { name: 'Sacramento', short: 'SAC', mile: 3400 }
  ];

  const dom = {};
  let state;
  let lastTick = performance.now();
  let autosaveAccumulator = 0;
  let eventAccumulator = 0;

  const defaultState = () => ({
    version: 1,
    day: 1,
    phase: 'day',
    phaseElapsed: 0,
    paused: false,
    miles: 0,
    food: 300,
    ammo: 120,
    cash: 700,
    wagon: 100,
    oxen: 100,
    supplies: 18,
    medicine: 8,
    trace: 4,
    goodwill: 0,
    banditAttention: 0,
    party: [
      { name: 'You', health: 100, alive: true },
      { name: 'Partner', health: 100, alive: true },
      { name: 'Traveler 1', health: 100, alive: true },
      { name: 'Traveler 2', health: 100, alive: true },
      { name: 'Traveler 3', health: 100, alive: true }
    ],
    activity: { type: 'travel', remaining: null, total: null },
    pendingEvent: null,
    flags: {
      firstHuntGround: false,
      firstDiplomacy: false,
      firstRiver: false,
      firstWolves: false,
      warnedTrace: false
    },
    log: [
      { day: 1, phase: 'day', minute: 0, text: 'The wagon leaves Boston. California is roughly 3,400 miles west. The route is provisional.' },
      { day: 1, phase: 'day', minute: 0, text: 'The clock is live: one real hour of daylight, then one real hour of night. There are no action points.' }
    ]
  });

  function boot() {
    cacheDom();
    load();
    bind();
    render();
    requestAnimationFrame(loop);
  }

  function cacheDom() {
    [
      'phaseLabel','gameClock','pauseBtn','asciiMap','distanceText','partyStat','foodStat','ammoStat','cashStat',
      'wagonStat','oxenStat','supplyStat','medicineStat','traceStat','milesStat','activityName','activityDetail','activityProgress',
      'activityTimer','actionsTitle','actions','goodwillStat','banditStat','disciplineStat','journal','newGameBtn','eventModal',
      'eventTitle','eventText','eventChoices','devNotice'
    ].forEach(id => dom[id] = document.getElementById(id));
  }

  function bind() {
    dom.pauseBtn.addEventListener('click', () => {
      state.paused = !state.paused;
      addLog(state.paused ? 'The trail clock is paused.' : 'The trail clock resumes.');
      save();
      render();
    });

    dom.newGameBtn.addEventListener('click', () => {
      if (!confirm('Erase this prototype journey and start over?')) return;
      state = defaultState();
      save();
      render();
    });
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      state = raw ? { ...defaultState(), ...JSON.parse(raw) } : defaultState();
      if (!state.activity) state.activity = { type: 'travel', remaining: null, total: null };
      if (!Array.isArray(state.log)) state.log = [];
    } catch {
      state = defaultState();
    }
  }

  function save() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }

  function loop(now) {
    let realDelta = Math.min((now - lastTick) / 1000, 2);
    lastTick = now;

    if (!state.paused && !isJourneyOver()) {
      update(realDelta * DEV_SPEED);
    }

    render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    state.phaseElapsed += dt;
    autosaveAccumulator += dt;
    eventAccumulator += dt;

    // Food burns continuously. Roughly 12 lb/day for the starting party.
    const living = livingParty();
    state.food = Math.max(0, state.food - (living * 2.4 / (PHASE_SECONDS * 2)) * dt);
    if (state.food <= 0) damageParty(0.0025 * dt);

    updateActivity(dt);
    updatePassiveRisk(dt);

    if (eventAccumulator >= 30) {
      eventAccumulator = 0;
      maybeTriggerEvent();
    }

    if (state.phaseElapsed >= PHASE_SECONDS) {
      state.phaseElapsed -= PHASE_SECONDS;
      changePhase();
    }

    if (autosaveAccumulator >= 2) {
      autosaveAccumulator = 0;
      save();
    }
  }

  function updateActivity(dt) {
    const a = state.activity;
    if (!a) return;

    if (a.type === 'travel' && state.phase === 'day' && !state.pendingEvent) {
      // About 18-22 miles over an uninterrupted daylight hour.
      const condition = Math.max(.35, (state.wagon / 100) * .55 + (state.oxen / 100) * .45);
      const paceMilesPerSecond = (20 / PHASE_SECONDS) * condition;
      state.miles = Math.min(TOTAL_MILES, state.miles + paceMilesPerSecond * dt);
      state.trace = clamp(state.trace + (0.7 / 60) * dt, 0, 100);
      state.oxen = clamp(state.oxen - (0.16 / 60) * dt, 0, 100);
      if (state.miles >= TOTAL_MILES) arrive();
      return;
    }

    if (a.remaining != null) {
      a.remaining -= dt;
      if (a.remaining <= 0) completeActivity(a.type);
    }
  }

  function updatePassiveRisk(dt) {
    if (state.trace > 65) state.banditAttention = clamp(state.banditAttention + 0.003 * dt, 0, 100);
    else state.banditAttention = clamp(state.banditAttention - 0.0007 * dt, 0, 100);
  }

  function startActivity(type, minutes) {
    if (state.paused || state.pendingEvent || isJourneyOver()) return;
    const seconds = minutes * 60;
    state.activity = { type, remaining: seconds, total: seconds };
    const labels = {
      hunt: `The party stops to hunt. ${minutes} minutes of daylight are committed.`,
      repair: `Tools come out. ${minutes} minutes are committed to wagon repairs.`,
      clean: `The camp is being cleaned and traces covered. ${minutes} minutes committed.`,
      scout: `A scout moves ahead of the wagon. ${minutes} minutes committed.`,
      guard: `Someone takes an armed watch. ${minutes} minutes of the night are committed.`,
      fire: `The party banks the fire and secures the animals. ${minutes} minutes committed.`
    };
    addLog(labels[type] || `${type} begun.`);
    save();
  }

  function setContinuous(type) {
    if (state.paused || state.pendingEvent || isJourneyOver()) return;
    state.activity = { type, remaining: null, total: null };
    if (type === 'travel') addLog('The wagon starts rolling west again.');
    if (type === 'rest') addLog('The party rests while the clock keeps moving.');
    if (type === 'sleep') addLog('Most of the party sleeps. The night continues around them.');
    save();
  }

  function completeActivity(type) {
    if (type === 'hunt') {
      const bullets = randInt(3, 9);
      if (state.ammo < bullets) {
        addLog('The hunt ends early. There was not enough ammunition to make it worthwhile.');
      } else {
        state.ammo -= bullets;
        const gained = randInt(28, 76);
        state.food += gained;
        addLog(`The hunters return with ${gained} lb of usable meat after spending ${bullets} rounds.`);
      }
    } else if (type === 'repair') {
      if (state.supplies >= 2) {
        state.supplies -= 2;
        const fixed = randInt(14, 26);
        state.wagon = clamp(state.wagon + fixed, 0, 100);
        addLog(`Repairs restore about ${fixed}% wagon condition and use 2 repair supplies.`);
      } else {
        addLog('There are not enough spare supplies to make a proper repair.');
      }
    } else if (type === 'clean') {
      state.trace = clamp(state.trace - 32, 0, 100);
      state.banditAttention = clamp(state.banditAttention - 8, 0, 100);
      addLog('Ash, scraps, packaging, and obvious signs are cleaned or buried. The trail behind you is harder to follow.');
    } else if (type === 'scout') {
      state.banditAttention = clamp(state.banditAttention - 5, 0, 100);
      addLog(randomFrom([
        'The scout finds firm ground and no fresh sign of trouble ahead.',
        'The scout reports fresh hoofprints crossing the route, but none following it.',
        'The scout finds water and a patch of country with promising game sign.'
      ]));
      if (Math.random() < .35) state.food += randInt(2, 7);
    } else if (type === 'guard') {
      state.banditAttention = clamp(state.banditAttention - 3, 0, 100);
      addLog('The watch passes without incident. Tracks around camp are checked before anyone turns in.');
    } else if (type === 'fire') {
      state.trace = clamp(state.trace - 8, 0, 100);
      addLog('The animals are pulled close and the fire is kept controlled rather than blazing like a beacon.');
    }

    state.activity = state.phase === 'day'
      ? { type: 'travel', remaining: null, total: null }
      : { type: 'sleep', remaining: null, total: null };
    save();
  }

  function changePhase() {
    if (state.phase === 'day') {
      state.phase = 'night';
      state.trace = clamp(state.trace + 7, 0, 100);
      state.activity = { type: 'sleep', remaining: null, total: null };
      addLog('Sunset. The wagon stops and camp is made. A careless camp leaves signs behind.');
    } else {
      state.phase = 'day';
      state.day += 1;
      state.activity = { type: 'travel', remaining: null, total: null };
      state.oxen = clamp(state.oxen + 3.5, 0, 100);
      addLog(`Dawn of Day ${state.day}. The road west is waiting.`);
    }
    save();
  }

  function maybeTriggerEvent() {
    if (state.pendingEvent || state.paused || isJourneyOver()) return;

    // Scripted early encounters guarantee the prototype demonstrates the intended systems.
    if (!state.flags.firstHuntGround && state.phase === 'day' && state.phaseElapsed > 6 * 60) {
      state.flags.firstHuntGround = true;
      return showEvent({
        id: 'game-country',
        title: 'Good Hunting Country',
        text: 'Fresh rabbit sign and larger tracks cover the low ground. Stopping could cost travel time, but the party may put away enough meat to avoid hunger later.',
        choices: [
          { label: 'Stop and hunt (8 min)', action: () => startActivity('hunt', 8) },
          { label: 'Keep moving', action: () => { addLog('You leave the game country behind and keep the wagon rolling.'); setContinuous('travel'); } }
        ]
      });
    }

    if (!state.flags.firstDiplomacy && state.phase === 'day' && state.miles > 2.2) {
      state.flags.firstDiplomacy = true;
      return showEvent({
        id: 'delegation',
        title: 'A Delegation Approaches',
        text: 'A small local delegation approaches openly and watches the wagon. This prototype models diplomacy as a relationship, not an automatic fight. You can offer part of your food as a gesture of peaceful passage, attempt ordinary trade, or decline and move on.',
        choices: [
          { label: 'Offer 20 lb of food', disabled: state.food < 20, action: () => {
            state.food -= 20;
            state.goodwill = clamp(state.goodwill + 28, -100, 100);
            state.trace = clamp(state.trace - 5, 0, 100);
            addLog('You give up 20 lb of food. The meeting ends peacefully, and word of fair dealing may travel ahead of you.');
          }},
          { label: 'Trade $8 for information', disabled: state.cash < 8, action: () => {
            state.cash -= 8;
            state.goodwill = clamp(state.goodwill + 12, -100, 100);
            state.banditAttention = clamp(state.banditAttention - 8, 0, 100);
            addLog('A small trade is made. You receive useful information about water and traffic ahead.');
          }},
          { label: 'Decline and move on', action: () => {
            state.goodwill = clamp(state.goodwill - 4, -100, 100);
            addLog('You decline the meeting and continue west. Nothing happens immediately, but the encounter is remembered.');
          }}
        ]
      });
    }

    if (!state.flags.firstRiver && state.phase === 'day' && state.miles > 5.4) {
      state.flags.firstRiver = true;
      return showEvent({
        id: 'river',
        title: 'River Crossing',
        text: 'The road ends at a swollen crossing. The water is moving fast enough to make a bad decision expensive.',
        choices: [
          { label: 'Ford now', action: () => {
            if (Math.random() < .42) {
              const lost = randInt(12, 35);
              state.food = Math.max(0, state.food - lost);
              state.wagon = clamp(state.wagon - randInt(5, 14), 0, 100);
              addLog(`The ford goes badly. ${lost} lb of food is ruined and the wagon takes damage.`);
            } else addLog('The ford is ugly but successful. Everybody reaches the far bank.');
          }},
          { label: 'Wait and inspect (6 min)', action: () => {
            startActivity('scout', 6);
            state.wagon = clamp(state.wagon + 2, 0, 100);
            addLog('You spend time studying the current and choose a better line across.');
          }},
          { label: 'Use supplies to secure cargo', disabled: state.supplies < 2, action: () => {
            state.supplies -= 2;
            state.wagon = clamp(state.wagon - randInt(0, 3), 0, 100);
            addLog('Two supplies are used to lash and waterproof the load. The crossing succeeds with little loss.');
          }}
        ]
      });
    }

    if (state.phase === 'night' && !state.flags.firstWolves && state.phaseElapsed > 5 * 60) {
      state.flags.firstWolves = true;
      return showEvent({
        id: 'wolves',
        title: 'Eyes Beyond the Firelight',
        text: 'The oxen stir. Shapes move beyond the edge of the firelight and a low chorus carries through the dark.',
        choices: [
          { label: 'Stand armed watch (10 min)', action: () => startActivity('guard', 10) },
          { label: 'Fire two warning shots', disabled: state.ammo < 2, action: () => {
            state.ammo -= 2;
            state.trace = clamp(state.trace + 8, 0, 100);
            addLog('Two shots crack through the dark. The animals scatter, but anybody nearby now knows roughly where camp is.');
          }},
          { label: 'Bank the fire and hold quiet', action: () => {
            if (Math.random() < .25) {
              state.food = Math.max(0, state.food - 8);
              addLog('The wolves get into part of the food before they are driven away. 8 lb is lost.');
            } else addLog('The camp stays quiet. The shapes eventually drift away.');
          }}
        ]
      });
    }

    // Repeatable emergent events.
    const baseChance = state.phase === 'day' ? .018 : .011;
    const traceRisk = state.trace / 1000;
    if (Math.random() > baseChance + traceRisk) return;

    if (state.phase === 'day' && state.activity.type === 'travel') {
      const event = randomFrom(['breakdown','weather','tracks','merchant']);
      if (event === 'breakdown') {
        const damage = randInt(8, 18);
        state.wagon = clamp(state.wagon - damage, 0, 100);
        setContinuous('rest');
        showEvent({
          title: 'Something Gives Way',
          text: `A violent crack comes from under the wagon. Condition drops by ${damage}%. You can repair it properly or lash it together and risk the road.`,
          choices: [
            { label: 'Repair properly (10 min)', disabled: state.supplies < 2, action: () => startActivity('repair', 10) },
            { label: 'Lash it and move', action: () => {
              state.wagon = clamp(state.wagon - 5, 0, 100);
              addLog('A rough field repair gets the wagon moving, but the frame is worse for it.');
              setContinuous('travel');
            }}
          ]
        });
      } else if (event === 'weather') {
        state.oxen = clamp(state.oxen - randInt(2, 6), 0, 100);
        addLog('A spell of miserable weather slows the team and wears down the oxen.');
      } else if (event === 'tracks') {
        if (state.trace > 55) {
          state.banditAttention = clamp(state.banditAttention + 12, 0, 100);
          addLog('Fresh tracks appear behind your own. Someone may be following the trail you are leaving.');
        } else addLog('Old tracks cross the road and disappear. Nothing follows your wagon.');
      } else {
        addLog('A passing trader exchanges news of the road. Prices, rumors, and danger all seem worse farther west.');
      }
    } else if (state.phase === 'night') {
      if (state.trace > 60 && Math.random() < .45) {
        state.banditAttention = clamp(state.banditAttention + 10, 0, 100);
        addLog('Far off in the dark, a light appears where there should be none. Your trail may have drawn attention.');
      } else {
        addLog(randomFrom([
          'The oxen stamp and snort at something beyond the camp.',
          'The night is cold and uneventful. For once, that feels like good news.',
          'A distant animal call passes across the dark and fades.'
        ]));
      }
    }
  }

  function showEvent(event) {
    state.pendingEvent = event.id || 'event';
    dom.eventTitle.textContent = event.title;
    dom.eventText.textContent = event.text;
    dom.eventChoices.innerHTML = '';

    event.choices.forEach(choice => {
      const btn = document.createElement('button');
      btn.className = 'event-choice';
      btn.textContent = choice.label;
      btn.disabled = !!choice.disabled;
      btn.addEventListener('click', () => {
        state.pendingEvent = null;
        dom.eventModal.classList.add('hidden');
        choice.action();
        save();
        render();
      });
      dom.eventChoices.appendChild(btn);
    });
    dom.eventModal.classList.remove('hidden');
    save();
  }

  function arrive() {
    state.miles = TOTAL_MILES;
    state.activity = { type: 'arrived', remaining: null, total: null };
    addLog('Sacramento. The wagon has reached California. The next game layer would begin here: settlement, claims, work, and the hunt for gold.');
    save();
  }

  function isJourneyOver() {
    return state.miles >= TOTAL_MILES || livingParty() <= 0;
  }

  function damageParty(amount) {
    state.party.forEach(p => {
      if (!p.alive) return;
      p.health = Math.max(0, p.health - amount);
      if (p.health <= 0) p.alive = false;
    });
  }

  function livingParty() {
    return state.party.filter(p => p.alive).length;
  }

  function addLog(text) {
    state.log.unshift({
      day: state.day,
      phase: state.phase,
      minute: inGameMinuteOfPhase(),
      text
    });
    state.log = state.log.slice(0, 80);
  }

  function render() {
    renderClock();
    renderStats();
    renderMap();
    renderActivity();
    renderActions();
    renderRelations();
    renderJournal();
    dom.pauseBtn.textContent = state.paused ? 'PLAY' : 'PAUSE';
    dom.devNotice.textContent = DEV_SPEED > 1 ? 'DEV MODE: clock ×60' : '';
  }

  function renderClock() {
    const isDay = state.phase === 'day';
    dom.phaseLabel.textContent = `DAY ${state.day} • ${isDay ? 'DAYLIGHT' : 'NIGHT'}`;
    dom.gameClock.textContent = `${formatGameTime()}${state.paused ? ' • FROZEN' : ''}`;
  }

  function renderStats() {
    dom.partyStat.textContent = livingParty();
    dom.foodStat.textContent = `${Math.floor(state.food)} lb`;
    dom.ammoStat.textContent = Math.floor(state.ammo);
    dom.cashStat.textContent = `$${Math.floor(state.cash)}`;
    dom.wagonStat.textContent = `${Math.floor(state.wagon)}%`;
    dom.oxenStat.textContent = `${Math.floor(state.oxen)}%`;
    dom.supplyStat.textContent = Math.floor(state.supplies);
    dom.medicineStat.textContent = Math.floor(state.medicine);
    dom.traceStat.textContent = `${Math.floor(state.trace)}%`;
    dom.milesStat.textContent = `${Math.floor(state.miles)} / ${TOTAL_MILES}`;
  }

  function renderMap() {
    const width = 104;
    const line = Array(width).fill('-');
    const labels = [];

    // Geographic orientation: west is left, east is right.
    // The party begins in New England on the right and travels left toward California.
    route.forEach((r, i) => {
      const x = (width - 1) - Math.round((r.mile / TOTAL_MILES) * (width - 1));
      line[x] = '□';
      if (i % 2 === 0 || i === route.length - 1) labels.push({ x, text: r.short });
    });

    const px = (width - 1) - Math.round((state.miles / TOTAL_MILES) * (width - 1));
    line[px] = '@';

    const labelLine = Array(width).fill(' ');
    labels.forEach(l => {
      const start = Math.max(0, Math.min(width - l.text.length, l.x - Math.floor(l.text.length / 2)));
      [...l.text].forEach((ch, i) => labelLine[start + i] = ch);
    });

    const next = route.find(r => r.mile > state.miles) || route[route.length - 1];
    const prev = [...route].reverse().find(r => r.mile <= state.miles) || route[0];
    dom.asciiMap.textContent = [
      'PACIFIC' + ' '.repeat(width - 14) + 'ATLANTIC',
      line.join(''),
      labelLine.join(''),
      '',
      `WEST ← California                                      New England → EAST`,
      `You are between ${prev.name} and ${next.name}. Next waypoint: ${next.name} (${Math.max(0, Math.ceil(next.mile - state.miles))} mi).`
    ].join('\n');
    dom.distanceText.textContent = `Boston, Massachusetts → Sacramento, California • ${Math.floor(state.miles)} miles traveled west`;
  }

  function renderActivity() {
    const a = state.activity;
    const info = {
      travel: ['TRAVELING WEST', 'The wagon rolls while daylight lasts. Distance depends on wagon and oxen condition.'],
      hunt: ['HUNTING', 'Travel has stopped. Food may be gained, ammunition will be spent.'],
      repair: ['REPAIRING WAGON', 'Travel has stopped while the party works on the wagon.'],
      clean: ['CLEANING CAMP', 'Time is traded for a colder trail: less trash, less sign, less attention.'],
      scout: ['SCOUTING AHEAD', 'Travel has stopped while someone checks ground, water, traffic, and danger.'],
      rest: ['STOPPED', 'The wagon is not making miles. The clock is still running.'],
      sleep: ['CAMPED FOR THE NIGHT', 'The party sleeps while the night clock continues.'],
      guard: ['STANDING WATCH', 'Sleep is sacrificed for security.'],
      fire: ['SECURING CAMP', 'Fire, animals, and visible sign are being managed.'],
      arrived: ['CALIFORNIA', 'The overland prototype journey is complete.']
    }[a.type] || [a.type.toUpperCase(), ''];

    dom.activityName.textContent = info[0];
    dom.activityDetail.textContent = info[1];

    if (a.remaining == null) {
      dom.activityProgress.style.width = a.type === 'travel' ? '100%' : '0%';
      dom.activityTimer.textContent = a.type === 'travel' ? 'Continuous until you choose something else' : 'Continuous';
    } else {
      const pct = clamp((1 - a.remaining / a.total) * 100, 0, 100);
      dom.activityProgress.style.width = `${pct}%`;
      dom.activityTimer.textContent = `${formatCountdown(a.remaining)} committed time remaining`;
    }
  }

  function renderActions() {
    dom.actions.innerHTML = '';
    const locked = state.activity.remaining != null || state.pendingEvent || isJourneyOver();
    const actions = state.phase === 'day' ? [
      { label: 'Travel West', fn: () => setContinuous('travel') },
      { label: 'Hunt • 8 min', fn: () => startActivity('hunt', 8), disabled: state.ammo < 4 },
      { label: 'Repair Wagon • 10 min', fn: () => startActivity('repair', 10), disabled: state.supplies < 2 },
      { label: 'Scout Ahead • 5 min', fn: () => startActivity('scout', 5) },
      { label: 'Clean Camp • 6 min', fn: () => startActivity('clean', 6) },
      { label: 'Rest Here', fn: () => setContinuous('rest') }
    ] : [
      { label: 'Sleep', fn: () => setContinuous('sleep') },
      { label: 'Stand Watch • 10 min', fn: () => startActivity('guard', 10) },
      { label: 'Repair Wagon • 10 min', fn: () => startActivity('repair', 10), disabled: state.supplies < 2 },
      { label: 'Clean Camp • 6 min', fn: () => startActivity('clean', 6) },
      { label: 'Secure Fire • 5 min', fn: () => startActivity('fire', 5) },
      { label: 'Scout Perimeter • 5 min', fn: () => startActivity('scout', 5) }
    ];

    dom.actionsTitle.textContent = state.phase === 'day' ? 'Daylight Orders' : 'Night Orders';
    actions.forEach(a => {
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.textContent = a.label;
      btn.disabled = locked || !!a.disabled || state.paused;
      btn.addEventListener('click', a.fn);
      dom.actions.appendChild(btn);
    });
  }

  function renderRelations() {
    dom.goodwillStat.textContent = state.goodwill >= 40 ? 'Trusted' : state.goodwill >= 10 ? 'Good' : state.goodwill <= -35 ? 'Hostile' : state.goodwill <= -10 ? 'Poor' : 'Neutral';
    dom.banditStat.textContent = state.banditAttention >= 60 ? 'High' : state.banditAttention >= 25 ? 'Rising' : 'Low';
    dom.disciplineStat.textContent = state.trace >= 70 ? 'Careless' : state.trace >= 35 ? 'Visible' : 'Clean';
  }

  function renderJournal() {
    dom.journal.innerHTML = '';
    state.log.slice(0, 24).forEach(entry => {
      const row = document.createElement('div');
      row.className = 'log-entry';
      const t = document.createElement('div');
      t.className = 'log-time';
      t.textContent = `DAY ${entry.day} • ${entry.phase.toUpperCase()} • ${formatStoredMinute(entry.phase, entry.minute)}`;
      const body = document.createElement('div');
      body.className = 'log-text';
      body.textContent = entry.text;
      row.append(t, body);
      dom.journal.appendChild(row);
    });
  }

  function formatGameTime() {
    // One real hour represents twelve in-game hours.
    // Showing seconds makes the accelerated clock visibly continuous:
    // 1 real second = 12 in-game seconds.
    const phaseGameSeconds = Math.floor((state.phaseElapsed / PHASE_SECONDS) * 12 * 60 * 60);
    let total = (state.phase === 'day' ? 6 * 60 * 60 : 18 * 60 * 60) + phaseGameSeconds;
    total %= 24 * 60 * 60;

    const h24 = Math.floor(total / 3600);
    const min = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    const suffix = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 || 12;

    return `${h12}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')} ${suffix}`;
  }

  function inGameMinuteOfPhase() {
    return Math.floor(((state.phaseElapsed / PHASE_SECONDS) * 12 * 60 * 60) / 60);
  }

  function formatStoredMinute(phase, minute) {
    let total = phase === 'day' ? 6 * 60 + minute : 18 * 60 + minute;
    total %= 24 * 60;
    const h24 = Math.floor(total / 60);
    const min = total % 60;
    const suffix = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 || 12;
    return `${h12}:${String(min).padStart(2,'0')} ${suffix}`;
  }

  function formatCountdown(seconds) {
    seconds = Math.max(0, Math.ceil(seconds));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  boot();
})();