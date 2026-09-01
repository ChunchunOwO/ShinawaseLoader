'use strict';

/*
 * Running work timer card (port of VPet's WorkTimer UI on top of the
 * engine's work branch). The card is pinned above the pet on its stage and
 * tinted with each job's colors on top of the shared glass look.
 *
 * The work/study/play selection list itself lives in the external work
 * panel window (panel.js); only this always-on-pet timer card stays here.
 */
(() => {
  const root = (window.EchoClassicPet = window.EchoClassicPet || {});

  const formatSpan = (minutes) => {
    const totalSeconds = minutes * 60;
    if (totalSeconds < 90) return `${totalSeconds.toFixed(0)}秒`;
    if (minutes < 90) return `${minutes.toFixed(1)}分钟`;
    return `${(minutes / 60).toFixed(1)}小时`;
  };

  root.createWorkTimer = (engine) => {
    const el = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined && text !== null) node.textContent = text;
      return node;
    };

    const card = el('aside', 'cp-work-timer');
    card.id = 'cp-work-timer';
    const cardTitle = el('div', 'cp-work-timer-title');
    const cardNumbers = el('div', 'cp-work-timer-numbers');
    const cardBarWrap = el('div', 'ec-meter cp-work-timer-bar');
    const cardBarFill = el('div', 'ec-meter-fill');
    cardBarWrap.append(cardBarFill);
    const cardStop = el('button', 'cp-work-timer-stop ec-btn', '停止');
    cardStop.type = 'button';
    cardStop.addEventListener('click', () => engine.stopWork('manualstop'));
    card.append(cardTitle, cardNumbers, cardBarWrap, cardStop);

    let cardTimer = null;

    const updateCard = () => {
      const work = engine.currentWork();
      if (engine.save.state !== 'work' || !work || !engine.save.nowWork) {
        hideCard();
        return;
      }
      const elapsedMinutes = (Date.now() - engine.save.nowWork.startTime) / 60000;
      const leftMinutes = Math.max(0, work.time - elapsedMinutes);
      const unit = work.type === 'Work' ? '钱' : 'EXP';
      cardTitle.textContent = `当前已${work.name}`;
      cardNumbers.textContent =
        `${formatSpan(elapsedMinutes)} · 剩${formatSpan(leftMinutes)} · ${engine.save.nowWork.getCount.toFixed(0)}${unit}`;
      cardBarFill.style.width = `${Math.min(100, (elapsedMinutes / work.time) * 100).toFixed(1)}%`;
      cardStop.textContent = `停止${work.name}`;
    };

    const showCard = () => {
      const work = engine.currentWork();
      if (!work) return;
      card.style.setProperty('--work-bg', work.background);
      card.style.setProperty('--work-fg', work.foreground);
      card.style.setProperty('--work-accent', work.accent);
      card.classList.add('is-open');
      updateCard();
      if (cardTimer === null) cardTimer = window.setInterval(updateCard, 1000);
    };

    const hideCard = () => {
      card.classList.remove('is-open');
      if (cardTimer !== null) {
        window.clearInterval(cardTimer);
        cardTimer = null;
      }
    };

    engine.on('workstart', showCard);
    engine.on('workend', hideCard);

    // Resume the card if the save was loaded mid-work.
    if (engine.save.state === 'work' && engine.save.nowWork) showCard();

    return { card };
  };
})();
