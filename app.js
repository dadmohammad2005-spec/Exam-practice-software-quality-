/**
 * SQE Master — Software Quality Engineering Exam Browser & Practice Hub
 * Core Application Engine
 */

(function () {
  'use strict';

  // 1. Data Store & State
  const ALL_QUESTIONS = window.SQE_QUESTIONS || [];

  const STATE = {
    view: 'home', // 'home' | 'exam' | 'practice' | 'results' | 'bank'
    sessionQuestions: [],
    currentIndex: 0,
    userAnswers: {}, // { questionId: 'A'|'B'|'C'|'D' }
    flagged: new Set(),
    isExamMode: false,
    examTitle: '',
    timeRemaining: 0,
    timerTotal: 0,
    timerInterval: null,
    startTime: null,
    examSubmitted: false,
    reviewFilter: 'all', // 'all' | 'correct' | 'incorrect' | 'flagged'
  };

  // Local Storage Keys
  const STORAGE_KEY_STATS = 'sqe_user_stats_v1';
  const STORAGE_KEY_SETTINGS = 'sqe_settings_v1';

  let userStats = {
    bookmarks: [],
    mistakes: {}, // { [id]: { wrongCount: number, lastSeen: timestamp } }
    correctHistory: {}, // { [id]: number }
    examHistory: [] // [ { date, title, score, total, pct, timeSpent } ]
  };

  let userSettings = {
    theme: 'dark',
    sound: true,
  };

  // 2. Load LocalStorage
  function loadStoredData() {
    try {
      const storedStats = localStorage.getItem(STORAGE_KEY_STATS);
      if (storedStats) {
        userStats = Object.assign(userStats, JSON.parse(storedStats));
      }
      const storedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (storedSettings) {
        userSettings = Object.assign(userSettings, JSON.parse(storedSettings));
      }
    } catch (e) {
      console.warn('LocalStorage access warning:', e);
    }
  }

  function saveStoredData() {
    try {
      localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(userStats));
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(userSettings));
    } catch (e) {
      console.warn('Error saving to LocalStorage:', e);
    }
  }

  // 3. Audio Synthesizer (Web Audio API)
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioCtx = new AudioCtx();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSound(type) {
    if (!userSettings.sound) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      if (type === 'click') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.05);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'correct') {
        // Ascending harmonic chime
        [523.25, 659.25, 783.99].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + i * 0.06);
          gain.gain.setValueAtTime(0.12, now + i * 0.06);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.25);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + i * 0.06);
          osc.stop(now + i * 0.06 + 0.25);
        });
      } else if (type === 'incorrect') {
        // Gentle descending tone
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.linearRampToValueAtTime(160, now + 0.18);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.18);
      } else if (type === 'warning') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    } catch (e) {
      // Audio autoplay policy
    }
  }

  // 4. Utility Functions
  function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function applyTheme(theme) {
    userSettings.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    const themeIcon = document.getElementById('theme-toggle-btn');
    if (themeIcon) {
      themeIcon.innerHTML = theme === 'dark' ? '☀️' : '🌙';
      themeIcon.title = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    }
    saveStoredData();
  }

  function toggleSound() {
    userSettings.sound = !userSettings.sound;
    const soundBtn = document.getElementById('sound-toggle-btn');
    if (soundBtn) {
      soundBtn.innerHTML = userSettings.sound ? '🔔' : '🔕';
      soundBtn.title = userSettings.sound ? 'Mute Sounds' : 'Unmute Sounds';
    }
    if (userSettings.sound) playSound('click');
    saveStoredData();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      document.body.classList.add('kiosk-mode');
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      document.body.classList.remove('kiosk-mode');
    }
  }

  document.addEventListener('fullscreenchange', () => {
    const fsBtn = document.getElementById('fs-toggle-btn');
    if (fsBtn) {
      fsBtn.innerHTML = document.fullscreenElement ? '🗗' : '⛶';
      fsBtn.title = document.fullscreenElement ? 'Exit Fullscreen' : 'Enter Kiosk / Fullscreen Mode';
    }
    if (!document.fullscreenElement) {
      document.body.classList.remove('kiosk-mode');
    }
  });

  // 5. Navigation & Screen Switching
  function switchView(viewName) {
    STATE.view = viewName;
    document.getElementById('view-home').style.display = viewName === 'home' ? 'block' : 'none';
    document.getElementById('view-exam').style.display = (viewName === 'exam' || viewName === 'practice') ? 'grid' : 'none';
    document.getElementById('view-results').style.display = viewName === 'results' ? 'block' : 'none';
    document.getElementById('view-bank').style.display = viewName === 'bank' ? 'block' : 'none';

    // Header updates
    const modeBadge = document.getElementById('header-mode-badge');
    const timerBox = document.getElementById('header-timer-box');
    const exitBtn = document.getElementById('header-exit-btn');

    if (viewName === 'home' || viewName === 'bank') {
      clearInterval(STATE.timerInterval);
      modeBadge.style.display = 'none';
      timerBox.style.display = 'none';
      exitBtn.style.display = 'none';
      renderHomeStats();
      if (viewName === 'bank') renderBankView();
    } else if (viewName === 'exam') {
      modeBadge.style.display = 'inline-flex';
      modeBadge.className = 'mode-badge exam';
      modeBadge.textContent = '⏱️ Official Exam Simulation';
      timerBox.style.display = 'inline-flex';
      exitBtn.style.display = 'inline-flex';
    } else if (viewName === 'practice') {
      modeBadge.style.display = 'inline-flex';
      modeBadge.className = 'mode-badge';
      modeBadge.textContent = '💡 Interactive Practice';
      timerBox.style.display = 'none';
      exitBtn.style.display = 'inline-flex';
    } else if (viewName === 'results') {
      modeBadge.style.display = 'inline-flex';
      modeBadge.className = 'mode-badge review';
      modeBadge.textContent = '📊 Exam Performance Report';
      timerBox.style.display = 'none';
      exitBtn.style.display = 'inline-flex';
      exitBtn.textContent = '← Return Home';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 6. Home View Logic
  function renderHomeStats() {
    const totalCount = ALL_QUESTIONS.length;
    const bookmarkedCount = userStats.bookmarks.length;
    const mistakesCount = Object.keys(userStats.mistakes).length;
    const examsCount = userStats.examHistory.length;

    // calculate average exam score
    let avgScore = 0;
    if (examsCount > 0) {
      const sum = userStats.examHistory.reduce((acc, h) => acc + h.pct, 0);
      avgScore = Math.round(sum / examsCount);
    }

    document.getElementById('stat-total-mcqs').textContent = totalCount;
    document.getElementById('stat-mistakes').textContent = mistakesCount;
    document.getElementById('stat-bookmarks').textContent = bookmarkedCount;
    document.getElementById('stat-avg-score').textContent = examsCount > 0 ? `${avgScore}%` : 'N/A';

    // Render Recent Exam History
    const historyContainer = document.getElementById('recent-history-list');
    if (historyContainer) {
      if (examsCount === 0) {
        historyContainer.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No exam attempts recorded yet. Start an Official Exam simulation above!</p>';
      } else {
        const recent = [...userStats.examHistory].reverse().slice(0, 4);
        historyContainer.innerHTML = recent.map(h => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:0.65rem 0.85rem; background:var(--bg-surface-hover); border-radius:var(--radius-md); border:1px solid var(--border-color); font-size:0.85rem;">
            <div>
              <strong>${h.title}</strong>
              <div style="font-size:0.75rem; color:var(--text-muted);">${h.date} • ${formatTime(h.timeSpent)} spent</div>
            </div>
            <div style="font-weight:700; color:${h.pct >= 60 ? 'var(--success)' : 'var(--danger)'};">
              ${h.score}/${h.total} (${h.pct}%)
            </div>
          </div>
        `).join('');
      }
    }
  }

  // 7. Exam Session Setup
  function startSession(config) {
    STATE.isExamMode = !!config.isExamMode;
    STATE.examTitle = config.title || 'SQE Practice';
    STATE.currentIndex = 0;
    STATE.userAnswers = {};
    STATE.flagged = new Set();
    STATE.examSubmitted = false;
    STATE.startTime = Date.now();

    let pool = [...config.questions];
    if (config.shuffle) {
      pool = shuffleArray(pool);
    }
    if (config.limit && pool.length > config.limit) {
      pool = pool.slice(0, config.limit);
    }

    STATE.sessionQuestions = pool;

    if (STATE.isExamMode) {
      STATE.timerTotal = config.timeLimitSeconds || 45 * 60; // 45 mins
      STATE.timeRemaining = STATE.timerTotal;
      startTimer();
      switchView('exam');
    } else {
      clearInterval(STATE.timerInterval);
      switchView('practice');
    }

    renderCurrentQuestion();
    renderPalette();
  }

  function startTimer() {
    clearInterval(STATE.timerInterval);
    updateTimerDisplay();

    STATE.timerInterval = setInterval(() => {
      STATE.timeRemaining--;
      updateTimerDisplay();

      if (STATE.timeRemaining === 300) {
        // 5 min warning
        playSound('warning');
        const timerBox = document.getElementById('header-timer-box');
        if (timerBox) timerBox.classList.add('warning');
      }

      if (STATE.timeRemaining <= 0) {
        clearInterval(STATE.timerInterval);
        playSound('warning');
        alert('Time is up! Submitting your exam automatically.');
        submitExam();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const el = document.getElementById('timer-display');
    const box = document.getElementById('header-timer-box');
    if (el) el.textContent = formatTime(Math.max(0, STATE.timeRemaining));
    if (box) {
      if (STATE.timeRemaining <= 300 && STATE.timeRemaining > 0) {
        box.classList.add('warning');
      } else {
        box.classList.remove('warning');
      }
    }
  }

  // 8. Render Current Question
  function renderCurrentQuestion() {
    const q = STATE.sessionQuestions[STATE.currentIndex];
    if (!q) return;

    const total = STATE.sessionQuestions.length;
    const currentNum = STATE.currentIndex + 1;

    // Header elements
    document.getElementById('q-current-badge').textContent = `Question ${currentNum} of ${total}`;
    document.getElementById('q-topic-badge').textContent = q.topic;
    document.getElementById('q-source-badge').textContent = q.source_name;

    // Bookmark & Flag buttons
    const flagBtn = document.getElementById('q-flag-btn');
    const isFlagged = STATE.flagged.has(q.id);
    flagBtn.className = `flag-btn ${isFlagged ? 'flagged' : ''}`;
    flagBtn.innerHTML = `🚩 ${isFlagged ? 'Flagged' : 'Flag'}`;

    const bmBtn = document.getElementById('q-bookmark-btn');
    const isBookmarked = userStats.bookmarks.includes(q.id);
    bmBtn.className = `bookmark-btn ${isBookmarked ? 'saved' : ''}`;
    bmBtn.innerHTML = isBookmarked ? '★' : '☆';
    bmBtn.title = isBookmarked ? 'Remove Bookmark' : 'Bookmark Question';

    // Question text
    document.getElementById('q-text-content').textContent = q.question;

    // Options Rendering
    const optionsContainer = document.getElementById('options-stack');
    optionsContainer.innerHTML = '';

    const letters = ['A', 'B', 'C', 'D'];
    const currentAnswer = STATE.userAnswers[q.id];
    const isRevealed = !STATE.isExamMode && currentAnswer !== undefined;
    const isReview = STATE.examSubmitted;

    letters.forEach(letter => {
      const optText = q.options[letter];
      if (!optText) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option-btn';
      btn.setAttribute('data-letter', letter);

      if (currentAnswer === letter) {
        btn.classList.add('selected');
      }

      // In practice mode (immediate feedback) or after exam submit (review mode)
      if (isRevealed || isReview) {
        btn.disabled = true;
        if (letter === q.answer) {
          btn.classList.add('correct');
        } else if (currentAnswer === letter && currentAnswer !== q.answer) {
          btn.classList.add('incorrect');
        } else {
          btn.classList.add('dimmed');
        }
      }

      btn.innerHTML = `
        <span class="option-letter">${letter}</span>
        <span class="option-text">${optText}</span>
      `;

      btn.addEventListener('click', () => {
        selectOption(letter);
      });

      optionsContainer.appendChild(btn);
    });

    // Explanation Box
    const explBox = document.getElementById('explanation-box');
    if ((isRevealed || isReview) && q.explanation) {
      explBox.style.display = 'flex';
      document.getElementById('expl-correct-letter').textContent = `Correct Answer: Option (${q.answer})`;
      document.getElementById('expl-text').textContent = q.explanation;
    } else {
      explBox.style.display = 'none';
    }

    // Nav Footer Buttons
    document.getElementById('nav-prev-btn').disabled = STATE.currentIndex === 0;
    const nextBtn = document.getElementById('nav-next-btn');
    if (STATE.currentIndex === total - 1) {
      nextBtn.textContent = STATE.isExamMode ? 'Review & Submit →' : 'Finish Practice →';
    } else {
      nextBtn.textContent = 'Next Question →';
    }

    renderPalette();
  }

  // 9. Option Selection & Feedback
  function selectOption(letter) {
    const q = STATE.sessionQuestions[STATE.currentIndex];
    if (!q) return;

    if (STATE.examSubmitted) return; // in read-only review

    const previousAns = STATE.userAnswers[q.id];
    STATE.userAnswers[q.id] = letter;

    if (STATE.isExamMode) {
      playSound('click');
      renderCurrentQuestion();
      renderPalette();
    } else {
      // Practice mode: immediate feedback
      const isCorrect = letter === q.answer;
      if (isCorrect) {
        playSound('correct');
        userStats.correctHistory[q.id] = (userStats.correctHistory[q.id] || 0) + 1;
        // If it was in mistakes, decrement or remove
        if (userStats.mistakes[q.id]) {
          userStats.mistakes[q.id].wrongCount--;
          if (userStats.mistakes[q.id].wrongCount <= 0) {
            delete userStats.mistakes[q.id];
          }
        }
      } else {
        playSound('incorrect');
        userStats.mistakes[q.id] = {
          wrongCount: ((userStats.mistakes[q.id]?.wrongCount) || 0) + 1,
          lastSeen: Date.now()
        };
      }
      saveStoredData();
      renderCurrentQuestion();
      renderPalette();
    }
  }

  function clearSelection() {
    const q = STATE.sessionQuestions[STATE.currentIndex];
    if (!q || STATE.examSubmitted) return;
    delete STATE.userAnswers[q.id];
    playSound('click');
    renderCurrentQuestion();
    renderPalette();
  }

  function toggleFlag() {
    const q = STATE.sessionQuestions[STATE.currentIndex];
    if (!q) return;
    if (STATE.flagged.has(q.id)) {
      STATE.flagged.delete(q.id);
    } else {
      STATE.flagged.add(q.id);
      playSound('click');
    }
    renderCurrentQuestion();
    renderPalette();
  }

  function toggleBookmark() {
    const q = STATE.sessionQuestions[STATE.currentIndex];
    if (!q) return;
    const idx = userStats.bookmarks.indexOf(q.id);
    if (idx >= 0) {
      userStats.bookmarks.splice(idx, 1);
    } else {
      userStats.bookmarks.push(q.id);
      playSound('click');
    }
    saveStoredData();
    renderCurrentQuestion();
  }

  // 10. Navigation Handlers
  function goPrev() {
    if (STATE.currentIndex > 0) {
      STATE.currentIndex--;
      playSound('click');
      renderCurrentQuestion();
    }
  }

  function goNext() {
    if (STATE.currentIndex < STATE.sessionQuestions.length - 1) {
      STATE.currentIndex++;
      playSound('click');
      renderCurrentQuestion();
    } else {
      if (STATE.isExamMode) {
        openSubmitModal();
      } else {
        finishPractice();
      }
    }
  }

  function jumpToQuestion(idx) {
    if (idx >= 0 && idx < STATE.sessionQuestions.length) {
      STATE.currentIndex = idx;
      playSound('click');
      renderCurrentQuestion();
    }
  }

  // 11. Question Palette (Sidebar)
  function renderPalette() {
    const grid = document.getElementById('palette-grid');
    if (!grid) return;
    grid.innerHTML = '';

    STATE.sessionQuestions.forEach((q, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'palette-btn';
      btn.textContent = idx + 1;

      if (idx === STATE.currentIndex) {
        btn.classList.add('current');
      }

      const hasAnswer = STATE.userAnswers[q.id] !== undefined;
      const isFlagged = STATE.flagged.has(q.id);

      if (hasAnswer) btn.classList.add('answered');
      if (isFlagged) btn.classList.add('flagged');

      // Post-submission or practice mode correct/wrong indicators
      if ((STATE.examSubmitted || !STATE.isExamMode) && hasAnswer) {
        if (STATE.userAnswers[q.id] === q.answer) {
          btn.classList.add('correct');
        } else {
          btn.classList.add('incorrect');
        }
      }

      btn.addEventListener('click', () => {
        jumpToQuestion(idx);
      });

      grid.appendChild(btn);
    });

    // Update palette counters
    const answeredCount = Object.keys(STATE.userAnswers).length;
    const flaggedCount = STATE.flagged.size;
    const totalCount = STATE.sessionQuestions.length;

    const countEl = document.getElementById('palette-count-label');
    if (countEl) {
      countEl.textContent = `${answeredCount}/${totalCount} Answered`;
    }
  }

  // 12. Submit & Exam Evaluation
  function openSubmitModal() {
    const total = STATE.sessionQuestions.length;
    const answered = Object.keys(STATE.userAnswers).length;
    const unanswered = total - answered;
    const flagged = STATE.flagged.size;

    document.getElementById('modal-submit-summary').innerHTML = `
      You have answered <strong>${answered}</strong> of <strong>${total}</strong> questions.<br>
      • Unanswered: <strong>${unanswered}</strong><br>
      • Marked for Review: <strong>${flagged}</strong><br>
      Are you sure you want to finish and submit your exam?
    `;

    const dialog = document.getElementById('dialog-submit-exam');
    if (dialog && typeof dialog.showModal === 'function') {
      dialog.showModal();
    }
  }

  function submitExam() {
    clearInterval(STATE.timerInterval);
    STATE.examSubmitted = true;

    // Calculate score
    let correctCount = 0;
    const topicStats = {};

    STATE.sessionQuestions.forEach(q => {
      if (!topicStats[q.topic]) {
        topicStats[q.topic] = { total: 0, correct: 0 };
      }
      topicStats[q.topic].total++;

      const userAns = STATE.userAnswers[q.id];
      if (userAns === q.answer) {
        correctCount++;
        topicStats[q.topic].correct++;
        userStats.correctHistory[q.id] = (userStats.correctHistory[q.id] || 0) + 1;
        if (userStats.mistakes[q.id]) {
          userStats.mistakes[q.id].wrongCount--;
          if (userStats.mistakes[q.id].wrongCount <= 0) {
            delete userStats.mistakes[q.id];
          }
        }
      } else {
        userStats.mistakes[q.id] = {
          wrongCount: ((userStats.mistakes[q.id]?.wrongCount) || 0) + 1,
          lastSeen: Date.now()
        };
      }
    });

    const total = STATE.sessionQuestions.length;
    const pct = Math.round((correctCount / total) * 100);
    const timeSpent = Math.max(1, Math.round((Date.now() - STATE.startTime) / 1000));
    const passed = pct >= 60; // 60% passing mark

    // Record in history
    userStats.examHistory.push({
      date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      title: STATE.examTitle,
      score: correctCount,
      total: total,
      pct: pct,
      timeSpent: timeSpent,
    });
    saveStoredData();

    // Render Results View
    renderResultsView({
      title: STATE.examTitle,
      score: correctCount,
      total: total,
      pct: pct,
      passed: passed,
      timeSpent: timeSpent,
      topicStats: topicStats,
    });

    switchView('results');
  }

  function finishPractice() {
    let correctCount = 0;
    STATE.sessionQuestions.forEach(q => {
      if (STATE.userAnswers[q.id] === q.answer) {
        correctCount++;
      }
    });
    const total = STATE.sessionQuestions.length;
    const pct = Math.round((correctCount / total) * 100);
    alert(`Practice complete! You answered ${correctCount} of ${total} correctly (${pct}%).`);
    switchView('home');
  }

  // 13. Render Results Screen
  function renderResultsView(result) {
    const circle = document.getElementById('res-score-circle');
    const val = document.getElementById('res-score-val');
    const verdict = document.getElementById('res-verdict');

    circle.className = `score-circle ${result.passed ? 'pass' : 'fail'}`;
    val.textContent = `${result.pct}%`;
    verdict.className = `result-verdict ${result.passed ? 'pass' : 'fail'}`;
    verdict.textContent = result.passed ? '🎉 Congratulations! You Passed' : '⚠️ Keep Practicing! Did Not Pass';

    document.getElementById('res-stat-score').textContent = `${result.score} / ${result.total}`;
    document.getElementById('res-stat-accuracy').textContent = `${result.pct}%`;
    document.getElementById('res-stat-time').textContent = formatTime(result.timeSpent);
    document.getElementById('res-stat-passing').textContent = '60%';

    // Topic breakdown bars
    const topicContainer = document.getElementById('res-topic-bars');
    topicContainer.innerHTML = '';
    for (const [topic, data] of Object.entries(result.topicStats)) {
      const topicPct = Math.round((data.correct / data.total) * 100);
      const row = document.createElement('div');
      row.className = 'topic-bar-row';
      row.innerHTML = `
        <div class="topic-bar-header">
          <span>${topic}</span>
          <span>${data.correct}/${data.total} (${topicPct}%)</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: ${topicPct}%; background-color: ${topicPct >= 60 ? 'var(--success)' : 'var(--danger)'}"></div>
        </div>
      `;
      topicContainer.appendChild(row);
    }
  }

  function reviewExamAnswers() {
    // Switch to review mode within exam view
    STATE.currentIndex = 0;
    switchView('exam');
    renderCurrentQuestion();
    renderPalette();
  }

  // 14. Question Bank View (Search & Browse)
  function renderBankView() {
    const listContainer = document.getElementById('bank-questions-list');
    const searchVal = (document.getElementById('bank-search-input')?.value || '').toLowerCase().trim();
    const topicVal = document.getElementById('bank-topic-filter')?.value || 'all';
    const sourceVal = document.getElementById('bank-source-filter')?.value || 'all';
    const statusVal = document.getElementById('bank-status-filter')?.value || 'all';

    const filtered = ALL_QUESTIONS.filter(q => {
      // topic filter
      if (topicVal !== 'all' && q.topic !== topicVal) return false;
      // source filter
      if (sourceVal !== 'all' && q.source_file !== sourceVal) return false;
      // status filter
      if (statusVal === 'bookmarked' && !userStats.bookmarks.includes(q.id)) return false;
      if (statusVal === 'mistakes' && !userStats.mistakes[q.id]) return false;
      if (statusVal === 'mastered' && !userStats.correctHistory[q.id]) return false;

      // search filter
      if (searchVal) {
        const text = (q.question + ' ' + Object.values(q.options).join(' ') + ' ' + q.explanation).toLowerCase();
        if (!text.includes(searchVal)) return false;
      }
      return true;
    });

    document.getElementById('bank-results-count').textContent = `Showing ${filtered.length} of ${ALL_QUESTIONS.length} Questions`;

    if (filtered.length === 0) {
      listContainer.innerHTML = '<div style="padding:2rem; text-align:center; color:var(--text-muted); background:var(--bg-card); border-radius:var(--radius-md);">No questions match your filter criteria.</div>';
      return;
    }

    listContainer.innerHTML = filtered.map(q => {
      const isBookmarked = userStats.bookmarks.includes(q.id);
      const isMistake = !!userStats.mistakes[q.id];
      return `
        <div class="bank-item-card" id="bank-q-${q.id}">
          <div class="bank-item-header">
            <div style="display:flex; gap:0.5rem; align-items:center;">
              <span class="q-badge">#${q.id}</span>
              <span class="topic-badge">${q.topic}</span>
              ${isMistake ? '<span style="font-size:0.75rem; color:var(--danger); font-weight:600;">⚠️ Mistake</span>' : ''}
            </div>
            <div style="display:flex; gap:0.5rem; align-items:center;">
              <button class="bookmark-btn ${isBookmarked ? 'saved' : ''}" onclick="window.SQE_APP.toggleBankBookmark(${q.id})" title="Bookmark">
                ${isBookmarked ? '★' : '☆'}
              </button>
            </div>
          </div>
          <div style="font-weight:600; font-size:1rem; color:var(--text-main);">${q.question}</div>
          <div style="display:grid; grid-template-columns:1fr; gap:0.4rem; font-size:0.9rem;">
            ${['A', 'B', 'C', 'D'].map(l => `
              <div style="padding:0.4rem 0.6rem; border-radius:var(--radius-sm); border:1px solid ${l === q.answer ? 'var(--success-border)' : 'var(--border-color)'}; background:${l === q.answer ? 'var(--success-bg)' : 'var(--bg-surface)'}; display:flex; gap:0.5rem;">
                <strong>${l}.</strong>
                <span>${q.options[l] || ''}</span>
                ${l === q.answer ? '<span style="margin-left:auto; color:var(--success); font-weight:bold;">✔ Correct</span>' : ''}
              </div>
            `).join('')}
          </div>
          <details style="margin-top:0.4rem; font-size:0.85rem; color:var(--text-muted);">
            <summary style="cursor:pointer; font-weight:600; color:var(--primary);">View Detailed Explanation & Source</summary>
            <div style="padding:0.75rem; background:var(--bg-surface-hover); border-radius:var(--radius-sm); margin-top:0.4rem; line-height:1.5; color:var(--text-main);">
              <strong>Source:</strong> ${q.source_name} (${q.set_name})<br>
              <strong>Explanation:</strong> ${q.explanation}
            </div>
          </details>
        </div>
      `;
    }).join('');
  }

  // 15. Light Dismiss Fallback for Native Dialogs (Modern Web Guidance)
  function initDialogs() {
    const dialogs = document.querySelectorAll('dialog');
    dialogs.forEach(dialog => {
      if (!('closedBy' in HTMLDialogElement.prototype)) {
        dialog.addEventListener('click', (event) => {
          if (event.target !== dialog) return;
          const rect = dialog.getBoundingClientRect();
          const isDialogContent = (
            rect.top <= event.clientY &&
            event.clientY <= rect.top + rect.height &&
            rect.left <= event.clientX &&
            event.clientX <= rect.width + rect.left
          );
          if (!isDialogContent) {
            dialog.close();
          }
        });
      }
    });
  }

  // 16. Keyboard Shortcuts Listener
  function initKeyboardNavigation() {
    window.addEventListener('keydown', (e) => {
      // Don't trigger if user is typing in search input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // Modal open? Don't interfere except Escape
      const activeModal = document.querySelector('dialog[open]');
      if (activeModal && e.key !== 'Escape') return;

      if (STATE.view === 'exam' || STATE.view === 'practice') {
        if (e.key === '1' || e.key.toUpperCase() === 'A') {
          e.preventDefault();
          selectOption('A');
        } else if (e.key === '2' || e.key.toUpperCase() === 'B') {
          e.preventDefault();
          selectOption('B');
        } else if (e.key === '3' || e.key.toUpperCase() === 'C') {
          e.preventDefault();
          selectOption('C');
        } else if (e.key === '4' || e.key.toUpperCase() === 'D') {
          e.preventDefault();
          selectOption('D');
        } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'n') {
          e.preventDefault();
          goNext();
        } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'p') {
          e.preventDefault();
          goPrev();
        } else if (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'm') {
          e.preventDefault();
          toggleFlag();
        } else if (e.key.toLowerCase() === 'c') {
          e.preventDefault();
          clearSelection();
        }
      }

      if (e.key === '?') {
        const shortcutsDialog = document.getElementById('dialog-shortcuts');
        if (shortcutsDialog && typeof shortcutsDialog.showModal === 'function') {
          shortcutsDialog.showModal();
        }
      }
    });
  }

  // 17. Bind Event Listeners
  function initEventListeners() {
    // Theme toggle
    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
      applyTheme(userSettings.theme === 'dark' ? 'light' : 'dark');
    });

    // Sound toggle
    document.getElementById('sound-toggle-btn')?.addEventListener('click', toggleSound);

    // Fullscreen toggle
    document.getElementById('fs-toggle-btn')?.addEventListener('click', toggleFullscreen);

    // Brand logo return home
    document.getElementById('app-brand')?.addEventListener('click', () => {
      if (STATE.view === 'exam' && !STATE.examSubmitted) {
        if (!confirm('You have an active exam in progress. Are you sure you want to leave and exit to the Home dashboard?')) {
          return;
        }
      }
      switchView('home');
    });

    // Header Exit Button
    document.getElementById('header-exit-btn')?.addEventListener('click', () => {
      if (STATE.view === 'exam' && !STATE.examSubmitted) {
        if (!confirm('Leave current exam and return home? Your progress for this test will be lost.')) {
          return;
        }
      }
      switchView('home');
    });

    // Shortcuts dialog button
    document.getElementById('shortcuts-btn')?.addEventListener('click', () => {
      document.getElementById('dialog-shortcuts')?.showModal();
    });

    // Reset stats button
    document.getElementById('reset-stats-btn')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset your exam history and practice progress?')) {
        userStats = { bookmarks: [], mistakes: {}, correctHistory: {}, examHistory: [] };
        saveStoredData();
        renderHomeStats();
        alert('All statistics have been reset.');
      }
    });

    // Navigation buttons
    document.getElementById('nav-prev-btn')?.addEventListener('click', goPrev);
    document.getElementById('nav-next-btn')?.addEventListener('click', goNext);
    document.getElementById('nav-clear-btn')?.addEventListener('click', clearSelection);
    document.getElementById('q-flag-btn')?.addEventListener('click', toggleFlag);
    document.getElementById('q-bookmark-btn')?.addEventListener('click', toggleBookmark);

    // Exam submit button in footer
    document.getElementById('nav-submit-btn')?.addEventListener('click', () => {
      if (STATE.isExamMode) openSubmitModal();
      else finishPractice();
    });

    // Modal submit confirmation
    document.getElementById('confirm-submit-exam-btn')?.addEventListener('click', () => {
      document.getElementById('dialog-submit-exam')?.close();
      submitExam();
    });

    // Results Actions
    document.getElementById('res-review-btn')?.addEventListener('click', reviewExamAnswers);
    document.getElementById('res-retake-btn')?.addEventListener('click', () => {
      startSession({
        title: STATE.examTitle,
        questions: STATE.sessionQuestions,
        isExamMode: true,
        timeLimitSeconds: STATE.timerTotal,
        shuffle: true,
      });
    });
    document.getElementById('res-home-btn')?.addEventListener('click', () => {
      switchView('home');
    });

    // Home Quick Launch Modes
    document.getElementById('launch-official-exam')?.addEventListener('click', () => {
      // 35 Questions from SQE.pdf
      const sqeQuestions = ALL_QUESTIONS.filter(q => q.source_file === 'SQE.pdf');
      startSession({
        title: 'Official SQE MCQ Examination (35 Questions)',
        questions: sqeQuestions.length === 35 ? sqeQuestions : ALL_QUESTIONS.slice(0, 35),
        isExamMode: true,
        timeLimitSeconds: 45 * 60,
        shuffle: false,
      });
    });

    document.getElementById('launch-bank-mock')?.addEventListener('click', () => {
      // 50 Random MCQs from all sources
      startSession({
        title: 'Full Mock Exam (50 Shuffled MCQs)',
        questions: ALL_QUESTIONS,
        limit: 50,
        isExamMode: true,
        timeLimitSeconds: 60 * 60,
        shuffle: true,
      });
    });

    document.getElementById('launch-marathon')?.addEventListener('click', () => {
      // All 245 MCQs in Practice Mode
      startSession({
        title: 'SQE 245 MCQs Complete Marathon',
        questions: ALL_QUESTIONS,
        isExamMode: false,
        shuffle: false,
      });
    });

    document.getElementById('launch-mistakes')?.addEventListener('click', () => {
      const mistakeIds = Object.keys(userStats.mistakes).map(Number);
      const mistakeQuestions = ALL_QUESTIONS.filter(q => mistakeIds.includes(q.id));
      if (mistakeQuestions.length === 0) {
        alert('You have no recorded mistakes yet! Complete an exam or practice session first.');
        return;
      }
      startSession({
        title: `Mistakes Revision Bank (${mistakeQuestions.length} MCQs)`,
        questions: mistakeQuestions,
        isExamMode: false,
        shuffle: true,
      });
    });

    document.getElementById('launch-bookmarks')?.addEventListener('click', () => {
      const bmQuestions = ALL_QUESTIONS.filter(q => userStats.bookmarks.includes(q.id));
      if (bmQuestions.length === 0) {
        alert('You have no bookmarked questions yet! Click the star icon (☆) on any question to bookmark it.');
        return;
      }
      startSession({
        title: `Bookmarked Questions (${bmQuestions.length} MCQs)`,
        questions: bmQuestions,
        isExamMode: false,
        shuffle: false,
      });
    });

    document.getElementById('open-bank-browser-btn')?.addEventListener('click', () => {
      switchView('bank');
    });

    document.getElementById('bank-back-home-btn')?.addEventListener('click', () => {
      switchView('home');
    });

    // Bank View Filters & Search
    document.getElementById('bank-search-input')?.addEventListener('input', renderBankView);
    document.getElementById('bank-topic-filter')?.addEventListener('change', renderBankView);
    document.getElementById('bank-source-filter')?.addEventListener('change', renderBankView);
    document.getElementById('bank-status-filter')?.addEventListener('change', renderBankView);

    // Print Cram Sheet
    document.getElementById('bank-print-btn')?.addEventListener('click', () => {
      window.print();
    });
  }

  // 18. Initialize Application
  function initApp() {
    loadStoredData();
    applyTheme(userSettings.theme);
    initDialogs();
    initKeyboardNavigation();
    initEventListeners();
    renderHomeStats();

    // Populate Topic Grid in Home
    const topicContainer = document.getElementById('home-topics-grid');
    if (topicContainer) {
      const topics = [
        { name: 'SQE Discipline (Module 01)', icon: '📘' },
        { name: 'SQE Lecture 1 (Quality Concepts & Specs)', icon: '🎯' },
        { name: 'SQE Lecture 2 (Quality Types & SQA Plans)', icon: '📋' },
        { name: 'Cost of Software Quality (Module 02)', icon: '💰' },
        { name: 'Quality Assurance Basics & Defect Prevention', icon: '🛡️' },
      ];

      topicContainer.innerHTML = topics.map(t => {
        const count = ALL_QUESTIONS.filter(q => q.topic === t.name).length;
        return `
          <div class="topic-card" onclick="window.SQE_APP.startTopicPractice('${t.name.replace(/'/g, "\\'")}')">
            <div style="font-size:1.5rem; margin-bottom:0.4rem;">${t.icon}</div>
            <div class="title">${t.name}</div>
            <div class="stats">
              <span>${count} Questions</span>
              <span style="color:var(--primary); font-weight:600;">Start Practice →</span>
            </div>
          </div>
        `;
      }).join('');
    }

    // Populate Topic Filter in Bank View
    const topicFilterSelect = document.getElementById('bank-topic-filter');
    if (topicFilterSelect) {
      const uniqueTopics = [...new Set(ALL_QUESTIONS.map(q => q.topic))];
      uniqueTopics.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        topicFilterSelect.appendChild(opt);
      });
    }

    console.log(`SQE Exam Browser initialized with ${ALL_QUESTIONS.length} MCQs.`);
  }

  // Global helper for inline card handlers
  window.SQE_APP = {
    startTopicPractice: function(topicName) {
      const topicQuestions = ALL_QUESTIONS.filter(q => q.topic === topicName);
      startSession({
        title: `${topicName} Practice`,
        questions: topicQuestions,
        isExamMode: false,
        shuffle: false,
      });
    },
    toggleBankBookmark: function(id) {
      const idx = userStats.bookmarks.indexOf(id);
      if (idx >= 0) userStats.bookmarks.splice(idx, 1);
      else userStats.bookmarks.push(id);
      saveStoredData();
      renderBankView();
    }
  };

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
