/**
 * Ceremony — Wedding Invitation App
 */

const CONFIG = {
  accessCodes: {
    solemnization: '1109',
    full: '9-11'
  },
  codeLength: 4,
  timezone: 'Asia/Singapore',
  weddingDate: new Date('2026-09-11T09:00:00'),
  music: {
    youtubeUrl: 'https://www.youtube.com/watch?v=ODjGbKDoE3c',
    startTime: 0,
    volume: 60
  },
  calendarEvents: {
    solemnization: {
      title: 'Shahrul & Ain — Solemnization',
      location: 'PICO SG, Pico Creative Centre, Singapore 339411',
      start: '20260911T090000',
      end: '20260911T123000',
      description: 'Solemnization of Shahrul & Ain. #ShahAinBrightLikeADiamond'
    },
    reception: {
      title: 'Shahrul & Ain — Reception Dinner',
      location: '39 MacTaggart Rd, Singapore 368084',
      start: '20260911T170000',
      end: '20260911T210000',
      description: 'Reception dinner of Shahrul & Ain. #ShahAinBrightLikeADiamond'
    }
  }
};

const STORAGE_KEY = 'ceremony_wedding_data_v2';

const defaultData = {
  wishes: []
};

let appData = loadData();
let gateCode = '';
let inviteTier = null;
let ytPlayer = null;
let musicPlaying = false;
let musicReady = false;
let pendingPlay = false;
let musicInitStarted = false;
const ytApiCallbacks = [];
let attendanceInterval = null;

window.onYouTubeIframeAPIReady = function () {
  ytApiCallbacks.splice(0).forEach((cb) => cb());
};

function loadData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? { ...defaultData, ...JSON.parse(stored) } : { ...defaultData };
  } catch {
    return { ...defaultData };
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
}

/* ─── Invite Tier ─── */
function applyInviteTier(tier) {
  inviteTier = tier;

  document.querySelectorAll('.reception-only').forEach((el) => {
    el.classList.toggle('hidden', tier !== 'full');
  });

  const purposeLine = document.getElementById('invitePurposeLine');
  if (purposeLine) {
    purposeLine.textContent = tier === 'full'
      ? 'to the solemnization and wedding reception of our son and daughter'
      : 'to the solemnization of our son and daughter';
  }

  document.getElementById('coverStandard').classList.toggle('hidden', tier === 'full');
  document.getElementById('coverInnerCircle').classList.toggle('hidden', tier !== 'full');
  document.getElementById('rsvpFullFields').classList.toggle('hidden', tier !== 'full');

  startAttendancePolling();
}

/* ─── Gate ─── */
function initGate() {
  const dots = document.querySelectorAll('.gate-dot');
  const errorEl = document.getElementById('gateError');
  const keypad = document.getElementById('gateKeypad');

  keypad.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-key]');
    if (!btn) return;

    const key = btn.dataset.key;
    errorEl.hidden = true;

    if (key === 'back') {
      gateCode = gateCode.slice(0, -1);
    } else if (gateCode.length < CONFIG.codeLength) {
      gateCode += key;
    }

    dots.forEach((dot, i) => {
      dot.classList.toggle('filled', i < gateCode.length);
    });

    if (gateCode.length === CONFIG.codeLength) {
      setTimeout(() => verifyCode(errorEl), 200);
    }
  });
}

function verifyCode(errorEl) {
  let tier = null;

  if (gateCode === CONFIG.accessCodes.solemnization) {
    tier = 'solemnization';
  } else if (gateCode === CONFIG.accessCodes.full) {
    tier = 'full';
  }

  if (tier) {
    applyInviteTier(tier);
    const gate = document.getElementById('gate');
    gate.classList.add('fade-out');
    document.getElementById('invitation').classList.remove('hidden');
    showMusicControl();
    setTimeout(() => gate.remove(), 500);
  } else {
    errorEl.hidden = false;
    gateCode = '';
    document.querySelectorAll('.gate-dot').forEach(d => d.classList.remove('filled'));
    setTimeout(() => { errorEl.hidden = true; }, 2500);
  }
}

/* ─── Cover & Body ─── */
function initCover() {
  document.getElementById('openBtn').addEventListener('click', () => {
    document.getElementById('cover').style.display = 'none';
    const body = document.getElementById('body');
    body.classList.add('visible');
    document.getElementById('bottomBar').classList.remove('hidden');
    playMusic();
    body.scrollIntoView({ behavior: 'smooth' });
  });
}

