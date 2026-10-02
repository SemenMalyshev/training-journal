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
      {slot:'Грудной жим',ids:['exercise-6','exercise-7'],main:true},
      {slot:'Одна тяга на спину',ids:['exercise-9','exercise-10','exercise-11'],main:true},
      {slot:'Ноги',ids:['exercise-1','exercise-2'],main:true},
      {slot:'Плечи',ids:['exercise-8','exercise-13']},
      {slot:'Трицепс',ids:['exercise-15','exercise-16']}
    ],
    pull:[
      {slot:'Вертикальная тяга',ids:['exercise-9','exercise-10'],main:true},
      {slot:'Один жим',ids:['exercise-6','exercise-7'],main:true},
      {slot:'Задняя часть ног',ids:['exercise-4','exercise-5','exercise-3'],main:true},
      {slot:'Горизонтальная тяга',ids:['exercise-11','exercise-12'],main:true},
      {slot:'Бицепс',ids:['exercise-14']}
    ],
    legs:[
      {slot:'Приседательное движение',ids:['exercise-1','exercise-2'],main:true},
      {slot:'Задняя часть ног / ягодицы',ids:['exercise-4','exercise-5','exercise-3'],main:true},
      {slot:'Дополнительное упражнение для ног',ids:['exercise-2','exercise-1','exercise-4','exercise-5']}
    ],
    custom:[]
  };
  const coreSlot = {slot:'Пресс',ids:['exercise-17','exercise-18']};
  const effortLabels = {'':'Не могу оценить',near:'Почти на пределе',some:'Ещё несколько',many:'Ещё много'};
  const effortHints = {near:'Ни одного или максимум одно повторение',some:'Примерно 2–3 повторения',many:'Примерно 4 повторения и больше'};
  const legacyEfforts = ['0','1','2','3+'];
  let locked = false;
  let rawUnreadable = '';
  let pdfFontBase64 = window.PDF_FONT_BASE64 || '';
  let activeFilter = 'all';
  let incomingPlan = null;
  let state = loadState();

  function defaultDraft() {
    return {date:today(),preset:'',duration:'',run:{target:'2',distance:'',time:'',feel:''},exercises:[],overall:'',liked:'',discomfort:'',next:''};
  }
  function defaultPreferences() { return {fontSize:'normal',uiSize:'normal',theme:'light'}; }
  function normalizePreferences(raw) {
    return {
      fontSize:['normal','large','largest'].includes(raw?.fontSize) ? raw.fontSize : 'normal',
      uiSize:['normal','large','largest'].includes(raw?.uiSize) ? raw.uiSize : 'normal',
      theme:['light','dark','contrast'].includes(raw?.theme) ? raw.theme : 'light'
    };
  }
  function defaultState() {
    return {version:VERSION,profile:{name:''},preferences:defaultPreferences(),workouts:[],draft:defaultDraft(),editingId:null,pausedDraft:null,lastBackupAt:null,lastBackupCount:0};
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (parsed.version !== VERSION || !Array.isArray(parsed.workouts) || !parsed.draft || !Array.isArray(parsed.draft.exercises) || !parsed.draft.run) throw new Error('Неподдерживаемый формат данных');
      return {...defaultState(),...parsed,profile:{name:String(parsed.profile?.name || '').slice(0,50)},preferences:normalizePreferences(parsed.preferences)};
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
    const recent = lastExerciseLogs(exerciseId)[0];
    const last = recent?.entry;
    const workingSets = last?.sets?.filter(set => set.kind === 'work') || [];
    const weights = workingSets.map(set => set.weight).filter(value => value !== '');
    const days = recent ? Math.floor((Date.now()-new Date(`${recent.workout.date}T12:00:00`).getTime())/86400000) : Infinity;
    const lastWeight = days <= 21 && last?.discomfort !== 'yes' && weights.length && weights.every(value => value === weights[0]) ? weights[0] : '';
    return {entryId:uid(),exerciseId,slot,sets:Array.from({length:ex.minSets},() => ({kind:'work',weight:lastWeight,reps:''})),rir:'',discomfort:'',liked:'',comfort:'',note:''};
  }
  function plannedSlots(preset,duration) {
    const minutes = Number(duration);
    // ponytail: approximate budget; reserve 5 minutes each for warm-up and core, 10 per other exercise.
    const count = minutes >= 10 && minutes <= 240 ? Math.max(0,Math.min(templates[preset].length,Math.floor((minutes-10)/10))) : templates[preset].length;
    return [...templates[preset].slice(0,count),coreSlot];
  }
  function buildPreset(preset) {
    const used = new Set();
    const result = [];
    for (const slot of plannedSlots(preset,state.draft.duration)) {
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
    if (!entry.sets?.some(set => set.kind === 'work') && entry.sets?.some(set => set.kind === 'warm')) return {text:'В прошлый раз отмечена только разминка. Рабочий вес выберите сами.',warning:false};
    const days = Math.floor((Date.now()-new Date(`${workout.date}T12:00:00`).getTime())/86400000);
    if (days > 21) return {text:'После длительного перерыва ориентируйтесь на прошлый результат, без автоматического повышения веса.',warning:false};
    const complete = item => {
      const sets=item.entry.sets?.filter(set => set.kind === 'work') || [];
      const firstWeight=sets[0]?.weight;
      return sets.length >= ex.minSets && sets.every(set => Number(set.reps) >= ex.maxReps && set.weight === firstWeight) && ['some','many','2','3+'].includes(item.entry.rir) && item.entry.discomfort === 'no';
    };
    const workingWeight = item => {
      const sets=item?.entry.sets?.filter(set => set.kind === 'work') || [];
      const weights=sets.map(set => set.weight).filter(value => value !== '');
      return weights.length && weights.every(value => value === weights[0]) ? Number(weights[0]) : NaN;
    };
    const weight = workingWeight(logs[0]);
    const previousWeight = workingWeight(logs[1]);
    if (logs.length >= 2 && complete(logs[0]) && complete(logs[1]) && weight === previousWeight) {
      if (ex.stepKg && Number.isFinite(weight) && weight > 0) return {text:`Дважды достигнут верх диапазона без дискомфорта. Можно попробовать ${formatNumber(weight+ex.stepKg)} кг — поправьте шаг под оборудование.`,warning:false};
      return {text:'Дважды достигнут верх диапазона. Можно попробовать более сложный вариант или добавить небольшую нагрузку.',warning:false};
    }
    if (['near','0','1'].includes(entry.rir)) return {text:'В прошлый раз подход был почти на пределе. Сохраните нагрузку и технику.',warning:false};
    if (Number.isFinite(weight) && weight > 0) return {text:`В прошлый раз рабочие подходы: ${formatNumber(weight)} кг. Пока можно сохранить вес и стремиться к дополнительному чистому повторению.`,warning:false};
    if (entry.sets?.some(set => !set.kind)) return {text:'В старой записи разминка не отделена от рабочих подходов. Укажите вес новых рабочих подходов сами.',warning:false};
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
    renderDurationPlan();
  }
  function renderDurationPlan() {
    const {preset,duration,exercises:rows} = state.draft;
    const minutes = Number(duration);
    $('rebuild-plan').disabled = !preset || preset === 'custom';
    const valid = Number.isInteger(minutes) && minutes >= 10 && minutes <= 240;
    $('duration-plan').hidden = !duration;
    if (!duration) return;
    if (!valid) { $('duration-plan').textContent = 'Укажите целое число от 10 до 240 минут.'; return; }
    if (!preset || preset === 'custom') { $('duration-plan').textContent = 'Выберите направление для подбора упражнений по времени. В своей тренировке количество определяете вы.'; return; }
    const count = plannedSlots(preset,duration).length;
    $('duration-plan').textContent = `Ориентир на ${minutes} мин: ${count} силовых упр., включая пресс. Сейчас в списке: ${rows.length}. Пересобрать список можно кнопкой ниже.${minutes < 20 ? ' Очень короткий план: только пресс и короткая разминка. Сократите цель бега; стандартные 2 км в этот бюджет не заложены.' : ' Расчёт приблизительный: разминка около 5 мин, пресс около 5 мин, остальные упражнения около 10 мин каждое с отдыхом.'}`;
  }
  function selectPreset(preset) {
    if (!labels[preset]) return;
    if (state.draft.duration && (!Number.isInteger(Number(state.draft.duration)) || Number(state.draft.duration) < 10 || Number(state.draft.duration) > 240)) return showAlert('Укажите длительность от 10 до 240 минут.');
    if (state.draft.exercises.length && !confirm('Заменить текущий список упражнений? Изменённый порядок и заполненные подходы будут удалены.')) return;
    state.draft.preset = preset;
    state.draft.exercises = buildPreset(preset);
    saveState();
    renderPresets(); renderExercises();
  }
  function effortLabel(value) {
    return Object.hasOwn(effortLabels,value) ? effortLabels[value] : legacyEfforts.includes(value) ? `Старая оценка: ${value} повторений в запасе` : effortLabels[''];
  }
  function setGroups(entry) {
    return [{kind:'warm',label:'Разминка'},{kind:'',label:'Старые подходы · тип не указан'},{kind:'work',label:'Основные подходы'}].map(group => ({...group,rows:entry.sets.map((set,index) => ({set,index})).filter(row => (row.set.kind || '') === group.kind)}));
  }
  function renderSetGroups(entry,isDumbbell) {
    return setGroups(entry).filter(group => group.rows.length || group.kind === 'work').map(group => `<section class="sets set-group" data-set-group="${group.kind || 'legacy'}" aria-label="${escapeHtml(group.label)}"><h4>${group.label}</h4>${group.rows.length ? `<div class="sets-head"><span>№</span><span>${isDumbbell?'КГ / ГАНТЕЛЬ':'ВЕС, КГ'}</span><span>ПОВТОРЫ</span><span></span></div>` : '<p class="mini-note">Добавьте основной подход кнопкой ниже.</p>'}${group.rows.map(({set,index},number) => `<div class="set-row" data-set="${index}"><span class="set-index">${number+1}</span><input data-set-field="weight" type="number" min="0" step="0.5" inputmode="decimal" aria-label="${group.kind==='warm'?'Вес разминки':'Вес подхода'} ${number+1}" value="${escapeHtml(set.weight)}"><input data-set-field="reps" type="number" min="0" step="1" inputmode="numeric" aria-label="${group.kind==='warm'?'Повторы разминки':'Повторы подхода'} ${number+1}" value="${escapeHtml(set.reps)}"><button class="icon-btn" data-action="remove-set" aria-label="${group.kind==='warm'?'Удалить разминку':'Удалить подход'} ${number+1}">×</button></div>`).join('')}${group.kind===''?'<p class="mini-note">Тип этих старых подходов неизвестен. Они сохраняются в истории, но не используются для подбора рабочего веса.</p>':''}</section>`).join('');
  }
  function renderEffortField(entry) {
    const values = ['near','some','many',''];
    if (legacyEfforts.includes(entry.rir)) values.push(entry.rir);
    return `<fieldset class="effort-field wide"><legend>После последнего основного подхода сколько ещё повторений ты смог бы сделать?</legend><p class="mini-note">Сразу, с тем же весом и нормальной техникой. Достаточно приблизительной оценки.</p><div class="effort-options">${values.map(value => `<label class="effort-option"><input type="radio" name="effort-${escapeHtml(entry.entryId)}" data-feedback="rir" value="${value}" ${entry.rir===value?'checked':''}><span>${escapeHtml(effortLabel(value))}${effortHints[value]?`<small>${effortHints[value]}</small>`:''}</span></label>`).join('')}</div></fieldset>`;
  }
  function renderRecordedSets(entry) {
    const unit = /гантел/i.test(byId[entry.exerciseId]?.name || '') ? 'кг/гантель' : 'кг';
    return setGroups(entry).filter(group => group.rows.length).map(group => `<h4>${group.label}</h4>${group.rows.map(({set},number) => `<div class="data-row"><span>Подход ${number+1}</span><span>${set.weight === '' ? 'без веса' : `${escapeHtml(set.weight)} ${unit}`} × ${escapeHtml(set.reps)}</span></div>`).join('')}`).join('');
  }
  function renderExercises() {
    const rows = state.draft.exercises;
    renderDurationPlan();
    $('exercise-count').textContent = rows.length ? `${rows.length} предложено / выбрано` : 'Добавьте упражнения';
    $('exercise-list').innerHTML = rows.map((entry,index) => {
      const ex = byId[entry.exerciseId];
      if (!ex) return '';
      const suggestion = progressSuggestion(ex.id);
      const isDumbbell = /гантел/i.test(ex.name);
      return `<article class="card exercise-card" data-entry="${escapeHtml(entry.entryId)}">
        <div class="slot-header"><span class="slot-num">${index+1}</span><span class="slot-title">${escapeHtml(entry.slot || 'Дополнительное упражнение')}</span><span class="small-pill">${escapeHtml(ex.scheme)}</span></div>
        <div class="exercise-top" style="margin-top:11px"><div><div class="exercise-name">${escapeHtml(ex.name)}</div><div class="exercise-scheme">${escapeHtml(ex.muscles)}</div></div></div>
        <div class="exercise-actions"><button class="btn btn-ghost btn-small" data-action="tech">Техника ↗</button><button class="btn btn-ghost btn-small" data-action="replace">Заменить</button><button class="btn btn-ghost btn-small danger-button" data-action="remove">Убрать</button>${index>0?'<button class="btn btn-outline btn-small" data-action="up" aria-label="Переместить упражнение выше">↑ Выше</button>':''}${index<rows.length-1?'<button class="btn btn-outline btn-small" data-action="down" aria-label="Переместить упражнение ниже">↓ Ниже</button>':''}</div>
        <div class="suggestion ${suggestion.warning?'warning':''}"><strong>Подсказка:</strong> ${escapeHtml(suggestion.text)}</div>
        <button class="btn btn-outline btn-small warm-set-button" data-action="add-warm-set">+ Разминочный подход</button>
        ${renderSetGroups(entry,isDumbbell)}
        <button class="btn btn-light btn-small" data-action="add-set">+ Добавить подход</button>
        <hr class="subtle-divider"><div class="exercise-feedback">${renderEffortField(entry)}<div class="field"><label>Боль или дискомфорт?</label><select data-feedback="discomfort"><option value="">Не отмечено</option><option value="no" ${entry.discomfort==='no'?'selected':''}>Нет</option><option value="yes" ${entry.discomfort==='yes'?'selected':''}>Да</option></select></div><div class="field"><label>Понравилось?</label><select data-feedback="liked"><option value="">Не отмечено</option><option value="yes" ${entry.liked==='yes'?'selected':''}>Да</option><option value="no" ${entry.liked==='no'?'selected':''}>Нет</option></select></div><div class="field"><label>Было удобно?</label><select data-feedback="comfort"><option value="">Не отмечено</option><option value="yes" ${entry.comfort==='yes'?'selected':''}>Да</option><option value="no" ${entry.comfort==='no'?'selected':''}>Нет</option></select></div><div class="field wide"><label>Заметка по упражнению</label><input data-feedback="note" type="text" maxlength="500" value="${escapeHtml(entry.note)}" placeholder="Техника, ощущения, что изменить"></div></div>
      </article>`;
    }).join('');
    if (state.draft.preset) {
      const missing = plannedSlots(state.draft.preset,state.draft.duration).filter(slot => !rows.some(entry => entry.slot === slot.slot));
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
    $('duration').value = draft.duration || '';
    $('run-target').value = draft.run?.target ?? '2';
    $('run-distance').value = draft.run?.distance ?? '';
    const runSeconds = timeSeconds(draft.run?.time || '');
    $('run-minutes').value = runSeconds === null ? '' : String(Math.floor(runSeconds/60));
    $('run-seconds').value = runSeconds === null ? '' : String(runSeconds%60);
    $('run-feel').value = draft.run?.feel ?? '';
    $('overall').value = draft.overall || '';
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
    if (action === 'add-set' || action === 'add-warm-set') {
      if (entry.sets.length >= 20) return showAlert('Для одного упражнения можно записать не более 20 подходов.');
      if (action === 'add-warm-set') entry.sets.push({kind:'warm',weight:'',reps:''});
      else entry.sets.push({kind:'work',weight:entry.sets.filter(set => set.kind === 'work').at(-1)?.weight || '',reps:''});
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
    const main = {date:'date',duration:'duration',overall:'overall',liked:'liked',discomfort:'discomfort',next:'next'};
    const run = {'run-target':'target','run-distance':'distance','run-feel':'feel'};
    if (main[field]) state.draft[main[field]] = event.target.value;
    if (run[field]) state.draft.run[run[field]] = event.target.value;
    if (field === 'run-minutes' || field === 'run-seconds') {
      const minutes = $('run-minutes').value, seconds = $('run-seconds').value;
      if (minutes === '' && seconds === '') state.draft.run.time = '';
      else if (/^\d{0,3}$/.test(minutes) && /^\d{0,2}$/.test(seconds) && Number(seconds) < 60) {
        const totalMinutes = Number(minutes || 0);
        state.draft.run.time = totalMinutes < 100 ? `${totalMinutes}:${String(Number(seconds || 0)).padStart(2,'0')}` : `${Math.floor(totalMinutes/60)}:${String(totalMinutes%60).padStart(2,'0')}:${String(Number(seconds || 0)).padStart(2,'0')}`;
      } else state.draft.run.time = '';
    }
    if (run[field] || field === 'run-minutes' || field === 'run-seconds') renderPace();
    if (field === 'duration') renderDurationPlan();
    saveState();
  }
  function cleanDraft() {
    const draft = state.draft;
    if (!validDate(draft.date)) throw new Error('Укажите корректную дату тренировки.');
    if (draft.duration && (!Number.isInteger(Number(draft.duration)) || Number(draft.duration) < 10 || Number(draft.duration) > 240)) throw new Error('Укажите длительность от 10 до 240 минут.');
    if (($('run-minutes').value && !/^\d{1,3}$/.test($('run-minutes').value)) || ($('run-seconds').value && (!/^\d{1,2}$/.test($('run-seconds').value) || Number($('run-seconds').value)>=60))) throw new Error('Проверьте минуты и секунды бега.');
    if (draft.run.time && !timeSeconds(draft.run.time)) throw new Error('Проверьте минуты и секунды бега.');
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
    const entries = workout.exercises.map(entry => `<h3>${escapeHtml(byId[entry.exerciseId]?.name || 'Упражнение')}</h3>${renderRecordedSets(entry)}<p class="mini-note">После основного подхода: ${escapeHtml(effortLabel(entry.rir || ''))} · Дискомфорт: ${entry.discomfort==='yes'?'да':entry.discomfort==='no'?'нет':'—'}${entry.note?`<br>${escapeHtml(entry.note)}`:''}</p>`).join('');
    openSheet(labels[workout.preset] || 'ТРЕНИРОВКА',`Тренировка ${prettyDate(workout.date)}`,`<div class="detail-block">${workout.athleteName?`<p><strong>${escapeHtml(workout.athleteName)}</strong></p>`:''}${workout.duration?`<p>Планировалось: ${escapeHtml(workout.duration)} мин</p>`:''}${run}${entries || '<p>Силовых упражнений не было.</p>'}${workout.overall?`<p>Общая нагрузка: ${escapeHtml(workout.overall)}/10</p>`:''}${workout.liked?`<p><strong>Понравилось:</strong> ${escapeHtml(workout.liked)}</p>`:''}${workout.discomfort?`<p><strong>Дискомфорт:</strong> ${escapeHtml(workout.discomfort)}</p>`:''}${workout.next?`<p><strong>Следующий раз:</strong> ${escapeHtml(workout.next)}</p>`:''}<div class="actions"><button class="btn btn-dark" data-history-action="download" data-id="${escapeHtml(id)}">Скачать PDF</button><button class="btn btn-primary" data-history-action="share" data-id="${escapeHtml(id)}">Поделиться PDF</button></div><div class="actions"><button class="btn btn-outline" data-history-action="edit" data-id="${escapeHtml(id)}">Исправить запись</button></div></div>`);
  }
  function renderSettings() {
    $('athlete-name').value = state.profile.name || '';
    $('font-size-setting').value = state.preferences.fontSize;
    $('ui-size-setting').value = state.preferences.uiSize;
    $('theme-setting').value = state.preferences.theme;
    $('profile-chip').textContent = state.profile.name || 'ЛИЧНЫЙ ЖУРНАЛ';
    $('backup-status').textContent = state.lastBackupAt ? `Последняя JSON-копия: ${prettyDate(state.lastBackupAt.slice(0,10))}` : 'JSON-копия ещё не скачивалась.';
  }
  function applyPreferences() {
    const {fontSize,uiSize,theme} = state.preferences;
    document.documentElement.dataset.fontSize = fontSize;
    document.documentElement.dataset.uiSize = uiSize;
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#173c37' : theme === 'dark' ? '#101a15' : '#000000';
  }
  function pdfFilename(workout) { return `Тренировка_${workout.date}.pdf`; }
  function makePdf(workout) {
    if (!window.jspdf?.jsPDF || !pdfFontBase64) throw new Error('Генератор PDF ещё не готов.');
    const doc = new window.jspdf.jsPDF({unit:'mm',format:'a4'});
    doc.addFileToVFS('NotoSans-Regular.ttf',pdfFontBase64);
    doc.addFont('NotoSans-Regular.ttf','NotoSans','normal');
    const fontScale = {normal:1,large:1.25,largest:1.5}[state.preferences.fontSize];
    const uiScale = {normal:1,large:1.15,largest:1.3}[state.preferences.uiSize];
    const palettes = {
      light:{paper:[255,255,255],text:[23,43,40],accent:[169,53,18],line:[197,210,198]},
      dark:{paper:[16,26,21],text:[244,248,243],accent:[255,154,115],line:[116,141,122]},
      contrast:{paper:[0,0,0],text:[255,255,255],accent:[255,228,91],line:[255,255,255]}
    };
    const palette = palettes[state.preferences.theme];
    const left = 16*uiScale, right = 210-left, top = 19*uiScale, bottom = 297-left;
    let y;
    function paintPage(add=false) {
      if (add) doc.addPage();
      doc.setFillColor(...palette.paper);
      doc.rect(0,0,210,297,'F');
      doc.setFont('NotoSans','normal');
      y = top;
    }
    paintPage();
    function line(text,size=10,space=3,color=palette.text) {
      const renderedSize = size*fontScale;
      doc.setFontSize(renderedSize);
      const parts = doc.splitTextToSize(String(text),right-left);
      const leading = renderedSize*0.52;
      for (const part of parts) {
        if (y + leading > bottom) paintPage(true);
        doc.setFontSize(renderedSize);
        doc.setTextColor(...color);
        doc.text(part,left,y);
        y += leading;
      }
      y += space*uiScale;
    }
    function rule() {
      if (y+6*uiScale > bottom) paintPage(true);
      doc.setDrawColor(...palette.line);
      doc.setLineWidth(0.25*uiScale);
      doc.line(left,y,right,y);
      y += 6*uiScale;
    }
    line('ТРЕНИРОВКА',18,2,palette.accent);
    line(`${prettyDate(workout.date)} · ${labels[workout.preset] || 'Без предустановки'}`,12,3);
    if (workout.athleteName) line(`Имя: ${workout.athleteName}`);
    rule();
    if (workout.duration) line(`Планировалось: ${workout.duration} мин`);
    if (workout.run?.distance) {
      line(`Бег: ${formatNumber(readNumber(workout.run.distance))} км${workout.run.time ? ` · ${workout.run.time}` : ''}`);
      if (workout.run.time) line(`Средний темп: ${formatPace(timeSeconds(workout.run.time),readNumber(workout.run.distance))}`);
      if (workout.run.feel) line(`Ощущение от бега: ${workout.run.feel}/10`);
    }
    for (const entry of workout.exercises) {
      const ex = byId[entry.exerciseId];
      if (!ex) continue;
      rule();
      line(`${entry.slot ? `${entry.slot}: ` : ''}${ex.name}`,12,2,palette.accent);
      line(`Ориентир: ${ex.scheme}`,9,2);
      for (const group of setGroups(entry).filter(group => group.rows.length)) {
        line(group.label,11,2);
        group.rows.forEach(({set},index) => line(`Подход ${index+1}: ${set.weight === '' ? 'без указанного веса' : `${formatNumber(readNumber(set.weight))} ${/гантел/i.test(ex.name)?'кг/гантель':'кг'}`} × ${set.reps}`,10,1));
      }
      const notes = [];
      if (entry.rir) notes.push(`После основного подхода: ${effortLabel(entry.rir)}`);
      if (entry.discomfort) notes.push(`Дискомфорт: ${entry.discomfort==='yes'?'да':'нет'}`);
      if (entry.liked) notes.push(`Понравилось: ${entry.liked==='yes'?'да':'нет'}`);
      if (entry.comfort) notes.push(`Было удобно: ${entry.comfort==='yes'?'да':'нет'}`);
      if (notes.length) line(notes.join(' · '),9,1);
      if (entry.note) line(`Заметка: ${entry.note}`,9,2);
    }
    rule();
    if (workout.overall) line(`Общая нагрузка: ${workout.overall}/10`);
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
      return {kind:['warm','work'].includes(set?.kind) ? set.kind : '',weight,reps};
    }),rir:['','near','some','many',...legacyEfforts].includes(raw.rir) ? raw.rir : '',discomfort:['','yes','no'].includes(raw.discomfort) ? raw.discomfort : '',liked:['','yes','no'].includes(raw.liked) ? raw.liked : '',comfort:['','yes','no'].includes(raw.comfort) ? raw.comfort : '',note:safeText(raw.note,500)};
  }
  function normalizeWorkout(raw,isDraft=false) {
    if (!raw || !validDate(raw.date) || !Array.isArray(raw.exercises) || raw.exercises.length>30) throw new Error('Некорректная тренировка в резервной копии.');
    if (!isDraft && !raw.id) throw new Error('У тренировки отсутствует идентификатор.');
    const run=raw.run || {};
    if (run.time && !timeSeconds(run.time)) throw new Error('Некорректное время бега в резервной копии.');
    for (const value of [run.target,run.distance]) if (value && (!Number.isFinite(readNumber(value)) || readNumber(value)<0 || readNumber(value)>1000)) throw new Error('Некорректная дистанция в резервной копии.');
    const duration=String(raw.duration ?? '').trim();
    if (duration && (!Number.isInteger(Number(duration)) || Number(duration)<10 || Number(duration)>240)) throw new Error('Некорректная длительность в резервной копии.');
    return {id:isDraft?undefined:safeText(raw.id,100),createdAt:safeText(raw.createdAt || new Date().toISOString(),40),updatedAt:safeText(raw.updatedAt || new Date().toISOString(),40),athleteName:safeText(raw.athleteName,50),date:raw.date,preset:labels[raw.preset]?raw.preset:'',duration,before:safeText(raw.before,3),run:{target:safeText(run.target ?? '2',10),distance:safeText(run.distance,10),time:safeText(run.time,10),feel:safeText(run.feel,3)},exercises:raw.exercises.map(normalizeEntry),overall:safeText(raw.overall,3),after:safeText(raw.after,3),liked:safeText(raw.liked,500),discomfort:safeText(raw.discomfort,500),next:safeText(raw.next,500)};
  }
  function draftIsEmpty() {
    const d=state.draft;
    return !d.preset && !d.duration && !d.run?.distance && !d.run?.time && !d.run?.feel && (!d.run?.target || d.run.target === '2') && !d.exercises.length && !d.overall && !d.liked && !d.discomfort && !d.next;
  }
  async function importBackup(file) {
    if (!file) return;
    if (file.size > 10_000_000) return showAlert('Резервная копия больше 10 МБ. Выберите меньший файл.');
    try {
      const payload = JSON.parse(await file.text());
      if (payload.app !== 'training-journal' || payload.version !== VERSION || !Array.isArray(payload.workouts) || payload.workouts.length > 5000) throw new Error('Файл не является совместимой резервной копией.');
      const sourceName = safeText(payload.profile?.name,50).trim();
      if (sourceName && state.profile.name.trim() && sourceName.toLocaleLowerCase('ru') !== state.profile.name.trim().toLocaleLowerCase('ru')) throw new Error('Это резервная копия другого человека. Для передачи только плана используйте QR-код.');
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
  function planToken() {
    const draft = state.draft;
    const preset = labels[draft.preset] ? draft.preset : 'custom';
    const slots = [...templates[preset],coreSlot];
    const entries = draft.exercises.map(entry => [Number(entry.exerciseId.split('-')[1]),slots.findIndex(slot => slot.slot === entry.slot),entry.sets.map(set => set.kind === 'warm' ? 'r' : 'w').join('')]);
    const bytes = new TextEncoder().encode(JSON.stringify([1,preset,draft.date,draft.duration || 0,entries]));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function decodePlan(token) {
    if (!/^[A-Za-z0-9_-]{1,4000}$/.test(token)) throw new Error('Повреждённый код плана.');
    const bytes = Uint8Array.from(atob(token.replace(/-/g,'+').replace(/_/g,'/')),char => char.charCodeAt(0));
    const [version,preset,date,duration,entries] = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if (version !== 1 || !labels[preset] || !validDate(date) || !Array.isArray(entries) || !entries.length || entries.length > 30) throw new Error('Неподдерживаемый план.');
    if (duration !== 0 && (!Number.isInteger(Number(duration)) || Number(duration)<10 || Number(duration)>240)) throw new Error('Некорректная длительность плана.');
    const slots = [...templates[preset],coreSlot];
    const used = new Set();
    const exercises = entries.map(item => {
      if (!Array.isArray(item) || item.length !== 3) throw new Error('Некорректное упражнение в плане.');
      const [number,slotIndex,kinds] = item;
      const id = `exercise-${number}`;
      if (!Number.isInteger(number) || !byId[id] || used.has(id) || typeof kinds !== 'string' || !/^[rw]{1,20}$/.test(kinds) || !Number.isInteger(slotIndex) || slotIndex< -1 || slotIndex>=slots.length) throw new Error('Некорректное упражнение в плане.');
      used.add(id);
      return {id,slot:slots[slotIndex]?.slot || (byId[id].group==='core'?'Пресс':'Дополнительное упражнение'),kinds};
    });
    return {preset,date,duration:duration || '',exercises};
  }
  function showPlanQr() {
    if (!state.draft.exercises.length) return showAlert('Сначала выберите упражнения для передачи.');
    if (!window.qrcode) return showAlert('Генератор QR недоступен. Обновите страницу.');
    try {
      const token = planToken();
      decodePlan(token);
      const url = `${new URL('./',location.href).href}#plan=${token}`;
      const qr = window.qrcode(0,'L');
      qr.addData(url); qr.make();
      openSheet('ПЕРЕДАЧА ПЛАНА','План для напарника',`<p class="choice-note">Покажите код другому человеку: он откроет ссылку камерой телефона. Передаются только дата, вид тренировки, длительность и список упражнений. Его история и рабочие веса останутся личными.</p><div class="plan-qr">${qr.createSvgTag(5,4)}</div><div class="field"><label for="plan-link">Ссылка на план</label><input id="plan-link" type="text" readonly value="${escapeHtml(url)}"></div><div class="actions"><button class="btn btn-outline" data-plan-copy>Скопировать ссылку</button></div>`);
    } catch { showAlert('Не удалось создать QR. Проверьте дату, длительность и число подходов.'); }
  }
  function openPlanInput() {
    openSheet('ПОЛУЧИТЬ ПЛАН','Вставить план напарника',`<p class="choice-note">Если QR открылся в другом браузере, скопируйте ссылку и вставьте её здесь на своём телефоне. История тренировок останется вашей.</p><div class="field"><label for="incoming-plan-input">Ссылка или код плана</label><input id="incoming-plan-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"></div><p id="plan-input-error" class="notice" role="alert" hidden></p><button class="btn btn-dark full-button" data-plan-open>Показать план</button>`);
  }
  function showIncomingPlan(token) {
    if (!token) return;
    try {
      const plan = decodePlan(token);
      const cautions = plan.exercises.filter(item => lastExerciseLogs(item.id)[0]?.entry.discomfort === 'yes');
      incomingPlan = plan;
      openSheet('ПОЛУЧЕННЫЙ ПЛАН',`Тренировка ${prettyDate(plan.date)}`,`<p class="choice-note">${escapeHtml(labels[plan.preset])}${plan.duration ? ` · около ${escapeHtml(plan.duration)} мин` : ''}. Вес, выполненные подходы и история отправителя не передаются.</p><ol class="plan-preview">${plan.exercises.map(item => `<li>${escapeHtml(byId[item.id].name)} · ${item.kinds.length} подх.</li>`).join('')}</ol>${cautions.length?`<p class="notice">У вас ранее был дискомфорт в: ${cautions.map(item => escapeHtml(byId[item.id].name)).join(', ')}. Проверьте эти упражнения и при необходимости замените.</p>`:''}${!draftIsEmpty()?'<p class="notice">На этом телефоне есть черновик. Прежде чем заменить его, можно скачать резервную копию.</p><button class="btn btn-outline full-button" data-plan-backup>Скачать копию с черновиком</button>':''}<button class="btn btn-dark full-button" data-plan-accept>Принять список упражнений</button>`);
    } catch {
      const error = $('plan-input-error');
      if (error) { error.hidden = false; error.textContent = 'Не удалось прочитать план. Проверьте ссылку или попросите новый код.'; }
      else showAlert('Не удалось прочитать QR-план. Попросите показать новый код.');
    }
  }
  function acceptIncomingPlan() {
    const plan = incomingPlan;
    if (!plan) return;
    if (locked) return showAlert('Локальное хранилище недоступно. Сначала восстановите его.');
    if (state.editingId) return showAlert('Сначала завершите или отмените исправление старой тренировки.');
    if (!draftIsEmpty() && !confirm('Заменить текущий черновик полученным планом? Сохраните резервную копию, если хотите оставить прежний черновик.')) return;
    const previous = JSON.parse(JSON.stringify(state.draft));
    const draft = defaultDraft();
    draft.date = plan.date; draft.preset = plan.preset; draft.duration = plan.duration;
    draft.exercises = plan.exercises.map(item => {
      const entry = makeEntry(item.id,item.slot);
      entry.sets = [...item.kinds].map(kind => ({kind:kind === 'r'?'warm':'work',weight:kind === 'r'?'':entry.sets[0]?.weight || '',reps:''}));
      return entry;
    });
    state.draft = draft;
    if (!saveState()) { state.draft = previous; return; }
    incomingPlan = null;
    closeSheet(); hydrateForm(); switchView('workout');
    showAlert('План принят. Укажите собственные веса и при необходимости замените упражнения.');
  }
  function initialize() {
    applyPreferences();
    for (const id of ['run-feel','overall']) for (let n=1;n<=10;n++) $(id).insertAdjacentHTML('beforeend',`<option value="${n}">${n}/10</option>`);
    hydrateForm(); renderCatalog(); renderHistory(); renderSettings();
    if (window.jspdf?.jsPDF && pdfFontBase64) {
      $('save-share').disabled = false;
      $('pdf-status').textContent = 'PDF использует текущие размер текста и тему; размер элементов меняет отступы. Если системная отправка недоступна, файл скачается.';
    } else $('pdf-status').textContent = 'Генератор PDF недоступен. Сохранение тренировки работает.';
    document.querySelectorAll('[data-nav]').forEach(button => button.addEventListener('click',() => switchView(button.dataset.nav)));
    $('presets').addEventListener('click',event => { const button=event.target.closest('[data-preset]'); if (button) selectPreset(button.dataset.preset); });
    $('rebuild-plan').addEventListener('click',() => selectPreset(state.draft.preset));
    $('exercise-list').addEventListener('click',handleExerciseAction);
    $('exercise-list').addEventListener('input',handleExerciseInput);
    $('exercise-list').addEventListener('change',handleExerciseInput);
    for (const id of ['date','duration','run-target','run-distance','run-minutes','run-seconds','run-feel','overall','liked','discomfort','next']) {
      $(id).addEventListener('input',syncMainField);
      $(id).addEventListener('change',syncMainField);
    }
    $('add-exercise').addEventListener('click',() => openChooser(null));
    $('share-plan').addEventListener('click',showPlanQr);
    $('paste-plan').addEventListener('click',openPlanInput);
    $('save-workout').addEventListener('click',() => saveWorkout(false));
    $('save-share').addEventListener('click',() => saveWorkout(true));
    $('cancel-edit').addEventListener('click',cancelEdit);
    $('sheet-close').addEventListener('click',closeSheet);
    $('sheet').addEventListener('click',event => { if (event.target === $('sheet')) closeSheet(); });
    $('sheet-content').addEventListener('click',event => {
      if (event.target.closest('[data-plan-copy]')) {
        const link = $('plan-link');
        if (!navigator.clipboard?.writeText) link.select();
        else navigator.clipboard.writeText(link.value).then(() => { event.target.textContent='Ссылка скопирована'; }).catch(() => { link.select(); });
        return;
      }
      if (event.target.closest('[data-plan-backup]')) { exportBackup(); return; }
      if (event.target.closest('[data-plan-accept]')) { acceptIncomingPlan(); return; }
      if (event.target.closest('[data-plan-open]')) {
        const value = $('incoming-plan-input').value.trim();
        let token = value;
        try { if (value.includes('#')) token = new URLSearchParams(new URL(value).hash.slice(1)).get('plan'); }
        catch { $('plan-input-error').hidden=false; $('plan-input-error').textContent='Вставьте полную ссылку или код плана.'; return; }
        if (!token) { $('plan-input-error').hidden=false; $('plan-input-error').textContent='Вставьте ссылку или код плана.'; return; }
        showIncomingPlan(token);
        return;
      }
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
    for (const [id,key] of [['font-size-setting','fontSize'],['ui-size-setting','uiSize'],['theme-setting','theme']]) {
      $(id).addEventListener('change',event => { state.preferences[key]=event.target.value; applyPreferences(); saveState(); });
    }
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
    const token = new URLSearchParams(location.hash.slice(1)).get('plan');
    if (token) { history.replaceState(null,'',location.pathname + location.search); showIncomingPlan(token); }
  }
  initialize();
})();
