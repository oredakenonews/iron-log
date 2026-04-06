import { useState, useEffect, useRef } from "react";
import { supabase } from './supabaseClient';

const INTERVAL_SEC = 120;

function playBeep(audioCtx) {
  [0, 0.4, 0.8].forEach(offset => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.frequency.value = 880; osc.type = "sine";
    gain.gain.setValueAtTime(0.7, audioCtx.currentTime + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + offset + 0.3);
    osc.start(audioCtx.currentTime + offset);
    osc.stop(audioCtx.currentTime + offset + 0.35);
  });
}

const DEFAULT_EXERCISES = [
  { name:"ベンチプレス", weight_min:1, reps_step:1, reps_max:20 },
  { name:"スクワット", weight_min:1, reps_step:1, reps_max:20 },
  { name:"サイドレイズ", weight_min:1, reps_step:1, reps_max:20 },
  { name:"ラットプルダウン", weight_min:1, reps_step:1, reps_max:20 },
  { name:"マシンベンチプレス", weight_min:1, reps_step:1, reps_max:20 },
  { name:"ラテラルレイズ", weight_min:1, reps_step:1, reps_max:20 },
  { name:"自重スクワット", weight_min:0, reps_step:5, reps_max:50 },
  { name:"プッシュアップ", weight_min:0, reps_step:5, reps_max:50 },
  { name:"デッドリフト", weight_min:1, reps_step:1, reps_max:20 },
  { name:"ショルダープレス", weight_min:1, reps_step:1, reps_max:20 },
  { name:"レッグプレス", weight_min:1, reps_step:1, reps_max:20 },
  { name:"ダンベルカール", weight_min:1, reps_step:1, reps_max:20 },
  { name:"ベントオーバーロウ", weight_min:1, reps_step:1, reps_max:20 },
  { name:"トライセプスプレス", weight_min:1, reps_step:1, reps_max:20 },
  { name:"ケーブルクロス", weight_min:1, reps_step:1, reps_max:20 },
  { name:"レッグカール", weight_min:1, reps_step:1, reps_max:20 },
  { name:"チェストフライ", weight_min:1, reps_step:1, reps_max:20 },
  { name:"インクラインプレス", weight_min:1, reps_step:1, reps_max:20 },
  { name:"ディップス", weight_min:1, reps_step:1, reps_max:20 },
  { name:"チンニング", weight_min:1, reps_step:1, reps_max:20 },
  { name:"レッグエクステンション", weight_min:1, reps_step:1, reps_max:20 },
];

const STORAGE_KEY = "gym-tracker-v2";
const TODAY = (() => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
})();

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
}
function shortDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric" });
}

async function loadUserExercises(userId) {
  const { data } = await supabase
    .from('user_exercises')
    .select('*')
    .eq('user_id', userId)
    .order('order');
  if (data && data.length > 0) return data;
  // 新規ユーザー: デフォルト種目を登録
  const rows = DEFAULT_EXERCISES.map((e, i) => ({ ...e, user_id: userId, order: i }));
  const { data: inserted } = await supabase.from('user_exercises').insert(rows).select();
  return inserted || [];
}

async function loadProfile(userId) {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
  return data || { height_cm: '', weight_kg: '' };
}

async function saveProfile(userId, height_cm) {
  await supabase.from('profiles').upsert({ id: userId, height_cm, updated_at: new Date().toISOString() });
}

async function loadBodyWeights(userId) {
  const { data } = await supabase
    .from('body_weights')
    .select('date, weight_kg')
    .eq('user_id', userId)
    .order('date', { ascending: true });
  return data || [];
}

async function loadData(userId) {
  try {
    const { data, error } = await supabase
      .from('workout_sessions')
      .select('date, exercises')
      .eq('user_id', userId);
    if (error) throw error;
    const sessions = {};
    data.forEach(row => { sessions[row.date] = { date: row.date, exercises: row.exercises }; });
    return sessions;
  } catch {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }
}