/* ─── Background Music (YouTube) ─── */
function parseYoutubeId(url) {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/
  );
  return match ? match[1] : (/^[\w-]{11}$/.test(url.trim()) ? url.trim() : null);
}

function loadYoutubeApi() {
  if (document.getElementById('youtube-api')) return;
  const tag = document.createElement('script');
  tag.id = 'youtube-api';
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

function onYoutubeApiReady(callback) {
  if (window.YT?.Player) {
    callback();
  } else {
    ytApiCallbacks.push(callback);
  }
}

function prepareMusicPlayer() {
  const videoId = parseYoutubeId(CONFIG.music?.youtubeUrl);
  if (!videoId || musicInitStarted) return;
  musicInitStarted = true;

  onYoutubeApiReady(() => {
    if (ytPlayer) return;

    const playerVars = {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      enablejsapi: 1,
      fs: 0,
      loop: 1,
      playlist: videoId,
      modestbranding: 1,
      playsinline: 1,
      rel: 0,
      start: CONFIG.music.startTime || 0
    };

    if (window.location.protocol.startsWith('http')) {
      playerVars.origin = window.location.origin;
    }

    ytPlayer = new YT.Player('youtubePlayer', {
      width: '200',
      height: '200',
      videoId,
      playerVars,
      events: {
        onReady: (event) => {
          musicReady = true;
          event.target.setVolume(CONFIG.music.volume ?? 60);
          if (pendingPlay) playMusic();
        },
        onStateChange: (event) => {
          if (event.data === YT.PlayerState.PLAYING) {
            musicPlaying = true;
            updateMusicToggle();
          } else if (
            event.data === YT.PlayerState.PAUSED ||
            event.data === YT.PlayerState.ENDED
          ) {
            musicPlaying = false;
            updateMusicToggle();
          }
        },
        onError: () => {
          showToast('This song cannot be played here. Try another YouTube link.');
        }
      }
    });
  });
}

function showMusicControl() {
  if (!parseYoutubeId(CONFIG.music?.youtubeUrl)) return;
  document.getElementById('musicToggle').classList.remove('hidden');
}

function playMusic() {
  if (!parseYoutubeId(CONFIG.music?.youtubeUrl)) return;
  pendingPlay = true;

  if (!musicReady || !ytPlayer?.playVideo) return;

  try {
    if (typeof ytPlayer.unMute === 'function') ytPlayer.unMute();
    ytPlayer.playVideo();
    pendingPlay = false;
  } catch {
    showToast('Tap the music button to play');
  }
}

function toggleMusic() {
  if (!parseYoutubeId(CONFIG.music?.youtubeUrl)) return;

  if (!musicReady || !ytPlayer) {
    pendingPlay = true;
    playMusic();
    return;
  }

  if (musicPlaying) {
    ytPlayer.pauseVideo();
  } else {
    playMusic();
  }
}

function updateMusicToggle() {
  const btn = document.getElementById('musicToggle');
  btn.classList.toggle('is-playing', musicPlaying);
  btn.setAttribute('aria-label', musicPlaying ? 'Pause music' : 'Play music');
}

/* ─── Countdown ─── */
function initCountdown() {
  function tick() {
    const now = new Date();
    const diff = CONFIG.weddingDate - now;

    if (diff <= 0) {
      setCountdown(0, 0, 0, 0);
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    setCountdown(days, hours, minutes, seconds);
  }

  tick();
  setInterval(tick, 1000);
}

function setCountdown(d, h, m, s) {
  document.getElementById('cdDays').textContent = pad(d);
  document.getElementById('cdHours').textContent = pad(h);
  document.getElementById('cdMinutes').textContent = pad(m);
  document.getElementById('cdSeconds').textContent = pad(s);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/* ─── Attendance (built-in RSVP) ─── */
async function fetchAttendance() {
  if (!inviteTier) return;

  try {
    const res = await fetch(
      `/.netlify/functions/rsvp?tier=${encodeURIComponent(inviteTier)}`
    );
    if (!res.ok) return;

    const data = await res.json();
    document.getElementById('attendingCount').textContent = data.attending ?? 0;
    document.getElementById('notAttendingCount').textContent = data.notAttending ?? 0;
  } catch {
    // Local preview without Netlify functions
  }
}

function startAttendancePolling() {
  fetchAttendance();
  if (attendanceInterval) clearInterval(attendanceInterval);
  attendanceInterval = setInterval(fetchAttendance, 60000);
}

/* ─── Wishes ─── */
function renderWishes() {
  const container = document.getElementById('wishesScroll');
  container.innerHTML = appData.wishes.map(w => `
    <div class="wish-item">
      <p class="wish-message">${escapeHtml(w.message)}</p>
      <p class="wish-author">${escapeHtml(w.name)}</p>
    </div>
  `).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function buildIcs(event) {
  const vevent = [
    'BEGIN:VEVENT',
    `DTSTART:${event.start}`,
    `DTEND:${event.end}`,
    `SUMMARY:${event.title}`,
    `LOCATION:${event.location}`,
    `DESCRIPTION:${event.description.replace(/\n/g, '\\n')}`,
    'END:VEVENT'
  ].join('\r\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Shahrul & Ain//Wedding//EN',
    vevent,
    'END:VCALENDAR'
  ].join('\r\n');
}

function getCalendarEvent() {
  const { solemnization, reception } = CONFIG.calendarEvents;

  if (inviteTier === 'full') {
    return {
      title: 'Shahrul & Ain — Wedding',
      start: solemnization.start,
      end: reception.end,
      location: 'Singapore',
      description: [
        'Solemnization: 9:00 AM – 12:30 PM',
        solemnization.location,
        '',
        'Reception: 5:00 PM – 9:00 PM',
        reception.location,
        '',
        '#ShahAinBrightLikeADiamond'
      ].join('\n')
    };
  }

  return { ...solemnization };
}

function buildGoogleCalendarUrl(event) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${event.start}/${event.end}`,
    ctz: CONFIG.timezone,
    location: event.location,
    details: event.description
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function downloadIcs(event) {
  const ics = buildIcs(event);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = inviteTier === 'full'
    ? 'shahrul-ain-wedding.ics'
    : 'shahrul-ain-solemnization.ics';
  a.click();
  URL.revokeObjectURL(url);
}

function renderCalendarOptions() {
  const event = getCalendarEvent();
  document.getElementById('googleCalendarBtn').href = buildGoogleCalendarUrl(event);
}

/* ─── Save the Date ─── */
function initSaveDate() {
  document.getElementById('saveDateBtn').addEventListener('click', () => {
    renderCalendarOptions();
    openModal('calendarModal');
  });

  document.getElementById('appleCalendarBtn').addEventListener('click', () => {
    downloadIcs(getCalendarEvent());
    closeModal('calendarModal');
    showToast('Added to Apple Calendar');
  });
}

/* ─── Modals ─── */
function initModals() {
  document.getElementById('rsvpBtn').addEventListener('click', () => openModal('rsvpModal'));
  document.getElementById('wishBtn').addEventListener('click', () => openModal('wishModal'));

  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });
}

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  if (id === 'rsvpModal') resetRsvpForm();
}

function resetRsvpForm() {
  const form = document.getElementById('rsvpForm');
  if (!form) return;
  form.reset();
  form.querySelectorAll('.rsvp-option.selected').forEach((el) => el.classList.remove('selected'));
  document.getElementById('rsvpAttending').value = '';
  document.getElementById('rsvpSide').value = '';
  document.getElementById('rsvpEvent').value = '';
  document.getElementById('rsvpPax').value = '';
  document.getElementById('rsvpExcited').value = '';
  document.getElementById('rsvpSpeech').value = '';
  document.getElementById('rsvpGift').value = '';
  document.getElementById('rsvpGiftOther').value = '';
  document.getElementById('rsvpGiftOther').classList.remove('selected');
  document.getElementById('rsvpSong').value = '';
  document.getElementById('rsvpDinnerIdea').value = '';
  document.getElementById('rsvpHashtagIdea').value = '';
  showRsvpStep('rsvpStep1');
}

function isDinnerGuest() {
  const event = document.getElementById('rsvpEvent').value;
  return event === 'dinner-only' || event === 'both';
}

function goToPaxStep() {
  updatePaxStepActions();
  showRsvpStep('rsvpStepPax');
}

function updatePaxStepActions() {
  const isDinner = inviteTier === 'full' && isDinnerGuest();
  document.getElementById('rsvpPaxContinueBtn').classList.toggle('hidden', !isDinner);
  document.getElementById('rsvpSubmitBtn').classList.toggle('hidden', isDinner);
}

function goToPaxBackStep() {
  if (inviteTier === 'full') {
    showRsvpStep('rsvpStepEvents');
  } else {
    showRsvpStep('rsvpStep1');
  }
}

function clearGiftSelection() {
  document.querySelectorAll('[data-field="gift"] .rsvp-option').forEach((b) => {
    b.classList.remove('selected');
  });
}

function selectGiftOther() {
  clearGiftSelection();
  document.getElementById('rsvpGift').value = 'other';
  document.getElementById('rsvpGiftOther').classList.add('selected');
}

function collectDinnerDetails() {
  const gift = document.getElementById('rsvpGift').value || null;
  return {
    excited: document.getElementById('rsvpExcited').value || null,
    song: document.getElementById('rsvpSong').value.trim() || null,
    speech: document.getElementById('rsvpSpeech').value || null,
    dinnerIdea: document.getElementById('rsvpDinnerIdea').value.trim() || null,
    hashtagIdea: document.getElementById('rsvpHashtagIdea').value.trim() || null,
    gift,
    giftOther: gift === 'other'
      ? document.getElementById('rsvpGiftOther').value.trim() || null
      : null
  };
}

function isGiftAnswerValid() {
  const gift = document.getElementById('rsvpGift').value;
  if (['yes', 'definitely', 'obviously'].includes(gift)) return true;
  if (gift === 'other') {
    return Boolean(document.getElementById('rsvpGiftOther').value.trim());
  }
  return false;
}

function showRsvpStep(stepId) {
  document.querySelectorAll('#rsvpForm .rsvp-step').forEach((step) => {
    step.classList.toggle('hidden', step.id !== stepId);
  });
}

function isAttendingYes(attending) {
  return attending === 'yes' || attending === 'yes-food';
}

function getRsvpHiddenInput(field) {
  const map = {
    side: 'rsvpSide',
    attending: 'rsvpAttending',
    event: 'rsvpEvent',
    pax: 'rsvpPax',
    excited: 'rsvpExcited',
    speech: 'rsvpSpeech',
    gift: 'rsvpGift'
  };
  return document.getElementById(map[field]);
}

async function submitRsvp(payload) {
  const submitBtn = document.getElementById('rsvpSubmitBtn');
  const dinnerSubmitBtn = document.getElementById('rsvpDinner3SubmitBtn');
  const activeBtn = submitBtn.classList.contains('hidden') ? dinnerSubmitBtn : submitBtn;
  activeBtn.disabled = true;
  activeBtn.textContent = 'Submitting...';

  try {
    const res = await fetch('/.netlify/functions/rsvp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Submit failed');

    closeModal('rsvpModal');
    resetRsvpForm();
    fetchAttendance();
    showToast('Thank you! Your RSVP has been received.');
  } catch {
    showToast('Could not submit RSVP. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit RSVP';
    dinnerSubmitBtn.disabled = false;
    dinnerSubmitBtn.textContent = 'Submit RSVP';
  }
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  if (id === 'rsvpModal') fetchAttendance();
}

/* ─── Forms ─── */
function initForms() {
  document.querySelectorAll('#rsvpForm .rsvp-option-group').forEach((group) => {
    const field = group.dataset.field;
    const hiddenInput = getRsvpHiddenInput(field);
    if (!hiddenInput) return;

    group.querySelectorAll('.rsvp-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.rsvp-option').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        hiddenInput.value = btn.dataset.value;

        if (field === 'gift') {
          document.getElementById('rsvpGiftOther').value = '';
          document.getElementById('rsvpGiftOther').classList.remove('selected');
        }
      });
    });
  });

  const giftOtherInput = document.getElementById('rsvpGiftOther');
  giftOtherInput.addEventListener('focus', selectGiftOther);
  giftOtherInput.addEventListener('input', selectGiftOther);

  document.getElementById('rsvpContinueBtn').addEventListener('click', async () => {
    const name = document.getElementById('rsvpName').value.trim();
    const attending = document.getElementById('rsvpAttending').value;
    const side = document.getElementById('rsvpSide').value;

    if (!name) {
      showToast('Please enter your name');
      return;
    }

    if (!attending) {
      showToast('Please select if you are attending');
      return;
    }

    if (inviteTier === 'full' && !side) {
      showToast('Please select groom or bride');
      return;
    }

    if (!isAttendingYes(attending)) {
      await submitRsvp({
        tier: inviteTier,
        name,
        attending,
        side: inviteTier === 'full' ? side : null,
        event: null,
        paxCount: 0
      });
      return;
    }

    if (inviteTier === 'full') {
      showRsvpStep('rsvpStepEvents');
    } else {
      goToPaxStep();
    }
  });

  document.getElementById('rsvpEventsContinueBtn').addEventListener('click', () => {
    if (!document.getElementById('rsvpEvent').value) {
      showToast('Please select what you are attending');
      return;
    }

    goToPaxStep();
  });

  document.getElementById('rsvpPaxContinueBtn').addEventListener('click', () => {
    const paxCount = parseInt(document.getElementById('rsvpPax').value, 10);
    if (!paxCount || paxCount < 1 || paxCount > 5) {
      showToast('Please select number of guests');
      return;
    }
    showRsvpStep('rsvpStepDinner1');
  });

  document.getElementById('rsvpDinner1ContinueBtn').addEventListener('click', () => {
    if (!document.getElementById('rsvpExcited').value) {
      showToast('Please select what you are most excited for');
      return;
    }
    showRsvpStep('rsvpStepDinner2');
  });

  document.getElementById('rsvpDinner2ContinueBtn').addEventListener('click', () => {
    if (!document.getElementById('rsvpSpeech').value) {
      showToast('Please select a speech option');
      return;
    }
    showRsvpStep('rsvpStepDinner3');
  });

  document.getElementById('rsvpPaxBackBtn').addEventListener('click', goToPaxBackStep);

  document.querySelectorAll('.rsvp-back-btn[data-back]').forEach((btn) => {
    btn.addEventListener('click', () => {
      showRsvpStep(btn.dataset.back);
    });
  });

  document.getElementById('rsvpForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('rsvpName').value.trim();
    const attending = document.getElementById('rsvpAttending').value;
    const side = document.getElementById('rsvpSide').value;
    const eventChoice = document.getElementById('rsvpEvent').value;
    const paxCount = parseInt(document.getElementById('rsvpPax').value, 10);

    if (!isAttendingYes(attending)) return;

    if (inviteTier === 'full' && !eventChoice) {
      showToast('Please select what you are attending');
      showRsvpStep('rsvpStepEvents');
      return;
    }

    if (!paxCount || paxCount < 1 || paxCount > 5) {
      showToast('Please select number of guests');
      showRsvpStep('rsvpStepPax');
      return;
    }

    if (isDinnerGuest()) {
      if (!document.getElementById('rsvpExcited').value) {
        showToast('Please complete the dinner questions');
        showRsvpStep('rsvpStepDinner1');
        return;
      }
      if (!document.getElementById('rsvpSpeech').value) {
        showRsvpStep('rsvpStepDinner2');
        return;
      }
      if (!isGiftAnswerValid()) {
        showToast(document.getElementById('rsvpGift').value === 'other'
          ? 'Please fill in your answer'
          : 'Please answer the gift question');
        showRsvpStep('rsvpStepDinner3');
        return;
      }
    }

    await submitRsvp({
      tier: inviteTier,
      name,
      attending,
      side: inviteTier === 'full' ? side : null,
      event: inviteTier === 'full' ? eventChoice : 'solemnization-only',
      paxCount,
      dinner: isDinnerGuest() ? collectDinnerDetails() : null
    });
  });

  document.getElementById('wishForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('wishName').value.trim();
    const message = document.getElementById('wishMessage').value.trim();

    appData.wishes.unshift({ name, message });
    saveData();
    renderWishes();
    closeModal('wishModal');
    e.target.reset();
    showToast('Your wish has been sent!');
  });
}

/* ─── Toast ─── */
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

/* ─── Init ─── */
document.addEventListener('DOMContentLoaded', () => {
  initGate();
  initCover();
  initCountdown();
  initSaveDate();
  initModals();
  initForms();
  initMusicToggle();
  if (parseYoutubeId(CONFIG.music?.youtubeUrl)) {
    loadYoutubeApi();
    prepareMusicPlayer();
  }
  renderWishes();
});

function initMusicToggle() {
  document.getElementById('musicToggle').addEventListener('click', toggleMusic);
}
