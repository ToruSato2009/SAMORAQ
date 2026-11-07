(() => {
  "use strict";
  const ACTIVE_USER_KEY = "studyforge_local_active_user";
  const activeUsername = (localStorage.getItem(ACTIVE_USER_KEY) || "").trim().toLowerCase();
  // A dashboard must never initialize as a guest or with a half-valid account.
  // Redirect once to the login page and stop this script before it can render/save guest data.
  let sessionValid = false;
  try {
    const accounts = JSON.parse(localStorage.getItem("studyforge_local_demo_users") || "{}");
    const savedProfile = localStorage.getItem(`studyforge_profile_${activeUsername}`);
    const savedState = JSON.parse(localStorage.getItem(`studyforge_v2_state_${activeUsername}`) || "null");
    sessionValid = !!(activeUsername && accounts[activeUsername] && savedProfile && savedState &&
      Array.isArray(savedState.subjects) && Array.isArray(savedState.topics) && Array.isArray(savedState.tasks));
  } catch { sessionValid = false; }
  if (!sessionValid) {
    localStorage.removeItem(ACTIVE_USER_KEY);
    location.replace("auth.html");
    return;
  }
  const STORAGE_KEY = `studyforge_v2_state_${activeUsername}`;
  const XP = { easy: 10, medium: 25, hard: 40, boss: 60 };
  const LEVEL_NAMES = ["Curious Beginner", "Steady Starter", "Focus Builder", "Chapter Champion", "Study Strategist", "Consistency Pro", "Knowledge Seeker", "Master Planner", "Exam Trailblazer", "StudyForge Legend"];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const dateFromISO = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y,m-1,d); };
  const dayStart = d => new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
  const safeText = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
  const emptyState = () => ({
    subjects: [], topics: [], tasks: [], dailyPlans: {}, dailyTopicSelections: {}, dailyTopicText: {}, dailyTopicDismissed: {}, dailyStudyMinutes: 0, priorityOrder: [], xp: 0, completed: [],
    theme: localStorage.getItem(`studyforge_theme_${activeUsername.toLowerCase()}`) || "dark",
    createdAt: Date.now()
  });
  const isSampleTask = t => {
    const sampleNotes = [
      "Read the topic and write a short summary.",
      "Attempt questions without checking the solution first.",
      "Close your notes and recall the main points.",
      "Correct mistakes and note what to revisit.",
      "Summarise formulas, definitions, or key ideas."
    ];
    const sampleTitles = ["Study a key concept:", "Practise questions:", "Recall from memory:", "Review mistakes:", "Quick chapter recap:"];
    return sampleNotes.includes(t.notes) && sampleTitles.some(prefix => String(t.title || "").startsWith(prefix));
  };
  const load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      const x = JSON.parse(raw);
      if (!Array.isArray(x.subjects) || !Array.isArray(x.tasks)) return emptyState();
      x.topics = Array.isArray(x.topics) ? x.topics : [];
      x.dailyPlans = x.dailyPlans && typeof x.dailyPlans === "object" ? x.dailyPlans : {};
      x.dailyTopicSelections = x.dailyTopicSelections && typeof x.dailyTopicSelections === "object" ? x.dailyTopicSelections : {};
      x.dailyTopicText = x.dailyTopicText && typeof x.dailyTopicText === "object" ? x.dailyTopicText : {};
      x.dailyTopicDismissed = x.dailyTopicDismissed && typeof x.dailyTopicDismissed === "object" ? x.dailyTopicDismissed : {};
      x.priorityOrder = Array.isArray(x.priorityOrder) ? x.priorityOrder.filter(id => x.subjects.some(subject => subject.id === id)) : [];
      const removedSamples = x.tasks.filter(isSampleTask);
      const removedSampleIds = new Set(removedSamples.map(task => task.id));
      const removedSampleXp = removedSamples.filter(task => task.done).reduce((sum, task) => sum + (XP[task.difficulty] || 10), 0);
      x.tasks = x.tasks.filter(t => !isSampleTask(t));
      x.completed = Array.isArray(x.completed) ? x.completed.filter(entry => !removedSampleIds.has(entry.taskId)) : [];
      x.xp = Math.max(0, (Number(x.xp) || 0) - removedSampleXp);
      const oldSubjectIds = new Set(["sub-physics","sub-chemistry","sub-maths","sub-english","sub-cs","sub-biology","sub-history","sub-geography","sub-economics","sub-accountancy"]);
      x.subjects = x.subjects.filter(subject => !(oldSubjectIds.has(subject.id) && !x.tasks.some(t => t.subject === subject.id) && !x.topics.some(topic => topic.subjectId === subject.id)));
      x.subjects.forEach(subject => { subject.topicCursor = Number(subject.topicCursor) || 0; });
      // Migrate older per-subject allocations into one total daily study budget.
      if (!Number.isFinite(Number(x.dailyStudyMinutes)) || Number(x.dailyStudyMinutes) <= 0) {
        const legacyTotal = x.subjects.reduce((sum, subject) => sum + Math.max(0, Number(subject.dailyMinutes) || 0), 0);
        const profile = (() => { try { return JSON.parse(localStorage.getItem(`studyforge_profile_${activeUsername.toLowerCase()}`) || "null"); } catch { return null; } })();
        x.dailyStudyMinutes = Number(profile?.dailyStudyMinutes) || legacyTotal || 120;
      }
      x.subjects.forEach(subject => { delete subject.dailyMinutes; });
      if (typeof x.xp !== "number") x.xp = 0;
      if (!Array.isArray(x.completed)) x.completed = [];
      return x;
    } catch { return emptyState(); }
  };
  let state = load();
  let currentView = "dashboard", taskFilter = "all", calendarMonth = new Date(), editingTaskId = null;
  const save = () => { try { localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); } catch { toast("Browser storage is full. Export or remove some data.", "error"); } };
  const subjectById = id => state.subjects.find(s=>s.id===id);
  const subjectName = id => subjectById(id)?.name || "Unassigned";
  const subjectColor = id => subjectById(id)?.color || "violet";
  const taskXP = t => {
    const base = XP[t.difficulty] || 10;
    const subject = subjectById(t.subject);
    const ranked = state.priorityOrder.length > 0 && subject;
    const rank = ranked ? state.priorityOrder.indexOf(t.subject) : -1;
    const priorityMultipliers = [1.30, 1.15, 1.00, 0.90, 0.80];
    const priorityMultiplier = ranked ? (rank >= 0 ? (priorityMultipliers[rank] ?? 0.75) : 0.75) : 1;
    const minutes = Math.max(1, Number(t.minutes) || 25);
    const durationMultiplier = Math.min(2.5, Math.max(0.6, Math.sqrt(minutes / 25)));
    return Math.max(1, Math.round(base * priorityMultiplier * durationMultiplier));
  };
  const topicById = id => state.topics.find(topic => topic.id === id);
  const activeTopicsFor = subjectId => state.topics.filter(topic => topic.subjectId === subjectId && !topic.completed);
  const isTaskLocked = task => Boolean(task.dueDate && task.dueDate < localDate());
  const totalDailyMinutes = () => Math.max(0, Number(state.dailyStudyMinutes) || 0);
  const syncDailyPlan = date => {
    if (!state.dailyPlans[date] && date !== localDate()) return;
    const tasks = state.tasks.filter(task => task.dueDate === date);
    const existing = state.dailyPlans[date] || {mode:"manual",generatedAt:Date.now(),taskIds:[],locked:false};
    existing.taskIds = tasks.map(task => task.id);
    existing.plannedMinutes = tasks.reduce((sum,task)=>sum+(Number(task.minutes)||0),0);
    state.dailyPlans[date] = existing;
  };
  // Allocate integer minutes using the largest-remainder method so every minute is accounted for.
  const splitMinutes = (total, entries, weightOf) => {
    const amount = Math.max(0, Math.floor(total));
    if (!entries.length) return new Map();
    const weights = entries.map(entry => Math.max(0.0001, Number(weightOf(entry)) || 0));
    const weightTotal = weights.reduce((a,b)=>a+b,0);
    const exact = weights.map(weight => amount * weight / weightTotal);
    const result = exact.map(Math.floor);
    let spare = amount - result.reduce((a,b)=>a+b,0);
    const order = exact.map((value,index)=>({index,remainder:value-result[index]})).sort((a,b)=>b.remainder-a.remainder);
    for (let i=0;i<spare;i++) result[order[i % order.length].index]++;
    return new Map(entries.map((entry,index)=>[entry.id,result[index]]));
  };
  const priorityRank = id => {
    const index = state.priorityOrder.indexOf(id);
    return index < 0 ? state.priorityOrder.length : index;
  };
  const priorityWeight = id => {
    if (!state.priorityOrder.length || !subjectById(id)) return 1;
    const rank = priorityRank(id);
    return 1 + Math.max(0, state.subjects.length - rank - 1) * 0.25;
  };
  const rebalanceDate = (date, anchorTaskId = null) => {
    if (!date || date < localDate()) return {ok:false,reason:"locked"};
    const dayTasks = state.tasks.filter(task => task.dueDate === date);
    if (!dayTasks.length) { syncDailyPlan(date); return {ok:true,changed:false}; }
    const plan = state.dailyPlans[date] || {mode:"manual",generatedAt:Date.now(),taskIds:[],locked:false};
    const defaultBudget = plan.mode === "kickstart" ? dayTasks.reduce((sum,task)=>sum+(Number(task.minutes)||0),0) : totalDailyMinutes();
    const budget = Math.max(0, Number(plan.allocationBudget) || defaultBudget);
    const completedMinutes = dayTasks.filter(task=>task.done).reduce((sum,task)=>sum+Math.max(0,Number(task.minutes)||0),0);
    const anchorTask = anchorTaskId ? dayTasks.find(task=>task.id===anchorTaskId&&!task.done) : null;
    const anchorMinutes = anchorTask ? Math.max(0,Number(anchorTask.minutes)||0) : 0;
    const openTasks = dayTasks.filter(task=>!task.done&&task.id!==anchorTaskId);
    const available = Math.max(0,budget-completedMinutes-anchorMinutes);
    if (!openTasks.length) { syncDailyPlan(date); return {ok:true,changed:false}; }
    if (available < openTasks.length) return {ok:false,reason:"too-many-tasks",available,taskCount:openTasks.length};

    // First allocate the remaining budget across subjects according to saved priority.
    const buckets = new Map();
    openTasks.forEach(task=>{
      const key = task.subject && subjectById(task.subject) ? task.subject : "__unassigned__";
      if (!buckets.has(key)) buckets.set(key,[]);
      buckets.get(key).push(task);
    });
    const subjectEntries = [...buckets.entries()].map(([id,tasks])=>({id,tasks}));
    // Reserve one minute for every unfinished task first; distribute the rest by priority and existing task-time preference.
    const extraBudget = available - openTasks.length;
    const subjectExtras = splitMinutes(extraBudget,subjectEntries,entry=>entry.id==="__unassigned__"?Math.sqrt(entry.tasks.reduce((sum,task)=>sum+Math.max(1,Number(task.minutes)||1),0)):priorityWeight(entry.id)*Math.sqrt(entry.tasks.reduce((sum,task)=>sum+Math.max(1,Number(task.minutes)||1),0)));
    subjectEntries.forEach(entry=>{
      const extras = subjectExtras.get(entry.id) || 0;
      const taskExtras = splitMinutes(extras,entry.tasks,task=>Math.max(1,Number(task.minutes)||1));
      entry.tasks.forEach(task=>{task.minutes=1+(taskExtras.get(task.id)||0);});
    });
    plan.allocationBudget=budget;
    state.dailyPlans[date]=plan;
    syncDailyPlan(date);
    return {ok:true,changed:true};
  };
  const rebalanceWithNotice = (date, anchorTaskId = null) => {
    const result=rebalanceDate(date,anchorTaskId);
    if (!result.ok && result.reason === "too-many-tasks") toast(`There are ${result.taskCount} unfinished tasks but only ${result.available} minutes left in this day's budget. Combine or remove tasks to fit the plan.`,"error");
    return result;
  };
  const formatMinutes = minutes => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  const remainingTodayMinutes = () => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return Math.max(0, Math.ceil((midnight.getTime() - now.getTime()) / 60000));
  };
  const makeDailyTask = (subject, topic, date, minutes, suffix = "") => ({
    id: uid(), title: `${topic.title}${suffix}`, subject: subject.id, topicId: topic.id,
    dueDate: date, difficulty: "medium", minutes, kind: "study",
    notes: "Daily study block generated from your total daily study budget.",
    done: false, createdAt: Date.now(), completedAt: null, generated: true
  });
  const nextTopicForSubject = subject => {
    const topics = activeTopicsFor(subject.id);
    if (!topics.length) return null;
    const index = (Number(subject.topicCursor) || 0) % topics.length;
    subject.topicCursor = (index + 1) % topics.length;
    return topics[index];
  };
  const generateDailyPlan = date => {
    if (state.dailyPlans[date]) return false;
    const selectedIds = new Set((state.dailyTopicSelections[date] || []).map(item => typeof item === "string" ? item : item.topicId));
    const eligible = state.subjects.map(subject => ({subject, topics: activeTopicsFor(subject.id).filter(topic => selectedIds.has(topic.id))})).filter(x => x.topics.length);
    if (!eligible.length || !totalDailyMinutes()) return false;
    const now = new Date(), remaining = remainingTodayMinutes(), budget = totalDailyMinutes();
    const kickstart = now.getHours() >= 22 && remaining > 0 && remaining <= 120 && budget >= remaining;
    const plannedBudget = kickstart ? Math.min(60, remaining, budget) : budget;
    const blocks = [];
    // Generate exactly one study task per eligible subject. The allocation engine
    // expands or reduces each task's duration to fit the full daily study budget.
    const subjectOrder = [...eligible].sort((a,b) => a.subject.name.localeCompare(b.subject.name));
    subjectOrder.forEach(item => {
      const start = (Number(item.subject.topicCursor) || 0) % item.topics.length;
      const topic = item.topics[start];
      blocks.push({subject:item.subject, topic});
      item.subject.topicCursor = (start + 1) % item.topics.length;
    });
    const base = Math.floor(plannedBudget / blocks.length), extra = plannedBudget % blocks.length;
    const taskIds=[];
    blocks.forEach((block,i)=>{
      const task=makeDailyTask(block.subject,block.topic,date,base+(i<extra?1:0));
      state.tasks.push(task);taskIds.push(task.id);
    });
    const manualTasks=state.tasks.filter(task=>task.dueDate===date&&!task.generated).map(task=>task.id);
    state.dailyPlans[date]={mode:kickstart?"kickstart":"normal",generatedAt:Date.now(),allocationBudget:plannedBudget,taskIds:[...taskIds,...manualTasks],plannedMinutes:state.tasks.filter(task=>task.dueDate===date).reduce((sum,task)=>sum+(Number(task.minutes)||0),0),locked:false};
    rebalanceDate(date);
    save();return true;
  };
  let activeLocalDate = localDate();
  const ensureDailyPlan = () => {
    const today = localDate();
    const changed = today !== activeLocalDate;
    activeLocalDate = today;
    const generated = generateDailyPlan(today);
    return changed || generated;
  };
  const completedTasks = () => state.tasks.filter(t=>t.done);
  const levelInfo = () => { const level = Math.floor((state.xp||0)/100)+1; return {level,progress:(state.xp||0)%100,remaining:100-((state.xp||0)%100)}; };
  const fmtDate = s => { if(!s) return "No date"; const d=dateFromISO(s); return d.toLocaleDateString(undefined,{month:"short",day:"numeric"}); };
  const dateLabel = s => s===localDate()?"Today":s===localDate(new Date(Date.now()+86400000))?"Tomorrow":fmtDate(s);
  const toast = (message,type="success") => { const el=document.createElement("div");el.className=`toast ${type}`;el.textContent=message;$("#toastRegion").append(el);setTimeout(()=>el.remove(),3300); };
  const openModal = id => { const el=$("#"+id); el.classList.add("open");el.setAttribute("aria-hidden","false");setTimeout(()=>$("input,select,textarea",el)?.focus(),50); };
  const closeModal = el => { const modal=el.closest(".modal-backdrop"); if(modal){modal.classList.remove("open");modal.setAttribute("aria-hidden","true");} };
  const empty = (title,desc,icon="✦") => `<div class="empty-state"><div class="empty-icon">${icon}</div><strong>${safeText(title)}</strong>${safeText(desc)}</div>`;
  const taskRow = t => {
    const locked = isTaskLocked(t);
    return `<div class="task-row ${t.done?"done":""} ${locked?"task-locked":""}" data-task-row="${t.id}">
      <input class="task-check" type="checkbox" aria-label="Mark ${safeText(t.title)} complete" data-complete="${t.id}" ${t.done?"checked":""} ${locked?"disabled":""}>
      <div><div class="task-title">${safeText(t.title)}</div><div class="task-meta"><span class="subject-tag">${safeText(subjectName(t.subject))}</span><span>${safeText(dateLabel(t.dueDate))}</span><span>· ${t.minutes} min</span>${t.done?'<span>· Completed</span>':""}${locked?'<span>· Day locked</span>':""}</div></div>
      <div class="task-xp">${locked&&!t.done?"Locked":t.done?"✓ Earned":`+${taskXP(t)} XP`}</div>
      <div class="task-actions"><button class="tiny-action" data-edit="${t.id}" aria-label="Edit task" ${locked?"disabled":""}>Edit</button><button class="tiny-action" data-delete="${t.id}" aria-label="Delete task" ${locked?"disabled":""}>×</button></div>
    </div>`;
  };
  const sortedTasks = arr => [...arr].sort((a,b)=>Number(a.done)-Number(b.done)||a.dueDate.localeCompare(b.dueDate)||b.createdAt-a.createdAt);
  const renderTasks = () => {
    const today=localDate();
    const todays=sortedTasks(state.tasks.filter(t=>t.dueDate===today)).slice(0,6);
    $("#todayTasks").innerHTML=todays.length?sortedTasks(todays).map(taskRow).join(""):empty("No plan generated yet","Add subjects, set your total daily study budget, and add topics to build today's schedule.","✓");
    let arr=state.tasks;
    if(taskFilter==="today") arr=arr.filter(t=>t.dueDate===today);
    if(taskFilter==="open") arr=arr.filter(t=>!t.done);
    if(taskFilter==="done") arr=arr.filter(t=>t.done);
    arr=sortedTasks(arr);
    $("#allTasks").innerHTML=arr.length?arr.map(taskRow).join(""):empty("Nothing here yet",taskFilter==="done"?"Your completed tasks will appear here.":"Add a study task to build your plan.","☑");
    $("#taskCountLabel").textContent=`${arr.length} task${arr.length===1?"":"s"}`;
    $("#navTaskCount").textContent=state.tasks.filter(t=>!t.done).length;
    const upcoming=sortedTasks(state.tasks.filter(t=>!t.done&&t.dueDate>=today)).slice(0,5);
    $("#upcomingTasks").innerHTML=upcoming.length?upcoming.map(taskRow).join(""):empty("You're all caught up","No upcoming tasks are scheduled.","✓");
  };
  const renderSubjectProgress = target => {
    const counts = s => {const tasks=state.tasks.filter(t=>t.subject===s.id);return {all:tasks.length,done:tasks.filter(t=>t.done).length};};
    if(!state.subjects.length){target.innerHTML=empty("No subjects yet","Add a subject to organise your work.");return;}
    target.innerHTML=state.subjects.map(s=>{const c=counts(s),pct=c.all?Math.round(c.done/c.all*100):0;return `<div class="subject-progress-row"><div class="subject-progress-top"><strong>${safeText(s.name)}</strong><span>${c.done}/${c.all} · ${pct}%</span></div><div class="subject-bar"><span style="width:${pct}%;background:${colorGradient(s.color)}"></span></div></div>`;}).join("");
  };
  const colorGradient = c => ({violet:"linear-gradient(90deg,#f4b740,#ffd071)",blue:"linear-gradient(90deg,#61a7ed,#86c9ff)",mint:"linear-gradient(90deg,#35b999,#79dec0)",orange:"linear-gradient(90deg,#f2a14d,#ffc985)",pink:"linear-gradient(90deg,#e777a6,#f6a7c6)"}[c]||"linear-gradient(90deg,#f4b740,#ffd071)");
  const renderSubjects = () => {
    const priorityNotice=$("#priorityNotice");
    const priorityButton=$("#openPriority");
    if(priorityNotice && priorityButton){
      const configured=state.priorityOrder.length>0;
      priorityNotice.classList.toggle("priority-configured",configured);
      priorityButton.textContent=configured?"Update priorities":"Set priorities";
      const copy=priorityNotice.querySelector(".priority-notice-copy");
      if(copy) copy.innerHTML=configured?`<strong>Your subject priorities are active.</strong><span>${state.priorityOrder.map((id,index)=>`${index+1}. ${safeText(subjectName(id))}`).join(" · ")}. You can change this order anytime.</span>`:`<strong>Hey! I need your help setting my study priorities.</strong><span>Arrange your subjects from highest to lowest priority. I’ll use your choices to distribute your daily study time more intelligently.</span>`;
      priorityButton.disabled=state.subjects.length<2;
      priorityButton.title=state.subjects.length<2?"Add at least two subjects to set a priority order":"Set or update your subject priorities";
    }
    const grid=$("#subjectGrid");
    grid.innerHTML=state.subjects.length?state.subjects.map(s=>{
      const tasks=state.tasks.filter(t=>t.subject===s.id),done=tasks.filter(t=>t.done).length,pct=tasks.length?Math.round(done/tasks.length*100):0;
      const topics=state.topics.filter(t=>t.subjectId===s.id);
      const topicMarkup=topics.length?topics.map(topic=>`<div class="topic-row ${topic.completed?"topic-complete":""}"><span>${safeText(topic.title)}</span><div><button class="tiny-action" data-complete-topic="${topic.id}" title="${topic.completed?"Reopen topic":"Mark topic complete"}">${topic.completed?"↶":"✓"}</button><button class="tiny-action" data-delete-topic="${topic.id}" aria-label="Remove topic">×</button></div></div>`).join(""):`<p class="topic-empty">No topics added yet.</p>`;
      return `<article class="subject-card"><div class="subject-card-top"><div class="subject-icon color-${safeText(s.color)}">${safeText(s.icon||"✦")}</div><div><button class="tiny-action" data-delete-subject="${s.id}">Remove</button></div></div><h3>${safeText(s.name)}</h3><p>${topics.length} topic${topics.length===1?"":"s"} · ${tasks.length} task${tasks.length===1?"":"s"}</p><div class="subject-progress-top"><strong>Progress</strong><span>${done}/${tasks.length} completed · ${pct}%</span></div><div class="subject-bar"><span style="width:${pct}%;background:${colorGradient(s.color)}"></span></div><div class="topic-heading"><strong>Topics</strong><button class="small-link" data-add-topic="${s.id}">＋ Add topic</button></div><div class="topic-list">${topicMarkup}</div></article>`;
    }).join(""):empty("Create your first subject","Add a subject, then add the topics you want to cover. Set your total daily hours in your study profile.");
    const select=$("#taskSubject");const old=select.value;
    select.innerHTML=state.subjects.map(s=>`<option value="${s.id}">${safeText(s.name)}</option>`).join("");
    if(old&&subjectById(old))select.value=old;
    const topicSubject=$("#topicSubject");
    if(topicSubject){const topicOld=topicSubject.value;topicSubject.innerHTML=state.subjects.map(s=>`<option value="${s.id}">${safeText(s.name)}</option>`).join("");if(topicOld&&subjectById(topicOld))topicSubject.value=topicOld;}
    const total=totalDailyMinutes(), active=state.subjects.length;
    const summary=$("#dailyTimeSummary");
    if(summary) summary.innerHTML=`<div><span class="card-label">TOTAL DAILY STUDY TIME</span><strong>${formatMinutes(total)}</strong><small>${active} selected subject${active===1?"":"s"}</small></div><p>One daily time budget, distributed across your subjects and active topics. Your plan adjusts when tasks or priorities change; completed work and past days remain preserved.</p><button class="small-link" type="button" data-edit-daily-budget>✎ Change daily hours</button>`;
  };
  const renderWeekChart = target => {
    const now=new Date();const days=[];
    for(let i=6;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);const key=localDate(d);const count=state.tasks.filter(t=>t.done&&t.completedAt&&localDate(new Date(t.completedAt))===key).length;days.push({key,label:d.toLocaleDateString(undefined,{weekday:"short"}),count,today:i===0});}
    const max=Math.max(1,...days.map(d=>d.count));
    target.innerHTML=days.map(d=>`<div class="chart-day"><div class="bar-area"><div class="chart-bar ${d.count?"has-value":""} ${d.today?"today":""}" style="height:${Math.max(4,d.count/max*84)}%">${d.count?`<span>${d.count}</span>`:""}</div></div><label class="${d.today?"today-label":""}">${d.label}</label></div>`).join("");
  };
  const renderCalendar = () => {
    const y=calendarMonth.getFullYear(),m=calendarMonth.getMonth();
    $("#monthLabel").textContent=calendarMonth.toLocaleDateString(undefined,{month:"long",year:"numeric"});
    const first=new Date(y,m,1),start=new Date(y,m,1-first.getDay()),today=localDate();
    const days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    let html=days.map(d=>`<div class="calendar-day-label">${d}</div>`).join("");
    for(let i=0;i<42;i++){const d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i),key=localDate(d),events=state.tasks.filter(t=>t.dueDate===key).slice(0,2);html+=`<div class="calendar-cell ${d.getMonth()!==m?"muted":""} ${key===today?"today":""}"><span class="day-num">${d.getDate()}</span>${events.map(t=>`<span class="calendar-event ${t.done?"done-event":""}" title="${safeText(t.title)}">${safeText(t.title)}</span>`).join("")}${state.tasks.filter(t=>t.dueDate===key).length>2?`<span class="calendar-event">+${state.tasks.filter(t=>t.dueDate===key).length-2} more</span>`:""}</div>`;}
    $("#calendarGrid").innerHTML=html;
  };
  const achievementData = () => {
    const done=completedTasks().length;
    return [
      ["First Forge","Complete your first task",done>=1,"✦"],
      ["Five Wins","Complete 5 tasks",done>=5,"★"],
      ["Ten Wins","Complete 10 tasks",done>=10,"✧"],
      ["XP Collector","Earn 100 XP",state.xp>=100,"◈"],
      ["Level Three","Reach level 3",levelInfo().level>=3,"♜"],
      ["Subject Explorer","Create 4 subjects",state.subjects.length>=4,"▤"],
      ["Deep Work","Complete a task estimated at 60+ minutes",completedTasks().some(t=>t.minutes>=60),"◷"],
      ["Boss Slayer","Complete a boss task",completedTasks().some(t=>t.difficulty==="boss"),"⚡"],
      ["Comeback","Complete a task after a missed day",state.tasks.some(t=>t.done&&t.completedAt),"↗"]
    ];
  };
  const renderAchievements = () => {
    $("#achievementXp").textContent=`${state.xp||0} XP`;
    $("#achievementGrid").innerHTML=achievementData().map(a=>`<article class="achievement-card ${a[2]?"unlocked":"locked"}"><div class="medal">${a[3]}</div><strong>${a[0]}</strong><p>${a[1]}<br>${a[2]?"Unlocked!":"Not unlocked yet"}</p></article>`).join("");
  };
  const renderReports = () => {
    const done=completedTasks(),all=state.tasks.length,rate=all?Math.round(done.length/all*100):0;
    const minutes=done.reduce((n,t)=>n+(Number(t.minutes)||0),0);
    const today=localDate(),todayDone=state.tasks.filter(t=>t.done&&t.completedAt&&localDate(new Date(t.completedAt))===today).length;
    const cards=[["Tasks completed",done.length,"All-time completed tasks"],["Completion rate",`${rate}%`,"Completed / all tasks"],["Planned focus time",`${Math.floor(minutes/60)}h ${minutes%60}m`,"Estimated time on completed tasks"],["Wins today",todayDone,"Tasks completed today"]];
    $("#reportStats").innerHTML=cards.map(c=>`<article class="stat-card"><span>${c[0]}</span><strong>${c[1]}</strong><small>${c[2]}</small></article>`).join("");
    renderWeekChart($("#reportChart"));renderSubjectProgress($("#reportSubjects"));
  };
  const renderScheduleNotice = () => {
    const notice=$("#scheduleNotice"); if(!notice) return;
    const today=localDate(), plan=state.dailyPlans[today], total=totalDailyMinutes();
    const topicsReady=state.topics.some(topic=>!topic.completed&&subjectById(topic.subjectId));
    notice.className="schedule-notice";
    if(plan?.mode==="kickstart"){
      notice.classList.add("kickstart");
      notice.innerHTML=`<strong>Since only a few hours are left today, here are a few tasks to give you a kickstart!</strong><span>Today's starter plan: ${formatMinutes(plan.plannedMinutes)} across ${plan.taskIds.length} short task blocks. Your regular daily schedule begins with the next day.</span>`;
    } else if(!state.subjects.length || !topicsReady){
      notice.innerHTML=`<strong>Your daily plan starts with your subjects and topics.</strong><span>Set your total daily study time once, then add topics under your subjects. I’ll organise the rest when you choose today’s topics.</span>`;
    } else if(!state.dailyTopicSelections[today]) {
      notice.innerHTML=`<strong>Today’s topics are waiting for you.</strong><span>Choose what you want to study today. I won’t select topics on your behalf.</span><button class="small-link" type="button" data-open-daily-topics>Choose today’s topics →</button>`;
    } else {
      const planned=plan?.plannedMinutes||0;
      notice.innerHTML=`<strong>Today's allocation: ${formatMinutes(planned)} planned.</strong><span>Your total daily study budget is ${formatMinutes(total)}. You can edit today's topics and tasks; once the day passes, its record is locked at midnight.</span>`;
    }
  };
  const renderDashboard = () => {
    const info=levelInfo(),done=completedTasks(),today=localDate(),todayTasks=state.tasks.filter(t=>t.dueDate===today),todayDone=todayTasks.filter(t=>t.done).length,pct=todayTasks.length?Math.round(todayDone/todayTasks.length*100):0;
    $("#levelNumber").textContent=String(info.level).padStart(2,"0");$("#levelPill").textContent=`LEVEL ${info.level}`;
    $(".level-caption").textContent=LEVEL_NAMES[Math.min(info.level-1,LEVEL_NAMES.length-1)];
    $("#totalXp").textContent=state.xp||0;$("#nextXp").textContent=info.remaining;$("#xpBar").style.width=`${info.progress}%`;$("#levelProgress").textContent=`${info.progress}%`;
    $("#focusPercent").innerHTML=`${pct}<span>%</span>`;$("#focusDone").textContent=`${todayDone}/${todayTasks.length}`;$("#focusRing").style.background=`conic-gradient(#f4b740 ${pct*3.6}deg,#51452e 0deg)`;
    $("#focusMessage").textContent=todayTasks.length?(pct===100?"All today's tasks completed!":`${todayTasks.length-todayDone} task${todayTasks.length-todayDone===1?"":"s"} left today`):"Add a task to set today's focus.";
    $("#sideQuest").textContent=todayTasks.length?`${todayDone} of ${todayTasks.length} tasks complete`:"Start your first task";$("#sideQuestBar").style.width=`${pct}%`;$("#sideQuestText").textContent=todayTasks.length?"You're building momentum.":"Every small step counts.";
    renderWeekChart($("#weekChart"));renderSubjectProgress($("#subjectProgress"));
  };
  const renderAll = () => {
    document.body.classList.toggle("dark",state.theme==="dark");
    $("#todayDate").textContent=new Date().toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"});
    renderSubjects();renderTasks();renderScheduleNotice();renderDashboard();renderCalendar();renderAchievements();renderReports();
    const profile=(()=>{try{return JSON.parse(localStorage.getItem(`studyforge_profile_${activeUsername.toLowerCase()}`)||"{}")}catch{return {}}})();
    if($("#settingsName"))$("#settingsName").textContent=profile.displayName||activeUsername;
    if($("#settingsBoard"))$("#settingsBoard").textContent=`${profile.board||"Board not set"} · ${profile.grade||"Class not set"}${profile.state?` · ${profile.state}`:""}`;
    if($("#settingsHours"))$("#settingsHours").textContent=formatMinutes(totalDailyMinutes());
  };
  const setView = name => {
    if(!$("#view-"+name))return;
    currentView=name;$$(".view").forEach(v=>v.classList.toggle("active",v.id==="view-"+name));
    const botBubble=$("#studybotBubble");if(botBubble){const lines={settings:"Your profile and preferences live here. Your study data stays on this device in this version.",dashboard:"Your plan is ready. Take it one task at a time!",tasks:"Small, focused sessions add up. You can edit today's tasks whenever you need.",subjects:"Your subjects are yours to shape. Add the chapters you want to cover.",calendar:"A little planning today can make tomorrow easier.",achievements:"Every completed task is a real step forward. Keep building your streak!",reports:"Use your progress as feedback, not as a measure of your worth."};botBubble.textContent=lines[name]||lines.dashboard;}
    $$(".nav-item[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
    const label={dashboard:"Dashboard",tasks:"My tasks",subjects:"Subjects",calendar:"Study calendar",achievements:"Achievements",reports:"Progress reports",settings:"Settings"}[name]||"Dashboard";
    $("#viewCrumb").textContent=label;document.title=`${label} — STUDYFORGE`;
    $("#sidebar").classList.remove("open");window.scrollTo({top:0,behavior:"smooth"});
  };
  const resetTaskForm = () => {$("#taskForm").reset();editingTaskId=null;$("#taskModalTitle").textContent="Add a study task";$("#taskForm [name=dueDate]").value=localDate();$("#taskForm [name=difficulty]").value="medium";$("#taskForm [name=minutes]").value="25";$("#rewardPreview").textContent="NEXUS will calculate your XP reward";};
  const editTask = id => {const t=state.tasks.find(x=>x.id===id);if(!t)return;if(isTaskLocked(t)){toast("This day is locked. Past tasks can no longer be changed.","error");return;}editingTaskId=id;const f=$("#taskForm");f.elements.title.value=t.title;f.elements.subject.value=t.subject;f.elements.dueDate.value=t.dueDate;f.elements.difficulty.value=t.difficulty;f.elements.minutes.value=String(t.minutes);f.elements.kind.value=t.kind||"study";f.elements.notes.value=t.notes||"";$("#taskModalTitle").textContent="Edit study task";$("#rewardPreview").textContent=`You'll earn ${taskXP(t)} XP when completed`;openModal("taskModal");};
  const addTaskForSubject = id => {resetTaskForm();if(subjectById(id))$("#taskSubject").value=id;openModal("taskModal");};
  const completeTask = id => {
    const t=state.tasks.find(x=>x.id===id);if(!t||t.done)return;if(isTaskLocked(t)){toast("This day is locked. Its history is read-only.","error");renderAll();return;}
    t.done=true;t.completedAt=Date.now();const earned=taskXP(t);state.xp=(state.xp||0)+earned;state.completed=state.completed||[];state.completed.push({taskId:id,xp:earned,at:t.completedAt});rebalanceWithNotice(t.dueDate);save();renderAll();showVictory(t,earned);
  };
  const showVictory = (t,earned) => {
    $("#victoryTask").textContent=t.title;$("#victoryXp").textContent=earned;const box=$("#victoryOverlay");box.classList.add("open");box.setAttribute("aria-hidden","false");
    const conf=$("#confetti");conf.innerHTML="";const colors=["#8b79f5","#f5a2c7","#55c9aa","#ffbf69","#8bbcf4"];
    for(let i=0;i<48;i++){const p=document.createElement("i");p.className="confetti-piece";p.style.left=`${Math.random()*100}%`;p.style.background=colors[i%colors.length];p.style.animationDelay=`${Math.random()*.6}s`;p.style.transform=`rotate(${Math.random()*180}deg)`;conf.append(p);}
  };
  const closeVictory = () => {const box=$("#victoryOverlay");box.classList.remove("open");box.setAttribute("aria-hidden","true");};
  const deleteTask = id => {const t=state.tasks.find(x=>x.id===id);if(!t)return;if(isTaskLocked(t)){toast("This day is locked. Past tasks cannot be deleted.","error");return;}if(!confirm(`Delete "${t.title}"?${t.done?" Earned XP will remain in your lifetime total.":""}`))return;const date=t.dueDate;state.tasks=state.tasks.filter(x=>x.id!==id);const allocation=rebalanceWithNotice(date);syncDailyPlan(date);save();renderAll();toast(allocation.ok?"Task removed and its time redistributed.":"Task removed.");};
  const deleteSubject = id => {const s=subjectById(id);if(!s)return;const count=state.tasks.filter(t=>t.subject===id).length;if(!confirm(`Remove ${s.name}? ${count?`${count} task(s) will become unassigned.`:""} Its topics will also be removed.`))return;state.subjects=state.subjects.filter(x=>x.id!==id);state.priorityOrder=state.priorityOrder.filter(subjectId=>subjectId!==id);state.topics=state.topics.filter(topic=>topic.subjectId!==id);state.tasks.forEach(t=>{if(t.subject===id)t.subject="";});save();renderAll();toast("Subject removed.");};
  let editingSubjectId = null;
  let addingTopicForSubject = null;
  const iconForColor = c => ({violet:"✦",blue:"◈",mint:"✧",orange:"✎",pink:"♡"}[c]||"✦");
  const addSubjectModal = () => {const form=$("#subjectForm");form.reset();editingSubjectId=null;$("#subjectModalTitle").textContent="Add a subject";$("#subjectSubmit").textContent="Add subject";openModal("subjectModal");};
  let draftPriorityOrder=[];
  const openPriorityModal = () => {
    setBotMessage("Hey! I need your help with something. Which subjects would you like me to focus on the most? Arrange them from highest to lowest priority. I’ll use your choices to share your daily study time more intelligently. Let’s build your ideal study schedule together!");
    $("#priorityModalBot")?.classList.add("is-visible");
    if(state.subjects.length<2){toast("Add at least two subjects before setting a priority order.","error");return;}
    const validIds=state.subjects.map(subject=>subject.id);
    draftPriorityOrder=[...state.priorityOrder.filter(id=>validIds.includes(id)),...validIds.filter(id=>!state.priorityOrder.includes(id))];
    renderPriorityList();openModal("priorityModal");
  };
  const renderPriorityList = () => {
    const target=$("#priorityList");if(!target)return;
    target.innerHTML=draftPriorityOrder.map((id,index)=>{
      const subject=subjectById(id);if(!subject)return "";
      return `<div class="priority-item"><span class="priority-rank">${index+1}</span><div class="priority-subject"><strong>${safeText(subject.name)}</strong><small>${index===0?"Highest priority":index===draftPriorityOrder.length-1?"Lowest priority":"Priority position "+(index+1)}</small></div><div class="priority-controls"><button type="button" class="tiny-action" data-priority-up="${id}" aria-label="Move ${safeText(subject.name)} up" ${index===0?"disabled":""}>↑</button><button type="button" class="tiny-action" data-priority-down="${id}" aria-label="Move ${safeText(subject.name)} down" ${index===draftPriorityOrder.length-1?"disabled":""}>↓</button></div></div>`;
    }).join("");
  };
  const greetingForTime = () => { const hour = new Date().getHours(); return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"; };
  const setBotMessage = message => { const bubble=$("#studybotBubble"); if(bubble) bubble.textContent=message; };
  const renderDailyTopicChoices = () => {
    const target=$("#dailyTopicChoices"); if(!target)return;
    const date=localDate(), saved=state.dailyTopicText[date]||{};
    target.innerHTML=state.subjects.map(subject=>{
      const existing=(saved[subject.id]||[]).join(", ");
      return `<section class="daily-topic-group"><h3>${safeText(subject.name)}</h3><label class="daily-topic-entry"><span>What would you like to study in ${safeText(subject.name)} today?</span><textarea name="dailyTopicText" data-topic-subject="${safeText(subject.id)}" rows="2" placeholder="Type today's topics or chapters here…">${safeText(existing)}</textarea></label></section>`;
    }).join("");
  };
  const openDailyTopicPlanner = (automatic=false) => {
    if(!state.subjects.length){
      setBotMessage("I’m ready to plan your day! First, add your subjects. Then tell me what you’d like to study.");
      if(automatic){state.dailyTopicDismissed[localDate()]=true;save();}
      return;
    }
    renderDailyTopicChoices();
    $("#dailyTopicModalBot")?.classList.add("is-visible");
    setBotMessage(`${greetingForTime()}! Ready for another productive day? Tell me what you’d like to study today. Type your topics under each subject, and I’ll organise your tasks around your priorities and available study time.`);
    openModal("dailyTopicModal");
  };
  const applyDailyTopicSelection = entries => {
    const date=localDate(), selected=[], textBySubject={};
    entries.forEach(({subjectId,text})=>{
      if(!subjectById(subjectId))return;
      const titles=[...new Set(String(text||"").split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean))];
      textBySubject[subjectId]=titles;
      titles.forEach(title=>{
        let topic=state.topics.find(item=>item.subjectId===subjectId&&item.title.toLowerCase()===title.toLowerCase());
        if(!topic){topic={id:uid(),subjectId,title,completed:false,createdAt:Date.now(),dailyEntry:true};state.topics.push(topic);}
        else if(topic.completed) topic.completed=false;
        selected.push(topic.id);
      });
    });
    const chosen=[...new Set(selected)];
    if(!chosen.length){toast("Type at least one topic under a subject, or choose Not now.","error");return false;}
    state.dailyTopicText[date]=textBySubject;
    state.dailyTopicSelections[date]=chosen; delete state.dailyTopicDismissed[date];
    const oldPlan=state.dailyPlans[date];
    if(oldPlan){
      const preserved=state.tasks.filter(task=>task.dueDate===date&&(task.done||!task.generated));
      const preservedIds=new Set(preserved.map(task=>task.id));
      state.tasks=state.tasks.filter(task=>task.dueDate!==date||preservedIds.has(task.id));
      delete state.dailyPlans[date];generateDailyPlan(date);
      const plan=state.dailyPlans[date];
      if(plan){plan.taskIds=[...new Set([...plan.taskIds,...preserved.map(task=>task.id)])];plan.allocationBudget=oldPlan.allocationBudget||plan.allocationBudget;rebalanceDate(date);}
    } else generateDailyPlan(date);
    save();closeModal($("#dailyTopicModal"));renderAll();
    setBotMessage("Lovely! I’ve built today’s plan around the topics you typed, your subject priorities, and your available study time. You can update them anytime today.");
    toast("Today's topics saved and your study plan updated.");return true;
  };
  const maybePromptDailyTopics = () => {
    const date=localDate();
    if(state.dailyTopicSelections[date] || state.dailyTopicDismissed[date])return;
    if(!state.subjects.length)return;
    openDailyTopicPlanner(true);
  };
  const editSubject = id => {const subject=subjectById(id);if(!subject)return;const form=$("#subjectForm");editingSubjectId=id;form.elements.name.value=subject.name;$("#subjectModalTitle").textContent="Update subject";$("#subjectSubmit").textContent="Save changes";openModal("subjectModal");};
  const addTopicModal = subjectId => {const form=$("#topicForm");form.reset();addingTopicForSubject=subjectId||null;renderSubjects();if(subjectId)$("#topicSubject").value=subjectId;openModal("topicModal");};
  const openTaskModal = () => {resetTaskForm();if(!state.subjects.length){toast("Add a subject before creating a task.","error");setView("subjects");return;}openModal("taskModal");};
  document.addEventListener("click",e=>{
    const priorityUp=e.target.closest("[data-priority-up]");if(priorityUp){const i=draftPriorityOrder.indexOf(priorityUp.dataset.priorityUp);if(i>0){[draftPriorityOrder[i-1],draftPriorityOrder[i]]=[draftPriorityOrder[i],draftPriorityOrder[i-1]];renderPriorityList();}return;}
    const priorityDown=e.target.closest("[data-priority-down]");if(priorityDown){const i=draftPriorityOrder.indexOf(priorityDown.dataset.priorityDown);if(i>=0&&i<draftPriorityOrder.length-1){[draftPriorityOrder[i+1],draftPriorityOrder[i]]=[draftPriorityOrder[i],draftPriorityOrder[i+1]];renderPriorityList();}return;}
    const dailyTopics=e.target.closest("[data-open-daily-topics]");if(dailyTopics){openDailyTopicPlanner(false);return;}
    const budgetEdit=e.target.closest("[data-edit-daily-budget]");if(budgetEdit){const current=(totalDailyMinutes()/60).toString();const answer=prompt("Total study hours available per day (0.5 to 24):",current);if(answer===null)return;const hours=Number(answer);if(!Number.isFinite(hours)||hours<.5||hours>24){toast("Enter a value between 0.5 and 24 hours.","error");return;}state.dailyStudyMinutes=Math.round(hours*60);Object.entries(state.dailyPlans).forEach(([date,plan])=>{if(date>=localDate()&&plan.mode!=="kickstart")plan.allocationBudget=state.dailyStudyMinutes;});try{const profile=JSON.parse(localStorage.getItem(`studyforge_profile_${activeUsername.toLowerCase()}`)||"{}");profile.dailyStudyMinutes=state.dailyStudyMinutes;localStorage.setItem(`studyforge_profile_${activeUsername.toLowerCase()}`,JSON.stringify(profile));}catch{}[...new Set(state.tasks.filter(task=>task.dueDate>=localDate()).map(task=>task.dueDate))].forEach(date=>rebalanceWithNotice(date));save();renderAll();toast("Daily study budget updated and unfinished tasks redistributed.");return;}
    const nav=e.target.closest("[data-view]");if(nav){setView(nav.dataset.view);return;}
    const go=e.target.closest("[data-goto]");if(go){setView(go.dataset.goto);return;}
    const check=e.target.closest("[data-complete]");if(check){if(check.checked)completeTask(check.dataset.complete);else{const t=state.tasks.find(x=>x.id===check.dataset.complete);if(t&&confirm("Mark this task as not completed? Previously earned XP will remain in your total.")){t.done=false;t.completedAt=null;rebalanceWithNotice(t.dueDate);save();renderAll();toast("Task moved back to in progress and time was redistributed.");}else renderAll();}return;}
    const edit=e.target.closest("[data-edit]");if(edit){editTask(edit.dataset.edit);return;}
    const del=e.target.closest("[data-delete]");if(del){deleteTask(del.dataset.delete);return;}
    const delSub=e.target.closest("[data-delete-subject]");if(delSub){deleteSubject(delSub.dataset.deleteSubject);return;}
    const editSub=e.target.closest("[data-edit-subject]");if(editSub){editSubject(editSub.dataset.editSubject);return;}
    const addTopic=e.target.closest("[data-add-topic]");if(addTopic){addTopicModal(addTopic.dataset.addTopic);return;}
    const doneTopic=e.target.closest("[data-complete-topic]");if(doneTopic){const topic=topicById(doneTopic.dataset.completeTopic);if(topic){topic.completed=!topic.completed;topic.completedAt=topic.completed?Date.now():null;save();renderAll();toast(topic.completed?"Topic marked complete. It will leave future daily plans.":"Topic reopened for future plans.");}return;}
    const removeTopic=e.target.closest("[data-delete-topic]");if(removeTopic){const topic=topicById(removeTopic.dataset.deleteTopic);if(topic&&confirm(`Remove topic "${topic.title}"? Existing daily records will remain.`)){state.topics=state.topics.filter(x=>x.id!==topic.id);save();renderAll();toast("Topic removed.");}return;}
    if(e.target.closest(".close-modal")){closeModal(e.target);return;}
  });
  $("#taskFilters").addEventListener("click",e=>{const b=e.target.closest("[data-filter]");if(!b)return;taskFilter=b.dataset.filter;$$(".filter",$("#taskFilters")).forEach(x=>x.classList.toggle("active",x===b));renderTasks();});
  $("#quickAdd").addEventListener("click",()=>{if(!state.subjects.length){setView("subjects");toast("Add a subject first. Your total daily hours are set in your profile.");return;}addTopicModal();});$("#addTaskBtn").addEventListener("click",openTaskModal);$("#calendarAdd").addEventListener("click",openTaskModal);
  $("#addSubjectBtn").addEventListener("click",addSubjectModal);
  $("#openPriority")?.addEventListener("click",openPriorityModal);
  $("#dailyTopicForm")?.addEventListener("submit",e=>{e.preventDefault();applyDailyTopicSelection($$("[data-topic-subject]",e.currentTarget).map(input=>({subjectId:input.dataset.topicSubject,text:input.value})));});
  $("#skipDailyTopics")?.addEventListener("click",()=>{state.dailyTopicDismissed[localDate()]=true;save();closeModal($("#dailyTopicModal"));setBotMessage("No problem! I won’t choose topics for you. Today’s plan will stay as it is until you tell me what you’d like to study.");});
  $("#savePriority")?.addEventListener("click",()=>{
    if(draftPriorityOrder.length!==state.subjects.length||draftPriorityOrder.some(id=>!subjectById(id))){toast("Please rank every selected subject.","error");return;}
    state.priorityOrder=[...draftPriorityOrder];
    const dates=[...new Set(state.tasks.filter(task=>task.dueDate>=localDate()).map(task=>task.dueDate))];
    dates.forEach(date=>rebalanceWithNotice(date));
    save();closeModal($("#priorityModal"));renderAll();toast("Priority order saved. Your study allocations have been updated.");
  });
  const updateRewardPreview = () => {
    const f = $("#taskForm");
    const estimate = taskXP({difficulty:f.elements.difficulty.value,subject:f.elements.subject.value,minutes:Number(f.elements.minutes.value)||25});
    $("#rewardPreview").textContent = `NEXUS will award ${estimate} XP when completed`;
  };
  ["difficulty","subject","minutes"].forEach(name => $("#taskForm").elements[name].addEventListener("input",updateRewardPreview));
  ["difficulty","subject","minutes"].forEach(name => $("#taskForm").elements[name].addEventListener("change",updateRewardPreview));
  $("#taskForm").addEventListener("submit",e=>{
    e.preventDefault();const f=e.currentTarget;if(!f.reportValidity())return;
    const title=f.elements.title.value.trim();if(!title)return;
    const data={title,subject:f.elements.subject.value,dueDate:f.elements.dueDate.value,difficulty:f.elements.difficulty.value,minutes:Number(f.elements.minutes.value),kind:f.elements.kind.value,notes:f.elements.notes.value.trim()};
    if(!subjectById(data.subject)){toast("Please choose a valid subject.","error");return;}
    if(data.dueDate<localDate()){toast("You cannot create or move tasks into a locked day.","error");return;}
    const planBudget=Number(state.dailyPlans[data.dueDate]?.allocationBudget)||totalDailyMinutes();
    const dateTasks=state.tasks.filter(task=>task.dueDate===data.dueDate&&task.id!==editingTaskId);
    const otherCompleted=dateTasks.filter(task=>task.done).reduce((sum,task)=>sum+(Number(task.minutes)||0),0);
    const otherOpenCount=dateTasks.filter(task=>!task.done).length;
    if(data.minutes+otherCompleted+otherOpenCount>planBudget){toast(`This duration leaves too little time for the other ${otherOpenCount} unfinished task(s) within the ${planBudget}-minute daily allocation.`,"error");return;}
    let previousDate=null,anchorId=editingTaskId;
    if(editingTaskId){const t=state.tasks.find(x=>x.id===editingTaskId);if(t){previousDate=t.dueDate;Object.assign(t,data);syncDailyPlan(previousDate);}}
    else{anchorId=uid();state.tasks.push({id:anchorId,...data,done:false,createdAt:Date.now(),completedAt:null});}
    if(previousDate && previousDate!==data.dueDate)rebalanceWithNotice(previousDate);
    const allocation=rebalanceWithNotice(data.dueDate,anchorId);
    syncDailyPlan(data.dueDate);save();closeModal(f);renderAll();
    toast(allocation.ok?(editingTaskId?"Task updated and remaining study time redistributed.":"Task added and study time redistributed."):"Task saved, but the daily task count exceeds the available minutes.",allocation.ok?"success":"error");
  });
  $("#subjectForm").addEventListener("submit",e=>{
    e.preventDefault();const f=e.currentTarget,name=f.elements.name.value.trim();
    if(!name)return;
    if(state.subjects.some(subject=>subject.name.toLowerCase()===name.toLowerCase()&&subject.id!==editingSubjectId)){toast("That subject already exists.","error");return;}
    if(editingSubjectId){const subject=subjectById(editingSubjectId);if(subject){subject.name=name;toast("Subject updated.");}}
    else{const palette=["violet","blue","mint","orange","pink"],color=palette[state.subjects.length%palette.length],id=uid();state.subjects.push({id,name,color,icon:iconForColor(color),topicCursor:0});if(state.priorityOrder.length)state.priorityOrder.push(id);toast(`${name} added. Now add its topics.`);}
    save();closeModal(f);renderAll();
  });
  $("#topicForm").addEventListener("submit",e=>{
    e.preventDefault();const f=e.currentTarget,title=f.elements.title.value.trim(),subjectId=f.elements.subject.value;
    if(!title||!subjectById(subjectId))return;
    if(state.topics.some(topic=>topic.subjectId===subjectId&&topic.title.toLowerCase()===title.toLowerCase())){toast("That topic already exists for this subject.","error");return;}
    state.topics.push({id:uid(),subjectId,title,completed:false,createdAt:Date.now()});
    save();closeModal(f);renderAll();
    if(state.dailyPlans[localDate()])toast("Topic added. It will enter tomorrow's generated plan; today's schedule stays unchanged.");else{ensureDailyPlan();renderAll();toast("Topic added to your study plan.");}
  });
  $("#prevMonth").addEventListener("click",()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1);renderCalendar();});
  $("#nextMonth").addEventListener("click",()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1);renderCalendar();});
  $("#themeToggle").addEventListener("click",()=>{state.theme=state.theme==="dark"?"light":"dark";save();renderAll();});
  $("#mobileMenu").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
  $("#victoryClose").addEventListener("click",closeVictory);$("#victoryOverlay").addEventListener("click",e=>{if(e.target.id==="victoryOverlay")closeVictory();});
  const resetPlanner=()=>{if(confirm("Clear all your local STUDYFORGE subjects, topics, tasks and progress? This cannot be undone.")){state=emptyState();save();taskFilter="all";renderAll();setView("dashboard");toast("Your planner is now empty and ready for your own subjects and topics.");}};
  $("#resetData").addEventListener("click",resetPlanner);$("#settingsReset")?.addEventListener("click",resetPlanner);
  // Logging out clears only the active account session; the student's local data remains saved.
  $("#logoutButton")?.addEventListener("click",()=>{
    if(!confirm("Log out of STUDYFORGE? Your study data will remain saved on this device.")) return;
    if (window.studyforgeCloudSignOut) {
      window.studyforgeCloudSignOut().then(()=>location.replace("auth.html")).catch(()=>toast("Could not complete cloud sign-out. Check your connection and try again.","error"));
    } else {
      localStorage.removeItem("studyforge_local_active_user");
      location.replace("auth.html");
    }
  });
  $$(".modal-backdrop").forEach(b=>b.addEventListener("click",e=>{if(e.target===b)closeModal(e.target);}));
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){ $$(".modal-backdrop.open").forEach(closeModal);closeVictory();$("#sidebar").classList.remove("open");}});
  if(!localStorage.getItem(STORAGE_KEY)){save();}
  ensureDailyPlan();
  // On-device account label and logout action.
  const profileMini = $(".profile-mini");
  if (profileMini && activeUsername !== "guest") {
    const profile = JSON.parse(localStorage.getItem(`studyforge_profile_${activeUsername.toLowerCase()}`) || "null");
    const strong = $("strong", profileMini);
    const subline = $("span", profileMini);
    if (strong) strong.textContent = profile?.displayName || activeUsername;
    if (subline) subline.textContent = `${profile?.grade || "Student"} · On-device account`;
  }
  const themeStore = () => localStorage.setItem(`studyforge_theme_${activeUsername.toLowerCase()}`, state.theme || "light");
  const originalSave = save;
  // Persist the selected theme for the credits page to reuse.
  $("#themeToggle")?.addEventListener("click", () => setTimeout(themeStore, 0));
  renderAll();

  // STUDYBOT companion: deterministic, event-based messages only.
  const botMessages={settings:"Your profile and preferences live here. Your study data stays on this device in this version.",dashboard:"Your plan is ready. Take it one task at a time!",tasks:"Small, focused sessions add up. You can edit today's tasks whenever you need.",subjects:"Your subjects are yours to shape. Add the chapters you want to cover.",calendar:"A little planning today can make tomorrow easier.",achievements:"Every completed task is a real step forward. Keep building your streak!",reports:"Use your progress as feedback, not as a measure of your worth."};
  const companion=document.createElement('aside');companion.className='studybot-float';companion.innerHTML='<img src="assets/studybot.png" alt="StudyBot"><div class="studybot-bubble" id="studybotBubble">Your plan is ready. Take it one task at a time!</div><button type="button" class="studybot-close" aria-label="Hide StudyBot">×</button>';
  document.body.appendChild(companion);companion.querySelector('.studybot-close').onclick=()=>companion.classList.toggle('minimised');
  setTimeout(maybePromptDailyTopics, 850);
  const originalSetView=setView;
  // Animate the visible view change without changing planner state.
  document.querySelectorAll('[data-goto], [data-view]').forEach(el=>el.addEventListener('click',()=>{const v=el.dataset.goto||el.dataset.view;setTimeout(()=>{const bubble=$('#studybotBubble');if(bubble)bubble.textContent=botMessages[v]||botMessages.dashboard;},80)}));
  // NEXUS guided walkthrough: only newly created profiles (explicit false) auto-start.
  // Existing profiles without the field are treated as returning users.
  (() => {
    const profileKey=`studyforge_profile_${activeUsername.toLowerCase()}`;
    const readProfile=()=>{try{return JSON.parse(localStorage.getItem(profileKey)||'{}')||{}}catch{return {}}};
    const steps=[
      {view:'dashboard',target:'.welcome-row',title:'Welcome to SAMORAQ!',message:"Hey there! Welcome to SAMORAQ! I'm NEXUS, your guide around here. Before you begin, let me show you what SAMORAQ has to offer and how you can make the most of it. Ready? Let's explore!"},
      {view:'dashboard',target:'.hero-grid',title:'Your dashboard',message:'This is your home base. See your level, XP, today’s focus, missions, weekly consistency and subject progress at a glance.'},
      {view:'tasks',target:'#view-tasks .filter-row',title:'Study tasks and quests',message:'Your tasks turn big study goals into manageable actions. Filter by due date or status, open a task to see its details, and mark it complete when you finish. Completing eligible tasks earns XP.'},
      {view:'subjects',target:'#view-subjects #dailyTimeSummary',title:'Subjects and academic goals',message:'Keep your subjects organised here. Set your total daily study time and subject priorities, then add the chapters or topics you want to work through. Your choices can be updated as your goals change.'},
      {view:'achievements',target:'#view-achievements .achievement-summary',title:'XP and achievements',message:'Every completed task adds XP based on its difficulty and estimated time. Your XP contributes to your level, while Achievements lets you review the rewards you have earned.'},
      {view:'reports',target:'#view-reports #reportStats',title:'Your progress, made visible',message:'Progress Reports help you review your recent activity and subject breakdown. Use the information to adjust your plan—not to judge yourself.'},
      {view:'calendar',target:'#view-calendar .calendar-panel',title:'Plan ahead with your calendar',message:'The Study Calendar gives you a date-based view of upcoming work. Move between months and add tasks when you want to plan ahead. That’s the tour—your study journey starts whenever you’re ready!'}
    ];
    let index=0,backdrop=null,dialog=null,highlight=null,busy=false;
    const clearHighlight=()=>{if(highlight){highlight.classList.remove('nexus-tour-highlight');highlight=null;}};
    const closeUI=()=>{clearHighlight();backdrop?.remove();dialog?.remove();backdrop=dialog=null;document.body.classList.remove('nexus-tour-open');};
    const persistCompletion=async()=>{
      const client=window.studyforgeSupabase;
      if(!client)throw new Error('Your secure account connection is unavailable. Please refresh and try again.');
      const {data:{user},error:userError}=await client.auth.getUser();
      if(userError||!user)throw new Error('Your session could not be verified. Please sign in again.');
      const next={...readProfile(),has_completed_tour:true};
      const {error}=await client.from('student_profiles').update({profile:next,updated_at:new Date().toISOString()}).eq('user_id',user.id);
      if(error)throw new Error('Could not save tour completion: '+error.message);
      localStorage.setItem(profileKey,JSON.stringify(next));
    };
    const render=()=>{
      clearHighlight();const step=steps[index];setView(step.view);
      const target=document.querySelector(step.target);
      if(target){highlight=target;target.classList.add('nexus-tour-highlight');setTimeout(()=>{const r=target.getBoundingClientRect();if(r.top<12||r.bottom>window.innerHeight-210)target.scrollIntoView({behavior:'smooth',block:'center'});},80);}
      if(!dialog)return;
      dialog.querySelector('.nexus-tour-kicker').textContent=`NEXUS WALKTHROUGH · ${index+1} OF ${steps.length}`;
      dialog.querySelector('h2').textContent=step.title;
      dialog.querySelector('.nexus-tour-message').textContent=step.message;
      dialog.querySelector('.nexus-tour-back').disabled=index===0;
      dialog.querySelector('.nexus-tour-back').style.opacity=index===0?'.45':'1';
      dialog.querySelector('.nexus-tour-next').textContent=index===steps.length-1?'Finish tour':'Next →';
      dialog.querySelector('.nexus-tour-error').textContent='';
      dialog.querySelector('.nexus-tour-meta span').textContent=`Step ${index+1} of ${steps.length}`;
    };
    const start=()=>{
      if(dialog)return;index=0;
      backdrop=document.createElement('div');backdrop.className='nexus-tour-backdrop';backdrop.setAttribute('aria-hidden','true');
      dialog=document.createElement('section');dialog.className='nexus-tour-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','NEXUS guided walkthrough');
      dialog.innerHTML=`<img src="assets/studybot.png" alt="NEXUS assistant"><div class="nexus-tour-copy"><div class="nexus-tour-kicker"></div><h2></h2><p class="nexus-tour-message"></p><div class="nexus-tour-meta"><span></span><span>LEARN SMARTER · GROW STRONGER</span></div><div class="nexus-tour-actions"><button type="button" class="nexus-tour-back">← Back</button><button type="button" class="nexus-tour-next">Next →</button><button type="button" class="nexus-tour-skip">Skip tour</button></div><div class="nexus-tour-error" role="status" aria-live="polite"></div></div>`;
      document.body.append(backdrop,dialog);document.body.classList.add('nexus-tour-open');
      dialog.querySelector('.nexus-tour-back').addEventListener('click',()=>{if(index>0){index--;render();}});
      dialog.querySelector('.nexus-tour-next').addEventListener('click',async()=>{if(busy)return;if(index<steps.length-1){index++;render();return;}await finish();});
      dialog.querySelector('.nexus-tour-skip').addEventListener('click',async()=>{if(busy)return;await finish();});
      render();dialog.querySelector('.nexus-tour-next').focus();
    };
    const finish=async()=>{
      busy=true;const next=dialog.querySelector('.nexus-tour-next'),skip=dialog.querySelector('.nexus-tour-skip');next.disabled=true;skip.disabled=true;next.textContent='Saving…';
      try{await persistCompletion();closeUI();setView('dashboard');setBotMessage('You’re all set! If you ever need a refresher, replay this walkthrough from Settings.');}
      catch(error){dialog.querySelector('.nexus-tour-error').textContent=error.message;next.disabled=false;skip.disabled=false;next.textContent=index===steps.length-1?'Try again':'Next →';}
      finally{busy=false;}
    };
    document.querySelector('#replayNexusTour')?.addEventListener('click',()=>{if(!dialog)start();});
    const initial=readProfile();
    if(initial.has_completed_tour===false){setTimeout(start,950);}
  })();
  const transition=document.createElement('div');transition.className='page-transition';transition.innerHTML='<div class="transition-orb">✦</div><strong>SAMORAQ</strong><span>Preparing your study space…</span>';document.body.appendChild(transition);
  document.body.classList.add('sf-enter');setTimeout(()=>{document.body.classList.remove('sf-enter');transition.classList.add('done');setTimeout(()=>transition.remove(),500)},650);
  // Keep an already-open dashboard aligned with the user's local midnight boundary.
  // The date check is cheap; a new plan is generated only when the local day changes.
  setInterval(() => {
    if (localDate() !== activeLocalDate) {
      ensureDailyPlan();
      renderAll();
      maybePromptDailyTopics();
      toast("A new study day has begun. Yesterday's plan is now locked.");
    }
  }, 15000);
})();