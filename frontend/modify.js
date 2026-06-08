// Modify timetable interactive editor
(() => {
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const SLOTS = [
    "08:30-09:30",
    "09:30-10:30",
    "10:30-11:00",
    "11:00-12:00",
    "12:00-01:00",
    "01:00-02:00",
    "02:00-03:00",
    "03:00-04:00"
  ];
  const SCHEDULABLE_SLOTS = SLOTS.filter(s => s !== "10:30-11:00" && s !== "01:00-02:00");

  const dept = sessionStorage.getItem('department') || 'BCA';

  const modeSel = document.getElementById('modeSel');
  const semDivWrap = document.getElementById('semDivWrap');
  const teacherWrap = document.getElementById('teacherWrap');
  const semSel = document.getElementById('semSel');
  const divSel = document.getElementById('divSel');
  const teacherSel = document.getElementById('teacherSel');

  const statusBox = document.getElementById('statusBox');
  const timetableWrap = document.getElementById('timetableWrap');
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const toast = document.getElementById('toast');

  let original = []; // original timetable
  let current = [];  // working timetable

  // Selection state
  let selectedCell = null; // { key, entry }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  }

  function setStatus(msg, isConflict = false) {
    statusBox.textContent = msg;
    statusBox.classList.toggle('conflict', isConflict);
  }

  function entryKey(e) {
    return `${e.day}__${e.slot}__${e.semester}__${e.division}__${e.teacherName}__${e.subject}__${e.type}`;
  }

  // Constraints:
  // 1) no teacher double-booking: same teacher on same day+slot
  // 2) no division double-booking: same semester+division on same day+slot
  function isMoveAllowed(entryToMove, targetDay, targetSlot, targetSem, targetDiv) {
    // keep semantics: entry is moved within same semester/division when in class mode,
    // but in teacher mode semester/division are part of the entry itself.

    // Normalize target fields based on entryToMove (we will not allow moving across sem/div in UI)
    const newSem = targetSem ?? entryToMove.semester;
    const newDiv = targetDiv ?? entryToMove.division;

    // Don't allow into break/lunch slots
    if (!SCHEDULATABLE_SLOTS.includes(targetSlot)) return false;

    // teacher conflict
    const teacherConflict = current.some(e => {
      if (e === entryToMove) return false;
      return e.day === targetDay && e.slot === targetSlot && e.teacherName === entryToMove.teacherName;
    });
    if (teacherConflict) return false;

    // division conflict
    const divConflict = current.some(e => {
      if (e === entryToMove) return false;
      return e.day === targetDay && e.slot === targetSlot && e.semester === newSem && e.division === newDiv;
    });
    if (divConflict) return false;

    return true;
  }

  function getEntriesForCell(day, slot, sem, div, teacher) {
    // In class mode: one cell maps to a single entry by sem/div/day/slot.
    // In teacher mode: by teacher/day/slot.
    if (modeSel.value === 'class') {
      return current.find(e => e.day === day && e.slot === slot && e.semester === sem && e.division === div) || null;
    }
    return current.find(e => e.day === day && e.slot === slot && e.teacherName === teacher) || null;
  }

  function clearSelection() {
    selectedCell = null;
    document.querySelectorAll('.block.selected').forEach(el => el.classList.remove('selected'));
  }

  function markDropTargets(day, slot, sem, div, teacher) {
    // highlight valid target cell for current selection
    const cell = document.querySelector(`[data-cell="${day}__${slot}__${sem ?? ''}__${div ?? ''}__${teacher ?? ''}"]`);
    if (!cell) return;

    // if there is selection, determine whether drop is valid
    if (!selectedCell) {
      cell.classList.remove('drop-hint');
      return;
    }

    const entryToMove = selectedCell.entry;
    const allowed = isMoveAllowed(entryToMove, day, slot, sem, div);
    cell.classList.toggle('drop-hint', allowed);
  }

  function render() {
    timetableWrap.innerHTML = '';
    clearSelection();

    const mode = modeSel.value;

    if (mode === 'class') {
      semDivWrap.style.display = 'flex';
      teacherWrap.style.display = 'none';

      const sem = semSel.value;
      const div = divSel.value;

      renderClassGrid(sem, div);
    } else {
      semDivWrap.style.display = 'none';
      teacherWrap.style.display = 'block';

      const teacher = teacherSel.value;
      renderTeacherGrid(teacher);
    }
  }

  function renderHeaderCell(dayLabel) {
    return `<td class="day-cell">${dayLabel}</td>`;
  }

  function renderClassGrid(sem, div) {
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');

    hr.innerHTML = `<th>Day</th>` + SLOTS.map(slot => {
      const label = slot;
      const isBreak = slot === '10:30-11:00' || slot === '01:00-02:00';
      return `<th>${label}${isBreak ? ' (Break)' : ''}</th>`;
    }).join('');

    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    for (const day of DAYS) {
      const tr = document.createElement('tr');
      tr.innerHTML = renderHeaderCell(day);

      for (const slot of SLOTS) {
        const isBreak = slot === '10:30-11:00' || slot === '01:00-02:00';
        if (isBreak) {
          tr.innerHTML += `<td class="empty-cell">—</td>`;
          continue;
        }

        const entry = current.find(e => e.day === day && e.slot === slot && e.semester === sem && e.division === div);
        const cellKey = `${day}__${slot}__${sem}__${div}__`;

        if (!entry) {
          tr.innerHTML += `<td class="empty-cell" data-cell="${cellKey}"></td>`;
        } else {
          tr.innerHTML += `
            <td data-cell="${cellKey}">
              <div class="block" draggable="false"
                data-entry-key="${encodeURIComponent(entryKey(entry))}"
                onclick="window.__tt_selectEntry && window.__tt_selectEntry('${encodeURIComponent(entryKey(entry))}', '${day}', '${slot}', '${sem}', '${div}', '')">
                <span class="subj ${entry.type === 'Lab' ? 'lab' : ''}">${entry.subject}</span>
                <span class="meta">👨‍🏫 ${entry.teacherName}</span>
                <span class="room">📍 ${entry.room || 'Room TBD'}</span>
              </div>
            </td>
          `;
        }
      }
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    timetableWrap.appendChild(table);
  }

  function renderTeacherGrid(teacher) {
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');

    hr.innerHTML = `<th>Day</th>` + SLOTS.map(slot => {
      const isBreak = slot === '10:30-11:00' || slot === '01:00-02:00';
      return `<th>${slot}${isBreak ? ' (Break)' : ''}</th>`;
    }).join('');

    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    for (const day of DAYS) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="day-cell">${day}</td>`;

      for (const slot of SLOTS) {
        const isBreak = slot === '10:30-11:00' || slot === '01:00-02:00';
        if (isBreak) {
          tr.innerHTML += `<td class="empty-cell">—</td>`;
          continue;
        }

        const entry = current.find(e => e.day === day && e.slot === slot && e.teacherName === teacher);
        const cellKey = `${day}__${slot}____${teacher}`;

        if (!entry) {
          tr.innerHTML += `<td class="empty-cell" data-cell="${cellKey}"></td>`;
        } else {
          // teacher mode keeps original sem/div per entry
          const sem = entry.semester;
          const div = entry.division;

          tr.innerHTML += `
            <td data-cell="${cellKey}">
              <div class="block" draggable="false"
                data-entry-key="${encodeURIComponent(entryKey(entry))}"
                onclick="window.__tt_selectEntry && window.__tt_selectEntry('${encodeURIComponent(entryKey(entry))}', '${day}', '${slot}', '${sem}', '${div}', '${teacher}')">
                <span class="subj ${entry.type === 'Lab' ? 'lab' : ''}">${entry.subject}</span>
                <span class="meta">🎓 Sem ${sem} Div ${div}</span>
                <span class="room">📍 ${entry.room || 'Room TBD'}</span>
              </div>
            </td>
          `;
        }
      }
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    timetableWrap.appendChild(table);
  }

  // Global hook called from inline onclick
  window.__tt_selectEntry = function (encodedKey, day, slot, sem, div, teacher) {
    const key = decodeURIComponent(encodedKey);
    const entry = current.find(e => entryKey(e) === key);
    if (!entry) return;

    // If selecting another cell while one is selected -> attempt move
    if (selectedCell && selectedCell.key === key) {
      // toggle off
      clearSelection();
      render();
      return;
    }

    if (!selectedCell) {
      selectedCell = { key, entry };
      // Mark selected block
      document.querySelectorAll('.block').forEach(b => {
        const ek = b.getAttribute('data-entry-key');
        if (ek === encodedKey) b.classList.add('selected');
      });
      setStatus('Selected. Now click target slot to move.', false);
      return;
    }

    // Move selected entry to target slot (swap not supported to keep constraints safe)
    const entryToMove = selectedCell.entry;
    const targetDay = day;
    const targetSlot = slot;

    // In this UI we only allow move within same sem/div (class mode) or within the entry sem/div (teacher mode)
    const targetSem = entryToMove.semester;
    const targetDiv = entryToMove.division;

    const allowed = isMoveAllowed(entryToMove, targetDay, targetSlot, targetSem, targetDiv);
    if (!allowed) {
      setStatus('Conflict detected: cannot move teacher/division to the selected slot.', true);
      return;
    }

    // Apply move
    entryToMove.day = targetDay;
    entryToMove.slot = targetSlot;
    entryToMove.semester = targetSem;
    entryToMove.division = targetDiv;

    setStatus('Move applied. Continue shuffling or save changes.', false);
    selectedCell = null;
    render();
  };

  modeSel.addEventListener('change', () => {
    render();
  });

  // Fill selectors based on original data
  function initSelectors() {
    const sems = [...new Set(original.map(e => e.semester))].sort();
    semSel.innerHTML = sems.map(s => `<option value="${s}">${s}</option>`).join('');

    const divs = [...new Set(original.filter(e => e.semester === semSel.value).map(e => e.division))].sort();
    divSel.innerHTML = divs.map(d => `<option value="${d}">${d}</option>`).join('');

    semSel.addEventListener('change', () => {
      const divs2 = [...new Set(original.filter(e => e.semester === semSel.value).map(e => e.division))].sort();
      divSel.innerHTML = divs2.map(d => `<option value="${d}">${d}</option>`).join('');
      render();
    });

    const teachers = [...new Set(original.map(e => e.teacherName))].sort();
    teacherSel.innerHTML = teachers.map(t => `<option value="${t}">${t}</option>`).join('');
  }

  async function load() {
    setStatus('Generating timetable for department...');
    const res = await fetch(`/generate-timetable?department=${encodeURIComponent(dept)}`);
    if (!res.ok) throw new Error('Failed to generate');
    original = await res.json();
    current = JSON.parse(JSON.stringify(original));

    initSelectors();

    // default mode: class
    modeSel.value = 'class';
    semDivWrap.style.display = 'flex';
    teacherWrap.style.display = 'none';

    setStatus('Ready. Select a block, then select a slot to move it.');
    render();
  }

  async function saveChanges() {
    // Persist by deleting existing entries then inserting current.
    // NOTE: currently Assignment collection stores teacher assignments, not timetable.
    // For saving shuffles, we store as the same collection content via a new collection would be better.
    // We'll implement a backend endpoint expectation: /save-timetable
    // If backend not present, show error.

    setStatus('Saving shuffled timetable to MongoDB...');
    const payload = {
      department: dept,
      timetable: current
    };

    try {
      const res = await fetch('/save-timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || 'Save failed');
      }

      showToast('Saved!');
      setStatus('Saved successfully.');
    } catch (e) {
      console.error(e);
      setStatus('Save failed: backend /save-timetable not available yet.', true);
    }
  }

  async function resetUI() {
    current = JSON.parse(JSON.stringify(original));
    selectedCell = null;
    setStatus('UI reset to original generated timetable.', false);
    render();
  }

  saveBtn.addEventListener('click', saveChanges);
  resetBtn.addEventListener('click', resetUI);

  load().catch(e => {
    console.error(e);
    setStatus('Failed to load timetable: ' + (e?.message || e), true);
  });
})();

