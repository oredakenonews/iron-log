import { useState, useEffect, useRef } from "react";

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

const EXERCISES = [
  "ベンチプレス","スクワット","デッドリフト","ショルダープレス",
  "サイドレイズ","ラットプルダウン","ベントオーバーロウ","レッグプレス","ダンベルカール",
  "トライセプスプレス","ケーブルクロス","レッグカール","チェストフライ",
  "インクラインプレス","ディップス","チンニング","レッグエクステンション"
];

const STORAGE_KEY = "gym-tracker-v2";
const TODAY = new Date().toISOString().split("T")[0];

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
}
function shortDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveData(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
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
  const [tab, setTab] = useState("record");
  const [sessions, setSessions] = useState(() => loadData());
  const [pickingExercise, setPickingExercise] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [setInputs, setSetInputs] = useState({});
  const [timerSec, setTimerSec] = useState(null);
  const [showTimer, setShowTimer] = useState(false);
  const [chartExercise, setChartExercise] = useState(null);
  const [chartMetric, setChartMetric] = useState("volume");
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
    clearTimeout(timerRef.current);
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    } catch {}
    setTimerSec(INTERVAL_SEC); setShowTimer(true);
  };
  const stopTimer = () => { clearTimeout(timerRef.current); setTimerSec(null); setShowTimer(false); };

  const todaySession = sessions[TODAY] || { date: TODAY, exercises: [] };

  const updateSessions = (updated) => {
    const next = { ...sessions, [TODAY]: updated };
    setSessions(next);
    saveData(next);
    setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1200);
  };

  const addExercise = (name) => {
    const ex = { id: Date.now(), name, sets: [] };
    updateSessions({ ...todaySession, exercises: [...todaySession.exercises, ex] });
    setPickingExercise(false);
  };
  const removeExercise = (exId) =>
    updateSessions({ ...todaySession, exercises: todaySession.exercises.filter(e => e.id !== exId) });
  const addSet = (exId) => {
    const inp = setInputs[exId] || {};
    if (!inp.weight || !inp.reps) return;
    const newSet = { id: Date.now(), weight: parseFloat(inp.weight), reps: parseInt(inp.reps) };
    const exes = todaySession.exercises.map(e => e.id === exId ? { ...e, sets: [...e.sets, newSet] } : e);
    updateSessions({ ...todaySession, exercises: exes });
    setSetInputs(prev => ({ ...prev, [exId]: { weight: "", reps: "" } }));
    startTimer();
  };
  const removeSet = (exId, setId) => {
    const exes = todaySession.exercises.map(e =>
      e.id === exId ? { ...e, sets: e.sets.filter(s => s.id !== setId) } : e);
    updateSessions({ ...todaySession, exercises: exes });
  };
  const totalVolume = (exercises) =>
    exercises.reduce((sum, e) => sum + e.sets.reduce((s2, s) => s2 + s.weight * s.reps, 0), 0);

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
            content: `あなたはプロのパーソナルトレーナーです。以下のトレーニング記録を分析して、日本語で具体的なアドバイスを3〜5文でください。重量の伸び・セット構成・種目バランス・次回への提案を含めてください。\n\n${summary}`
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

  const sortedHistory = Object.values(sessions).sort((a,b) => b.date.localeCompare(a.date));
  const usedExercises = todaySession.exercises.map(e => e.name);
  const totalSets = todaySession.exercises.reduce((s, e) => s + e.sets.length, 0);
  const isDone = timerSec !== null && timerSec <= 0;
  const mm = timerSec !== null ? String(Math.floor(Math.max(timerSec,0)/60)) : "2";
  const ss_str = timerSec !== null ? String(Math.max(timerSec,0)%60).padStart(2,"0") : "00";
  const circumference = 2 * Math.PI * 54;
  const dashOffset = timerSec !== null && !isDone ? circumference*(timerSec/INTERVAL_SEC) : isDone ? 0 : circumference;

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+JP:wght@400;600;800&display=swap'); *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;} body{background:#f2f2f7;color-scheme:light;} .app{min-height:100vh;background:#f2f2f7;color:#111;font-family:'Noto Sans JP',sans-serif;max-width:430px;margin:0 auto;} .header{padding:22px 20px 0;display:flex;align-items:center;justify-content:space-between;} .logo{font-family:'Bebas Neue',sans-serif;font-size:38px;letter-spacing:3px;background:linear-gradient(135deg,#e84c1e,#e8003d);-webkit-background-clip:text;-webkit-text-fill-color:transparent;} .saved{font-size:16px;color:#16a34a;font-weight:800;opacity:0;transition:opacity 0.3s;} .saved.on{opacity:1;} .tabs{display:flex;margin:14px 16px 0;gap:4px;background:#ddd;padding:5px;border-radius:16px;} .tb{flex:1;padding:13px 0;border:none;border-radius:12px;background:transparent;color:#666;font-size:15px;font-family:'Noto Sans JP',sans-serif;cursor:pointer;font-weight:700;} .tb.on{background:linear-gradient(135deg,#e84c1e,#e8003d);color:#fff;box-shadow:0 2px 10px rgba(232,76,30,.35);} .content{padding:16px 16px 130px;} .dh{font-size:17px;color:#666;margin-bottom:14px;font-weight:700;} .vbar{display:flex;justify-content:space-between;align-items:center;background:#fff;border-radius:18px;padding:16px 20px;margin-bottom:14px;box-shadow:0 2px 8px rgba(0,0,0,.08);} .vlbl{font-size:14px;color:#999;margin-bottom:2px;font-weight:700;} .vsets{font-size:16px;color:#555;font-weight:700;} .vval{font-family:'Bebas Neue',sans-serif;font-size:38px;color:#111;} .excard{background:#fff;border-radius:20px;margin-bottom:16px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.09);animation:si .2s ease;} @keyframes si{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}} .exhdr{display:flex;align-items:center;justify-content:space-between;padding:16px 16px 12px;} .exname{font-weight:800;font-size:20px;color:#111;} .exmeta{font-size:14px;color:#999;margin-top:3px;font-weight:600;} .exdel{background:none;border:none;color:#ccc;cursor:pointer;font-size:22px;padding:6px;} .stbl{padding:0 16px;} .srow{display:flex;align-items:center;gap:8px;padding:12px 0;border-top:2px solid #f5f5f5;} .snum{font-family:'Bebas Neue',sans-serif;font-size:16px;color:#ccc;width:30px;flex-shrink:0;} .swt{font-family:'Bebas Neue',sans-serif;font-size:34px;color:#e84c1e;line-height:1;} .su{font-size:15px;color:#aaa;font-weight:700;} .sx{font-size:18px;color:#ddd;margin:0 4px;} .srep{font-family:'Bebas Neue',sans-serif;font-size:34px;color:#111;line-height:1;} .svol{font-size:13px;color:#ccc;margin-left:auto;font-weight:700;} .sdel{background:none;border:none;color:#ddd;cursor:pointer;font-size:18px;padding:4px 6px;} .addrow{display:flex;align-items:center;gap:8px;padding:12px 16px 14px;border-top:2px solid #f5f5f5;background:#fafafa;} input{background:#fff;border:2.5px solid #e5e5e5;border-radius:12px;color:#111;font-family:'Noto Sans JP',sans-serif;font-size:22px;font-weight:800;padding:11px 8px;outline:none;text-align:center;transition:border-color .2s;} input:focus{border-color:#e84c1e;} .wi{width:84px;} .ri{width:72px;} .ilbl{font-size:14px;color:#bbb;text-align:center;margin-top:4px;font-weight:700;} .addbtn{background:linear-gradient(135deg,#e84c1e,#e8003d);border:none;border-radius:12px;color:#fff;font-size:28px;width:52px;height:52px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 10px rgba(232,76,30,.35);transition:transform .1s;} .addbtn:active{transform:scale(.9);} .addex{width:100%;padding:20px;background:#fff;border:2.5px dashed #ddd;border-radius:18px;color:#bbb;font-family:'Noto Sans JP',sans-serif;font-size:18px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 1px 4px rgba(0,0,0,.05);} .addex:active{border-color:#e84c1e;color:#e84c1e;} .pov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100;display:flex;align-items:flex-end;} .psh{background:#fff;border-radius:26px 26px 0 0;width:100%;max-height:72vh;overflow-y:auto;padding:20px 0 54px;animation:su .25s ease;} @keyframes su{from{transform:translateY(100%)}to{transform:translateY(0)}} .ptitle{font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:2px;color:#e84c1e;padding:0 20px 16px;border-bottom:2px solid #f5f5f5;} .pitem{padding:20px;font-size:19px;font-weight:700;cursor:pointer;border-bottom:1.5px solid #f8f8f8;display:flex;justify-content:space-between;align-items:center;color:#111;} .pitem:active{background:#fff5f0;} .pitem.used{color:#ddd;pointer-events:none;} .stitle{font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:2px;color:#e84c1e;margin-bottom:14px;} .csec{background:#fff;border-radius:20px;padding:18px;margin-bottom:16px;box-shadow:0 2px 10px rgba(0,0,0,.08);} .cstitle{font-size:15px;color:#999;margin-bottom:12px;font-weight:700;} .exscroll{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;} .exscroll::-webkit-scrollbar{display:none;} .echip{flex-shrink:0;padding:10px 18px;border-radius:50px;border:2.5px solid #e5e5e5;background:transparent;color:#888;font-size:15px;font-family:'Noto Sans JP',sans-serif;cursor:pointer;white-space:nowrap;font-weight:700;} .echip.on{border-color:#e84c1e;color:#e84c1e;background:#fff5f0;} .mtog{display:flex;gap:8px;margin:14px 0 16px;} .mbtn{flex:1;padding:13px 0;border-radius:12px;border:2.5px solid #e5e5e5;background:transparent;color:#888;font-size:16px;font-family:'Noto Sans JP',sans-serif;cursor:pointer;font-weight:800;} .mbtn.on{border-color:#e84c1e;color:#e84c1e;background:#fff5f0;} .cstats{display:flex;gap:10px;margin-top:14px;} .sbox{flex:1;background:#f8f8f8;border-radius:14px;padding:14px 12px;} .slbl{font-size:14px;color:#aaa;margin-bottom:4px;font-weight:700;} .sval{font-family:'Bebas Neue',sans-serif;font-size:30px;color:#e84c1e;line-height:1;} .sunt{font-size:13px;color:#bbb;font-weight:700;} .hcard{background:#fff;border-radius:20px;padding:18px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,.07);} .hhdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;} .hdate{font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:1px;color:#111;} .hvol{font-size:15px;color:#aaa;font-weight:700;} .hex{margin-bottom:10px;} .hexname{font-size:16px;color:#e84c1e;font-weight:800;margin-bottom:6px;} .hsets{display:flex;gap:6px;flex-wrap:wrap;} .hchip{background:#f5f5f5;border-radius:10px;padding:7px 13px;} .hl{font-size:13px;color:#bbb;font-weight:700;} .hn{font-family:'Bebas Neue',sans-serif;font-size:22px;color:#111;} .aicard{background:#fff;border-radius:18px;padding:18px;margin-bottom:16px;font-size:17px;color:#777;line-height:1.85;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.07);} .aibtn{width:100%;padding:18px;background:#fff;border:3px solid #e84c1e;border-radius:18px;color:#e84c1e;font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:2px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 2px 8px rgba(0,0,0,.07);} .aibub{margin-top:16px;background:#fff;border:2.5px solid #ede8ff;border-radius:18px;padding:20px;font-size:17px;line-height:1.95;color:#333;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.07);} .ailbl{font-size:14px;color:#7c3aed;letter-spacing:2px;margin-bottom:10px;display:flex;align-items:center;gap:6px;font-weight:800;} .pulse{width:8px;height:8px;background:#7c3aed;border-radius:50%;animation:p 1.2s infinite;} @keyframes p{0%,100%{opacity:1}50%{opacity:.3}} .dots span{display:inline-block;width:7px;height:7px;background:#e84c1e;border-radius:50%;animation:b .8s infinite;margin:0 2px;} .dots span:nth-child(2){animation-delay:.15s}.dots span:nth-child(3){animation-delay:.3s} @keyframes b{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}} .empty{text-align:center;color:#ccc;padding:50px 0;font-size:17px;line-height:2.4;font-weight:700;} .tov{position:fixed;inset:0;background:rgba(255,255,255,.97);z-index:200;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;} .tov.done{background:rgba(240,255,245,.98);} .ttitle{font-size:18px;color:#aaa;letter-spacing:3px;font-weight:800;} .tsvg{position:relative;} .tsvg svg{transform:rotate(-90deg);} .tsvg .rt{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;} .ttime{font-family:'Bebas Neue',sans-serif;font-size:80px;line-height:1;color:#111;letter-spacing:4px;} .tdone{font-family:'Bebas Neue',sans-serif;font-size:44px;color:#16a34a;letter-spacing:6px;animation:pop .4s ease;} @keyframes pop{from{transform:scale(.7);opacity:0}to{transform:scale(1);opacity:1}} .thint{font-size:16px;color:#bbb;font-weight:700;} .tclosebtn{padding:18px 52px;background:#f5f5f5;border:2.5px solid #e0e0e0;border-radius:50px;color:#666;font-family:'Noto Sans JP',sans-serif;font-size:18px;font-weight:800;cursor:pointer;} .tmini{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:430px;background:#fff;border-top:3px solid #e84c1e;padding:16px 20px 36px;display:flex;align-items:center;justify-content:space-between;z-index:50;cursor:pointer;box-shadow:0 -4px 16px rgba(0,0,0,.1);} .tml{display:flex;align-items:center;gap:12px;} .tmlbl{font-size:15px;color:#aaa;font-weight:700;} .tmtime{font-family:'Bebas Neue',sans-serif;font-size:40px;color:#e84c1e;line-height:1;} .tmstop{background:none;border:2.5px solid #e0e0e0;border-radius:10px;color:#888;font-size:16px;font-weight:800;padding:10px 18px;cursor:pointer;font-family:'Noto Sans JP',sans-serif;} .tsbar{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:430px;background:#fff;border-top:2px solid #eee;padding:14px 20px 36px;display:flex;align-items:center;justify-content:space-between;z-index:50;box-shadow:0 -2px 10px rgba(0,0,0,.06);} .tslbl{font-size:16px;color:#bbb;font-weight:700;} .tsbtn{display:flex;align-items:center;gap:8px;background:none;border:2.5px solid #e0e0e0;border-radius:14px;color:#888;font-size:17px;font-weight:800;padding:12px 22px;cursor:pointer;font-family:'Noto Sans JP',sans-serif;} .csvbtn{display:flex;align-items:center;gap:8px;background:none;border:2.5px solid #e0e0e0;border-radius:14px;color:#888;font-size:16px;font-weight:800;padding:12px 20px;cursor:pointer;font-family:'Noto Sans JP',sans-serif;white-space:nowrap;} .csvbtn:active{border-color:#e84c1e;color:#e84c1e;} .histhdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;} .histhdr .stitle{margin-bottom:0;}`}</style>
      <div className="app">
        <div className="header">
          <div className="logo">IRON LOG</div>
          <div className={`saved ${savedFlash?"on":""}`}>✓ 保存</div>
        </div>
        <div className="tabs">
          <button className={`tb ${tab==="record"?"on":""}`} onClick={()=>setTab("record")}>📝 記録</button>
          <button className={`tb ${tab==="history"?"on":""}`} onClick={()=>setTab("history")}>📊 履歴</button>
          <button className={`tb ${tab==="ai"?"on":""}`} onClick={()=>setTab("ai")}>🤖 AI</button>
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
                          <span className="swt">{s.weight}</span>
                          <span className="su">kg</span>
                          <span className="sx">×</span>
                          <span className="srep">{s.reps}</span>
                          <span className="su">rep</span>
                          <span className="svol">{(s.weight*s.reps).toLocaleString()}kg</span>
                          <button className="sdel" onClick={()=>removeSet(ex.id,s.id)}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="addrow">
                    <div>
                      <input className="wi" type="number" placeholder="重量" value={inp.weight}
                        onChange={e=>setSetInputs(p=>({...p,[ex.id]:{...inp,weight:e.target.value}}))}
                        onKeyDown={e=>e.key==="Enter"&&addSet(ex.id)}/>
                      <div className="ilbl">kg</div>
                    </div>
                    <div>
                      <input className="ri" type="number" placeholder="回数" value={inp.reps}
                        onChange={e=>setSetInputs(p=>({...p,[ex.id]:{...inp,reps:e.target.value}}))}
                        onKeyDown={e=>e.key==="Enter"&&addSet(ex.id)}/>
                      <div className="ilbl">rep</div>
                    </div>
                    <button className="addbtn" onClick={()=>addSet(ex.id)}>＋</button>
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
                <div className="exscroll">
                  {allExerciseNames.map(name=>(
                    <button key={name} className={`echip ${chartExercise===name?"on":""}`}
                      onClick={()=>setChartExercise(chartExercise===name?null:name)}>{name}</button>
                  ))}
                </div>
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
              {sortedHistory.length>0 && (
                <button className="csvbtn" onClick={exportCSV}>📥 CSV</button>
              )}
            </div>
            {sortedHistory.length===0 && <div className="empty">まだ記録がありません<br/>ワークアウトを記録してみよう！</div>}
            {sortedHistory.map(session=>(
              <div className="hcard" key={session.date}>
                <div className="hhdr">
                  <span className="hdate">{formatDate(session.date)}</span>
                  <span className="hvol">Vol. {totalVolume(session.exercises).toLocaleString()}kg</span>
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
        </div>

        {pickingExercise && (
          <div className="pov" onClick={()=>setPickingExercise(false)}>
            <div className="psh" onClick={e=>e.stopPropagation()}>
              <div className="ptitle">種目を選択</div>
              {EXERCISES.map(ex=>{
                const used=usedExercises.includes(ex);
                return (
                  <div key={ex} className={`pitem ${used?"used":""}`} onClick={()=>!used&&addExercise(ex)}>
                    {ex}
                    {used&&<span style={{fontSize:14,color:"#ddd",fontWeight:700}}>追加済み</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {showTimer && timerSec!==null && (
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

        {tab==="record" && timerSec!==null && !showTimer && (
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

        {tab==="record" && timerSec===null && todaySession.exercises.some(e=>e.sets.length>0) && (
          <div className="tsbar">
            <span className="tslbl">インターバルタイマー</span>
            <button className="tsbtn" onClick={startTimer}>⏱ 2分スタート</button>
          </div>
        )}
      </div>
    </>
  );
}
