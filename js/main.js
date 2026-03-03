/* ===== データ管理 ===== */
let tasks = JSON.parse(localStorage.getItem("tasks")) || [];
let shameCount = Number(localStorage.getItem("shameCount")) || 0;
let streakData = JSON.parse(localStorage.getItem("streakData")) || { lastDate: null, count: 0 };

/* ===== DOM要素 ===== */
const input = document.getElementById("taskInput");
const prioritySelect = document.getElementById("priority");
const categorySelect = document.getElementById("category");
const deadlineInput = document.getElementById("deadlineInput");
const addBtn = document.getElementById("addBtn");
const list = document.getElementById("taskList");
const clearDoneBtn = document.getElementById("clearDoneBtn");
const overdueBanner = document.getElementById("overdueBanner");

/* ===== イベント ===== */
addBtn.addEventListener("click", addTask);
input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.isComposing) addTask();
});
clearDoneBtn.addEventListener("click", clearDoneTasks);

/* ===== デフォルト期限：1時間後 ===== */
function setDefaultDeadline() {
  const now = new Date();
  now.setHours(now.getHours() + 1);
  // datetime-local はローカル時間を期待するので手動でフォーマット
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  deadlineInput.value = `${y}-${m}-${d}T${h}:${min}`;
}
setDefaultDeadline();

/* ===== タスク追加 ===== */
function addTask() {
  const text = input.value.trim();
  if (!text) {
    input.style.borderColor = "#ef5350";
    input.style.animation = "overdue-shake 0.3s ease-in-out";
    setTimeout(() => {
      input.style.borderColor = "";
      input.style.animation = "";
    }, 500);
    return;
  }

  const deadline = deadlineInput.value || null;

  tasks.push({
    text,
    priority: Number(prioritySelect.value),
    category: categorySelect.value,
    done: false,
    doneAt: null,
    createdAt: new Date().toISOString(),
    deadline: deadline ? new Date(deadline).toISOString() : null,
    shamed: false  // 先延ばしカウント済みフラグ
  });

  saveTasks();
  renderTasks();
  input.value = "";
  setDefaultDeadline();
  input.focus();
}

