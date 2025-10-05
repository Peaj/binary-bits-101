import React, { useMemo, useState, useEffect, useLayoutEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// --- Binary Bits — v1.2.3 ---
// Changes: goal generator now enforces short paths per level (1→3 steps),
// removed old fallback code that could produce long/boring goals.
// Kept: digit-added pre-animation, merge flight + ripple, par + hint,
// inverted stack with subtler overlap.

// ========== helpers ==========
const toBinary = (v, bits) => v.toString(2).padStart(bits, "0");
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const DEC_CLASS = "text-blue-900"; // contrasts well on yellow

// Operators
const OPS = {
  SHL:  { id: "SHL",  label: "<<", base: 2, tooltip: "Shift left (×2, mod 2^N)", apply: (v, { mask }) => (v << 1) & mask, showInBFS: true },
  ADD1: { id: "ADD1", label: "+1", base: 2, tooltip: "Add 1 (wrap)",           apply: (v, { mask }) => (v + 1) & mask, showInBFS: true },
  SHR:  { id: "SHR",  label: ">>", base: 2, tooltip: "Shift right (÷2, floor)",  apply: (v, { mask }) => (v >>> 1) & mask, showInBFS: true },
  NOT:  { id: "NOT",  label: "~",  base: 2, tooltip: "Bitwise NOT",              apply: (v, { mask }) => (~v) & mask, showInBFS: true },
};

const LEVEL_OPS = [
  ["SHL", "ADD1"],
  ["SHL", "ADD1"],
  ["SHL", "ADD1", "SHR"],
  ["SHL", "ADD1", "SHR", "NOT"],
];

function bitsForLevel(l) { return Math.min(8, 3 + l); }
function stepsBounds(level){
  if(level <= 1) return { min: 1, max: 1 };
  if(level === 2) return { min: 1, max: 2 };
  return { min: 1, max: 3 };
}
function maxParForLevel(l){ return stepsBounds(l).max; }

// BFS shortest path (par)
function bfsOptimal(start, goal, ops, ctx) {
  if (start === goal) return { dist: 0, path: [] };
  const max = (1 << ctx.bits);
  const vis = new Uint8Array(max);
  const q = new Uint16Array(max);
  const parent = new Uint16Array(max);
  const opFrom = new Uint8Array(max);
  let h = 0, t = 0; vis[start] = 1; q[t++] = start;
  const bfsOps = ops.filter(o => o.showInBFS);
  while (h < t) {
    const cur = q[h++];
    for (let i = 0; i < bfsOps.length; i++) {
      const next = bfsOps[i].apply(cur, ctx);
      if (!vis[next]) {
        vis[next] = 1; parent[next] = cur; opFrom[next] = i; q[t++] = next;
        if (next === goal) {
          const path = []; let v = next;
          while (v !== start) { const p = parent[v]; const w = opFrom[v]; path.push(bfsOps[w]); v = p; }
          path.reverse(); return { dist: path.length, path };
        }
      }
    }
  }
  return { dist: Infinity, path: [] };
}

// Generate a short, solvable queue where each goal is within the step bounds
function generateQueue({ current, bits, level, depth = 4 }) {
  const mask = (1 << bits) - 1;
  const ids = LEVEL_OPS[Math.min(level - 1, LEVEL_OPS.length - 1)];
  const allowed = ids.map(id => OPS[id]);
  const ctx = { bits, mask };

  const { min, max } = stepsBounds(level);
  const q = [];
  let base = current;

  for (let i = 0; i < depth; i++) {
    let target = base;
    let ok = false;

    // Try to synthesize an exact-in-bounds goal by applying 1..3 ops
    for (let attempt = 0; attempt < 20 && !ok; attempt++) {
      const steps = (min === max) ? min : randInt(min, max);
      let v = base;
      let lastOp = null;
      for (let s = 0; s < steps; s++) {
        // Avoid three identical ops in a row when steps===3
        let op = allowed[randInt(0, allowed.length - 1)];
        if (lastOp && lastOp.id === op.id && steps >= 3 && s === 2) {
          const pool = allowed.filter(o => o.id !== op.id);
          if (pool.length) op = pool[randInt(0, pool.length - 1)];
        }
        v = op.apply(v, ctx);
        lastOp = op;
      }
      if (level <= 2 && v === 0) continue; // avoid zero early
      if (v === base) continue;             // must change
      const { dist } = bfsOptimal(base, v, allowed, ctx);
      if (dist !== Infinity && dist >= min && dist <= max) { target = v; ok = true; }
    }

    // Soft fallback: still prefer short BFS distance ≤ max
    if (!ok) {
      let best = base, bestDist = Infinity;
      for (let attempt = 0; attempt < 24; attempt++) {
        let v = base; const sN = randInt(1, 3);
        for (let j = 0; j < sN; j++) { const op = allowed[randInt(0, allowed.length - 1)]; v = op.apply(v, ctx); }
        const { dist } = bfsOptimal(base, v, allowed, ctx);
        if (dist < bestDist) { best = v; bestDist = dist; }
        if (dist !== Infinity && dist <= max) { best = v; bestDist = dist; break; }
      }
      target = (bestDist === Infinity) ? ((base||1) & mask) : best;
    }

    q.push(target);
    base = target; // chain
  }
  return { queue: q, allowed, ctx };
}

// Visual bits
function BigBits({ value, bits, label }) {
  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div className="text-[10px] uppercase opacity-80">{label}</div>
      <div className="font-mono text-5xl tracking-[0.2em]">{toBinary(value, bits)}</div>
      <div className={`font-mono text-sm ${DEC_CLASS}`}><span className="opacity-60">dec</span> {value}</div>
    </div>
  );
}

