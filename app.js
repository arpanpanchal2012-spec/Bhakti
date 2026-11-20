/**
 * Show Studio Pro - Presentation, Anchor Script & Instrumental Buzzer Engine
 */

'use strict';

// -----------------------------------------------------------------------------
// Global State & Storage Keys
// -----------------------------------------------------------------------------
const STORAGE_KEY = 'show_studio_bhakti_data_v3';
const LEGACY_STORAGE_KEY = 'show_studio_pro_data_v2';
const CHANNEL_NAME = 'show_studio_channel_v2';

let appChannel = null;
try {
  appChannel = new BroadcastChannel(CHANNEL_NAME);
} catch (e) {
  console.warn('BroadcastChannel not supported in this browser environment');
}

// Default Show Data (DMHT Bhakti)
const defaultShowData = {
  eventInfo: {
    eventName: 'DMHT Bhakti',
    eventTheme: 'Bhakti Sandhya',
    themeDescription: '',
    customGreeting: '',
    projectorTitle: 'Welcome to DMHT Bhakti',
    projectorSubtitle: ''
  },
  globalSettings: {
    defaultLyricSize: 52,
    defaultLyricStyle: 4
  },
  items: [
    {
      id: 'item-welcome-1',
      type: 'slide',
      useProjectorTitle: true,
      title: 'Welcome to DMHT Bhakti',
      singer: '',
      location: '',
      slideCaption: '',
      notes: 'Welcome screen. Edit the projector text under Event Settings.'
    },
    {
      id: 'item-song-1',
      type: 'song',
      title: 'Opening Bhajan',
      singer: 'Singer name',
      location: '',
      lyricStyle: 4,
      lyricSize: 52,
      lyrics: ['Add bhajan lyrics here', 'One line per row'],
      notes: 'Replace with the first bhajan, singer and lyrics.'
    },
    {
      id: 'item-buzz-1',
      type: 'buzz',
      title: 'Instrumental Round: Guess the Bhajan',
      mysteryTitle: '',
      filmName: '',
      originalSinger: '',
      hints: '',
      pointsCorrect: 10,
      pointsPenalty: 5,
      synthMelody: 'bhakti',
      notes: 'Open the online buzzer room and share the participant link in Zoom chat.'
    },
    {
      id: 'item-closing-1',
      type: 'slide',
      title: 'Thank You',
      singer: '',
      location: '',
      slideCaption: '',
      notes: 'Closing remarks and vote of thanks.'
    }
  ],
  scriptText: '',
  participantScores: {}
};

// Current Application State
let appData = JSON.parse(JSON.stringify(defaultShowData));
let editingIndex = null;
let currentStageIndex = 0;
let currentLyricLine = 0;
let quizRevealedOptions = 0;
let quizAnswerRevealed = false;
let isBlackout = false;

// Buzzer State (synced across tabs/windows)
let buzzerState = {
  roundId: 'round-1',
  itemTitle: '',
  status: 'LOCKED', // 'LOCKED' | 'OPEN' | 'REVEALED'
  openedAt: 0,
  buzzers: [], // Array of { id, name, city, timeOffsetMs, timestamp }
  mysteryAnswer: '',
  filmCredits: '',
  winnerAwarded: null
};

// Audio & Visualizer Context
let audioCtx = null;
let synthOsc = null;
let isPlayingSynth = false;
let visualizerAnimId = null;

// Teleprompter State
let prompterScrollInterval = null;
let prompterSpeed = 2;
let isPrompterPlaying = false;

// -----------------------------------------------------------------------------
// Web Audio API Synthesizer & Soundboard Effects
// -----------------------------------------------------------------------------
function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// 1. Big Game Show Buzzer Sound
function playBuzzerSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.35);

  gain.gain.setValueAtTime(0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.35);
}

// 2. Correct Answer Chime
function playCorrectSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 arpeggio

  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const noteTime = now + idx * 0.08;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, noteTime);

    gain.gain.setValueAtTime(0.3, noteTime);
    gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(noteTime);
    osc.stop(noteTime + 0.45);
  });
}

// 3. Wrong Answer Buzz
function playWrongSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  
  [120, 110].forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = now + idx * 0.16;

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.15);
  });
}

// 4. Applause Sound Effect
function playApplauseSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const bufferSize = ctx.sampleRate * 2.2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  // Generate pink/white noise envelope
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 1.5));
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1200, ctx.currentTime);
  filter.Q.setValueAtTime(1.5, ctx.currentTime);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.4, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 2.2);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start();
}

// 5. Drumroll Sound Effect
function playDrumrollSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const totalBeats = 24;

  for (let i = 0; i < totalBeats; i++) {
    const t = now + i * 0.06;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(80 + Math.random() * 20, t);

    gain.gain.setValueAtTime(0.15 + (i / totalBeats) * 0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.06);
  }

  // Final Crash
  setTimeout(() => {
    playCorrectSound();
  }, totalBeats * 60);
}

// 6. Tick Tock Countdown Sound
function playTickSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(1200, now);

  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.05);
}

// 7. Synthesized Instrumental Mystery Tunes (built-in tunes for buzzer rounds)
function playSynthesizedInstrumental(melodyId) {
  stopSynthesizedInstrumental();
  const ctx = getAudioContext();
  if (!ctx) return;

  isPlayingSynth = true;
  updateAudioVisualizerState(true);

  // Note frequency definitions
  const notes = {
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00
  };

  let sequence = [];
  if (melodyId === 'ddlj' || melodyId === 'bhakti') {
    // Gentle test phrase (replace with your own instrumental audio file)
    sequence = [
      { note: notes.G4, dur: 0.35 }, { note: notes.C5, dur: 0.35 }, { note: notes.D5, dur: 0.35 },
      { note: notes.E5, dur: 0.7 },  { note: notes.D5, dur: 0.35 }, { note: notes.C5, dur: 0.35 },
      { note: notes.D5, dur: 0.7 },  { note: notes.B4, dur: 0.35 }, { note: notes.G4, dur: 0.7 },
      { note: notes.G4, dur: 0.35 }, { note: notes.B4, dur: 0.35 }, { note: notes.C5, dur: 0.35 },
      { note: notes.D5, dur: 0.7 },  { note: notes.C5, dur: 0.35 }, { note: notes.B4, dur: 0.35 },
      { note: notes.C5, dur: 1.0 }
    ];
  } else {
    // Alternate test phrase
    sequence = [
      { note: notes.E5, dur: 0.25 }, { note: notes.E5, dur: 0.25 }, { note: notes.D5, dur: 0.25 },
      { note: notes.C5, dur: 0.25 }, { note: notes.B4, dur: 0.25 }, { note: notes.A4, dur: 0.4 },
      { note: notes.E5, dur: 0.25 }, { note: notes.E5, dur: 0.25 }, { note: notes.D5, dur: 0.25 },
      { note: notes.C5, dur: 0.25 }, { note: notes.B4, dur: 0.25 }, { note: notes.A4, dur: 0.6 }
    ];
  }

  let startTime = ctx.currentTime + 0.1;
  sequence.forEach(step => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(step.note, startTime);

    gain.gain.setValueAtTime(0.25, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + step.dur * 0.9);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + step.dur);

    startTime += step.dur;
  });

  // End animation when melody finishes
  const totalDuration = sequence.reduce((acc, s) => acc + s.dur, 0);
  setTimeout(() => {
    isPlayingSynth = false;
    updateAudioVisualizerState(false);
  }, (totalDuration + 0.2) * 1000);
}

function stopSynthesizedInstrumental() {
  isPlayingSynth = false;
  updateAudioVisualizerState(false);
}

// -----------------------------------------------------------------------------
// Audio Visualizer Canvas Renderer
// -----------------------------------------------------------------------------
function setupVisualizerCanvas() {
  const canvas = document.getElementById('visualizerCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function renderFrame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const numBars = 32;
    const barWidth = (canvas.width / numBars) - 3;

    for (let i = 0; i < numBars; i++) {
      let height = 8;
      if (isPlayingSynth) {
        // Dynamic dancing bars based on time and index
        const t = Date.now() / 150;
        height = Math.abs(Math.sin(t + i * 0.4)) * (canvas.height * 0.8) + 12;
      }

      const x = i * (barWidth + 3) + 2;
      const y = canvas.height - height;

      // Gradient color (Cyan to Purple/Gold)
      const grad = ctx.createLinearGradient(0, y, 0, canvas.height);
      grad.addColorStop(0, '#ffd700');
      grad.addColorStop(0.5, '#00ffff');
      grad.addColorStop(1, '#667eea');

      ctx.fillStyle = grad;
      ctx.fillRect(x, y, barWidth, height);
    }

    visualizerAnimId = requestAnimationFrame(renderFrame);
  }

  if (visualizerAnimId) cancelAnimationFrame(visualizerAnimId);
  renderFrame();
}