function LineChart({ data, color }) {
  if (!data || data.length < 2) return (
    <div style={{textAlign:"center",color:"#bbb",padding:"20px 0",fontSize:15,fontWeight:600}}>
      2回以上記録するとグラフが表示されます
    </div>
  );
  const W = 340, H = 150, padL = 52, padR = 12, padT = 16, padB = 36;
  const vals = data.map(d => d.value);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = maxV - minV || 1;
  const toX = i => padL + (i / (data.length - 1)) * (W - padL - padR);
  const toY = v => padT + (1 - (v - minV) / range) * (H - padT - padB);
  const points = data.map((d, i) => `${toX(i)},${toY(d.value)}`).join(" ");
  const areaPoints = `${toX(0)},${H-padB} ` + points + ` ${toX(data.length-1)},${H-padB}`;
  const yLabels = [minV, minV + range/2, maxV].map(v => Math.round(v));
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
      {[0,0.5,1].map((t,i) => (
        <line key={i} x1={padL} x2={W-padR} y1={padT+t*(H-padT-padB)} y2={padT+t*(H-padT-padB)} stroke="#eee" strokeWidth="1.5"/>
      ))}
      {yLabels.map((v,i) => (
        <text key={i} x={padL-8} y={padT+(1-i*0.5)*(H-padT-padB)+5} fill="#aaa" fontSize="13" fontWeight="700" textAnchor="end">{v}</text>
      ))}
      <polygon points={areaPoints} fill={color} opacity="0.1"/>
      <polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>
      {data.map((d,i) => (
        <circle key={i} cx={toX(i)} cy={toY(d.value)} r="5" fill={color} stroke="#fff" strokeWidth="2.5"/>
      ))}
      {data.map((d,i) => {
        const show = i===0 || i===data.length-1 || (data.length>4 && i===Math.floor(data.length/2));
        if (!show) return null;
        return <text key={i} x={toX(i)} y={H-padB+18} fill="#aaa" fontSize="12" fontWeight="700" textAnchor="middle">{shortDate(d.date)}</text>;
      })}
    </svg>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [tab, setTab] = useState("record");
  const [sessions, setSessions] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const [hasLocalData, setHasLocalData] = useState(false);
  const [userExercises, setUserExercises] = useState([]);
  const [profile, setProfile] = useState({ height_cm: '' });
  const [profileSaved, setProfileSaved] = useState(false);
  const [newExName, setNewExName] = useState('');
  const [bodyWeights, setBodyWeights] = useState([]);
  const [weightDate, setWeightDate] = useState(TODAY);
  const [weightInput, setWeightInput] = useState('');
  const [weightSaved, setWeightSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      try { if (Object.keys(JSON.parse(local)).length > 0) setHasLocalData(true); } catch {}
    }
    Promise.all([
      loadData(user.id),
      loadUserExercises(user.id),
      loadProfile(user.id),
      loadBodyWeights(user.id),
    ]).then(([sessions, exercises, prof, weights]) => {
      setSessions(sessions);
      setUserExercises(exercises);
      setProfile({ height_cm: prof.height_cm ?? '' });
      setBodyWeights(weights);
      // 最新の体重を入力欄の初期値に
      if (weights.length > 0) setWeightInput(String(weights[weights.length - 1].weight_kg));
      setLoaded(true);
    });
  }, [user]);
  const [pickingExercise, setPickingExercise] = useState(false);
  const [pickingEditExercise, setPickingEditExercise] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [setInputs, setSetInputs] = useState({});
  const [timerEnabled, setTimerEnabled] = useState(() => localStorage.getItem('timer-enabled') !== 'false');
  const [timerSec, setTimerSec] = useState(null);
  const [showTimer, setShowTimer] = useState(false);
  const [chartExercise, setChartExercise] = useState(null);
  const [chartMetric, setChartMetric] = useState("volume");
  const [editingDate, setEditingDate] = useState(null);
  const [editSetInputs, setEditSetInputs] = useState({});
  const [historyMonth, setHistoryMonth] = useState(() => TODAY.slice(0, 7));
  const timerRef = useRef(null);
  const audioCtxRef = useRef(null);

  useEffect(() => {
    if (timerSec === null) return;
    if (timerSec <= 0) {
      try {
        if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        playBeep(audioCtxRef.current);
      } catch {}
      timerRef.current = setTimeout(() => setTimerSec(null), 3000);
      return;
    }
    timerRef.current = setTimeout(() => setTimerSec(s => s-1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [timerSec]);

  const startTimer = () => {
    if (!timerEnabled) return;
    clearTimeout(timerRef.current);
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    } catch {}
    setTimerSec(INTERVAL_SEC); setShowTimer(true);
  };
  const toggleTimer = (val) => {
    setTimerEnabled(val);
    localStorage.setItem('timer-enabled', val);
    if (!val) stopTimer();
  };
  const stopTimer = () => { clearTimeout(timerRef.current); setTimerSec(null); setShowTimer(false); };

  const [migrating, setMigrating] = useState(false);
  const [migrateError, setMigrateError] = useState('');
  const migrateFromLocal = async () => {
    setMigrating(true); setMigrateError('');
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { setMigrating(false); return; }
      const localSessions = JSON.parse(raw);
      const rows = Object.values(localSessions).map(s => ({
        user_id: user.id,
        date: s.date,
        exercises: s.exercises,
      }));
      console.log('[migrate] rows to upsert:', rows);
      if (rows.length === 0) { setMigrating(false); return; }
      const { error } = await supabase
        .from('workout_sessions')
        .upsert(rows, { onConflict: 'user_id,date' });
      if (error) {
        console.error('[migrate] upsert error:', error);
        setMigrateError(error.message);
        setMigrating(false);
        return;
      }
      localStorage.removeItem(STORAGE_KEY);
      setHasLocalData(false);
      const d = await loadData(user.id);
      setSessions(d);
    } catch (e) {
      console.error('[migrate] unexpected error:', e);
      setMigrateError(e.message);
    }
    setMigrating(false);
  };

  const getExSetting = (name) =>
    userExercises.find(e => e.name === name) || { weight_min: 1, reps_step: 1, reps_max: 20 };

  const handleSaveProfile = async () => {
    await saveProfile(user.id, Number(profile.height_cm) || null);
    setProfileSaved(true); setTimeout(() => setProfileSaved(false), 1500);
  };

  const handleSaveWeight = async () => {
    if (!weightInput || !weightDate) return;
    const kg = Number(weightInput);
    await supabase.from('body_weights').upsert(
      { user_id: user.id, date: weightDate, weight_kg: kg },
      { onConflict: 'user_id,date' }
    );
    setBodyWeights(prev => {
      const filtered = prev.filter(w => w.date !== weightDate);
      return [...filtered, { date: weightDate, weight_kg: kg }].sort((a, b) => a.date.localeCompare(b.date));
    });
    setWeightSaved(true); setTimeout(() => setWeightSaved(false), 1500);
  };

  const handleUpdateExSetting = async (id, field, value) => {
    setUserExercises(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
    await supabase.from('user_exercises').update({ [field]: value }).eq('id', id);
  };

  const handleDeleteEx = async (id) => {
    setUserExercises(prev => prev.filter(e => e.id !== id));
    await supabase.from('user_exercises').delete().eq('id', id);
  };

  const handleMoveEx = async (index, dir) => {
    const next = [...userExercises];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    next.forEach((e, i) => { e.order = i; });
    setUserExercises(next);
    await supabase.from('user_exercises').upsert(
      next.map(e => ({ id: e.id, user_id: user.id, order: e.order })),
      { onConflict: 'id' }
    );
  };

  const handleAddEx = async () => {
    const name = newExName.trim();
    if (!name || userExercises.find(e => e.name === name)) return;
    const newRow = { user_id: user.id, name, order: userExercises.length, weight_min: 1, reps_step: 1, reps_max: 20 };
    const { data } = await supabase.from('user_exercises').insert(newRow).select().single();
    if (data) setUserExercises(prev => [...prev, data]);
    setNewExName('');
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthSubmitting(true); setAuthError('');
    const { error } = authMode === 'login'
      ? await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
      : await supabase.auth.signUp({ email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
    setAuthSubmitting(false);
  };
  const handleLogout = async () => { await supabase.auth.signOut(); };

  const todaySession = sessions[TODAY] || { date: TODAY, exercises: [] };

  const updateSessions = (updated) => {
    const next = { ...sessions, [TODAY]: updated };
    setSessions(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
    supabase.from('workout_sessions')
      .upsert({ user_id: user.id, date: TODAY, exercises: updated.exercises }, { onConflict: 'user_id,date' })
      .then();
    setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1200);
  };

  // 編集モード用関数
  const editSession = sessions[editingDate] || { date: editingDate, exercises: [] };
  const updateEditSession = async (updated) => {
    const next = { ...sessions, [editingDate]: updated };
    setSessions(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
    await supabase.from('workout_sessions')
      .upsert({ user_id: user.id, date: editingDate, exercises: updated.exercises }, { onConflict: 'user_id,date' });
    setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1200);
  };
  const addEditExercise = (name) => {
    const ex = { id: Date.now(), name, sets: [] };
    updateEditSession({ ...editSession, exercises: [...editSession.exercises, ex] });
  };
  const removeEditExercise = (exId) =>
    updateEditSession({ ...editSession, exercises: editSession.exercises.filter(e => e.id !== exId) });
  const addEditSet = (exId) => {
    const inp = editSetInputs[exId] || {};
    const exs = getExSetting(editSession.exercises.find(e => e.id === exId)?.name);
    const w = inp.weight !== "" ? inp.weight : exs.weight_min;
    const r = inp.reps !== "" ? inp.reps : exs.reps_step;
    const newSet = { id: Date.now(), weight: w, reps: r };
    const exes = editSession.exercises.map(e => e.id === exId ? { ...e, sets: [...e.sets, newSet] } : e);
    updateEditSession({ ...editSession, exercises: exes });
    setEditSetInputs(prev => ({ ...prev, [exId]: { weight: "", reps: "" } }));
  };
  const removeEditSet = (exId, setId) => {
    const exes = editSession.exercises.map(e =>
      e.id === exId ? { ...e, sets: e.sets.filter(s => s.id !== setId) } : e);
    updateEditSession({ ...editSession, exercises: exes });
  };
  const deleteEditSession = async () => {
    const next = { ...sessions };
    delete next[editingDate];
    setSessions(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
    await supabase.from('workout_sessions')
      .delete()
      .eq('user_id', user.id)
      .eq('date', editingDate);
    setEditingDate(null);
  };

  const addExercise = (name) => {
    const exId = Date.now();
    const ex = { id: exId, name, sets: [] };
    updateSessions({ ...todaySession, exercises: [...todaySession.exercises, ex] });
    setPickingExercise(false);
    // 過去データからデフォルト値を取得
    const pastSessions = Object.values(sessions)
      .filter(s => s.date < TODAY)
      .sort((a, b) => b.date.localeCompare(a.date));
    const exs = getExSetting(name);
    let defWeight = exs.weight_min, defReps = exs.reps_step;
    for (const session of pastSessions) {
      const pastEx = session.exercises.find(e => e.name === name);
      if (pastEx && pastEx.sets.length > 0) {
        const last = pastEx.sets[pastEx.sets.length - 1];
        defWeight = last.weight; defReps = last.reps;
        break;
      }
    }
    setSetInputs(prev => ({ ...prev, [exId]: { weight: defWeight, reps: defReps } }));
  };
  const removeExercise = (exId) =>
    updateSessions({ ...todaySession, exercises: todaySession.exercises.filter(e => e.id !== exId) });
  // 種目のデフォルト重量・回数を取得
  const getDefaultInput = (exId) => {
    const ex = todaySession.exercises.find(e => e.id === exId);
    if (!ex) return { weight: 1, reps: 1 };
    // 当日に既にセットがある場合は直前のセット
    if (ex.sets.length > 0) {
      const last = ex.sets[ex.sets.length - 1];
      return { weight: last.weight, reps: last.reps };
    }
    // 当日初回 → 過去のセッションから同名種目の最後のセットを探す
    const pastSessions = Object.values(sessions)
      .filter(s => s.date < TODAY)
      .sort((a, b) => b.date.localeCompare(a.date));
    for (const session of pastSessions) {
      const pastEx = session.exercises.find(e => e.name === ex.name);
      if (pastEx && pastEx.sets.length > 0) {
        const last = pastEx.sets[pastEx.sets.length - 1];
        return { weight: last.weight, reps: last.reps };
      }
    }
    return { weight: 1, reps: 1 };
  };

  const addSet = (exId) => {
    const inp = setInputs[exId] || {};
    const exs = getExSetting(todaySession.exercises.find(e => e.id === exId)?.name);
    const w = inp.weight !== "" ? inp.weight : exs.weight_min;
    const r = inp.reps !== "" ? inp.reps : exs.reps_step;
    const newSet = { id: Date.now(), weight: w, reps: r };
    const exes = todaySession.exercises.map(e => e.id === exId ? { ...e, sets: [...e.sets, newSet] } : e);
    updateSessions({ ...todaySession, exercises: exes });
    // 追加後のデフォルトは今追加したセットの値
    setSetInputs(prev => ({ ...prev, [exId]: { weight: w, reps: r } }));
    startTimer();
  };
  const removeSet = (exId, setId) => {
    const exes = todaySession.exercises.map(e =>
      e.id === exId ? { ...e, sets: e.sets.filter(s => s.id !== setId) } : e);
    updateSessions({ ...todaySession, exercises: exes });
  };
  const totalVolume = (exercises) =>
    exercises.reduce((sum, e) => {
      const exs = getExSetting(e.name);
      if (exs.weight_min === 0) return sum;
      return sum + e.sets.reduce((s2, s) => s2 + (Number(s.weight) || 0) * s.reps, 0);
    }, 0);

  const allExerciseNames = [...new Set(
    Object.values(sessions).flatMap(s => s.exercises.map(e => e.name))
  )].sort();

  const getChartData = (exName, metric) =>
    Object.values(sessions).sort((a,b) => a.date.localeCompare(b.date)).map(session => {
      const ex = session.exercises.find(e => e.name === exName);
      if (!ex || ex.sets.length === 0) return null;
      const value = metric === "volume"
        ? ex.sets.reduce((sum, s) => sum + s.weight * s.reps, 0)
        : Math.max(...ex.sets.map(s => s.weight));
      return { date: session.date, value };
    }).filter(Boolean);

  const chartData = chartExercise ? getChartData(chartExercise, chartMetric) : [];

  // ★ Vercel API Route経由でClaudeを呼ぶ
  const getAiAdvice = async () => {
    setAiLoading(true); setAiText("");
    const recent = Object.values(sessions).sort((a,b) => b.date.localeCompare(a.date)).slice(0,5);
    const summary = recent.map(s =>
      `${s.date}:\n` + s.exercises.map(e =>
        ` ${e.name}:` + e.sets.map((st,i) => `セット${i+1} ${st.weight}kg×${st.reps}rep`).join(", ")
      ).join("\n")
    ).join("\n\n");
    try {
      const res = await fetch('/api/advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `あなたはプロのパーソナルトレーナーです。以下のトレーニング記録を分析して、日本語で具体的なアドバイスを3〜5文でください。重量の伸び・セット構成・種目バランス・次回への提案を含めてください。\n\n【ユーザー情報】身長${profile.height_cm||'不明'}cm・体重${bodyWeights.length>0?bodyWeights[bodyWeights.length-1].weight_kg:'不明'}kg\n【種目補足】マシンベンチプレスはアイソラテラル式のマシン種目であり、バーベルのベンチプレスとは別種目として扱ってください。\n\n${summary}`
          }]
        })
      });
      const data = await res.json();
      setAiText(data.content?.map(b => b.text||"").join("") || "取得できませんでした");
    } catch { setAiText("エラーが発生しました。"); }
    setAiLoading(false);
  };

  const exportCSV = () => {
    const rows = [["日付","種目","セット","重量(kg)","回数","ボリューム(kg)"]];
    Object.values(sessions).sort((a,b) => a.date.localeCompare(b.date)).forEach(session => {
      session.exercises.forEach(ex => {
        ex.sets.forEach((s, i) => {
          rows.push([session.date, ex.name, i+1, s.weight, s.reps, s.weight*s.reps]);
        });
      });
    });
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF"+csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "iron-log.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const allMonths = [...new Set(Object.keys(sessions).map(d => d.slice(0,7)))].sort((a,b) => b.localeCompare(a));
  const sortedHistory = Object.values(sessions)
    .filter(s => s.date.startsWith(historyMonth))
    .sort((a,b) => b.date.localeCompare(a.date));
  const usedExercises = todaySession.exercises.map(e => e.name);
  const totalSets = todaySession.exercises.reduce((s, e) => s + e.sets.length, 0);
  const isDone = timerSec !== null && timerSec <= 0;
  const mm = timerSec !== null ? String(Math.floor(Math.max(timerSec,0)/60)) : "2";
  const ss_str = timerSec !== null ? String(Math.max(timerSec,0)%60).padStart(2,"0") : "00";
  const circumference = 2 * Math.PI * 54;
  const dashOffset = timerSec !== null && !isDone ? circumference*(timerSec/INTERVAL_SEC) : isDone ? 0 : circumference;

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+JP:wght@400;600;800&display=swap'); *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;} body{background:#f2f2f7;color-scheme:light;} .app{min-height:100vh;background:#f2f2f7;color:#111;font-family:'Noto Sans JP',sans-serif;max-width:430px;margin:0 auto;} .header{padding:22px 20px 0;display:flex;align-items:center;justify-content:space-between;} .logo{font-family:'Bebas Neue',sans-serif;font-size:38px;letter-spacing:3px;background:linear-gradient(135deg,#e84c1e,#e8003d);-webkit-background-clip:text;-webkit-text-fill-color:transparent;} .saved{font-size:16px;color:#16a34a;font-weight:800;opacity:0;transition:opacity 0.3s;} .saved.on{opacity:1;} .tabs{display:flex;margin:14px 16px 0;gap:4px;background:#ddd;padding:5px;border-radius:16px;} .tb{flex:1;padding:13px 0;border:none;border-radius:12px;background:transparent;color:#666;font-size:15px;font-family:'Noto Sans JP',sans-serif;cursor:pointer;font-weight:700;} .tb.on{background:linear-gradient(135deg,#e84c1e,#e8003d);color:#fff;box-shadow:0 2px 10px rgba(232,76,30,.35);} .content{padding:16px 16px 130px;} .dh{font-size:17px;color:#666;margin-bottom:14px;font-weight:700;} .vbar{display:flex;justify-content:space-between;align-items:center;background:#fff;border-radius:18px;padding:16px 20px;margin-bottom:14px;box-shadow:0 2px 8px rgba(0,0,0,.08);} .vlbl{font-size:14px;color:#999;margin-bottom:2px;font-weight:700;} .vsets{font-size:16px;color:#555;font-weight:700;} .vval{font-family:'Bebas Neue',sans-serif;font-size:38px;color:#111;} .excard{background:#fff;border-radius:20px;margin-bottom:16px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.09);animation:si .2s ease;} @keyframes si{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}} .exhdr{display:flex;align-items:center;justify-content:space-between;padding:16px 16px 12px;} .exname{font-weight:800;font-size:20px;color:#111;} .exmeta{font-size:14px;color:#999;margin-top:3px;font-weight:600;} .exdel{background:none;border:none;color:#ccc;cursor:pointer;font-size:22px;padding:6px;} .stbl{padding:0 16px;} .srow{display:flex;align-items:center;gap:8px;padding:12px 0;border-top:2px solid #f5f5f5;} .snum{font-family:'Bebas Neue',sans-serif;font-size:16px;color:#ccc;width:30px;flex-shrink:0;} .swt{font-family:'Bebas Neue',sans-serif;font-size:34px;color:#e84c1e;line-height:1;} .su{font-size:15px;color:#aaa;font-weight:700;} .sx{font-size:18px;color:#ddd;margin:0 4px;} .srep{font-family:'Bebas Neue',sans-serif;font-size:34px;color:#111;line-height:1;} .svol{font-size:13px;color:#ccc;margin-left:auto;font-weight:700;} .sdel{background:none;border:none;color:#ddd;cursor:pointer;font-size:18px;padding:4px 6px;} .addrow{display:flex;align-items:center;gap:8px;padding:12px 16px 14px;border-top:2px solid #f5f5f5;background:#fafafa;} input{background:#fff;border:2.5px solid #e5e5e5;border-radius:12px;color:#111;font-family:'Noto Sans JP',sans-serif;font-size:22px;font-weight:800;padding:11px 8px;outline:none;text-align:center;transition:border-color .2s;} input:focus{border-color:#e84c1e;} .wi{width:84px;} .ri{width:72px;} .ilbl{font-size:14px;color:#bbb;text-align:center;margin-top:4px;font-weight:700;} .addbtn{background:linear-gradient(135deg,#e84c1e,#e8003d);border:none;border-radius:12px;color:#fff;font-size:28px;width:52px;height:52px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 10px rgba(232,76,30,.35);transition:transform .1s;} .addbtn:active{transform:scale(.9);} .addex{width:100%;padding:20px;background:#fff;border:2.5px dashed #ddd;border-radius:18px;color:#bbb;font-family:'Noto Sans JP',sans-serif;font-size:18px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 1px 4px rgba(0,0,0,.05);} .addex:active{border-color:#e84c1e;color:#e84c1e;} .pov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100;display:flex;align-items:flex-end;} .psh{background:#fff;border-radius:26px 26px 0 0;width:100%;max-height:72vh;overflow-y:auto;padding:20px 0 54px;animation:su .25s ease;} @keyframes su{from{transform:translateY(100%)}to{transform:translateY(0)}} .ptitle{font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:2px;color:#e84c1e;padding:0 20px 16px;border-bottom:2px solid #f5f5f5;} .pitem{padding:20px;font-size:19px;font-weight:700;cursor:pointer;border-bottom:1.5px solid #f8f8f8;display:flex;justify-content:space-between;align-items:center;color:#111;} .pitem:active{background:#fff5f0;} .pitem.used{color:#ddd;pointer-events:none;} .stitle{font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:2px;color:#e84c1e;margin-bottom:14px;} .csec{background:#fff;border-radius:20px;padding:18px;margin-bottom:16px;box-shadow:0 2px 10px rgba(0,0,0,.08);} .cstitle{font-size:15px;color:#999;margin-bottom:12px;font-weight:700;} .exscroll{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;} .exscroll::-webkit-scrollbar{display:none;} .echip{flex-shrink:0;padding:10px 18px;border-radius:50px;border:2.5px solid #e5e5e5;background:transparent;color:#888;font-size:15px;font-family:'Noto Sans JP',sans-serif;cursor:pointer;white-space:nowrap;font-weight:700;} .echip.on{border-color:#e84c1e;color:#e84c1e;background:#fff5f0;} .mtog{display:flex;gap:8px;margin:14px 0 16px;} .mbtn{flex:1;padding:13px 0;border-radius:12px;border:2.5px solid #e5e5e5;background:transparent;color:#888;font-size:16px;font-family:'Noto Sans JP',sans-serif;cursor:pointer;font-weight:800;} .mbtn.on{border-color:#e84c1e;color:#e84c1e;background:#fff5f0;} .cstats{display:flex;gap:10px;margin-top:14px;} .sbox{flex:1;background:#f8f8f8;border-radius:14px;padding:14px 12px;} .slbl{font-size:14px;color:#aaa;margin-bottom:4px;font-weight:700;} .sval{font-family:'Bebas Neue',sans-serif;font-size:30px;color:#e84c1e;line-height:1;} .sunt{font-size:13px;color:#bbb;font-weight:700;} .hcard{background:#fff;border-radius:20px;padding:18px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,.07);} .hhdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;} .hdate{font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:1px;color:#111;} .hvol{font-size:15px;color:#aaa;font-weight:700;} .hex{margin-bottom:10px;} .hexname{font-size:16px;color:#e84c1e;font-weight:800;margin-bottom:6px;} .hsets{display:flex;gap:6px;flex-wrap:wrap;} .hchip{background:#f5f5f5;border-radius:10px;padding:7px 13px;} .hl{font-size:13px;color:#bbb;font-weight:700;} .hn{font-family:'Bebas Neue',sans-serif;font-size:22px;color:#111;} .aicard{background:#fff;border-radius:18px;padding:18px;margin-bottom:16px;font-size:17px;color:#777;line-height:1.85;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.07);} .aibtn{width:100%;padding:18px;background:#fff;border:3px solid #e84c1e;border-radius:18px;color:#e84c1e;font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:2px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 2px 8px rgba(0,0,0,.07);} .aibub{margin-top:16px;background:#fff;border:2.5px solid #ede8ff;border-radius:18px;padding:20px;font-size:17px;line-height:1.95;color:#333;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.07);} .ailbl{font-size:14px;color:#7c3aed;letter-spacing:2px;margin-bottom:10px;display:flex;align-items:center;gap:6px;font-weight:800;} .pulse{width:8px;height:8px;background:#7c3aed;border-radius:50%;animation:p 1.2s infinite;} @keyframes p{0%,100%{opacity:1}50%{opacity:.3}} .dots span{display:inline-block;width:7px;height:7px;background:#e84c1e;border-radius:50%;animation:b .8s infinite;margin:0 2px;} .dots span:nth-child(2){animation-delay:.15s}.dots span:nth-child(3){animation-delay:.3s} @keyframes b{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}} .empty{text-align:center;color:#ccc;padding:50px 0;font-size:17px;line-height:2.4;font-weight:700;} .tov{position:fixed;inset:0;background:rgba(255,255,255,.97);z-index:200;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;} .tov.done{background:rgba(240,255,245,.98);} .ttitle{font-size:18px;color:#aaa;letter-spacing:3px;font-weight:800;} .tsvg{position:relative;} .tsvg svg{transform:rotate(-90deg);} .tsvg .rt{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;} .ttime{font-family:'Bebas Neue',sans-serif;font-size:80px;line-height:1;color:#111;letter-spacing:4px;} .tdone{font-family:'Bebas Neue',sans-serif;font-size:44px;color:#16a34a;letter-spacing:6px;animation:pop .4s ease;} @keyframes pop{from{transform:scale(.7);opacity:0}to{transform:scale(1);opacity:1}} .thint{font-size:16px;color:#bbb;font-weight:700;} .tclosebtn{padding:18px 52px;background:#f5f5f5;border:2.5px solid #e0e0e0;border-radius:50px;color:#666;font-family:'Noto Sans JP',sans-serif;font-size:18px;font-weight:800;cursor:pointer;} .tmini{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:430px;background:#fff;border-top:3px solid #e84c1e;padding:16px 20px 36px;display:flex;align-items:center;justify-content:space-between;z-index:50;cursor:pointer;box-shadow:0 -4px 16px rgba(0,0,0,.1);} .tml{display:flex;align-items:center;gap:12px;} .tmlbl{font-size:15px;color:#aaa;font-weight:700;} .tmtime{font-family:'Bebas Neue',sans-serif;font-size:40px;color:#e84c1e;line-height:1;} .tmstop{background:none;border:2.5px solid #e0e0e0;border-radius:10px;color:#888;font-size:16px;font-weight:800;padding:10px 18px;cursor:pointer;font-family:'Noto Sans JP',sans-serif;} .tsbar{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:430px;background:#fff;border-top:2px solid #eee;padding:14px 20px 36px;display:flex;align-items:center;justify-content:space-between;z-index:50;box-shadow:0 -2px 10px rgba(0,0,0,.06);} .tslbl{font-size:16px;color:#bbb;font-weight:700;} .tsbtn{display:flex;align-items:center;gap:8px;background:none;border:2.5px solid #e0e0e0;border-radius:14px;color:#888;font-size:17px;font-weight:800;padding:12px 22px;cursor:pointer;font-family:'Noto Sans JP',sans-serif;} .nsel{appearance:none;-webkit-appearance:none;background:#f5f5f5;border:2.5px solid #e5e5e5;border-radius:12px;font-family:'Bebas Neue',sans-serif;font-size:28px;color:#e84c1e;font-weight:700;text-align:center;padding:10px 8px;width:86px;cursor:pointer;outline:none;} .nsel:focus{border-color:#e84c1e;} .csvbtn{display:flex;align-items:center;gap:8px;background:none;border:2.5px solid #e0e0e0;border-radius:14px;color:#888;font-size:16px;font-weight:800;padding:12px 20px;cursor:pointer;font-family:'Noto Sans JP',sans-serif;white-space:nowrap;} .csvbtn:active{border-color:#e84c1e;color:#e84c1e;} .histhdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;} .histhdr .stitle{margin-bottom:0;} .authpage{min-height:100vh;background:#f2f2f7;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;} .authlogo{font-family:'Bebas Neue',sans-serif;font-size:52px;letter-spacing:4px;background:linear-gradient(135deg,#e84c1e,#e8003d);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:32px;} .authcard{background:#fff;border-radius:24px;padding:28px 24px;width:100%;max-width:380px;box-shadow:0 4px 24px rgba(0,0,0,.1);} .authtitle{font-size:20px;font-weight:800;color:#111;margin-bottom:24px;text-align:center;} .authinput{width:100%;padding:16px;background:#f5f5f5;border:2.5px solid #e5e5e5;border-radius:14px;font-size:16px;font-weight:600;color:#111;font-family:'Noto Sans JP',sans-serif;outline:none;margin-bottom:12px;box-sizing:border-box;} .authinput:focus{border-color:#e84c1e;} .authbtn{width:100%;padding:18px;background:linear-gradient(135deg,#e84c1e,#e8003d);border:none;border-radius:14px;color:#fff;font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:2px;cursor:pointer;margin-top:8px;box-shadow:0 2px 10px rgba(232,76,30,.35);} .authbtn:disabled{opacity:.6;cursor:not-allowed;} .autherr{color:#e8003d;font-size:14px;font-weight:700;margin-top:10px;text-align:center;} .authtoggle{margin-top:20px;text-align:center;font-size:15px;color:#aaa;font-weight:700;} .authtoggle span{color:#e84c1e;cursor:pointer;font-weight:800;} .logoutbtn{background:none;border:2px solid #ddd;border-radius:10px;color:#aaa;font-size:13px;font-weight:800;padding:8px 14px;cursor:pointer;font-family:'Noto Sans JP',sans-serif;}`}</style>
      {authLoading ? (
        <div className="authpage"><div className="dots"><span/><span/><span/></div></div>
      ) : !user ? (
        <div className="authpage">
          <div className="authlogo">IRON LOG</div>
          <div className="authcard">
            <div className="authtitle">{authMode === 'login' ? 'ログイン' : 'アカウント作成'}</div>
            <form onSubmit={handleAuth}>
              <input className="authinput" type="email" placeholder="メールアドレス" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} required autoComplete="email"/>
              <input className="authinput" type="password" placeholder="パスワード" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} required autoComplete={authMode==='login'?'current-password':'new-password'}/>
              {authError && <div className="autherr">{authError}</div>}
              <button className="authbtn" type="submit" disabled={authSubmitting}>
                {authSubmitting ? '...' : authMode === 'login' ? 'LOGIN' : 'SIGN UP'}
              </button>
            </form>
            <div className="authtoggle">
              {authMode === 'login'
                ? <>アカウントをお持ちでない方は<span onClick={()=>{setAuthMode('signup');setAuthError('');}}>新規登録</span></>
                : <>すでにアカウントをお持ちの方は<span onClick={()=>{setAuthMode('login');setAuthError('');}}>ログイン</span></>}
            </div>
          </div>
        </div>
      ) : (
      <div className="app">
        <div className="header">
          <div className="logo">IRON LOG</div>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div className={`saved ${savedFlash?"on":""}`}>✓ 保存</div>
            <button className="logoutbtn" onClick={handleLogout}>ログアウト</button>
          </div>
        </div>
        {hasLocalData && (
          <div style={{margin:'12px 16px 0',padding:'14px 18px',background:'#fff8e1',borderRadius:14,border:'2px solid #f59e0b'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
              <span style={{fontSize:14,fontWeight:700,color:'#92400e'}}>ローカルに保存されたデータがあります</span>
              <button onClick={migrateFromLocal} disabled={migrating} style={{background:'#f59e0b',border:'none',borderRadius:10,color:'#fff',fontSize:13,fontWeight:800,padding:'8px 14px',cursor:'pointer',whiteSpace:'nowrap',opacity:migrating?0.6:1}}>
                {migrating ? '処理中...' : 'インポート'}
              </button>
            </div>
            {migrateError && <div style={{marginTop:8,fontSize:13,color:'#b91c1c',fontWeight:700}}>{migrateError}</div>}
          </div>
        )}
        <div className="tabs">
          <button className={`tb ${tab==="record"?"on":""}`} onClick={()=>setTab("record")}>📝 記録</button>
          <button className={`tb ${tab==="history"?"on":""}`} onClick={()=>setTab("history")}>📊 履歴</button>
          <button className={`tb ${tab==="ai"?"on":""}`} onClick={()=>setTab("ai")}>🤖 AI</button>
          <button className={`tb ${tab==="settings"?"on":""}`} onClick={()=>setTab("settings")}>⚙️</button>
        </div>

        <div className="content">
          {tab==="record" && (<>
            <div className="dh">{formatDate(TODAY)}</div>
            {todaySession.exercises.length>0 && (
              <div className="vbar">
                <div>
                  <div className="vlbl">TOTAL VOLUME</div>
                  <div className="vsets">{totalSets} セット・{todaySession.exercises.length} 種目</div>
                </div>
                <div>
                  <span className="vval">{totalVolume(todaySession.exercises).toLocaleString()}</span>
                  <span style={{fontSize:17,color:"#aaa",fontWeight:700}}> kg</span>
                </div>
              </div>
            )}
            {todaySession.exercises.map(ex => {
              const inp = setInputs[ex.id] || {weight:"",reps:""};
              const exs = getExSetting(ex.name);
              return (
                <div className="excard" key={ex.id}>
                  <div className="exhdr">
                    <div>
                      <div className="exname">{ex.name}</div>
                      <div className="exmeta">{ex.sets.length} セット完了</div>
                    </div>
                    <button className="exdel" onClick={()=>removeExercise(ex.id)}>✕</button>
                  </div>
                  {ex.sets.length>0 && (
                    <div className="stbl">
                      {ex.sets.map((s,i)=>(
                        <div className="srow" key={s.id}>
                          <span className="snum">S{i+1}</span>
                          {exs.weight_min > 0 && <><span className="swt">{s.weight}</span><span className="su">kg</span><span className="sx">×</span></>}
                          <span className="srep">{s.reps}</span>
                          <span className="su">rep</span>
                          {exs.weight_min > 0 && <span className="svol">{(s.weight*s.reps).toLocaleString()}kg</span>}
                          <button className="sdel" onClick={()=>removeSet(ex.id,s.id)}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="addrow" style={{justifyContent:'center',gap:8,padding:'12px 16px',background:'#fafafa'}}>
                    {exs.weight_min > 0 && <>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                        <select className="nsel" value={inp.weight!==""?inp.weight:exs.weight_min} onChange={e=>setSetInputs(p=>({...p,[ex.id]:{...inp,weight:Number(e.target.value)}}))}>
                          {Array.from({length:151-exs.weight_min},(_,i)=>i+exs.weight_min).map(w=><option key={w} value={w}>{w}</option>)}
                        </select>
                        <span className="ilbl">kg</span>
                      </div>
                      <div style={{display:'flex',alignItems:'center',color:'#ddd',fontSize:28,fontFamily:"'Bebas Neue',sans-serif",paddingBottom:18}}>×</div>
                    </>}
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                      <select className="nsel" value={inp.reps!==""?inp.reps:exs.reps_step} onChange={e=>setSetInputs(p=>({...p,[ex.id]:{...inp,reps:Number(e.target.value)}}))}>
                        {Array.from({length:Math.floor(exs.reps_max/exs.reps_step)},(_,i)=>(i+1)*exs.reps_step).map(r=><option key={r} value={r}>{r}</option>)}
                      </select>
                      <span className="ilbl">rep</span>
                    </div>
                    <button className="addbtn" style={{marginBottom:18,flexShrink:0}} onClick={()=>addSet(ex.id)}>＋</button>
                  </div>
                </div>
              );
            })}
            <button className="addex" onClick={()=>setPickingExercise(true)}>
              <span style={{fontSize:24}}>＋</span> 種目を追加
            </button>
            {todaySession.exercises.length===0 && (
              <div className="empty">「種目を追加」からスタート 💪<br/>セットごとに重量と回数を記録しよう</div>
            )}
          </>)}

          {tab==="history" && (<>
            {allExerciseNames.length>0 && (
              <div className="csec">
                <div className="stitle">📈 グラフ</div>
                <div className="cstitle">種目を選択</div>
                <select
                  value={chartExercise || allExerciseNames[0]}
                  onChange={e=>setChartExercise(e.target.value)}
                  style={{width:'100%',padding:'12px 16px',borderRadius:12,border:'2.5px solid #e5e5e5',fontSize:16,fontWeight:700,fontFamily:"'Noto Sans JP',sans-serif",color:'#e84c1e',background:'#f5f5f5',outline:'none',marginBottom:4,appearance:'none',WebkitAppearance:'none',textAlign:'center'}}
                >
                  {allExerciseNames.map(n=><option key={n} value={n}>{n}</option>)}
                </select>
                {chartExercise && (<>
                  <div className="mtog">
                    <button className={`mbtn ${chartMetric==="volume"?"on":""}`} onClick={()=>setChartMetric("volume")}>総ボリューム</button>
                    <button className={`mbtn ${chartMetric==="maxWeight"?"on":""}`} onClick={()=>setChartMetric("maxWeight")}>最大重量</button>
                  </div>
                  <LineChart data={chartData} color={chartMetric==="volume"?"#e84c1e":"#7c3aed"}/>
                  {chartData.length>=1 && (
                    <div className="cstats">
                      <div className="sbox">
                        <div className="slbl">最高記録</div>
                        <div className="sval">{Math.max(...chartData.map(d=>d.value)).toLocaleString()}</div>
                        <div className="sunt">{chartMetric==="volume"?"kg(vol)":"kg"}</div>
                      </div>
                      <div className="sbox">
                        <div className="slbl">直近</div>
                        <div className="sval">{chartData[chartData.length-1].value.toLocaleString()}</div>
                        <div className="sunt">{chartMetric==="volume"?"kg(vol)":"kg"}</div>
                      </div>
                      <div className="sbox">
                        <div className="slbl">記録回数</div>
                        <div className="sval">{chartData.length}</div>
                        <div className="sunt">回</div>
                      </div>
                    </div>
                  )}
                </>)}
              </div>
            )}
            <div className="histhdr">
              <div className="stitle">履歴</div>
              <button className="csvbtn" onClick={exportCSV}>📥 CSV</button>
            </div>
            {allMonths.length > 0 && (
              <div style={{background:'#fff',borderRadius:18,padding:'12px 16px',marginBottom:14,boxShadow:'0 2px 8px rgba(0,0,0,.07)'}}>
                <select
                  value={historyMonth}
                  onChange={e=>setHistoryMonth(e.target.value)}
                  style={{width:'100%',padding:'10px 16px',borderRadius:12,border:'2.5px solid #e5e5e5',fontSize:16,fontWeight:700,fontFamily:"'Noto Sans JP',sans-serif",color:'#e84c1e',background:'#f5f5f5',outline:'none',appearance:'none',WebkitAppearance:'none',textAlign:'center'}}
                >
                  {allMonths.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
            {sortedHistory.length===0 && <div className="empty">この月の記録はありません</div>}
            {sortedHistory.map(session=>(
              <div className="hcard" key={session.date}>
                <div className="hhdr">
                  <span className="hdate">{formatDate(session.date)}</span>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span className="hvol">Vol. {totalVolume(session.exercises).toLocaleString()}kg</span>
                    <button onClick={()=>{setEditingDate(session.date);setEditSetInputs({});}} style={{background:'none',border:'2px solid #e5e5e5',borderRadius:10,color:'#aaa',fontSize:13,fontWeight:800,padding:'5px 12px',cursor:'pointer',fontFamily:'Noto Sans JP,sans-serif'}}>編集</button>
                  </div>
                </div>
                {session.exercises.map(ex=>(
                  <div className="hex" key={ex.id}>
                    <div className="hexname">{ex.name}</div>
                    <div className="hsets">
                      {ex.sets.map((s,i)=>(
                        <div className="hchip" key={s.id}>
                          <span className="hl">S{i+1} </span>
                          <span className="hn">{s.weight}</span>
                          <span className="hl">kg×</span>
                          <span className="hn">{s.reps}</span>
                          <span className="hl">rep</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </>)}

          {tab==="record" && (
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'#fff',borderRadius:16,padding:'14px 18px',marginBottom:14,boxShadow:'0 2px 8px rgba(0,0,0,.07)'}}>
              <div>
                <div style={{fontSize:15,fontWeight:800,color:'#111'}}>⏱ インターバルタイマー</div>
                <div style={{fontSize:13,color:'#aaa',fontWeight:600,marginTop:2}}>{timerEnabled ? 'セット後に2分タイマーが起動' : 'タイマーOFF'}</div>
              </div>
              <div onClick={()=>toggleTimer(!timerEnabled)} style={{width:52,height:30,borderRadius:15,background:timerEnabled?'#e84c1e':'#ddd',cursor:'pointer',position:'relative',transition:'background .3s',flexShrink:0}}>
                <div style={{position:'absolute',top:3,left:timerEnabled?24:3,width:24,height:24,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 4px rgba(0,0,0,.2)',transition:'left .3s'}}/>
              </div>
            </div>
          )}

          {tab==="ai" && (<>
            <div className="stitle">AI TRAINER</div>
            <div className="aicard">過去のトレーニングをもとに、重量の伸び・セット構成・種目バランスを分析してアドバイスします。</div>
            <button className="aibtn" onClick={getAiAdvice} disabled={aiLoading}>
              {aiLoading?<><span>分析中</span><div className="dots"><span/><span/><span/></div></>:"⚡ AIアドバイスを取得"}
            </button>
            {aiText && (
              <div className="aibub">
                <div className="ailbl"><div className="pulse"/><span>AI PERSONAL TRAINER</span></div>
                {aiText}
              </div>
            )}
            {!aiText&&!aiLoading&&<div className="empty">記録を追加してから<br/>AIアドバイスを取得しよう 🤖</div>}
          </>)}

          {tab==="settings" && (<>
            <div className="stitle">プロフィール</div>
            <div className="csec">
              <div className="cstitle">身長</div>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
                <input type="number" value={profile.height_cm} onChange={e=>setProfile(p=>({...p,height_cm:e.target.value}))} style={{width:90,padding:'10px 12px',borderRadius:12,border:'2.5px solid #e5e5e5',fontSize:18,fontWeight:700,outline:'none'}} placeholder="172"/>
                <span style={{fontSize:14,color:'#aaa',fontWeight:700}}>cm</span>
              </div>
              <button onClick={handleSaveProfile} style={{width:'100%',padding:'14px',background:'linear-gradient(135deg,#e84c1e,#e8003d)',border:'none',borderRadius:12,color:'#fff',fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:2,cursor:'pointer'}}>
                {profileSaved ? '✓ 保存しました' : 'SAVE'}
              </button>
            </div>

            <div className="stitle">体重記録</div>
            <div className="csec">
              <div style={{display:'flex',gap:8,marginBottom:16}}>
                <input type="date" value={weightDate} onChange={e=>setWeightDate(e.target.value)} style={{flex:1,padding:'10px 12px',borderRadius:12,border:'2.5px solid #e5e5e5',fontSize:15,fontWeight:700,outline:'none',color:'#555'}}/>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <input type="number" value={weightInput} onChange={e=>setWeightInput(e.target.value)} style={{width:80,padding:'10px 8px',borderRadius:12,border:'2.5px solid #e5e5e5',fontSize:18,fontWeight:700,outline:'none',textAlign:'center'}} placeholder="85" step="0.1"/>
                  <span style={{fontSize:14,color:'#aaa',fontWeight:700}}>kg</span>
                </div>
                <button onClick={handleSaveWeight} style={{padding:'10px 16px',background:'linear-gradient(135deg,#e84c1e,#e8003d)',border:'none',borderRadius:12,color:'#fff',fontFamily:"'Bebas Neue',sans-serif",fontSize:17,cursor:'pointer',whiteSpace:'nowrap'}}>
                  {weightSaved ? '✓' : '記録'}
                </button>
              </div>
              <LineChart data={bodyWeights.map(w=>({date:w.date,value:Number(w.weight_kg)}))} color="#7c3aed"/>
              {bodyWeights.length > 0 && (
                <div style={{marginTop:14}}>
                  {[...bodyWeights].reverse().slice(0,10).map(w=>(
                    <div key={w.date} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1.5px solid #f5f5f5'}}>
                      <span style={{fontSize:14,color:'#999',fontWeight:700}}>{shortDate(w.date)}</span>
                      <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:'#7c3aed'}}>{w.weight_kg}<span style={{fontSize:14,color:'#bbb',fontWeight:700}}> kg</span></span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="stitle">種目設定</div>
            <div className="csec">
              {userExercises.map((ex, i) => (
                <div key={ex.id} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 0',borderBottom:'1.5px solid #f5f5f5'}}>
                  <div style={{flex:1,fontWeight:700,fontSize:15,color:'#111'}}>{ex.name}</div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                    <span style={{fontSize:11,color:'#aaa',fontWeight:700}}>最低重量</span>
                    <select value={ex.weight_min} onChange={e=>handleUpdateExSetting(ex.id,'weight_min',Number(e.target.value))} style={{fontSize:13,fontWeight:700,border:'2px solid #e5e5e5',borderRadius:8,padding:'4px 6px',background:'#f8f8f8',color:'#555'}}>
                      <option value={0}>0kg</option>
                      <option value={1}>1kg</option>
                    </select>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                    <span style={{fontSize:11,color:'#aaa',fontWeight:700}}>回数刻み</span>
                    <select value={ex.reps_step} onChange={e=>handleUpdateExSetting(ex.id,'reps_step',Number(e.target.value))} style={{fontSize:13,fontWeight:700,border:'2px solid #e5e5e5',borderRadius:8,padding:'4px 6px',background:'#f8f8f8',color:'#555'}}>
                      <option value={1}>1回</option>
                      <option value={5}>5回</option>
                    </select>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                    <span style={{fontSize:11,color:'#aaa',fontWeight:700}}>最大回数</span>
                    <select value={ex.reps_max} onChange={e=>handleUpdateExSetting(ex.id,'reps_max',Number(e.target.value))} style={{fontSize:13,fontWeight:700,border:'2px solid #e5e5e5',borderRadius:8,padding:'4px 6px',background:'#f8f8f8',color:'#555'}}>
                      <option value={20}>20</option>
                      <option value={30}>30</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:2}}>
                    <button onClick={()=>handleMoveEx(i,-1)} disabled={i===0} style={{background:'none',border:'1.5px solid #e5e5e5',borderRadius:6,color:'#aaa',fontSize:13,cursor:'pointer',padding:'2px 6px',lineHeight:1}}>▲</button>
                    <button onClick={()=>handleMoveEx(i,1)} disabled={i===userExercises.length-1} style={{background:'none',border:'1.5px solid #e5e5e5',borderRadius:6,color:'#aaa',fontSize:13,cursor:'pointer',padding:'2px 6px',lineHeight:1}}>▼</button>
                  </div>
                  <button onClick={()=>handleDeleteEx(ex.id)} style={{background:'none',border:'none',color:'#ffaaaa',fontSize:18,cursor:'pointer',padding:'0 4px'}}>✕</button>
                </div>
              ))}
              <div style={{display:'flex',gap:8,marginTop:14}}>
                <input value={newExName} onChange={e=>setNewExName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleAddEx()} placeholder="新しい種目名" style={{flex:1,padding:'10px 12px',borderRadius:12,border:'2.5px solid #e5e5e5',fontSize:15,fontWeight:700,outline:'none'}}/>
                <button onClick={handleAddEx} style={{padding:'10px 18px',background:'linear-gradient(135deg,#e84c1e,#e8003d)',border:'none',borderRadius:12,color:'#fff',fontFamily:"'Bebas Neue',sans-serif",fontSize:18,cursor:'pointer'}}>追加</button>
              </div>
            </div>


          </>)}
        </div>

        {editingDate && (
          <div className="pov" onClick={()=>setEditingDate(null)}>
            <div className="psh" style={{maxHeight:'90vh'}} onClick={e=>e.stopPropagation()}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 20px 16px',borderBottom:'2px solid #f5f5f5'}}>
                <div className="ptitle" style={{padding:0,border:'none'}}>{formatDate(editingDate)}</div>
                <button onClick={deleteEditSession} style={{background:'none',border:'none',color:'#ffaaaa',fontSize:14,fontWeight:800,cursor:'pointer',fontFamily:'Noto Sans JP,sans-serif'}}>🗑 削除</button>
              </div>
              <div style={{padding:'16px 16px 0',overflowY:'auto',maxHeight:'70vh'}}>
                {editSession.exercises.map(ex => {
                  const inp = editSetInputs[ex.id] || {weight:"",reps:""};
                  const exs = getExSetting(ex.name);
                  return (
                    <div className="excard" key={ex.id} style={{marginBottom:12}}>
                      <div className="exhdr">
                        <div>
                          <div className="exname">{ex.name}</div>
                          <div className="exmeta">{ex.sets.length} セット完了</div>
                        </div>
                        <button className="exdel" onClick={()=>removeEditExercise(ex.id)}>✕</button>
                      </div>
                      {ex.sets.length>0 && (
                        <div className="stbl">
                          {ex.sets.map((s,i)=>(
                            <div className="srow" key={s.id}>
                              <span className="snum">S{i+1}</span>
                              {exs.weight_min > 0 && <><span className="swt">{s.weight}</span><span className="su">kg</span><span className="sx">×</span></>}
                              <span className="srep">{s.reps}</span>
                              <span className="su">rep</span>
                              {exs.weight_min > 0 && <span className="svol">{(s.weight*s.reps).toLocaleString()}kg</span>}
                              <button className="sdel" onClick={()=>removeEditSet(ex.id,s.id)}>✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="addrow" style={{justifyContent:'center',gap:8,padding:'12px 16px',background:'#fafafa'}}>
                        {exs.weight_min > 0 && <>
                          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                            <select className="nsel" value={inp.weight!==""?inp.weight:exs.weight_min} onChange={e=>setEditSetInputs(p=>({...p,[ex.id]:{...inp,weight:Number(e.target.value)}}))}>
                              {Array.from({length:151-exs.weight_min},(_,i)=>i+exs.weight_min).map(w=><option key={w} value={w}>{w}</option>)}
                            </select>
                            <span className="ilbl">kg</span>
                          </div>
                          <div style={{display:'flex',alignItems:'center',color:'#ddd',fontSize:28,fontFamily:"'Bebas Neue',sans-serif",paddingBottom:18}}>×</div>
                        </>}
                        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                          <select className="nsel" value={inp.reps!==""?inp.reps:exs.reps_step} onChange={e=>setEditSetInputs(p=>({...p,[ex.id]:{...inp,reps:Number(e.target.value)}}))}>
                            {Array.from({length:Math.floor(exs.reps_max/exs.reps_step)},(_,i)=>(i+1)*exs.reps_step).map(r=><option key={r} value={r}>{r}</option>)}
                          </select>
                          <span className="ilbl">rep</span>
                        </div>
                        <button className="addbtn" style={{marginBottom:18,flexShrink:0}} onClick={()=>addEditSet(ex.id)}>＋</button>
                      </div>
                    </div>
                  );
                })}
                <button className="addex" style={{marginBottom:16}} onClick={()=>setPickingEditExercise(true)}>
                  <span style={{fontSize:24}}>＋</span> 種目を追加
                </button>
              </div>
              <div style={{padding:'12px 20px 20px',borderTop:'2px solid #f5f5f5'}}>
                <button onClick={()=>setEditingDate(null)} style={{width:'100%',padding:'16px',background:'linear-gradient(135deg,#e84c1e,#e8003d)',border:'none',borderRadius:14,color:'#fff',fontSize:18,fontWeight:800,cursor:'pointer',fontFamily:'Noto Sans JP,sans-serif'}}>完了</button>
              </div>
            </div>
          </div>
        )}

        {pickingExercise && (
          <div className="pov" onClick={()=>setPickingExercise(false)}>
            <div className="psh" onClick={e=>e.stopPropagation()}>
              <div className="ptitle">種目を選択</div>
              {userExercises.map(({name})=>{
                const used=usedExercises.includes(name);
                return (
                  <div key={name} className={`pitem ${used?"used":""}`} onClick={()=>!used&&addExercise(name)}>
                    {name}
                    {used&&<span style={{fontSize:14,color:"#ddd",fontWeight:700}}>追加済み</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {pickingEditExercise && (
          <div className="pov" onClick={()=>setPickingEditExercise(false)}>
            <div className="psh" onClick={e=>e.stopPropagation()}>
              <div className="ptitle">種目を選択</div>
              {userExercises.map(({name})=>{
                const used=editSession.exercises.map(e=>e.name).includes(name);
                return (
                  <div key={name} className={`pitem ${used?"used":""}`} onClick={()=>{if(!used){addEditExercise(name);setPickingEditExercise(false);}}}>
                    {name}
                    {used&&<span style={{fontSize:14,color:"#ddd",fontWeight:700}}>追加済み</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {timerEnabled && showTimer && timerSec!==null && (
          <div className={`tov ${isDone?"done":""}`} onClick={()=>!isDone&&setShowTimer(false)}>
            <div className="ttitle">インターバル休憩</div>
            <div className="tsvg">
              <svg width="170" height="170" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="54" fill="none" stroke="#f0f0f0" strokeWidth="8"/>
                <circle cx="60" cy="60" r="54" fill="none"
                  stroke={isDone?"#16a34a":"#e84c1e"} strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={circumference} strokeDashoffset={dashOffset}
                  style={{transition:"stroke-dashoffset 1s linear,stroke .5s"}}/>
              </svg>
              <div className="rt">
                {isDone
                  ? <div className="tdone">GO! 💪</div>
                  : <div className="ttime">{mm}:{ss_str}</div>}
              </div>
            </div>
            {!isDone&&<div className="thint">画面をタップで最小化</div>}
            <button className="tclosebtn" onClick={e=>{e.stopPropagation();stopTimer();}}>タイマーを終了</button>
          </div>
        )}

        {timerEnabled && tab==="record" && timerSec!==null && !showTimer && (
          <div className="tmini" onClick={()=>setShowTimer(true)}>
            <div className="tml">
              <span style={{fontSize:28}}>⏱</span>
              <div>
                <div className="tmlbl">インターバル（タップで拡大）</div>
                <div className="tmtime">{isDone?"GO! 💪":`${mm}:${ss_str}`}</div>
              </div>
            </div>
            <button className="tmstop" onClick={e=>{e.stopPropagation();stopTimer();}}>終了</button>
          </div>
        )}

        {timerEnabled && tab==="record" && timerSec===null && todaySession.exercises.some(e=>e.sets.length>0) && (
          <div className="tsbar">
            <span className="tslbl">インターバルタイマー</span>
            <button className="tsbtn" onClick={startTimer}>⏱ 2分スタート</button>
          </div>
        )}
      </div>
      )}
    </>
  );
}