function OperatorButton({ op, onClick }) {
  const isDec = op.base === 10;
  return (
    <button onClick={onClick} title={op.tooltip}
      className="relative px-4 py-3 rounded-2xl border-2 border-black text-lg font-semibold hover:bg-black/10 active:translate-y-[1px] transition font-mono">
      <span className={`absolute -top-2 -left-2 text-[10px] px-1.5 py-0.5 rounded-full border-2 ${isDec ? 'border-blue-900 text-blue-900' : 'border-black text-black'} bg-yellow-300`}> {isDec ? '10' : '2'} </span>
      {op.label}
    </button>
  );
}

// Simple WebAudio blip
function useBlip(){
  const ctxRef = useRef(null);
  const play = (freq=560, dur=0.12) => {
    try{
      if(!ctxRef.current) ctxRef.current = new (window.AudioContext||window.webkitAudioContext)();
      const actx = ctxRef.current;
      const t0 = actx.currentTime;
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain); gain.connect(actx.destination);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    }catch(_){/* ignore audio failures */}
  };
  return play;
}

// ========== component ==========
export default function App() {
  // core state
  const [level, setLevel]   = useState(1);
  const [bits, setBits]     = useState(bitsForLevel(1));
  const [current, setCurrent] = useState(1);
  const [queue, setQueue]   = useState([]);
  const [allowedOps, setAllowedOps] = useState([]);
  const [ctx, setCtx]       = useState({ bits, mask: (1 << bits) - 1 });

  // ux state
  const [history, setHistory] = useState([]);
  const [clears, setClears]   = useState(0);
  const [merging, setMerging] = useState(false);
  const [tick, setTick]       = useState(0);       // retry match detection after layout changes
  const [bitChanging, setBitChanging] = useState(false); // play digit-added pre-animation

  // refs for animation
  const bottomGoalRef = useRef(null);
  const currentRef    = useRef(null);
  const [flyer, setFlyer] = useState(null); // {value, from:{x,y}, to:{x,y}}
  const advancedRef = useRef(false);
  const retryRef = useRef(0);
  const prevBitsRef = useRef(bits);

  const blip = useBlip();

  const bottomGoal = queue.length ? queue[queue.length - 1] : undefined;

  // par + full hint path
  const { par, hint } = useMemo(() => {
    if (!queue.length || bottomGoal == null) return { par: undefined, hint: [] };
    const res = bfsOptimal(current, bottomGoal, allowedOps, ctx);
    return { par: res.dist === Infinity ? undefined : res.dist, hint: res.path || [] };
  }, [current, bottomGoal, allowedOps, ctx, queue]);

  // initialize / update level
  useEffect(() => {
    const b = bitsForLevel(level);
    const prevBits = prevBitsRef.current;
    const grew = b > prevBits;
    if (grew) setBitChanging(true);

    const { queue: q, allowed, ctx: ctxOut } = generateQueue({ current, bits: b, level });
    setBits(b);
    setQueue(q.slice().reverse());
    setAllowedOps(allowed);
    setCtx(ctxOut);

    if (grew) {
      // Run a short digit-added overlay, then re-enable merge and re-measure
      const t = setTimeout(() => { setBitChanging(false); setTick(tk => tk + 1); }, 380);
      return () => clearTimeout(t);
    }
  }, [level]);

  // track previous bits
  useEffect(() => { prevBitsRef.current = bits; }, [bits]);

  // match watcher → measure, create global flyer, play sfx, then advance
  useLayoutEffect(() => {
    if (!queue.length || bottomGoal == null) return;
    if (merging) return;
    if (bitChanging) return;
    if (current !== bottomGoal) return;

    const goalEl = bottomGoalRef.current;
    const curEl = currentRef.current;

    if (!goalEl || !curEl) {
      if (retryRef.current < 8) {
        retryRef.current += 1;
        requestAnimationFrame(() => setTick(t => t + 1));
        return;
      }
      // last resort: advance without animation (should be rare now)
      retryRef.current = 0;
      setMerging(true);
      setTimeout(() => { advance(); setMerging(false); }, 30);
      return;
    }

    const g = goalEl.getBoundingClientRect();
    const c = curEl.getBoundingClientRect();
    const from = { x: g.left + g.width / 2, y: g.top + g.height / 2 };
    const to   = { x: c.left + c.width / 2, y: c.top + c.height / 2 };

    setMerging(true);
    advancedRef.current = false;

    // success cadence
    blip(560, 0.085);
    setTimeout(() => blip(840, 0.07), 60);

    setFlyer({ value: bottomGoal, from, to });

    const failSafe = setTimeout(() => {
      if (!advancedRef.current) {
        advancedRef.current = true;
        setFlyer(null);
        advance();
      }
    }, 1200);
    return () => clearTimeout(failSafe);
  }, [current, bottomGoal, queue, merging, tick, bits, bitChanging]);

  const applyOp = (op) => {
    const next = op.apply(current, ctx);
    setHistory(h => [...h, { prev: current, next }]);
    setCurrent(next);
  };

  const advance = () => {
    if (bottomGoal == null) { setMerging(false); return; }
    const newCurrent = bottomGoal;
    const rest = queue.slice(0, -1);
    const { queue: q2 } = generateQueue({ current: newCurrent, bits, level, depth: 1 });
    setCurrent(newCurrent);
    setQueue([...q2, ...rest]);
    setHistory([]);
    setClears(n => { const n2 = n + 1; if (n2 >= 3) { setLevel(L => Math.min(L + 1, LEVEL_OPS.length)); return 0; } return n2; });
    setMerging(false);
  };

  // ========== render ==========
  return (
    <div className="min-h-screen bg-yellow-300 text-black px-4 py-6 font-sans relative overflow-hidden">
      <div className="max-w-md mx-auto flex flex-col items-center gap-6">
        {/* Header */}
        <div className="flex justify-between items-center w-full">
          <div className="font-bold text-2xl tracking-tight">Binary Bits 101</div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">lvl {level} · bits {bits}</span>
            <span className="text-[10px] font-mono px-2 py-0.5 border-2 border-black rounded-full">v1.2.3</span>
          </div>
        </div>

        {/* Goals stack inverted (bottom is current goal) */}
        <div className="w-full">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] uppercase opacity-80">goals</div>
            <div className="flex items-center gap-3">
              <div className="font-mono text-xs">par {par ?? '–'}</div>
              {hint.length > 0 && (
                <div className="font-mono text-[10px] opacity-70">hint: {hint.map(o => o.label).join(' · ')}</div>
              )}
            </div>
          </div>
          <div className="relative h-44 w-full flex flex-col items-center justify-end overflow-visible">
            {queue.map((g, idx) => {
              const rel = queue.length - 1 - idx; // 0 is bottom
              const isBottom = rel === 0;
              const hideBottomWhileMerging = isBottom && merging; // animate via global flyer
              return (
                <AnimatePresence key={idx + ":wrp"}>
                  {!hideBottomWhileMerging && (
                    <motion.div key={idx + ":" + g}
                      className="absolute"
                      style={{ bottom: rel * 30 }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: isBottom ? 1 : Math.max(0, 0.25 - rel * 0.05), scale: 1 - rel * 0.15 }}
                      ref={isBottom ? bottomGoalRef : undefined}
                    >
                      <div className="border-2 border-black rounded-xl px-4 py-3 bg-black/0">
                        <div className={`font-mono tracking-[0.2em] text-5xl text-center`}>{toBinary(g, bits)}</div>
                        <div className={`text-center font-mono text-xs ${DEC_CLASS}`}><span className="opacity-60">dec</span> {g}</div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              );
            })}
          </div>
        </div>

        {/* Current */}
        <div className="relative" ref={currentRef}>
          <BigBits value={current} bits={bits} label="current" />
          {/* Digit-added overlay animation */}
          <AnimatePresence>
            {bitChanging && (
              <motion.div
                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-black bg-yellow-300"
                initial={{ opacity: 0, scaleX: 0.7, scaleY: 0.9 }}
                animate={{ opacity: 1, scaleX: 1.08, scaleY: 1.02 }}
                exit={{ opacity: 0, scaleX: 1.0, scaleY: 1.0 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                style={{ width: 260, height: 90 }}
              >
                <div className="absolute inset-0 flex items-center justify-center font-mono text-xs opacity-60">+1 bit</div>
              </motion.div>
            )}
          </AnimatePresence>
          {/* Ripple & bloom on overlap */}
          <AnimatePresence>
            {merging && (
              <>
                <motion.div
                  className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black"
                  initial={{ width: 0, height: 0, opacity: 0.6 }}
                  animate={{ width: 240, height: 240, opacity: 0 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
                <motion.div
                  className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ boxShadow: '0 0 60px rgba(0,0,0,0.35)' }}
                  initial={{ opacity: 0.0, scale: 0.9 }}
                  animate={{ opacity: 1.0, scale: 1.05 }}
                  exit={{ opacity: 0, scale: 1.1 }}
                  transition={{ duration: 0.35 }}
                />
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Global flyer that animates goal → current */}
        <AnimatePresence>
          {merging && flyer && (
            <motion.div
              className="z-50 pointer-events-none"
              style={{ position: 'fixed', transform: 'translate(-50%, -50%)' }}
              initial={{ left: flyer.from.x, top: flyer.from.y, opacity: 1 }}
              animate={{ left: flyer.to.x, top: flyer.to.y, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              onAnimationComplete={() => { if (!advancedRef.current) { advancedRef.current = true; setFlyer(null); advance(); } retryRef.current = 0; }}
            >
              <div className="border-2 border-black rounded-xl px-4 py-3 bg-black/0">
                <div className={`font-mono tracking-[0.2em] text-5xl text-center`}>{toBinary(flyer.value ?? 0, bits)}</div>
                <div className={`text-center font-mono text-xs ${DEC_CLASS}`}><span className="opacity-60">dec</span> {flyer.value ?? 0}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Operators */}
        <div className="grid grid-cols-2 gap-3 w-full">
          {allowedOps.map(op => (<OperatorButton key={op.id} op={op} onClick={() => applyOp(op)} />))}
        </div>

        {/* Legend hint (tiny) */}
        <div className="text-[10px] font-mono opacity-80 text-center">
          <span className="mr-3">Badge ² = binary operator</span>
          <span className={`${DEC_CLASS}`}>Badge 10 = decimal operator</span>
        </div>
      </div>
    </div>
  );
}

// ========== DEV SELF-TESTS (non-blocking) ==========
(function runSelfTests(){
  try{
    const bits4=4, mask4=(1<<bits4)-1; const ctx4={bits:bits4,mask:mask4};
    const allow4=[OPS.SHL, OPS.ADD1];
    let r = bfsOptimal(1,2,allow4,ctx4); console.assert(r.dist===1, 'BFS 1->2 should be 1 (<<)');
    r = bfsOptimal(1,3,allow4,ctx4); console.assert(r.dist===2, 'BFS 1->3 should be 2');

    for(let i=0;i<10;i++){
      const {queue:q, allowed:allow, ctx:cx} = generateQueue({ current:1, bits:4, level:1, depth:3 });
      const qr = q.slice().reverse();
      const bottom = qr[qr.length - 1];
      console.assert(bottom !== 0, 'L1 bottom should avoid 0000');
      const rr = bfsOptimal(1, bottom, allow, cx);
      console.assert(rr.dist<=maxParForLevel(1), 'bottom par <= cap');
    }

    const bits5=5, mask5=(1<<bits5)-1; const ctx5={bits:bits5,mask:mask5};
    const allow5=[OPS.SHL, OPS.ADD1];
    const r5 = bfsOptimal(0b10001, 0b10101, allow5, ctx5);
    console.assert(r5.dist!==Infinity, 'BFS 5-bit path exists 10001→10101');
  }catch(e){
    console.warn('Self tests encountered an error:', e);
  }
})();