/* ===== 日時フォーマット ===== */
function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* ===== カウントダウン計算 ===== */
function getCountdownInfo(task) {
  if (!task.deadline || task.done) return null;

  const now = new Date();
  const deadline = new Date(task.deadline);
  const created = new Date(task.createdAt);
  const totalMs = deadline - created;
  const remainMs = deadline - now;

  if (remainMs <= 0) {
    return { text: "⚠️ 期限切れ！", level: "overdue", ratio: 0 };
  }

  const ratio = remainMs / totalMs; // 1.0 → 0.0

  // 残り時間を人間可読形式に
  const totalMin = Math.floor(remainMs / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;

  let text = "";
  if (days > 0) text = `あと${days}日${hours}時間`;
  else if (hours > 0) text = `あと${hours}時間${mins}分`;
  else text = `あと${mins}分`;

  let level;
  if (ratio > 0.5) level = "safe";
  else if (ratio > 0.25) level = "warning";
  else level = "danger";

  return { text, level, ratio };
}

/* ===== 先延ばしカウンター更新 ===== */
function updateShameCount() {
  let updated = false;
  const now = new Date();

  tasks.forEach(task => {
    if (!task.done && task.deadline && !task.shamed) {
      const deadline = new Date(task.deadline);
      if (now > deadline) {
        task.shamed = true;
        shameCount++;
        updated = true;
      }
    }
  });

  if (updated) {
    localStorage.setItem("shameCount", shameCount);
    saveTasks();
  }
}

/* ===== ストリーク（連続達成日数） ===== */
function updateStreak() {
  const today = new Date().toISOString().slice(0, 10);

  // 今日完了されたタスクがあるかチェック
  const todayDone = tasks.some(t =>
    t.done && t.doneAt && t.doneAt.slice(0, 10) === today
  );

  if (todayDone) {
    if (streakData.lastDate === today) {
      // 既に今日カウント済み
    } else {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      if (streakData.lastDate === yesterdayStr) {
        streakData.count++;
      } else if (streakData.lastDate !== today) {
        streakData.count = 1;
      }
      streakData.lastDate = today;
    }
  }

  localStorage.setItem("streakData", JSON.stringify(streakData));
}

/* ===== 統計表示更新 ===== */
function updateStats() {
  const total = tasks.length;
  const done = tasks.filter(t => t.done).length;
  const rate = total > 0 ? Math.round((done / total) * 100) : 0;

  document.getElementById("statDone").textContent = done;
  document.getElementById("statRate").textContent = total > 0 ? `${rate}%` : "--%";
  document.getElementById("statStreak").textContent = `${streakData.count}日`;
  document.getElementById("statShame").textContent = shameCount;

  // 恥カウンターが高いとさらにビジュアル強化
  const shameStat = document.querySelector(".stat.shame .stat-value");
  if (shameCount >= 10) {
    shameStat.style.fontSize = "24px";
    shameStat.style.animation = "count-pulse 0.8s infinite";
  } else if (shameCount >= 5) {
    shameStat.style.fontSize = "22px";
  }

  // 完了一括削除ボタンの表示制御
  clearDoneBtn.style.display = done > 0 ? "block" : "none";
}

/* ===== 期限切れバナー制御 ===== */
function updateOverdueBanner() {
  const now = new Date();
  const hasOverdue = tasks.some(t =>
    !t.done && t.deadline && new Date(t.deadline) < now
  );
  overdueBanner.style.display = hasOverdue ? "block" : "none";
}

/* ===== タスク描画 ===== */
function renderTasks() {
  list.innerHTML = "";

  // 先延ばしチェック
  updateShameCount();
  updateStreak();

  // ソート: 未完了→完了、期限切れ→期限近い→余裕あり→期限なし、優先度
  tasks.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;

    // 期限切れを最上部に
    const now = new Date();
    const aOverdue = a.deadline && new Date(a.deadline) < now && !a.done;
    const bOverdue = b.deadline && new Date(b.deadline) < now && !b.done;
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;

    // 期限が近い順
    if (a.deadline && b.deadline) {
      return new Date(a.deadline) - new Date(b.deadline);
    }
    if (a.deadline) return -1;
    if (b.deadline) return 1;

    return b.priority - a.priority;
  });

  if (tasks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = '<span class="emoji">😴</span>タスクがないぞ…<br>油断するな！';
    list.appendChild(empty);
  }

  tasks.forEach((task, index) => {
    const li = document.createElement("li");
    const countdown = getCountdownInfo(task);

    // 優先度ボーダー
    li.classList.add(
      task.priority === 3 ? "priority-high" :
        task.priority === 2 ? "priority-middle" : "priority-low"
    );

    // 緊急度による背景変化
    if (countdown) {
      li.classList.add(`urgency-${countdown.level}`);
    }

    if (task.done) li.classList.add("done");

    /* --- メイン行 --- */
    const mainRow = document.createElement("div");
    mainRow.className = "task-main";

    // チェックボックス
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.done;
    checkbox.onchange = () => {
      tasks[index].done = checkbox.checked;
      tasks[index].doneAt = checkbox.checked ? new Date().toISOString() : null;
      saveTasks();
      renderTasks();
    };

    // タスクテキスト（クリックで編集）
    const span = document.createElement("span");
    span.className = "task-text";
    span.textContent = task.text;
    span.onclick = () => startEditing(span, index);

    // 削除ボタン
    const delBtn = document.createElement("button");
    delBtn.textContent = "×";
    delBtn.className = "delete";
    delBtn.onclick = () => {
      tasks.splice(index, 1);
      saveTasks();
      renderTasks();
    };

    mainRow.append(checkbox, span, delBtn);

    /* --- メタ情報行 --- */
    const metaRow = document.createElement("div");
    metaRow.className = "task-meta";

    // カテゴリバッジ
    const badge = document.createElement("span");
    badge.className = "category-badge";
    badge.textContent = task.category;
    metaRow.appendChild(badge);

    // 作成日時
    const meta = document.createElement("small");
    meta.className = "meta";
    meta.textContent = formatDate(task.createdAt);
    metaRow.appendChild(meta);

    // カウントダウン（クリックで期限編集）
    if (!task.done) {
      const deadlineEl = document.createElement("span");
      if (countdown) {
        deadlineEl.className = `countdown ${countdown.level}`;
        deadlineEl.textContent = countdown.text;
      } else {
        deadlineEl.className = "deadline-add";
        deadlineEl.textContent = "＋期限";
      }
      deadlineEl.title = "クリックで期限を編集";
      deadlineEl.onclick = () => startEditingDeadline(deadlineEl, index);
      metaRow.appendChild(deadlineEl);
    }

    li.append(mainRow, metaRow);
    list.appendChild(li);
  });

  updateStats();
  updateOverdueBanner();
}

/* ===== タスク編集 ===== */
function startEditing(span, index) {
  if (tasks[index].done) return; // 完了タスクは編集不可

  span.classList.add("editing");
  span.contentEditable = "true";
  span.focus();

  // テキスト全選択
  const range = document.createRange();
  range.selectNodeContents(span);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const finishEditing = () => {
    span.contentEditable = "false";
    span.classList.remove("editing");
    const newText = span.textContent.trim();
    if (newText && newText !== tasks[index].text) {
      tasks[index].text = newText;
      saveTasks();
    } else {
      span.textContent = tasks[index].text;
    }
  };

  span.onblur = finishEditing;
  span.onkeydown = e => {
    if (e.key === "Enter") {
      e.preventDefault();
      span.blur();
    }
    if (e.key === "Escape") {
      span.textContent = tasks[index].text;
      span.blur();
    }
  };
}

/* ===== 期限編集 ===== */
function startEditingDeadline(el, index) {
  if (tasks[index].done) return;

  const input = document.createElement("input");
  input.type = "datetime-local";
  input.className = "deadline-edit-input";

  if (tasks[index].deadline) {
    const d = new Date(tasks[index].deadline);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 16);
    input.value = local;
  }

  el.replaceWith(input);
  input.focus();

  const finish = () => {
    tasks[index].deadline = input.value
      ? new Date(input.value).toISOString()
      : null;
    saveTasks();
    renderTasks();
  };

  input.onblur = finish;
  input.onkeydown = e => {
    if (e.key === "Enter") { e.preventDefault(); input.blur(); }
    if (e.key === "Escape") renderTasks();
  };
}

/* ===== 完了タスク一括削除 ===== */
function clearDoneTasks() {
  tasks = tasks.filter(t => !t.done);
  saveTasks();
  renderTasks();
}

/* ===== 保存 ===== */
function saveTasks() {
  localStorage.setItem("tasks", JSON.stringify(tasks));
}

/* ===== 初回描画 ===== */
renderTasks();

/* ===== 1分ごとの自動更新（カウントダウン用） ===== */
setInterval(() => {
  renderTasks();
}, 60000);