function updateAudioVisualizerState(active) {
  const statusEl = document.getElementById('audioPlayStatus');
  if (statusEl) {
    statusEl.textContent = active ? '🎶 Playing Mystery Instrumental Track...' : '⏸️ Instrumental Ready to Play';
  }
}

// -----------------------------------------------------------------------------
// IndexedDB Media Storage for Large Videos & Audios
// -----------------------------------------------------------------------------
let mediaDb = null;
const initMediaDb = () => {
  return new Promise(resolve => {
    try {
      const req = indexedDB.open('show_studio_media_db_v2', 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('mediaFiles')) {
          db.createObjectStore('mediaFiles');
        }
      };
      req.onsuccess = e => {
        mediaDb = e.target.result;
        resolve(mediaDb);
      };
      req.onerror = () => resolve(null);
    } catch (err) {
      resolve(null);
    }
  });
};

async function saveMediaBlob(itemId, file) {
  await initMediaDb();
  if (!mediaDb || !file) return null;
  return new Promise((resolve, reject) => {
    const tx = mediaDb.transaction('mediaFiles', 'readwrite');
    tx.objectStore('mediaFiles').put(file, itemId);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function getMediaBlob(itemId) {
  await initMediaDb();
  if (!mediaDb || !itemId) return null;
  return new Promise(resolve => {
    const tx = mediaDb.transaction('mediaFiles', 'readonly');
    const req = tx.objectStore('mediaFiles').get(itemId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

async function deleteMediaBlob(itemId) {
  await initMediaDb();
  if (!mediaDb || !itemId) return;
  const tx = mediaDb.transaction('mediaFiles', 'readwrite');
  tx.objectStore('mediaFiles').delete(itemId);
}

// -----------------------------------------------------------------------------
// Data Persistence (LocalStorage + State Sync)
// -----------------------------------------------------------------------------
function loadSavedData() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Keep the user's own older show, but drop the old Bollywood sample show
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy && !/Melody Junction/i.test(legacy)) raw = legacy;
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.items)) {
        appData = { ...JSON.parse(JSON.stringify(defaultShowData)), ...parsed };
        appData.eventInfo = { ...defaultShowData.eventInfo, ...(parsed.eventInfo || {}) };
      }
    }
  } catch (e) {
    console.warn('Could not load saved show data:', e);
  }
}

function saveShowData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    showToast('Show changes saved');
  } catch (e) {
    showToast('Storage quota warning: Check attached files');
  }
}

function showToast(msg) {
  const toast = document.getElementById('saveStatusIndicator');
  if (toast) {
    toast.textContent = msg;
    toast.style.opacity = '1';
    setTimeout(() => {
      toast.style.opacity = '0.6';
    }, 2000);
  }
}

// -----------------------------------------------------------------------------
// Broadcast Sync between Presenter, Audience Screen, & Buzzer Guest Windows
// -----------------------------------------------------------------------------
function broadcastState(type, payload = {}) {
  const msg = { type, payload, timestamp: Date.now() };
  if (appChannel) {
    appChannel.postMessage(msg);
  }
  // Fallback via LocalStorage event for cross-browser reliability
  try {
    localStorage.setItem('show_studio_sync_event', JSON.stringify(msg));
  } catch (e) {}
}

if (appChannel) {
  appChannel.onmessage = e => {
    handleIncomingSync(e.data);
  };
}

window.addEventListener('storage', e => {
  if (e.key === STORAGE_KEY && document.body.classList.contains('audience-window')) {
    loadSavedData();
    renderStageContent();
    return;
  }
  if (e.key === 'show_studio_sync_event' && e.newValue) {
    try {
      const msg = JSON.parse(e.newValue);
      handleIncomingSync(msg);
    } catch (err) {}
  }
});

function handleIncomingSync(data) {
  if (!data || !data.type) return;

  if (data.type === 'STAGE_UPDATE') {
    currentStageIndex = data.payload.index;
    currentLyricLine = data.payload.line;
    quizRevealedOptions = data.payload.revealedOptions;
    quizAnswerRevealed = data.payload.answerRevealed;
    isBlackout = data.payload.blackout;
    renderStageContent();
  } else if (data.type === 'BUZZER_STATE') {
    buzzerState = data.payload;
    renderBuzzerPodium();
    renderGuestBuzzerScreen();
  } else if (data.type === 'NEW_BUZZ') {
    // A participant buzzed in from another window or device!
    handleNewParticipantBuzz(data.payload);
  }
}

