(() => {
  'use strict';

  const KEY = 'training-journal-v1';
  const VERSION = 1;
  const exercises = window.EXERCISES;
  const byId = Object.fromEntries(exercises.map(item => [item.id, item]));
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const today = () => new Date().toLocaleDateString('sv-SE');
  const labels = {push:'Толкание',pull:'Тяга',legs:'Ноги',custom:'Своя тренировка'};
  const descriptions = {push:'Грудь, плечи, трицепс, передняя часть ног',pull:'Спина, бицепс, задняя часть ног',legs:'Акцент только на ноги',custom:'Выбирайте упражнения сами'};
  const templates = {
    push:[
      {slot:'Ноги',ids:['exercise-1','exercise-2'],main:true},
      {slot:'Грудной жим',ids:['exercise-6','exercise-7'],main:true},
      {slot:'Плечи',ids:['exercise-8','exercise-13']},
      {slot:'Трицепс',ids:['exercise-15','exercise-16']},
      {slot:'Одна тяга на спину',ids:['exercise-9','exercise-10','exercise-11'],main:true}
    ],
    pull:[
      {slot:'Задняя часть ног',ids:['exercise-4','exercise-5','exercise-3'],main:true},
      {slot:'Вертикальная тяга',ids:['exercise-9','exercise-10'],main:true},
      {slot:'Горизонтальная тяга',ids:['exercise-11','exercise-12'],main:true},
      {slot:'Бицепс',ids:['exercise-14']},
      {slot:'Один жим',ids:['exercise-6','exercise-7'],main:true}
    ],
    legs:[
      {slot:'Приседательное движение',ids:['exercise-1','exercise-2'],main:true},
      {slot:'Задняя часть ног / ягодицы',ids:['exercise-4','exercise-5','exercise-3'],main:true},
      {slot:'Дополнительное упражнение для ног',ids:['exercise-2','exercise-1','exercise-4','exercise-5']}
    ],
    custom:[]
  };
  const coreSlot = {slot:'Пресс',ids:['exercise-17','exercise-18']};
  let locked = false;
  let rawUnreadable = '';
  let pdfFontBase64 = window.PDF_FONT_BASE64 || '';
  let activeFilter = 'all';
  let state = loadState();

  function defaultDraft() {
    return {date:today(),preset:'',before:'',run:{target:'2',distance:'',time:'',feel:''},exercises:[],overall:'',after:'',liked:'',discomfort:'',next:''};
  }
  function defaultState() {
    return {version:VERSION,profile:{name:''},workouts:[],draft:defaultDraft(),editingId:null,pausedDraft:null,lastBackupAt:null,lastBackupCount:0};
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (parsed.version !== VERSION || !Array.isArray(parsed.workouts) || !parsed.draft || !Array.isArray(parsed.draft.exercises) || !parsed.draft.run) throw new Error('Неподдерживаемый формат данных');
      return {...defaultState(),...parsed,profile:{name:String(parsed.profile?.name || '').slice(0,50)}};
    } catch (error) {
      locked = true;
      try { rawUnreadable = localStorage.getItem(KEY) || ''; } catch { /* Storage can be disabled. */ }
      return defaultState();
    }
  }
  function saveState() {
    if (locked) return false;
    try {
      localStorage.setItem(KEY,JSON.stringify(state));
      return true;
    } catch {
      showAlert('Браузер не сохранил изменения. Проверьте доступ к хранилищу и скачайте резервную копию.');
      return false;
    }
  }
  function showAlert(message, actionLabel, action) {
    const box = $('alert');
    box.textContent = message;
    if (actionLabel) {
      const button = document.createElement('button');
      button.className = 'btn btn-outline btn-small';
      button.style.marginLeft = '10px';
      button.textContent = actionLabel;
      button.addEventListener('click',action);
      box.append(button);
    }
    box.hidden = false;
    window.scrollTo({top:0});
  }
  function clearAlert() { $('alert').hidden = true; }
  function downloadBlob(blob,filename) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url),60000);
  }
  function workoutSort(a,b) { return String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)); }
  function workoutHistory() { return [...state.workouts].sort(workoutSort); }
  function lastExerciseLogs(exerciseId) {
    const result = [];
    for (const workout of workoutHistory()) for (const entry of workout.exercises || []) if (entry.exerciseId === exerciseId) result.push({entry,workout});
    return result;
  }
  function recommendedPreset() {
    const history = workoutHistory();
    if (!history.length) return 'push';
    const latest = history.find(item => item.preset && item.preset !== 'custom');
    if (latest?.preset === 'push') return 'pull';
    if (latest?.preset === 'pull') return 'push';
    const lastPush = history.findIndex(item => item.preset === 'push');
    const lastPull = history.findIndex(item => item.preset === 'pull');
    if (lastPush === -1) return 'push';
    if (lastPull === -1) return 'pull';
    return lastPush > lastPull ? 'push' : 'pull';
  }
  function chooseCandidate(slot,used) {
    let best = null;
    let bestScore = -Infinity;
    for (let order=0;order<slot.ids.length;order++) {
      const id = slot.ids[order];
      if (used.has(id)) continue;
      const logs = lastExerciseLogs(id);
      const last = logs[0]?.entry;
      if (last?.discomfort === 'yes') continue;
      let score = -order * 0.05;
      if (last) {
        score += last.liked === 'yes' ? 3 : last.liked === 'no' ? -2 : 0;
        score += last.comfort === 'yes' ? 1 : last.comfort === 'no' ? -1 : 0;
        score += slot.main ? 1 : 0;
        if (!slot.main && logs[0]?.workout.id === workoutHistory()[0]?.id) score -= 1.5;
      }
      if (score > bestScore) { best=id; bestScore=score; }
    }
    return best;
  }
  function makeEntry(exerciseId,slot) {
    const ex = byId[exerciseId];
    const last = lastExerciseLogs(exerciseId)[0]?.entry;
    const lastWeight = last?.sets?.find(set => set.weight !== '')?.weight || '';
    return {entryId:uid(),exerciseId,slot,sets:Array.from({length:ex.minSets},() => ({weight:lastWeight,reps:''})),rir:'',discomfort:'',liked:'',comfort:'',note:''};
  }
  function buildPreset(preset) {
    const used = new Set();
    const result = [];
    for (const slot of [...templates[preset],coreSlot]) {
      const id = chooseCandidate(slot,used);
      if (!id) continue;
      used.add(id);
      result.push(makeEntry(id,slot.slot));
    }
    return result;
  }
  function progressSuggestion(exerciseId) {
    const ex = byId[exerciseId];
    const logs = lastExerciseLogs(exerciseId);
    if (!logs.length) return {text:`Начните с ориентира ${ex.scheme}. Рабочий вес выберите сами.`,warning:false};
    const [{entry,workout}] = logs;
    if (entry.discomfort === 'yes') return {text:'В прошлый раз был дискомфорт. Не повышайте нагрузку автоматически; выберите замену или оцените самочувствие.',warning:true};
    const days = Math.floor((Date.now()-new Date(`${workout.date}T12:00:00`).getTime())/86400000);
    if (days > 21) return {text:'После длительного перерыва ориентируйтесь на прошлый результат, без автоматического повышения веса.',warning:false};
    const complete = item => {
      const sets=item.entry.sets;
      const firstWeight=sets?.[0]?.weight;
      return sets?.length && sets.every(set => Number(set.reps) >= ex.maxReps && set.weight === firstWeight) && parseInt(item.entry.rir,10) >= 2 && item.entry.discomfort === 'no';
    };
    const weight = Number(entry.sets?.find(set => set.weight !== '')?.weight);
    const previousWeight = Number(logs[1]?.entry.sets?.find(set => set.weight !== '')?.weight);
    if (logs.length >= 2 && complete(logs[0]) && complete(logs[1]) && weight === previousWeight) {
      if (ex.stepKg && Number.isFinite(weight) && weight > 0) return {text:`Дважды достигнут верх диапазона без дискомфорта. Можно попробовать ${formatNumber(weight+ex.stepKg)} кг — поправьте шаг под оборудование.`,warning:false};
      return {text:'Дважды достигнут верх диапазона. Можно попробовать более сложный вариант или добавить небольшую нагрузку.',warning:false};
    }
    if (entry.rir === '0' || entry.rir === '1') return {text:'В прошлый раз запас повторений был небольшим. Сохраните нагрузку и технику.',warning:false};
    if (Number.isFinite(weight) && weight > 0) return {text:`В прошлый раз: ${formatNumber(weight)} кг. Пока можно сохранить вес и стремиться к дополнительному чистому повторению.`,warning:false};
    return {text:'Ориентируйтесь на прошлые повторы и старайтесь прибавить одно чистое повторение.',warning:false};
  }
  function formatNumber(value) { return new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(value); }
  function timeSeconds(text) {
    const match = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/.exec(String(text).trim());
    if (!match || Number(match[3]) >= 60 || (match[1] && Number(match[2]) >= 60)) return null;
    return Number(match[1] || 0)*3600+Number(match[2])*60+Number(match[3]);
  }
  function formatPace(seconds,distance) {
    if (!(distance > 0) || !(seconds > 0)) return '';
    const sec = Math.round(seconds/distance);
    return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')} мин/км`;
  }
  function readNumber(value) { return Number(String(value).replace(',','.')); }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00`);
    return !Number.isNaN(date.getTime()) && date.getFullYear() === Number(value.slice(0,4)) && date.getMonth()+1 === Number(value.slice(5,7)) && date.getDate() === Number(value.slice(8,10));
  }
  function switchView(view) {
    document.querySelectorAll('.view').forEach(section => section.classList.toggle('active',section.id === `view-${view}`));
    document.querySelectorAll('[data-nav]').forEach(button => button.classList.toggle('active',button.dataset.nav === view));
    if (view === 'history') renderHistory();
    if (view === 'settings') renderSettings();
    window.scrollTo(0,0);
  }
  function renderPresets() {
    const recommended = recommendedPreset();
    $('next-day-hint').textContent = `Следующее предложение: ${labels[recommended]}`;
    $('presets').innerHTML = Object.keys(labels).map(id => `<button class="preset ${state.draft.preset===id?'active':''} ${recommended===id?'recommended':''}" data-preset="${id}" aria-pressed="${state.draft.preset===id}"><strong>${labels[id]}</strong><small>${descriptions[id]}</small></button>`).join('');
    const current = state.draft.preset;
    $('preset-reason').textContent = current ? `${labels[current]} — только основа. Все предложенные упражнения можно заменить или убрать. Рекомендуемое направление подсвечено по истории ваших занятий.` : 'Выберите предустановку. Рекомендация основана на последнем завершённом занятии; выбрать другой вид тренировки можно всегда.';
  }
  function selectPreset(preset) {
    if (!labels[preset]) return;
    const hasWork = state.draft.exercises.some(entry => entry.sets.some(set => set.reps !== ''));
    if (hasWork && !confirm('Заменить текущий список упражнений? Заполненные подходы в черновике будут удалены.')) return;
    state.draft.preset = preset;
    state.draft.exercises = buildPreset(preset);
    saveState();
    renderPresets(); renderExercises();
  }
  function renderExercises() {
    const rows = state.draft.exercises;
    $('exercise-count').textContent = rows.length ? `${rows.length} предложено / выбрано` : 'Добавьте упражнения';
    $('exercise-list').innerHTML = rows.map((entry,index) => {
      const ex = byId[entry.exerciseId];
      if (!ex) return '';
      const suggestion = progressSuggestion(ex.id);
      const isDumbbell = /гантел/i.test(ex.name);
      return `<article class="card exercise-card" data-entry="${escapeHtml(entry.entryId)}">
        <div class="slot-header"><span class="slot-num">${index+1}</span><span class="slot-title">${escapeHtml(entry.slot || 'Дополнительное упражнение')}</span><span class="small-pill">${escapeHtml(ex.scheme)}</span></div>
        <div class="exercise-top" style="margin-top:11px"><div><div class="exercise-name">${escapeHtml(ex.name)}</div><div class="exercise-scheme">${escapeHtml(ex.muscles)}</div></div></div>
        <div class="exercise-actions"><button class="btn btn-ghost btn-small" data-action="tech">Техника ↗</button><button class="btn btn-ghost btn-small" data-action="replace">Заменить</button><button class="btn btn-ghost btn-small danger-button" data-action="remove">Убрать</button>${index>0?'<button class="btn btn-ghost btn-small" data-action="up">↑</button>':''}${index<rows.length-1?'<button class="btn btn-ghost btn-small" data-action="down">↓</button>':''}</div>
        <div class="suggestion ${suggestion.warning?'warning':''}"><strong>Подсказка:</strong> ${escapeHtml(suggestion.text)}</div>
        <div class="sets"><div class="sets-head"><span>№</span><span>${isDumbbell?'КГ / ГАНТЕЛЬ':'ВЕС, КГ'}</span><span>ПОВТОРЫ</span><span></span></div>${entry.sets.map((set,setIndex) => `<div class="set-row" data-set="${setIndex}"><span class="set-index">${setIndex+1}</span><input data-set-field="weight" type="number" min="0" step="0.5" inputmode="decimal" aria-label="Вес подхода ${setIndex+1}" value="${escapeHtml(set.weight)}"><input data-set-field="reps" type="number" min="0" step="1" inputmode="numeric" aria-label="Повторы подхода ${setIndex+1}" value="${escapeHtml(set.reps)}"><button class="icon-btn" data-action="remove-set" aria-label="Удалить подход ${setIndex+1}">×</button></div>`).join('')}</div>
        <button class="btn btn-light btn-small" data-action="add-set">+ Добавить подход</button>
        <hr class="subtle-divider"><div class="exercise-feedback"><div class="field"><label>Сколько чистых повторов осталось?</label><select data-feedback="rir"><option value="">Не отмечено</option>${['0','1','2','3+'].map(value => `<option value="${value}" ${entry.rir===value?'selected':''}>${value}</option>`).join('')}</select></div><div class="field"><label>Боль или дискомфорт?</label><select data-feedback="discomfort"><option value="">Не отмечено</option><option value="no" ${entry.discomfort==='no'?'selected':''}>Нет</option><option value="yes" ${entry.discomfort==='yes'?'selected':''}>Да</option></select></div><div class="field"><label>Понравилось?</label><select data-feedback="liked"><option value="">Не отмечено</option><option value="yes" ${entry.liked==='yes'?'selected':''}>Да</option><option value="no" ${entry.liked==='no'?'selected':''}>Нет</option></select></div><div class="field"><label>Было удобно?</label><select data-feedback="comfort"><option value="">Не отмечено</option><option value="yes" ${entry.comfort==='yes'?'selected':''}>Да</option><option value="no" ${entry.comfort==='no'?'selected':''}>Нет</option></select></div><div class="field wide"><label>Заметка по упражнению</label><input data-feedback="note" type="text" maxlength="500" value="${escapeHtml(entry.note)}" placeholder="Техника, ощущения, что изменить"></div></div>
      </article>`;
    }).join('');
    if (state.draft.preset) {
      const missing = [...templates[state.draft.preset],coreSlot].filter(slot => !rows.some(entry => entry.slot === slot.slot));
      if (missing.length) $('exercise-list').insertAdjacentHTML('beforeend',`<div class="notice" style="margin-top:12px">Без автоматической рекомендации: ${missing.map(slot => escapeHtml(slot.slot)).join(', ')}. Ранее варианты были отмечены как дискомфортные или вы убрали их. При желании добавьте упражнение вручную.</div>`);
    }
  }
  function showTechnique(id) {
    const ex = byId[id];
    openSheet(`ТЕХНИКА · ${ex.scheme}`,ex.name,`<div class="technique-block"><p><strong>Работает:</strong> ${escapeHtml(ex.muscles)}</p><p class="sheet-label">Исходное положение</p><p>${escapeHtml(ex.start)}</p><p class="sheet-label">Движение</p><p>${escapeHtml(ex.move)}</p><p class="sheet-label">Важно</p><p>${escapeHtml(ex.watch)}</p><p class="sheet-label">Типичные ошибки</p><p>${escapeHtml(ex.errors)}</p></div>`);
  }
  function openSheet(eyebrow,title,content) {
    $('sheet-eyebrow').textContent = eyebrow;
    $('sheet-title').textContent = title;
    $('sheet-content').innerHTML = content;
    $('sheet').showModal();
  }
  function closeSheet() { $('sheet').close(); }
  function openChooser(entryId) {
    const entry = state.draft.exercises.find(item => item.entryId === entryId);
    const used = new Set(state.draft.exercises.filter(item => item.entryId !== entryId).map(item => item.exerciseId));
    const ids = entry ? Object.values(templates).flat().find(slot => slot.slot === entry.slot)?.ids || (entry.slot === 'Пресс' ? coreSlot.ids : []) : [];
    const options = exercises.filter(ex => !used.has(ex.id));
    options.sort((a,b) => (ids.includes(b.id)?1:0)-(ids.includes(a.id)?1:0));
    openSheet('ВЫБОР УПРАЖНЕНИЯ',entry ? `Заменить: ${entry.slot}` : 'Добавить упражнение',`<p class="choice-note">Можно выбрать любой вариант. Близкие к текущему блоку показаны первыми.</p><input class="chooser-search" id="chooser-search" type="search" placeholder="Найти упражнение" aria-label="Найти упражнение"><div class="chooser-list" id="chooser-list">${options.map(ex => `<button class="catalog-item" data-choose="${ex.id}" data-for="${escapeHtml(entryId || '')}"><span class="round-icon">${ids.includes(ex.id)?'★':'+'}</span><span><strong>${escapeHtml(ex.name)}</strong><small>${escapeHtml(ex.scheme)} · ${escapeHtml(ex.muscles)}</small></span><span class="arrow">›</span></button>`).join('')}</div>`);
    $('chooser-search').addEventListener('input',event => {
      const query = event.target.value.trim().toLocaleLowerCase('ru');
      $('chooser-list').querySelectorAll('button').forEach(button => button.hidden = !button.textContent.toLocaleLowerCase('ru').includes(query));
    });
  }
  function renderCatalog() {
    const filterList = [['all','Все'],['legs','Ноги'],['press','Жим'],['back','Спина'],['posterior','Задняя цепь'],['other','Дополнения']];
    $('filters').innerHTML = filterList.map(([id,label]) => `<button class="filter ${activeFilter===id?'active':''}" data-filter="${id}">${label}</button>`).join('');
    const query = $('catalog-search').value.trim().toLocaleLowerCase('ru');
    const main = new Set(['legs','posterior','press','back']);
    const matches = exercises.filter(ex => (activeFilter === 'all' || (activeFilter === 'other' ? !main.has(ex.group) : ex.group === activeFilter)) && ex.name.toLocaleLowerCase('ru').includes(query));
    $('catalog-list').innerHTML = matches.length ? matches.map(ex => `<button class="catalog-item" data-tech="${ex.id}"><span class="round-icon">${Number(ex.id.split('-')[1])}</span><span><strong>${escapeHtml(ex.name)}</strong><small>${escapeHtml(ex.scheme)} · ${escapeHtml(ex.muscles)}</small></span><span class="arrow">›</span></button>`).join('') : '<div class="empty-list">Упражнений не найдено</div>';
  }
  function hydrateForm() {
    const draft = state.draft;
    $('date').value = draft.date || today();
    $('before').value = draft.before || '';
    $('run-target').value = draft.run?.target ?? '2';
    $('run-distance').value = draft.run?.distance ?? '';
    $('run-time').value = draft.run?.time ?? '';
    $('run-feel').value = draft.run?.feel ?? '';
    $('overall').value = draft.overall || '';
    $('after').value = draft.after || '';
    $('liked').value = draft.liked || '';
    $('discomfort').value = draft.discomfort || '';
    $('next').value = draft.next || '';
    $('cancel-edit').hidden = !state.editingId;
    $('save-workout').textContent = state.editingId ? 'Сохранить исправления' : 'Сохранить тренировку';
    renderPace();
    renderPresets(); renderExercises();
  }
  function renderPace() {
    const distance = readNumber(state.draft.run.distance);
    const seconds = timeSeconds(state.draft.run.time);
    $('run-pace').textContent = distance > 0 && seconds ? `Средний темп: ${formatPace(seconds,distance)}` : 'Темп появится после ввода фактической дистанции и времени.';
  }
  function handleExerciseAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const card = button.closest('[data-entry]');
    const index = state.draft.exercises.findIndex(item => item.entryId === card.dataset.entry);
    if (index < 0) return;
    const entry = state.draft.exercises[index];
    const action = button.dataset.action;
    if (action === 'tech') return showTechnique(entry.exerciseId);
    if (action === 'replace') return openChooser(entry.entryId);
    if (action === 'remove' && entry.sets.some(set => set.reps !== '') && !confirm('Убрать упражнение вместе с заполненными подходами?')) return;
    if (action === 'remove') state.draft.exercises.splice(index,1);
    if (action === 'up' && index > 0) [state.draft.exercises[index-1],state.draft.exercises[index]] = [state.draft.exercises[index],state.draft.exercises[index-1]];
    if (action === 'down' && index < state.draft.exercises.length-1) [state.draft.exercises[index+1],state.draft.exercises[index]] = [state.draft.exercises[index],state.draft.exercises[index+1]];
    if (action === 'add-set') {
      if (entry.sets.length >= 20) return showAlert('Для одного упражнения можно записать не более 20 подходов.');
      entry.sets.push({weight:entry.sets.at(-1)?.weight || '',reps:''});
    }
    if (action === 'remove-set') entry.sets.splice(Number(button.closest('[data-set]').dataset.set),1);
    saveState(); renderExercises();
  }
  function handleExerciseInput(event) {
    const card = event.target.closest('[data-entry]');
    if (!card) return;
    const entry = state.draft.exercises.find(item => item.entryId === card.dataset.entry);
    if (!entry) return;
    if (event.target.dataset.setField) {
      const set = entry.sets[Number(event.target.closest('[data-set]').dataset.set)];
      set[event.target.dataset.setField] = event.target.value;
    } else if (event.target.dataset.feedback) entry[event.target.dataset.feedback] = event.target.value;
    saveState();
  }
  function syncMainField(event) {
    const field = event.target.id;
    const main = {date:'date',before:'before',overall:'overall',after:'after',liked:'liked',discomfort:'discomfort',next:'next'};
    const run = {'run-target':'target','run-distance':'distance','run-time':'time','run-feel':'feel'};
    if (main[field]) state.draft[main[field]] = event.target.value;
    if (run[field]) state.draft.run[run[field]] = event.target.value;
    if (run[field]) renderPace();
    saveState();
  }
  function cleanDraft() {
    const draft = state.draft;
    if (!validDate(draft.date)) throw new Error('Укажите корректную дату тренировки.');
    if (draft.run.time && !timeSeconds(draft.run.time)) throw new Error('Время бега укажите как минуты:секунды, например 12:30.');
    if (draft.run.time && !(readNumber(draft.run.distance) > 0)) throw new Error('Для времени бега укажите фактическую дистанцию.');
    if (draft.run.distance && !(readNumber(draft.run.distance) > 0)) throw new Error('Фактическая дистанция должна быть больше нуля.');
    const copy = JSON.parse(JSON.stringify(draft));
    copy.exercises = [];
    for (const entry of draft.exercises) {
      const activeSets = entry.sets.filter(set => set.reps !== '');
      for (const set of activeSets) {
        if (!Number.isInteger(Number(set.reps)) || Number(set.reps) < 1 || Number(set.reps) > 100) throw new Error(`Проверьте повторы: ${byId[entry.exerciseId].name}.`);
        if (set.weight !== '' && (!Number.isFinite(readNumber(set.weight)) || readNumber(set.weight) < 0 || readNumber(set.weight) > 2000)) throw new Error(`Проверьте вес: ${byId[entry.exerciseId].name}.`);
      }
      if (activeSets.length) copy.exercises.push({...entry,sets:activeSets});
    }
    if (!copy.exercises.length && !(readNumber(copy.run.distance) > 0)) throw new Error('Запишите хотя бы один подход или фактическую дистанцию бега.');
    return copy;
  }
  function saveWorkout(andShare=false) {
    clearAlert();
    let workout;
    try { workout = cleanDraft(); } catch (error) { showAlert(error.message); return; }
    const previous = JSON.parse(JSON.stringify(state));
    const now = new Date().toISOString();
    const existing = state.editingId && state.workouts.find(item => item.id === state.editingId);
    workout.id = existing?.id || uid();
    workout.athleteName = existing?.athleteName || state.profile.name;
    workout.createdAt = existing?.createdAt || now;
    workout.updatedAt = now;
    if (existing) state.workouts[state.workouts.findIndex(item => item.id === existing.id)] = workout;
    else state.workouts.push(workout);
    state.draft = state.pausedDraft || defaultDraft();
    state.editingId = null; state.pausedDraft = null;
    if (!saveState()) { state = previous; return; }
    hydrateForm();
    switchView('history');
    showAlert(existing ? 'Исправленная тренировка сохранена.' : 'Тренировка сохранена на этом устройстве.');
    if (andShare) sharePdf(workout);
  }
  function startEdit(id) {
    const workout = state.workouts.find(item => item.id === id);
    if (!workout) return;
    if (state.editingId) {
      if (!confirm('Заменить текущую правку другой записью? Незавершённые исправления будут потеряны.')) return;
    } else state.pausedDraft = JSON.parse(JSON.stringify(state.draft));
    state.draft = JSON.parse(JSON.stringify(workout));
    state.editingId = id;
    saveState();
    hydrateForm(); closeSheet(); switchView('workout');
  }
  function cancelEdit() {
    if (!state.editingId) return;
    state.draft = state.pausedDraft || defaultDraft();
    state.editingId = null; state.pausedDraft = null;
    saveState(); hydrateForm();
  }
  function prettyDate(date) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));
    return match ? `${match[3]}.${match[2]}.${match[1]}` : String(date);
  }
  function renderHistory() {
    const history = workoutHistory();
    $('backup-reminder').hidden = history.length - Number(state.lastBackupCount || 0) < 4;
    $('backup-reminder').textContent = 'После нескольких новых тренировок полезно скачать JSON-копию истории в настройках.';
    $('history-list').innerHTML = history.length ? history.map(workout => `<div class="card history-card"><span class="small-pill">${escapeHtml(labels[workout.preset] || 'Тренировка')}</span><h3>${prettyDate(workout.date)}</h3><p>${workout.exercises.length} упражнений${workout.run?.distance ? ` · Бег ${escapeHtml(workout.run.distance)} км` : ''}</p><div class="tag-row">${workout.exercises.slice(0,4).map(entry => `<span class="tag">${escapeHtml(byId[entry.exerciseId]?.name || 'Упражнение')}</span>`).join('')}</div><div class="history-actions"><button class="btn btn-outline" data-open-history="${escapeHtml(workout.id)}">Открыть запись</button></div></div>`).join('') : '<div class="card empty-history"><strong>История пока пуста</strong><p>Сохранённые тренировки появятся здесь.</p></div>';
  }
  function showWorkout(id) {
    const workout = state.workouts.find(item => item.id === id);
    if (!workout) return;
    const run = workout.run?.distance ? `<div class="data-row"><span>Бег</span><span>${escapeHtml(workout.run.distance)} км${workout.run.time ? ` · ${escapeHtml(workout.run.time)}` : ''}${workout.run.time && timeSeconds(workout.run.time) ? `<br>${formatPace(timeSeconds(workout.run.time),readNumber(workout.run.distance))}` : ''}</span></div>` : '';
    const entries = workout.exercises.map(entry => `<h3>${escapeHtml(byId[entry.exerciseId]?.name || 'Упражнение')}</h3>${entry.sets.map(set => `<div class="data-row"><span>Подход</span><span>${set.weight === '' ? 'без веса' : `${escapeHtml(set.weight)} кг`} × ${escapeHtml(set.reps)}</span></div>`).join('')}<p class="mini-note">Запас: ${escapeHtml(entry.rir || '—')} · Дискомфорт: ${entry.discomfort==='yes'?'да':entry.discomfort==='no'?'нет':'—'}${entry.note?`<br>${escapeHtml(entry.note)}`:''}</p>`).join('');
    openSheet(labels[workout.preset] || 'ТРЕНИРОВКА',`Тренировка ${prettyDate(workout.date)}`,`<div class="detail-block">${workout.athleteName?`<p><strong>${escapeHtml(workout.athleteName)}</strong></p>`:''}${run}${entries || '<p>Силовых упражнений не было.</p>'}${workout.overall?`<p>Общая нагрузка: ${escapeHtml(workout.overall)}/10</p>`:''}${workout.liked?`<p><strong>Понравилось:</strong> ${escapeHtml(workout.liked)}</p>`:''}${workout.discomfort?`<p><strong>Дискомфорт:</strong> ${escapeHtml(workout.discomfort)}</p>`:''}${workout.next?`<p><strong>Следующий раз:</strong> ${escapeHtml(workout.next)}</p>`:''}<div class="actions"><button class="btn btn-dark" data-history-action="download" data-id="${escapeHtml(id)}">Скачать PDF</button><button class="btn btn-primary" data-history-action="share" data-id="${escapeHtml(id)}">Поделиться PDF</button></div><div class="actions"><button class="btn btn-outline" data-history-action="edit" data-id="${escapeHtml(id)}">Исправить запись</button></div></div>`);
  }
  function renderSettings() {
    $('athlete-name').value = state.profile.name || '';
    $('profile-chip').textContent = state.profile.name || 'ЛИЧНЫЙ ЖУРНАЛ';
    $('backup-status').textContent = state.lastBackupAt ? `Последняя JSON-копия: ${prettyDate(state.lastBackupAt.slice(0,10))}` : 'JSON-копия ещё не скачивалась.';
  }
  function pdfFilename(workout) { return `Тренировка_${workout.date}.pdf`; }
  function makePdf(workout) {
    if (!window.jspdf?.jsPDF || !pdfFontBase64) throw new Error('Генератор PDF ещё не готов.');
    const doc = new window.jspdf.jsPDF({unit:'mm',format:'a4'});
    doc.addFileToVFS('NotoSans-Regular.ttf',pdfFontBase64);
    doc.addFont('NotoSans-Regular.ttf','NotoSans','normal');
    doc.setFont('NotoSans','normal');
    const left = 16, right = 194, bottom = 278;
    let y = 19;
    function line(text,size=10,space=3) {
      doc.setFontSize(size);
      const parts = doc.splitTextToSize(String(text),right-left);
      const leading = size >= 16 ? 7.6 : size >= 12 ? 6.5 : 5.2;
      for (const part of parts) {
        if (y + leading > bottom) { doc.addPage(); y=19; doc.setFont('NotoSans','normal'); doc.setFontSize(size); }
        doc.text(part,left,y);
        y += leading;
      }
      y += space;
    }
    function rule() {
      if (y+4 > bottom) { doc.addPage(); y=19; }
      doc.setDrawColor(213,225,215); doc.line(left,y,right,y); y += 6;
    }
    line('ТРЕНИРОВКА',18,2);
    line(`${prettyDate(workout.date)} · ${labels[workout.preset] || 'Без предустановки'}`,12,3);
    if (workout.athleteName) line(`Имя: ${workout.athleteName}`);
    rule();
    if (workout.before) line(`Самочувствие до: ${workout.before}/10`);
    if (workout.run?.distance) {
      line(`Бег: ${formatNumber(readNumber(workout.run.distance))} км${workout.run.time ? ` · ${workout.run.time}` : ''}`);
      if (workout.run.time) line(`Средний темп: ${formatPace(timeSeconds(workout.run.time),readNumber(workout.run.distance))}`);
      if (workout.run.feel) line(`Ощущение от бега: ${workout.run.feel}/10`);
    }
    for (const entry of workout.exercises) {
      const ex = byId[entry.exerciseId];
      if (!ex) continue;
      rule();
      line(`${entry.slot ? `${entry.slot}: ` : ''}${ex.name}`,12,2);
      line(`Ориентир: ${ex.scheme}`,9,2);
      entry.sets.forEach((set,index) => line(`Подход ${index+1}: ${set.weight === '' ? 'без указанного веса' : `${formatNumber(readNumber(set.weight))} кг`} × ${set.reps}`,10,1));
      const notes = [];
      if (entry.rir) notes.push(`Запас чистых повторений: ${entry.rir}`);
      if (entry.discomfort) notes.push(`Дискомфорт: ${entry.discomfort==='yes'?'да':'нет'}`);
      if (entry.liked) notes.push(`Понравилось: ${entry.liked==='yes'?'да':'нет'}`);
      if (entry.comfort) notes.push(`Было удобно: ${entry.comfort==='yes'?'да':'нет'}`);
      if (notes.length) line(notes.join(' · '),9,1);
      if (entry.note) line(`Заметка: ${entry.note}`,9,2);
    }
    rule();
    if (workout.overall) line(`Общая нагрузка: ${workout.overall}/10`);
    if (workout.after) line(`Самочувствие после: ${workout.after}/10`);
    if (workout.liked) line(`Понравилось: ${workout.liked}`);
    if (workout.discomfort) line(`Боль или дискомфорт: ${workout.discomfort}`);
    if (workout.next) line(`В следующий раз: ${workout.next}`);
    return doc.output('blob');
  }
  function downloadPdf(workout) {
    try { downloadBlob(makePdf(workout),pdfFilename(workout)); }
    catch (error) { showAlert(`Не удалось создать PDF: ${error.message}`); }
  }
  function sharePdf(workout) {
    try {
      const blob = makePdf(workout);
      const file = new File([blob],pdfFilename(workout),{type:'application/pdf'});
      if (navigator.canShare?.({files:[file]}) && navigator.share) {
        navigator.share({files:[file],title:`Тренировка ${prettyDate(workout.date)}`}).catch(error => {
          if (error.name !== 'AbortError') { downloadBlob(blob,pdfFilename(workout)); showAlert('Отправка не удалась. PDF скачан на устройство.'); }
        });
      } else {
        downloadBlob(blob,pdfFilename(workout));
        showAlert('На этом устройстве отправка файла через системное меню недоступна. PDF скачан.');
      }
    } catch (error) { showAlert(`Не удалось подготовить PDF: ${error.message}`); }
  }
  function exportBackup() {
    if (locked && rawUnreadable) {
      downloadBlob(new Blob([rawUnreadable],{type:'application/json'}),`training-unreadable-${today()}.json`);
      return;
    }
    if (locked) return showAlert('Хранилище недоступно, исходных данных для выгрузки нет.');
    const payload = {app:'training-journal',version:VERSION,exportedAt:new Date().toISOString(),profile:state.profile,workouts:state.workouts,draft:state.draft};
    downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),`Тренировки_резервная_копия_${today()}.json`);
    state.lastBackupAt = new Date().toISOString();
    state.lastBackupCount = state.workouts.length;
    saveState(); renderSettings(); renderHistory();
  }
  function safeText(value,max=500) { return String(value ?? '').slice(0,max); }
  function normalizeEntry(raw) {
    if (!raw || !byId[raw.exerciseId] || !Array.isArray(raw.sets) || raw.sets.length > 20) throw new Error('Некорректное упражнение в резервной копии.');
    return {entryId:safeText(raw.entryId || uid(),100),exerciseId:raw.exerciseId,slot:safeText(raw.slot,100),sets:raw.sets.map(set => {
      const weight=safeText(set?.weight,20),reps=safeText(set?.reps,10);
      if (weight && (!Number.isFinite(readNumber(weight)) || readNumber(weight)<0 || readNumber(weight)>2000)) throw new Error('Некорректный вес в резервной копии.');
      if (reps && (!Number.isInteger(Number(reps)) || Number(reps)<1 || Number(reps)>100)) throw new Error('Некорректные повторы в резервной копии.');
      return {weight,reps};
    }),rir:['','0','1','2','3+'].includes(raw.rir) ? raw.rir : '',discomfort:['','yes','no'].includes(raw.discomfort) ? raw.discomfort : '',liked:['','yes','no'].includes(raw.liked) ? raw.liked : '',comfort:['','yes','no'].includes(raw.comfort) ? raw.comfort : '',note:safeText(raw.note,500)};
  }
  function normalizeWorkout(raw,isDraft=false) {
    if (!raw || !validDate(raw.date) || !Array.isArray(raw.exercises) || raw.exercises.length>30) throw new Error('Некорректная тренировка в резервной копии.');
    if (!isDraft && !raw.id) throw new Error('У тренировки отсутствует идентификатор.');
    const run=raw.run || {};
    if (run.time && !timeSeconds(run.time)) throw new Error('Некорректное время бега в резервной копии.');
    for (const value of [run.target,run.distance]) if (value && (!Number.isFinite(readNumber(value)) || readNumber(value)<0 || readNumber(value)>1000)) throw new Error('Некорректная дистанция в резервной копии.');
    return {id:isDraft?undefined:safeText(raw.id,100),createdAt:safeText(raw.createdAt || new Date().toISOString(),40),updatedAt:safeText(raw.updatedAt || new Date().toISOString(),40),athleteName:safeText(raw.athleteName,50),date:raw.date,preset:labels[raw.preset]?raw.preset:'',before:safeText(raw.before,3),run:{target:safeText(run.target ?? '2',10),distance:safeText(run.distance,10),time:safeText(run.time,10),feel:safeText(run.feel,3)},exercises:raw.exercises.map(normalizeEntry),overall:safeText(raw.overall,3),after:safeText(raw.after,3),liked:safeText(raw.liked,500),discomfort:safeText(raw.discomfort,500),next:safeText(raw.next,500)};
  }
  function draftIsEmpty() {
    const d=state.draft;
    return !d.preset && !d.before && !d.run?.distance && !d.run?.time && !d.run?.feel && (!d.run?.target || d.run.target === '2') && !d.exercises.length && !d.overall && !d.after && !d.liked && !d.discomfort && !d.next;
  }
  async function importBackup(file) {
    if (!file) return;
    if (file.size > 10_000_000) return showAlert('Резервная копия больше 10 МБ. Выберите меньший файл.');
    try {
      const payload = JSON.parse(await file.text());
      if (payload.app !== 'training-journal' || payload.version !== VERSION || !Array.isArray(payload.workouts) || payload.workouts.length > 5000) throw new Error('Файл не является совместимой резервной копией.');
      const imported = payload.workouts.map(item => normalizeWorkout(item));
      const importedDraft = payload.draft ? normalizeWorkout(payload.draft,true) : null;
      const before = JSON.parse(JSON.stringify(state));
      const existingIds = new Set(state.workouts.map(item => item.id));
      const added = imported.filter(item => { if (existingIds.has(item.id)) return false; existingIds.add(item.id); return true; });
      const skipped = imported.length - added.length;
      state.workouts.push(...added);
      const restoredDraft = importedDraft && !state.editingId && draftIsEmpty();
      if (restoredDraft) state.draft = importedDraft;
      if (!state.profile.name && payload.profile?.name) state.profile.name = safeText(payload.profile.name,50);
      if (!saveState()) { state = before; throw new Error('Не удалось сохранить импортированные данные.'); }
      hydrateForm(); renderHistory(); renderSettings();
      showAlert(`Импорт завершён: добавлено ${added.length}, уже были в истории ${skipped}.${restoredDraft?' Черновик восстановлен.':''}`);
    } catch (error) { showAlert(`Импорт не выполнен: ${error.message}`); }
  }
  function initialize() {
    for (const id of ['before','run-feel','overall','after']) for (let n=1;n<=10;n++) $(id).insertAdjacentHTML('beforeend',`<option value="${n}">${n}/10</option>`);
    hydrateForm(); renderCatalog(); renderHistory(); renderSettings();
    if (window.jspdf?.jsPDF && pdfFontBase64) {
      $('save-share').disabled = false;
      $('pdf-status').textContent = 'PDF создаётся на этом устройстве. Если системная отправка недоступна, файл скачается.';
    } else $('pdf-status').textContent = 'Генератор PDF недоступен. Сохранение тренировки работает.';
    document.querySelectorAll('[data-nav]').forEach(button => button.addEventListener('click',() => switchView(button.dataset.nav)));
    $('presets').addEventListener('click',event => { const button=event.target.closest('[data-preset]'); if (button) selectPreset(button.dataset.preset); });
    $('exercise-list').addEventListener('click',handleExerciseAction);
    $('exercise-list').addEventListener('input',handleExerciseInput);
    $('exercise-list').addEventListener('change',handleExerciseInput);
    for (const id of ['date','before','run-target','run-distance','run-time','run-feel','overall','after','liked','discomfort','next']) {
      $(id).addEventListener('input',syncMainField);
      $(id).addEventListener('change',syncMainField);
    }
    $('add-exercise').addEventListener('click',() => openChooser(null));
    $('save-workout').addEventListener('click',() => saveWorkout(false));
    $('save-share').addEventListener('click',() => saveWorkout(true));
    $('cancel-edit').addEventListener('click',cancelEdit);
    $('sheet-close').addEventListener('click',closeSheet);
    $('sheet').addEventListener('click',event => { if (event.target === $('sheet')) closeSheet(); });
    $('sheet-content').addEventListener('click',event => {
      const chosen = event.target.closest('[data-choose]');
      if (chosen) {
        const id=chosen.dataset.choose;
        const replaceId=chosen.dataset.for;
        const index=state.draft.exercises.findIndex(item => item.entryId === replaceId);
        if (index >= 0) state.draft.exercises[index] = makeEntry(id,state.draft.exercises[index].slot);
        else state.draft.exercises.push(makeEntry(id,byId[id].group==='core'?'Пресс':'Дополнительное упражнение'));
        saveState(); renderExercises(); closeSheet();
        return;
      }
      const action=event.target.closest('[data-history-action]');
      if (!action) return;
      const workout=state.workouts.find(item => item.id === action.dataset.id);
      if (!workout) return;
      if (action.dataset.historyAction === 'download') downloadPdf(workout);
      if (action.dataset.historyAction === 'share') sharePdf(workout);
      if (action.dataset.historyAction === 'edit') startEdit(workout.id);
    });
    $('catalog-search').addEventListener('input',renderCatalog);
    $('filters').addEventListener('click',event => { const button=event.target.closest('[data-filter]'); if (button) { activeFilter=button.dataset.filter; renderCatalog(); } });
    $('catalog-list').addEventListener('click',event => { const button=event.target.closest('[data-tech]'); if (button) showTechnique(button.dataset.tech); });
    $('history-list').addEventListener('click',event => { const button=event.target.closest('[data-open-history]'); if (button) showWorkout(button.dataset.openHistory); });
    $('athlete-name').addEventListener('input',event => { state.profile.name=event.target.value.slice(0,50); $('profile-chip').textContent=state.profile.name || 'ЛИЧНЫЙ ЖУРНАЛ'; saveState(); });
    $('export-json').addEventListener('click',exportBackup);
    $('import-json').addEventListener('click',() => $('import-file').click());
    $('import-file').addEventListener('change',event => { importBackup(event.target.files?.[0]); event.target.value=''; });
    if (locked) {
      showAlert('Локальные данные не удалось прочитать. Сохранение отключено, чтобы не перезаписать их.','Скачать исходные данные',exportBackup);
      const reset = document.createElement('button');
      reset.className = 'btn btn-outline btn-small'; reset.style.marginLeft='8px'; reset.textContent='Начать заново';
      reset.addEventListener('click',() => { if (!confirm('Удалить нечитаемые локальные данные? Сначала скачайте их копию.')) return; try { localStorage.removeItem(KEY); location.reload(); } catch { showAlert('Браузер не позволяет очистить хранилище.'); } });
      $('alert').append(reset);
      $('save-workout').disabled=true; $('save-share').disabled=true;
    }
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  initialize();
})();