// -----------------------------------------------------------------------------
// View Switching & Navigation Tabs
// -----------------------------------------------------------------------------
function switchView(viewName) {
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

  const targetView = document.getElementById(viewName + 'View');
  const targetBtn = document.getElementById('nav' + capitalize(viewName));

  if (targetView) targetView.classList.add('active');
  if (targetBtn) targetBtn.classList.add('active');
  document.body.dataset.view = viewName;

  // Specific view actions
  if (viewName === 'presentation') {
    renderStageContent();
    setupVisualizerCanvas();
  } else if (viewName === 'anchorScript') {
    if (!appData.scriptText || appData.scriptText.trim().length === 0) {
      generateAnchorScript();
    }
  } else if (viewName === 'buzzerGuest') {
    renderGuestBuzzerScreen();
  }
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// -----------------------------------------------------------------------------
// Playlist / Show Sequence Management
// -----------------------------------------------------------------------------
function renderSequenceList() {
  const container = document.getElementById('sequenceList');
  if (!container) return;

  if (!appData.items.length) {
    container.innerHTML = '<div class="text-center" style="color: #a0aec0; padding: 30px;">Your show is empty! Add songs, quizzes, or buzzer rounds above.</div>';
    return;
  }

  container.innerHTML = '';
  appData.items.forEach((item, index) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'sequence-item' + (index === currentStageIndex ? ' active-item' : '');

    const badgeClass = 'badge-' + (item.type || 'song');
    const badgeName = getItemTypeLabel(item.type);

    itemEl.innerHTML = `
      <div class="seq-left" onclick="selectAndPresentItem(${index})">
        <div class="seq-num">${index + 1}</div>
        <div class="seq-info">
          <div class="seq-title">${escapeHtml(item.title)}</div>
          <div class="seq-meta">
            <span class="badge ${badgeClass}">${badgeName}</span>
            ${item.singer ? `<span>🎤 ${escapeHtml(item.singer)}</span>` : ''}
            ${item.location ? `<span>📍 ${escapeHtml(item.location)}</span>` : ''}
            ${item.type === 'buzz' ? `<span style="color:#dc2626; font-weight:bold;">🚨 Instrumental Buzzer</span>` : ''}
            ${item.mediaFileName ? `<span>📎 ${escapeHtml(item.mediaFileName)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="seq-actions">
        <button class="action-icon-btn" title="Present this item" onclick="selectAndPresentItem(${index})">▶️</button>
        <button class="action-icon-btn" title="Duplicate item" onclick="duplicateItem(${index})">⧉</button>
        <button class="action-icon-btn" title="Edit item" onclick="editSequenceItem(${index})">✏️</button>
        <button class="action-icon-btn" title="Move Up" onclick="moveSequenceItem(${index}, -1)" ${index === 0 ? 'disabled' : ''}>⬆️</button>
        <button class="action-icon-btn" title="Move Down" onclick="moveSequenceItem(${index}, 1)" ${index === appData.items.length - 1 ? 'disabled' : ''}>⬇️</button>
        <button class="action-icon-btn danger-hover" title="Delete" onclick="deleteSequenceItem(${index})">🗑️</button>
      </div>
    `;

    container.appendChild(itemEl);
  });
}

function getItemTypeLabel(type) {
  const map = {
    song: 'Video Song',
    audio: 'Audio Track',
    quiz: 'Trivia Quiz',
    blank: 'Blank text',
    slide: 'Slide Card',
    buzz: 'Buzzer Round',
    game: 'Party Game',
    break: 'Break / Timer',
    announcement: 'Announcement',
    custom: 'Custom Segment'
  };
  return map[type] || 'Segment';
}

function selectAndPresentItem(index) {
  if (index < 0 || index >= appData.items.length) return;
  currentStageIndex = index;
  currentLyricLine = 0;
  quizRevealedOptions = 0;
  quizAnswerRevealed = false;
  isBlackout = false;

  // If this is an instrumental buzz round, setup buzzer state
  const item = appData.items[index];
  if (item && item.type === 'buzz') {
    initBuzzerRoundForItem(item);
  }

  renderSequenceList();
  renderStageContent();
  broadcastStageState();
}

function editSequenceItem(index) {
  const item = appData.items[index];
  if (!item) return;

  editingIndex = index;
  document.getElementById('itemTypeSelect').value = item.type;
  updateFormFieldsVisibility();

  document.getElementById('itemTitleInput').value = item.title || '';
  document.getElementById('itemSingerInput').value = item.singer || '';
  document.getElementById('itemLocationInput').value = item.location || '';
  document.getElementById('itemNotesInput').value = item.notes || '';
  document.getElementById('songGlowColor').value = item.glowColor || '#ff00ff';
  document.getElementById('introSeconds').value = item.introSeconds ?? 5;
  document.getElementById('enableItemBuzzer').checked = !!item.enableBuzzer;

  // Type specific fields
  if (item.type === 'song') {
    document.getElementById('itemLyricsInput').value = (item.lyrics || []).join('\n');
    document.getElementById('itemLyricSizeInput').value = item.lyricSize || 52;
    document.getElementById('itemLyricSizeDisplay').textContent = (item.lyricSize || 52) + 'px';
    selectStyleOption(item.lyricStyle || 1);
  } else if (item.type === 'quiz') {
    document.getElementById('quizOptionsInput').value = (item.options || []).join('\n');
    document.getElementById('quizAnswerSelect').value = item.answerIndex !== undefined ? item.answerIndex : 0;
    document.getElementById('quizAnswerText').value=item.answerText||'';
    document.getElementById('quizEmoji').value=item.quizEmoji||'';
    document.getElementById('answerImageName').textContent=item.answerImageName||'';
    document.getElementById('answerAudioName').textContent=item.answerAudioName||'';
  } else if (item.type === 'buzz') {
    document.getElementById('buzzMysteryTitle').value = item.mysteryTitle || '';
    document.getElementById('buzzFilmName').value = item.filmName || '';
    document.getElementById('buzzOriginalSinger').value = item.originalSinger || '';
    document.getElementById('buzzHintsInput').value = item.hints || '';
  } else if (item.type === 'slide') {
    document.getElementById('slideCaptionInput').value = item.slideCaption || '';
  } else if (item.type === 'game') {
    document.getElementById('gameRulesInput').value = item.rules || '';
    document.getElementById('gamePrizesInput').value = item.prizes || '';
  }

  document.getElementById('saveItemBtn').textContent = '💾 Update Item';
  document.getElementById('cancelEditBtn').classList.remove('hide');
  document.getElementById('itemFormCard').scrollIntoView({ behavior: 'smooth' });
}

function moveSequenceItem(index, offset) {
  const target = index + offset;
  if (target < 0 || target >= appData.items.length) return;

  const temp = appData.items[index];
  appData.items[index] = appData.items[target];
  appData.items[target] = temp;

  if (currentStageIndex === index) {
    currentStageIndex = target;
  } else if (currentStageIndex === target) {
    currentStageIndex = index;
  }

  saveShowData();
  renderSequenceList();
}

async function deleteSequenceItem(index) {
  if (!confirm('Are you sure you want to delete this segment?')) return;
  const item = appData.items[index];
  if (item && item.id) {
    await deleteMediaBlob(item.id);
    await deleteMediaBlob(item.id+'-answer-image');
    await deleteMediaBlob(item.id+'-answer-audio');
  }
  appData.items.splice(index, 1);
  if (currentStageIndex >= appData.items.length) {
    currentStageIndex = Math.max(0, appData.items.length - 1);
  }
  saveShowData();
  renderSequenceList();
  renderStageContent();
}

function resetItemForm() {
  editingIndex = null;
  document.getElementById('itemTitleInput').value = '';
  document.getElementById('itemSingerInput').value = '';
  document.getElementById('itemLocationInput').value = '';
  document.getElementById('itemNotesInput').value = '';
  document.getElementById('songGlowColor').value = '#ff00ff';
  document.getElementById('introSeconds').value = 5;
  document.getElementById('enableItemBuzzer').checked = false;
  document.getElementById('itemLyricsInput').value = '';
  document.getElementById('itemLyricSizeInput').value=appData.globalSettings?.defaultLyricSize||64;
  document.getElementById('itemLyricSizeDisplay').textContent=document.getElementById('itemLyricSizeInput').value+'px';
  document.getElementById('quizOptionsInput').value = '';
  document.getElementById('quizAnswerText').value='';
  document.getElementById('quizEmoji').value='';
  document.getElementById('quizAnswerImage').value='';document.getElementById('quizAnswerAudio').value='';
  document.getElementById('removeAnswerImage').checked=false;document.getElementById('removeAnswerAudio').checked=false;
  document.getElementById('answerImageName').textContent='';document.getElementById('answerAudioName').textContent='';
  document.getElementById('buzzMysteryTitle').value = '';
  document.getElementById('buzzFilmName').value = '';
  document.getElementById('buzzOriginalSinger').value = '';
  document.getElementById('buzzHintsInput').value = '';
  document.getElementById('slideCaptionInput').value = '';
  document.getElementById('gameRulesInput').value = '';
  document.getElementById('gamePrizesInput').value = '';
  document.getElementById('itemMediaFile').value = '';

  document.getElementById('saveItemBtn').textContent = '➕ Add to Sequence';
  document.getElementById('cancelEditBtn').classList.add('hide');
}

// -----------------------------------------------------------------------------
// Form Handling & Adding / Updating Show Items
// -----------------------------------------------------------------------------
async function handleSaveItem() {
  const title = document.getElementById('itemTitleInput').value.trim();
  const type = document.getElementById('itemTypeSelect').value;

  if (!title) {
    alert('Please enter a title for this segment.');
    return;
  }

  if(type==='quiz'){const opts=document.getElementById('quizOptionsInput').value.split('\n').map(x=>x.trim()).filter(Boolean);const answer=Number(document.getElementById('quizAnswerSelect').value);if(opts.length===1 || opts.length>4 || (opts.length && answer>=opts.length)){alert('Use no options, or enter two to four options and select a valid correct answer.');return}}
  const prevItem = editingIndex !== null ? appData.items[editingIndex] : null;
  const itemId = prevItem ? prevItem.id : ('item-' + Date.now());

  // Handle optional media file upload
  const fileInput = document.getElementById('itemMediaFile');
  let mediaFileName = prevItem ? prevItem.mediaFileName : '';
  if (fileInput && fileInput.files && fileInput.files[0]) {
    const file = fileInput.files[0];
    try {
      await saveMediaBlob(itemId, file);
      mediaFileName = file.name;
    } catch (e) {
      alert('Could not save media file to browser storage. Try a smaller file.');
      return;
    }
  }

  const newItem = {
    id: itemId,
    type: type,
    title: title,
    singer: document.getElementById('itemSingerInput').value.trim(),
    location: document.getElementById('itemLocationInput').value.trim(),
    notes: document.getElementById('itemNotesInput').value.trim(),
    mediaFileName: mediaFileName,
    enableBuzzer: document.getElementById('enableItemBuzzer').checked
  };

  // Type specific additions
  if (type === 'song') {
    newItem.lyrics = document.getElementById('itemLyricsInput').value
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    newItem.lyricSize = parseInt(document.getElementById('itemLyricSizeInput').value, 10) || 52;
    newItem.lyricStyle = getSelectedLyricStyle();
    newItem.glowColor = document.getElementById('songGlowColor').value;
    newItem.introSeconds = Math.max(0,Math.min(30,Number(document.getElementById('introSeconds').value)||0));
  } else if (type === 'quiz') {
    newItem.options = document.getElementById('quizOptionsInput').value
      .split('\n')
      .map(o => o.trim())
      .filter(Boolean);
    newItem.answerIndex = parseInt(document.getElementById('quizAnswerSelect').value, 10) || 0;
    newItem.answerText=document.getElementById('quizAnswerText').value.trim();
    newItem.quizEmoji=document.getElementById('quizEmoji').value.trim();
    for (const [kind,input] of [['Image','quizAnswerImage'],['Audio','quizAnswerAudio']]) {
      const key=itemId+'-answer-'+kind.toLowerCase();const file=document.getElementById(input).files[0];
      newItem['answer'+kind+'Name']=prevItem?.['answer'+kind+'Name']||'';
      if(document.getElementById('removeAnswer'+kind).checked){await deleteMediaBlob(key);newItem['answer'+kind+'Name']=''}
      if(file){try{if(!await saveMediaBlob(key,file))throw Error('Storage unavailable');newItem['answer'+kind+'Name']=file.name}catch(e){alert('Could not save answer '+kind.toLowerCase()+': '+e.message);return}}
    }
  } else if (type === 'buzz') {
    newItem.mysteryTitle = document.getElementById('buzzMysteryTitle').value.trim();
    newItem.filmName = document.getElementById('buzzFilmName').value.trim();
    newItem.originalSinger = document.getElementById('buzzOriginalSinger').value.trim();
    newItem.hints = document.getElementById('buzzHintsInput').value.trim();
    newItem.pointsCorrect = 10;
    newItem.pointsPenalty = 5;
    newItem.synthMelody = prevItem?.synthMelody || 'bhakti';
  } else if (type === 'slide') {
    newItem.slideCaption = document.getElementById('slideCaptionInput').value.trim();
  } else if (type === 'game') {
    newItem.rules = document.getElementById('gameRulesInput').value.trim();
    newItem.prizes = document.getElementById('gamePrizesInput').value.trim();
  }

  if (editingIndex !== null) {
    appData.items[editingIndex] = newItem;
  } else {
    appData.items.push(newItem);
  }

  saveShowData();
  renderSequenceList();
  resetItemForm();
}

function updateFormFieldsVisibility() {
  const type = document.getElementById('itemTypeSelect').value;

  const showPerformer = ['song', 'audio'].includes(type);
  const showLyrics = type === 'song';
  const showQuiz = type === 'quiz';
  const showBuzz = type === 'buzz';
  const showSlide = type === 'slide';
  const showGame = type === 'game';
  const showMedia = ['song', 'audio', 'slide', 'buzz', 'quiz'].includes(type);

  document.getElementById('formPerformerGroup').classList.toggle('hide', !showPerformer);
  document.getElementById('formLyricsGroup').classList.toggle('hide', !showLyrics);
  document.getElementById('formQuizGroup').classList.toggle('hide', !showQuiz);
  document.getElementById('formBuzzGroup').classList.toggle('hide', !showBuzz);
  document.getElementById('formSlideGroup').classList.toggle('hide', !showSlide);
  document.getElementById('formGameGroup').classList.toggle('hide', !showGame);
  document.getElementById('formMediaGroup').classList.toggle('hide', !showMedia);
}

// -----------------------------------------------------------------------------
// Lyrics Style Selector Logic
// -----------------------------------------------------------------------------
function selectStyleOption(styleId) {
  document.querySelectorAll('.style-option').forEach(opt => {
    opt.classList.toggle('selected', parseInt(opt.dataset.style, 10) === styleId);
  });
}

function getSelectedLyricStyle() {
  const sel = document.querySelector('.style-option.selected');
  return sel ? parseInt(sel.dataset.style, 10) : 1;
}

// -----------------------------------------------------------------------------
// Presentation Stage Renderer (Video, Audio, Lyrics, Quiz, Buzzer, Slide)
// -----------------------------------------------------------------------------
async function renderStageContent() {
  const stage = document.getElementById('presentationStage');
  if (!stage) return;

  const item = appData.items[currentStageIndex];

  // Blackout handler
  if (isBlackout) {
    stage.innerHTML = `
      <div style="color: #64748b; font-size: 1.5rem; font-weight: bold;">
        ⬛ Stage Blackout Active (Press B to restore)
      </div>
    `;
    updatePresenterCues(null);
    return;
  }

  if (!item) {
    stage.innerHTML = `
      <div class="stage-content">
        <h2 style="font-size: 2.2rem; color: #ffd700; margin-bottom: 10px;">DMHT Bhakti Studio</h2>
        <p style="font-size: 1.1rem; color: #cbd5e0;">Select a song, quiz, or buzzer round from your playlist to begin.</p>
      </div>
    `;
    updatePresenterCues(null);
    return;
  }

  // Render by segment type
  switch (item.type) {
    case 'song':
      await renderSongStage(stage, item);
      break;
    case 'audio':
      renderAudioStage(stage, item);
      break;
    case 'quiz':
      renderQuizStage(stage, item);
      break;
    case 'buzz':
      renderBuzzerStage(stage, item);
      break;
    case 'slide':
      await renderSlideStage(stage, item);
      break;
    case 'game':
    case 'break':
    case 'announcement':
    case 'custom':
    default:
      renderGeneralStage(stage, item);
      break;
  }

  updatePresenterCues(item);
}

// 1. Song with Lyrics Display
async function renderSongStage(stage, item) {
  const mediaBlob = await getMediaBlob(item.id);
  const mediaUrl = mediaBlob ? URL.createObjectURL(mediaBlob) : null;
  const currentLine = (item.lyrics && item.lyrics[currentLyricLine]) || '';
  const nextLine = (item.lyrics && item.lyrics[currentLyricLine + 1]) || '';
  const styleClass = 'lyrics-style-' + (item.lyricStyle || 1);
  const lyricSize = (item.lyricSize || 52) + 'px';

  stage.innerHTML = `
    ${mediaUrl ? `<video class="stage-video" src="${mediaUrl}" autoplay loop muted></video>` : ''}
    <div class="stage-content" style="margin-bottom: 90px;">
      <h2 style="font-size: 2.6rem; color: white; font-weight: 800; text-shadow: 0 4px 15px rgba(0,0,0,0.8);">${escapeHtml(item.title)}</h2>
      <p style="font-size: 1.4rem; color: #ffd700; font-weight: 600;">🎤 ${escapeHtml(item.singer || 'Performance')} ${item.location ? '• ' + escapeHtml(item.location) : ''}</p>
    </div>
    <div class="lyrics-overlay ${styleClass}" style="--lyric-size: ${lyricSize};">
      <div class="lyric-line">${escapeHtml(currentLine)}</div>
      ${nextLine ? `<div class="lyric-next">${escapeHtml(nextLine)}</div>` : ''}
    </div>
  `;
}

// 2. Audio Performance with Real-Time Waveform Visualizer
function renderAudioStage(stage, item) {
  stage.innerHTML = `
    <div class="stage-content audio-visual-stage">
      <div class="audio-track-title">${escapeHtml(item.title)}</div>
      <div class="audio-track-singer">🎤 ${escapeHtml(item.singer || 'Live Audio')} ${item.location ? '• ' + escapeHtml(item.location) : ''}</div>
      <canvas id="visualizerCanvas" class="visualizer-canvas" width="600" height="120"></canvas>
      <div id="audioPlayStatus" style="font-size: 0.95rem; color: #a0aec0;">Audio track · no lyrics</div>
    </div>
  `;
  setupVisualizerCanvas();
}

// 3. Quiz Segment with Interactive Option Reveals
function renderQuizStage(stage, item) {
  const options = item.options || [];
  let optionsHtml = '';

  options.forEach((opt, idx) => {
    const isRevealed = idx < quizRevealedOptions || quizAnswerRevealed;
    const isCorrect = quizAnswerRevealed && idx === item.answerIndex;
    const optLetter = String.fromCharCode(65 + idx);

    optionsHtml += `
      <div class="stage-quiz-opt ${isRevealed ? 'revealed' : ''} ${isCorrect ? 'correct' : ''}">
        <span style="color: #ffd700; margin-right: 8px;">${optLetter}.</span> ${escapeHtml(opt)}
      </div>
    `;
  });

  stage.innerHTML = `
    <div class="stage-content quiz-layout">
      <div class="stage-quiz-question">${escapeHtml(item.title)}</div>
      ${item.quizEmoji ? `<div class="quiz-emoji-clue">${escapeHtml(item.quizEmoji)}</div>` : ''}
      <div class="stage-quiz-options">
        ${optionsHtml}
      </div>
      ${quizAnswerRevealed&&item.answerText ? `<div class="quiz-answer-text">${escapeHtml(item.answerText)}</div>` : ''}
      <div id="quizAnswerImageDisplay"></div>
    </div>
  `;
}

// 4. Slide Card Segment
async function renderSlideStage(stage, item) {
  const mediaBlob = await getMediaBlob(item.id);
  const mediaUrl = mediaBlob ? URL.createObjectURL(mediaBlob) : null;
  const info = appData.eventInfo || {};
  const slideTitle = item.useProjectorTitle ? (info.projectorTitle || item.title) : item.title;
  const slideSub = item.useProjectorTitle ? (info.projectorSubtitle || '') : (item.slideCaption || '');

  stage.innerHTML = `
    <div class="stage-content">
      ${mediaUrl ? `<img class="stage-slide-img" src="${mediaUrl}" alt="Slide image">` : ''}
      <div class="stage-slide-caption">${escapeHtml(slideTitle)}</div>
      ${slideSub ? `<p class="stage-slide-sub">${escapeHtml(slideSub)}</p>` : ''}
    </div>
  `;
}

// 5. Instrumental Buzz Round Stage View
function renderBuzzerStage(stage, item) {
  stage.innerHTML = `
    <div class="stage-content buzz-stage-wrap">
      <div class="buzz-header">
        <span>🎧</span> Instrumental Mystery Round
      </div>
      <h2 style="font-size: 2rem; color: white; font-weight: 800;">${escapeHtml(item.title)}</h2>
      
      <div class="buzz-status-banner ${buzzerState.status === 'OPEN' ? 'open' : 'locked'}" id="stageBuzzStatusBanner">
        ${buzzerState.status === 'OPEN' ? '🚨 BUZZERS ARE OPEN! GUESS THE SONG!' : (buzzerState.status === 'REVEALED' ? '🎉 SONG REVEALED!' : '🔒 BUZZERS LOCKED — LISTEN CAREFULLY...')}
      </div>

      <!-- Podium Top 3 -->
      <div class="buzz-podium" id="stageBuzzerPodium">
        <!-- Rendered dynamically via renderBuzzerPodium() -->
      </div>

      <!-- Full Ranked Buzz List -->
      <div class="ranked-buzz-table" id="stageBuzzerRankedTable">
        <!-- Rendered dynamically -->
      </div>

      ${buzzerState.status === 'REVEALED' ? `
        <div style="background: rgba(34, 197, 94, 0.2); border: 2px solid #22c55e; padding: 18px 28px; border-radius: 12px; margin-top: 15px;">
          <div style="font-size: 1.8rem; font-weight: 800; color: #ffd700;">🎵 ${escapeHtml(item.mysteryTitle)}</div>
          <div style="font-size: 1.1rem; color: #e2e8f0;">Film: <strong>${escapeHtml(item.filmName)}</strong> • Original: <strong>${escapeHtml(item.originalSinger)}</strong></div>
        </div>
      ` : ''}
    </div>
  `;

  renderBuzzerPodium();
}

// 6. General Segment (Break, Game, Announcement)
function renderGeneralStage(stage, item) {
  if(item.type==='blank'||item.type==='custom'){stage.innerHTML='<div class="stage-content"><div class="blank-text">'+escapeHtml(item.title)+'</div></div>';return;}
  stage.innerHTML = `
    <div class="stage-content">
      <h2 style="font-size: 2.6rem; color: #ffd700; font-weight: 800; margin-bottom: 15px;">${escapeHtml(item.title)}</h2>
      ${item.rules ? `<div style="background: rgba(255,255,255,0.08); padding: 20px; border-radius: 12px; margin-top: 15px; font-size: 1.2rem; text-align: left; max-width: 600px; margin-left: auto; margin-right: auto;">📋 <strong>Rules:</strong> ${escapeHtml(item.rules)}</div>` : ''}
      ${item.prizes ? `<div style="font-size: 1.2rem; color: #4ade80; margin-top: 12px; font-weight: bold;">🏆 Prizes: ${escapeHtml(item.prizes)}</div>` : ''}
    </div>
  `;
}

// Presenter confidential host cue box
function updatePresenterCues(item) {
  const cueBox = document.getElementById('presenterCueBox');
  if (!cueBox) return;

  if (!item) {
    cueBox.innerHTML = '<strong>HOST DESK:</strong> Ready to present.';
    return;
  }

  let text = `<strong>CURRENT:</strong> ${escapeHtml(item.title)} (${getItemTypeLabel(item.type)})`;
  if (item.notes) text += ` • <em>Note:</em> ${escapeHtml(item.notes)}`;

  if (item.type === 'quiz') {
    const correctLetter = String.fromCharCode(65 + item.answerIndex);
    const correctText = (item.options && item.options[item.answerIndex]) || '';
    if(correctText||item.answerText) text += ` • <span style="color:#ffd700; font-weight:bold;">CONFIDENTIAL ANSWER: ${correctText?'['+correctLetter+'] '+escapeHtml(correctText):''} ${escapeHtml(item.answerText||'')}</span>`;
  } else if (item.type === 'buzz') {
    text += ` • <span style="color:#ffd700; font-weight:bold;">MYSTERY SONG: ${escapeHtml(item.mysteryTitle)} (${escapeHtml(item.filmName)})</span>`;
    if (item.hints) text += ` • <em>Hints:</em> ${escapeHtml(item.hints)}`;
  }

  cueBox.innerHTML = text;

  // Update current item counter
  const counterEl = document.getElementById('stageItemCounter');
  if (counterEl) {
    counterEl.textContent = `Item ${currentStageIndex + 1} of ${appData.items.length}`;
  }
}

function broadcastStageState() {
  broadcastState('STAGE_UPDATE', {
    index: currentStageIndex,
    line: currentLyricLine,
    revealedOptions: quizRevealedOptions,
    answerRevealed: quizAnswerRevealed,
    blackout: isBlackout
  });
}

// -----------------------------------------------------------------------------
// Presenter Stage Controls (Next/Prev, Step Lyrics, Quiz Reveal, Blackout)
// -----------------------------------------------------------------------------
function nextStageItem() {
  if (currentStageIndex < appData.items.length - 1) {
    selectAndPresentItem(currentStageIndex + 1);
  }
}

function prevStageItem() {
  if (currentStageIndex > 0) {
    selectAndPresentItem(currentStageIndex - 1);
  }
}

function nextLyricLine() {
  const item = appData.items[currentStageIndex];
  if (!item) return;

  if (item.type === 'song' && item.lyrics) {
    if (currentLyricLine < item.lyrics.length - 1) {
      currentLyricLine++;
      renderStageContent();
      broadcastStageState();
    }
  } else if (item.type === 'quiz') {
    stepQuizReveal();
  }
}

function prevLyricLine() {
  const item = appData.items[currentStageIndex];
  if (item && item.type === 'song' && currentLyricLine > 0) {
    currentLyricLine--;
    renderStageContent();
    broadcastStageState();
  }
}

function stepQuizReveal() {
  const item = appData.items[currentStageIndex];
  if (!item || item.type !== 'quiz') return;

  const totalOptions = (item.options || []).length;
  if (quizRevealedOptions < totalOptions) {
    quizRevealedOptions++;
    playTickSound();
  } else if (!quizAnswerRevealed) {
    quizAnswerRevealed = true;
    if (typeof showLive !== 'undefined') { showLive = false; sendLive(); }
    playCorrectSound();
  }

  renderStageContent();
  broadcastStageState();
}

function toggleQuizAnswer() {
  const item = appData.items[currentStageIndex];
  if (!item) return;

  if (item.type === 'quiz') {
    quizAnswerRevealed = !quizAnswerRevealed;
    if (quizAnswerRevealed) {
      if (typeof showLive !== 'undefined') { showLive = false; sendLive(); }
      quizRevealedOptions = (item.options || []).length;
      playCorrectSound();
    }
  } else if (item.type === 'buzz') {
    quizAnswerRevealed = !quizAnswerRevealed;
    if (quizAnswerRevealed && typeof showLive !== 'undefined') { showLive = false; sendLive(); }
    renderStageContent();
    broadcastStageState();
    return;
  }

  renderStageContent();
  broadcastStageState();
}

function toggleBlackout() {
  isBlackout = !isBlackout;
  renderStageContent();
  broadcastStageState();
}

// -----------------------------------------------------------------------------
// INSTRUMENTAL BUZZ ROUND & ZOOM ATTENDEE SYNC ENGINE
// -----------------------------------------------------------------------------
function initBuzzerRoundForItem(item) {
  buzzerState = {
    roundId: 'buzz-' + item.id + '-' + Date.now(),
    itemTitle: item.title,
    status: 'LOCKED',
    openedAt: 0,
    buzzers: [],
    mysteryAnswer: item.mysteryTitle || '',
    filmCredits: (item.filmName ? item.filmName + ' • ' : '') + (item.originalSinger || ''),
    winnerAwarded: null
  };
  broadcastBuzzerState();
}

function openBuzzersForRound() {
  buzzerState.status = 'OPEN';
  buzzerState.openedAt = Date.now();
  buzzerState.buzzers = [];
  buzzerState.winnerAwarded = null;

  playBuzzerSound();
  broadcastBuzzerState();
  renderStageContent();
}

function lockBuzzersForRound() {
  buzzerState.status = 'LOCKED';
  broadcastBuzzerState();
  renderStageContent();
}

function resetBuzzersForRound() {
  buzzerState.buzzers = [];
  buzzerState.winnerAwarded = null;
  broadcastBuzzerState();
  renderStageContent();
}

function toggleBuzzerReveal() {
  if (buzzerState.status === 'REVEALED') {
    buzzerState.status = 'LOCKED';
  } else {
    buzzerState.status = 'REVEALED';
    playCorrectSound();
  }
  broadcastBuzzerState();
  renderStageContent();
}

// When any participant buzzes in:
function handleNewParticipantBuzz(buzzEntry) {
  if (buzzerState.status !== 'OPEN') return;

  // Prevent duplicate buzz by same person
  const exists = buzzerState.buzzers.some(b => b.name.toLowerCase() === buzzEntry.name.toLowerCase());
  if (exists) return;

  const reactionTime = Math.max(0, Date.now() - buzzerState.openedAt);
  const newRank = buzzerState.buzzers.length + 1;

  const recordedBuzz = {
    id: 'buzz-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    name: buzzEntry.name || 'Anonymous Participant',
    city: buzzEntry.city || 'Zoom Guest',
    timeOffsetMs: reactionTime,
    formattedTime: (reactionTime / 1000).toFixed(2) + 's',
    rank: newRank,
    status: 'PENDING'
  };

  buzzerState.buzzers.push(recordedBuzz);
  playBuzzerSound();

  broadcastBuzzerState();
  renderBuzzerPodium();
  renderGuestBuzzerScreen();
}

function broadcastBuzzerState() {
  broadcastState('BUZZER_STATE', buzzerState);
}

// Render the 3-podium and full ranked list on stage
function renderBuzzerPodium() {
  const podiumEl = document.getElementById('stageBuzzerPodium');
  const tableEl = document.getElementById('stageBuzzerRankedTable');
  if (!podiumEl || !tableEl) return;

  const buzzers = buzzerState.buzzers || [];

  // Top 3 Podium
  const ranks = [
    { rank: 1, label: '🥇 Rank 1', class: 'gold', entry: buzzers[0] },
    { rank: 2, label: '🥈 Rank 2', class: 'silver', entry: buzzers[1] },
    { rank: 3, label: '🥉 Rank 3', class: 'bronze', entry: buzzers[2] }
  ];

  podiumEl.innerHTML = ranks.map(r => {
    if (!r.entry) {
      return `
        <div class="podium-card ${r.class}">
          <div class="podium-rank">${r.label}</div>
          <div class="podium-name" style="opacity: 0.4;">Waiting for Buzz...</div>
          <div class="podium-time" style="opacity: 0.3;">--:--</div>
        </div>
      `;
    }
    return `
      <div class="podium-card ${r.class}">
        <div class="podium-rank">${r.label}</div>
        <div class="podium-name">${escapeHtml(r.entry.name)}</div>
        <div class="podium-city">${escapeHtml(r.entry.city)}</div>
        <div class="podium-time">⚡ ${r.entry.formattedTime}</div>
      </div>
    `;
  }).join('');

  // Full Ranked List (4th place onwards or full list)
  if (buzzers.length === 0) {
    tableEl.innerHTML = `
      <div style="padding: 18px; color: #94a3b8; text-align: center; font-style: italic;">
        No buzzes recorded yet. When Anchor opens buzzers, participant reaction rankings appear here instantly!
      </div>
    `;
    return;
  }

  tableEl.innerHTML = buzzers.map((b, idx) => {
    const isFirst = idx === 0;
    return `
      <div class="ranked-buzz-row ${isFirst ? 'active-speaker' : ''}">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span class="rank-badge rank-${b.rank}">#${b.rank}</span>
          <strong style="color: white;">${escapeHtml(b.name)}</strong>
          <span style="color: #94a3b8; font-size: 0.85rem;">(${escapeHtml(b.city)})</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-family: monospace; color: #38bdf8;">+${b.formattedTime}</span>
          ${isFirst ? `
            <button class="btn btn-sm btn-success" onclick="awardBuzzerScore('${escapeHtml(b.name)}', 10)">Correct (+10)</button>
            <button class="btn btn-sm btn-danger" onclick="penalizeBuzzerScore('${escapeHtml(b.name)}', 5)">Wrong (-5)</button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// Host awards or penalizes points for individual participants
function awardBuzzerScore(participantName, points = 10) {
  appData.participantScores[participantName] = (appData.participantScores[participantName] || 0) + points;
  playCorrectSound();
  saveShowData();
  renderLeaderboardScores();
  buzzerState.winnerAwarded = participantName;
  toggleBuzzerReveal();
}

function penalizeBuzzerScore(participantName, penalty = 5) {
  appData.participantScores[participantName] = Math.max(0, (appData.participantScores[participantName] || 0) - penalty);
  playWrongSound();
  saveShowData();
  renderLeaderboardScores();

  // Remove 1st buzzer so 2nd rank moves up to spotlight!
  if (buzzerState.buzzers.length > 0) {
    buzzerState.buzzers.shift();
    // Re-index remaining ranks
    buzzerState.buzzers.forEach((b, idx) => b.rank = idx + 1);
  }

  broadcastBuzzerState();
  renderBuzzerPodium();
}

// Simulate Zoom Attendees Buzzing In (For testing solo / rehearsal!)
function simulateZoomParticipantsBuzzing() {
  if (buzzerState.status !== 'OPEN') {
    openBuzzersForRound();
  }

  const simulatedGuests = [
    { name: 'Guest 1', city: 'Demo' },
    { name: 'Guest 2', city: 'Demo' },
    { name: 'Guest 3', city: 'Demo' },
    { name: 'Guest 4', city: 'Demo' },
    { name: 'Guest 5', city: 'Demo' }
  ];

  // Randomize sequence and buzz times
  const shuffled = [...simulatedGuests].sort(() => Math.random() - 0.5);

  shuffled.forEach((guest, index) => {
    const delay = 400 + index * (600 + Math.random() * 800);
    setTimeout(() => {
      if (buzzerState.status === 'OPEN') {
        handleNewParticipantBuzz(guest);
      }
    }, delay);
  });
}

// Copy Zoom Chat Announcement
function copyZoomChatAnnouncement() {
  // Remote participants need a room link from the online buzzer
  const w = window.open('/buzzer/', 'DMHTOnlineBuzzer');
  if (!w) location.href = '/buzzer/';
}

// -----------------------------------------------------------------------------
// PARTICIPANT BUZZER VIEW (What Zoom attendees see on phone or second tab)
// -----------------------------------------------------------------------------
function renderGuestBuzzerScreen() {
  const pill = document.getElementById('guestBuzzerStatusPill');
  const btn = document.getElementById('bigBuzzerButton');
  const resultBox = document.getElementById('guestResultBox');
  if (!pill || !btn) return;

  const guestName = (document.getElementById('guestParticipantName')?.value || '').trim() || 'You';
  const myBuzz = buzzerState.buzzers.find(b => b.name.toLowerCase() === guestName.toLowerCase());

  if (buzzerState.status === 'OPEN') {
    pill.textContent = '🚨 BUZZERS OPEN — BUZZ NOW!';
    pill.className = 'buzzer-status-pill status-open';
    btn.disabled = false;
    btn.classList.remove('buzzed-success');
    btn.innerHTML = '🚨<br>BUZZ!';
  } else if (buzzerState.status === 'LOCKED') {
    pill.textContent = '🔒 BUZZERS LOCKED — LISTEN CLOSELY';
    pill.className = 'buzzer-status-pill status-waiting';
    btn.disabled = true;
    btn.classList.remove('buzzed-success');
    btn.innerHTML = '🔒<br>WAIT';
  } else if (buzzerState.status === 'REVEALED') {
    pill.textContent = '🎉 ROUND COMPLETE';
    pill.className = 'buzzer-status-pill status-ready';
    btn.disabled = true;
    btn.innerHTML = '🎵<br>DONE';
  }

  if (myBuzz) {
    btn.disabled = true;
    btn.classList.add('buzzed-success');
    btn.innerHTML = `✅<br>#${myBuzz.rank}`;
    if (resultBox) {
      resultBox.innerHTML = `
        <h3 style="color: #16a34a; margin-bottom: 5px;">You Buzzed In Rank #${myBuzz.rank}!</h3>
        <p style="font-size: 0.95rem; color: #4b5563;">Reaction Time: <strong>${myBuzz.formattedTime}</strong></p>
        <p style="font-size: 0.85rem; color: #6b7280; margin-top: 4px;">${myBuzz.rank === 1 ? '🌟 You are FIRST on the buzzer! Get ready to unmute on Zoom!' : 'You are in queue. If Rank 1 answers incorrectly, Host passes to you!'}</p>
      `;
    }
  } else if (resultBox) {
    resultBox.innerHTML = `
      <p style="color: #6b7280; font-size: 0.9rem;">
        ${buzzerState.status === 'OPEN' ? 'Tap the big red button above to lock in your buzz!' : 'Waiting for Anchor to start the instrumental track...'}
      </p>
    `;
  }
}

function handleGuestBuzzClick() {
  const nameInput = document.getElementById('guestParticipantName');
  const cityInput = document.getElementById('guestParticipantCity');

  let name = (nameInput?.value || '').trim();
  let city = (cityInput?.value || '').trim();

  if (!name) {
    name = prompt('Please enter your Name for Zoom Leaderboard:', 'Guest ' + Math.floor(Math.random() * 100));
    if (!name) return;
    if (nameInput) nameInput.value = name;
  }

  const buzzPayload = {
    name: name,
    city: city || 'Zoom Attendee'
  };

  // Broadcast buzz to host
  broadcastState('NEW_BUZZ', buzzPayload);
  handleNewParticipantBuzz(buzzPayload);
}

// -----------------------------------------------------------------------------
// Overall Leaderboard Scores
// -----------------------------------------------------------------------------
function renderLeaderboardScores() {
  const container = document.getElementById('leaderboardScoreList');
  if (!container) return;

  const entries = Object.entries(appData.participantScores || {})
    .sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    container.innerHTML = '<div style="color: #94a3b8; font-size: 0.85rem;">No scores yet. Award points during Quiz and Buzzer rounds.</div>';
    return;
  }

  container.innerHTML = entries.map(([name, score], idx) => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-bottom: 1px solid #edf2f7; font-size: 0.88rem;">
      <span style="font-weight: 600; color: #2d3748;">
        ${idx === 0 ? '👑 ' : (idx === 1 ? '🥈 ' : (idx === 2 ? '🥉 ' : ''))}${escapeHtml(name)}
      </span>
      <span style="background: #eef2ff; color: #4338ca; padding: 2px 8px; border-radius: 6px; font-weight: 800;">
        ${score} pts
      </span>
    </div>
  `).join('');
}

// -----------------------------------------------------------------------------
// ANCHOR SCRIPT GENERATOR PRO (Standard MC Script with Cues)
// -----------------------------------------------------------------------------
const anchorDefaults = {
  intention: 'Today we come together in Bhakti, remembering Dada Bhagwan Janam Jayanti.',
  participantCount: '',
  transition: 'JSCA',
  format: 'This is an online Bhakti on Zoom. Participants may sing with or without instrumental accompaniment and supporting singers. We will also have Pad quizzes during the program.',
  instructions: 'Everyone is welcome to join in. Please keep yourself muted, and keep your video on if possible.',
  quizFlow: 'We will first display emojis for the Pad. If needed, we can play the instrumental, followed by an English translation as another hint.'
};
function populateAnchorSettings(){
  const settings={...anchorDefaults,...(appData.anchorOptions||{})};
  for (const [field,id] of Object.entries({intention:'anchorIntention',participantCount:'anchorParticipantCount',transition:'anchorTransition',format:'anchorFormat',instructions:'anchorInstructions',quizFlow:'anchorQuizFlow'})){let el=document.getElementById(id);if(el)el.value=settings[field]??''}
}
function generateAnchorScript() {
  const info=appData.eventInfo||{}, settings={...anchorDefaults,...(appData.anchorOptions||{})};
  let script=`ANCHOR NOTES: ${info.eventName||'Bhakti program'}\n\nSTART WITH\n`;
  script+=`Welcome everyone, and thank you for joining.\n`;
  if(info.customGreeting)script+=`${info.customGreeting}\n`;
  if(settings.intention)script+=`\nIntention: ${settings.intention}\n`;
  if(info.themeDescription)script+=`${info.themeDescription}\n`;
  if(settings.format)script+=`\nProgram format: ${settings.format}\n`;
  if(String(settings.participantCount).trim()!=='')script+=`\nWe have ${settings.participantCount} participants.\n`;
  if(settings.instructions)script+=`\nZoom instructions: ${settings.instructions}\n`;
  for(const item of appData.items){
    const title=item.useProjectorTitle?(info.projectorTitle||item.title):item.title;
    if(item.type==='song'||item.type==='audio'){
      script+=`\nINTRODUCE ${item.singer||'THE NEXT PARTICIPANT'}${item.location?' — '+item.location:''}\n`;
      script+=`Please welcome ${item.singer||'our next participant'}${item.location?' from '+item.location:''}, who will be singing “${item.title}”.\n`;
      if(item.mediaFileName)script+=`[ZOOM OPERATOR: Prepare ${item.mediaFileName}${item.type==='song'?' and advance the lyrics as the participant sings':''}.]\n`;
      if(item.notes)script+=`[PRIVATE CUE: ${item.notes}]\n`;
      if(settings.transition)script+=`After the performance: ${settings.transition}\n`;
    } else if(item.type==='quiz'||item.type==='buzz'){
      script+=`\nPAD QUIZ / ACTIVITY: ${title}\n`;
      script+=`Now it is time for everyone to participate. ${item.title}\n`;
      if(settings.quizFlow)script+=`[ANCHOR CUE: ${settings.quizFlow}]\n`;
      if(item.quizEmoji)script+=`[EMOJI CLUE: ${item.quizEmoji}]\n`;
      if(item.options?.length)script+=item.options.map((opt,i)=>`${String.fromCharCode(65+i)}. ${opt}`).join('\n')+'\n';
      const answer=item.answerText||item.mysteryTitle||(item.options||[])[item.answerIndex];
      if(answer)script+=`[CORRECT ANSWER — PRIVATE: ${answer}]\n`;
      if(item.hints)script+=`[HINTS — PRIVATE: ${item.hints}]\n`;
      if(item.notes)script+=`[ZOOM OPERATOR / PRIVATE CUE: ${item.notes}]\n`;
    } else {
      script+=`\n${title||'NEXT ITEM'}\n`;
      if(item.slideCaption)script+=`${item.slideCaption}\n`;
      if(item.rules)script+=`${item.rules}\n`;
      if(item.notes)script+=`[ZOOM OPERATOR / PRIVATE CUE: ${item.notes}]\n`;
    }
  }
  script+='\nCLOSING\nThank you to all the participants and everyone who joined us.\n';
  appData.scriptText=script;const area=document.getElementById('scriptOutputArea');if(area)area.value=script;saveShowData();
}

// Teleprompter Fullscreen Controller
function openTeleprompter() {
  const modal = document.getElementById('teleprompterModal');
  const body = document.getElementById('teleprompterBody');
  if (!modal || !body) return;

  body.textContent = appData.scriptText || 'No script generated yet. Click "Generate Script" first.';
  modal.classList.add('active');
  isPrompterPlaying = false;
  updatePrompterPlayBtn();
}

function closeTeleprompter() {
  const modal = document.getElementById('teleprompterModal');
  if (modal) modal.classList.remove('active');
  pausePrompter();
}

function togglePrompterPlay() {
  if (isPrompterPlaying) {
    pausePrompter();
  } else {
    startPrompter();
  }
}

function startPrompter() {
  const body = document.getElementById('teleprompterBody');
  if (!body) return;

  isPrompterPlaying = true;
  updatePrompterPlayBtn();

  if (prompterScrollInterval) clearInterval(prompterScrollInterval);
  prompterScrollInterval = setInterval(() => {
    body.scrollTop += prompterSpeed;
  }, 40);
}

function pausePrompter() {
  isPrompterPlaying = false;
  if (prompterScrollInterval) clearInterval(prompterScrollInterval);
  updatePrompterPlayBtn();
}

function updatePrompterPlayBtn() {
  const btn = document.getElementById('prompterPlayBtn');
  if (btn) btn.textContent = isPrompterPlaying ? '⏸️ Pause' : '▶️ Play';
}

function changePrompterSpeed(delta) {
  prompterSpeed = Math.max(1, Math.min(10, prompterSpeed + delta));
  const el = document.getElementById('prompterSpeedDisplay');
  if (el) el.textContent = prompterSpeed + 'x';
}

function changePrompterFontSize(delta) {
  const body = document.getElementById('teleprompterBody');
  if (!body) return;
  const current = parseInt(getComputedStyle(body).getPropertyValue('--prompter-size') || 38, 10);
  const next = Math.max(20, Math.min(72, current + delta));
  body.style.setProperty('--prompter-size', next + 'px');
}

function togglePrompterMirror() {
  const body = document.getElementById('teleprompterBody');
  if (body) body.classList.toggle('teleprompter-mirror');
}

// Download TXT
function downloadScriptTxt() {
  const text = document.getElementById('scriptOutputArea')?.value || appData.scriptText;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'anchor-script-pro.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Print Script to Paper / PDF
function printAnchorScript() {
  const text = document.getElementById('scriptOutputArea')?.value || appData.scriptText;
  const win = window.open('', '_blank');
  if (!win) {
    alert('Please allow popups to print script');
    return;
  }
  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Anchor Script - ${escapeHtml(appData.eventInfo.eventName)}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.8; padding: 40px; color: #111; }
          pre { white-space: pre-wrap; font-family: inherit; font-size: 15px; }
          @media print { body { padding: 15px; } }
        </style>
      </head>
      <body>
        <pre>${escapeHtml(text)}</pre>
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
}

// -----------------------------------------------------------------------------
// Audience Screen & Dual Window Popup
// -----------------------------------------------------------------------------
function openAudienceScreenWindow() {
  const url = window.location.href.split('?')[0] + '?audience=1';
  const w = window.open(url, 'ShowStudioAudienceWindow', 'width=1280,height=720');
  if (!w) {
    alert('Please allow pop-ups for this site so the clean Projector/TV screen can open.');
  } else {
    setTimeout(broadcastStageState, 600);
  }
}

// Open Dedicated Participant Buzzer in clean popup/window
function openParticipantBuzzerWindow() {
  const url = window.location.href.split('?')[0] + '?view=buzzer';
  const w = window.open(url, 'ShowStudioBuzzerWindow', 'width=480,height=700');
  if (!w) {
    switchView('buzzerGuest');
  }
}

// -----------------------------------------------------------------------------
// Export & Import Show Package (JSON)
// -----------------------------------------------------------------------------
function exportShowPackage() {
  const payload = {
    app: 'ShowStudioPro',
    version: '2.0',
    exportDate: new Date().toISOString(),
    data: appData
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (appData.eventInfo.eventName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'show_package') + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function triggerImportFile() {
  document.getElementById('importShowFileInput').click();
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const parsed = JSON.parse(evt.target.result);
      if (parsed && parsed.data && Array.isArray(parsed.data.items)) {
        if (!confirm('Import this show? It will replace your current sequence in the editor.')) return;
        appData = parsed.data;
        saveShowData();
        renderSequenceList();
        populateEventDetailsForm();
        renderLeaderboardScores();
        if (appData.scriptText) {
          document.getElementById('scriptOutputArea').value = appData.scriptText;
        }
        selectAndPresentItem(0);
        alert('Show imported successfully! (Note: Large video/audio files stored locally should be re-attached).');
      } else {
        alert('Invalid show file format.');
      }
    } catch (err) {
      alert('Could not parse show file: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// -----------------------------------------------------------------------------
// Keyboard Shortcuts (Stage presentation mode)
// -----------------------------------------------------------------------------
document.addEventListener('keydown', e => {
  // Ignore typing inside inputs, selects, or textareas
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

  switch (e.key) {
    case 'ArrowRight':
    case ' ':
      e.preventDefault();
      nextLyricLine();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      prevLyricLine();
      break;
    case 'PageDown':
    case 'n':
    case 'N':
      e.preventDefault();
      nextStageItem();
      break;
    case 'PageUp':
    case 'p':
    case 'P':
      e.preventDefault();
      prevStageItem();
      break;
    case 'b':
    case 'B':
      e.preventDefault();
      toggleBlackout();
      break;
    case 'r':
    case 'R':
      e.preventDefault();
      toggleQuizAnswer();
      break;
    // SFX Shortcuts
    case '1': playApplauseSound(); break;
    case '2': playDrumrollSound(); break;
    case '3': playCorrectSound(); break;
    case '4': playWrongSound(); break;
    case '5': playBuzzerSound(); break;
  }
});

// -----------------------------------------------------------------------------
// Initialization & Startup Binding
// -----------------------------------------------------------------------------
function populateEventDetailsForm() {
  populateAnchorSettings();
  const info = appData.eventInfo || {};
  document.getElementById('eventNameInput').value = info.eventName || '';
  document.getElementById('eventThemeInput').value = info.eventTheme || '';
  document.getElementById('themeDescInput').value = info.themeDescription || '';
  document.getElementById('customGreetingInput').value = info.customGreeting || '';
  document.getElementById('projectorTitleInput').value = info.projectorTitle || '';
  document.getElementById('projectorSubtitleInput').value = info.projectorSubtitle || '';
}

function bindEventListeners() {
  // Event Details Live Updates
  ['eventNameInput', 'eventThemeInput', 'themeDescInput', 'customGreetingInput', 'projectorTitleInput', 'projectorSubtitleInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        appData.eventInfo.eventName = document.getElementById('eventNameInput').value;
        appData.eventInfo.eventTheme = document.getElementById('eventThemeInput').value;
        appData.eventInfo.themeDescription = document.getElementById('themeDescInput').value;
        appData.eventInfo.customGreeting = document.getElementById('customGreetingInput').value;
        appData.eventInfo.projectorTitle = document.getElementById('projectorTitleInput').value;
        appData.eventInfo.projectorSubtitle = document.getElementById('projectorSubtitleInput').value;
        saveShowData();
        renderStageContent();
      });
    }
  });

  populateAnchorSettings();
  for (const [field,id] of Object.entries({intention:'anchorIntention',participantCount:'anchorParticipantCount',transition:'anchorTransition',format:'anchorFormat',instructions:'anchorInstructions',quizFlow:'anchorQuizFlow'})) {
    const el=document.getElementById(id);if(el)el.addEventListener('input',()=>{appData.anchorOptions=appData.anchorOptions||{};appData.anchorOptions[field]=el.value;saveShowData()});
  }

  // Item Type Select Change
  document.getElementById('itemTypeSelect').addEventListener('change', updateFormFieldsVisibility);

  // Style Selector Options Click
  document.querySelectorAll('.style-option').forEach(opt => {
    opt.addEventListener('click', () => {
      selectStyleOption(parseInt(opt.dataset.style, 10));
    });
  });

  // Lyric Size Slider
  const sizeInput = document.getElementById('itemLyricSizeInput');
  const sizeDisplay = document.getElementById('itemLyricSizeDisplay');
  if (sizeInput && sizeDisplay) {
    sizeInput.addEventListener('input', () => {
      sizeDisplay.textContent = sizeInput.value + 'px';
    });
  }

  // Script text area manual edits
  const scriptArea = document.getElementById('scriptOutputArea');
  if (scriptArea) {
    scriptArea.addEventListener('input', () => {
      appData.scriptText = scriptArea.value;
      saveShowData();
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Window load init
window.addEventListener('DOMContentLoaded', () => {
  loadSavedData();
  populateEventDetailsForm();
  bindEventListeners();
  renderSequenceList();
  renderLeaderboardScores();
  updateFormFieldsVisibility();

  // Check URL parameters for clean Audience Projector or Guest Buzzer mode
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('audience')) {
    document.body.classList.add('audience-window');
    switchView('presentation');
  } else if (urlParams.get('view') === 'buzzer') {
    switchView('buzzerGuest');
  } else {
    switchView('setup');
  }

  // Select initial stage item
  selectAndPresentItem(0);
});
