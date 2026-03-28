import { useState, useEffect, useCallback, useRef } from "react";

// ─── IndexedDB ────────────────────────────────────────────────────────────────
class DB {
  constructor() { this.db = null; this.ready = this._init(); }
  _init() {
    return new Promise((res, rej) => {
      const req = indexedDB.open("FlagFootball", 7);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        ["players","games","plays","defPlays","insights"].forEach(s => {
          if (!db.objectStoreNames.contains(s))
            db.createObjectStore(s, { keyPath: "id", autoIncrement: true });
        });
      };
      req.onsuccess = (e) => { this.db = e.target.result; res(); };
      req.onerror = () => rej(req.error);
    });
  }
  async getAll(store) {
    await this.ready;
    return new Promise((res, rej) => {
      const tx = this.db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  async add(store, data) {
    await this.ready;
    return new Promise((res, rej) => {
      const tx = this.db.transaction(store, "readwrite");
      const req = tx.objectStore(store).add(data);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  async put(store, data) {
    await this.ready;
    return new Promise((res, rej) => {
      const tx = this.db.transaction(store, "readwrite");
      const req = tx.objectStore(store).put(data);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  async delete(store, id) {
    await this.ready;
    return new Promise((res, rej) => {
      const tx = this.db.transaction(store, "readwrite");
      const req = tx.objectStore(store).delete(id);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
  }
}
const db = new DB();

// ─── Constants ────────────────────────────────────────────────────────────────
const ROLES        = ["QB","WR","RB","C"];
const OFF_TYPES    = ["Catch","Carry"];
const OFF_RESULTS  = ["TD","Flag Pulled","No Flag Pulled","Incomplete"];
const DIRS         = ["L","C","R"];
const OPP_TYPES    = ["Pass Short","Pass Deep","Run"];
const TERMS        = ["Spring","Summer","Fall"];
const YEARS        = ["2024","2025","2026","2027"];
const DEF_GROUPS   = [
  { key:"stopped",  label:"Stopped",  color:"teal",   items:["Flag Pull","Out of Bounds","Incomplete Forced"] },
  { key:"turnover", label:"Turnover", color:"accent", items:["Interception","Turnover on Downs"] },
  { key:"bad",      label:"Against",  color:"orange", items:["TD Allowed","Penalty"] },
];
const OFF_PEN_OPTIONS = ["Flag Guarding","Offsides","Other"];
const DEF_PEN_OPTIONS = ["Offsides","Other"];

function seasonLabel(term, year) { return `${term} ${year}`; }
function allSeasons() {
  const out = [];
  YEARS.forEach(y => TERMS.forEach(t => out.push(seasonLabel(t, y))));
  return out;
}
function detectCurrentSeason(games) {
  if (!games.length) return seasonLabel("Spring", new Date().getFullYear());
  const latest = [...games].sort((a,b) => (b.createdAt||0)-(a.createdAt||0))[0];
  return latest.season;
}

function initDown() { return { zone:"midfield", down:1, maxDowns:4 }; }
function nextDown(s) {
  if (s.down < s.maxDowns) return { ...s, down:s.down+1 };
  if (s.zone==="midfield") return { zone:"scoring", down:1, maxDowns:3 };
  return initDown();
}

// ─── Tokens ───────────────────────────────────────────────────────────────────
const G = {
  bg:"#080c12", surface:"#0f1520", card:"#141c28", border:"#1c2840",
  accent:"#00e5ff", accentDim:"#00b8cc",
  green:"#00e676", red:"#ff1744", yellow:"#ffd600",
  orange:"#ff6d00", teal:"#1de9b6",
  text:"#e8f4ff", muted:"#4a6a8a",
  font:"'Barlow Condensed','Arial Narrow',sans-serif",
  mono:"'Roboto Mono',monospace",
};
const COL = { teal:G.teal, accent:G.accent, orange:G.orange, green:G.green, red:G.red, yellow:G.yellow };

const css = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,400;0,600;0,700;0,800;1,700&family=Roboto+Mono:wght@500&display=swap');
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{background:${G.bg};color:${G.text};font-family:${G.font};min-height:100vh;overscroll-behavior:none}
button{cursor:pointer;border:none;background:none;font-family:${G.font}}
input,select,textarea{font-family:${G.font};color:${G.text}}
.app{max-width:480px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column}

.nav{background:${G.surface};border-bottom:1px solid ${G.border};display:flex;position:sticky;top:0;z-index:100}
.nav-btn{flex:1;padding:13px 2px 11px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${G.muted};border-bottom:2px solid transparent;transition:all .15s}
.nav-btn.active{color:${G.accent};border-bottom-color:${G.accent}}

.hdr{padding:18px 16px 10px}
.hdr h1{font-size:30px;font-weight:800;letter-spacing:-.02em}
.hdr h1 em{color:${G.accent};font-style:normal}
.hdr p{color:${G.muted};font-size:13px;margin-top:2px}

.card{background:${G.card};border:1px solid ${G.border};border-radius:12px;padding:14px;margin-bottom:10px}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px 18px;border-radius:9px;font-size:14px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;transition:all .1s;font-family:${G.font}}
.btn-primary{background:${G.accent};color:${G.bg}}
.btn-primary:active{background:${G.accentDim};transform:scale(.97)}
.btn-ghost{background:${G.border};color:${G.text}}
.btn-ghost:active{opacity:.7;transform:scale(.97)}
.btn-danger{background:${G.red}22;color:${G.red};border:1px solid ${G.red}44}
.btn-danger:active{background:${G.red}33}
.btn-end{background:${G.orange}22;color:${G.orange};border:1px solid ${G.orange}44}
.btn-export{background:${G.accent}18;color:${G.accent};border:1px solid ${G.accent}44}
.btn-sm{padding:6px 12px;font-size:12px;border-radius:7px}
.btn-full{width:100%}

.btn-log{width:100%;padding:17px;font-size:17px;border-radius:12px;margin-top:4px;background:${G.surface};border:1px dashed ${G.border};color:${G.muted};transition:all .15s;font-family:${G.font};font-weight:800;letter-spacing:.04em;text-transform:uppercase;cursor:pointer}
.btn-log.ready{background:${G.accent};color:${G.bg};border:none}
.btn-log.ready:active{background:${G.accentDim};transform:scale(.98)}
.btn-log.pen-active{background:${G.yellow};color:${G.bg};border:none}
.btn-log.pen-active:active{opacity:.85;transform:scale(.98)}

.tg{display:grid;gap:7px;margin-bottom:14px}
.tg-2{grid-template-columns:1fr 1fr}
.tg-3{grid-template-columns:1fr 1fr 1fr}
.tg-4{grid-template-columns:1fr 1fr 1fr 1fr}
.tg-auto{grid-template-columns:repeat(auto-fill,minmax(88px,1fr))}

.tb{padding:14px 6px;border-radius:10px;font-size:15px;font-weight:800;letter-spacing:.02em;text-transform:uppercase;background:${G.surface};color:${G.text};border:2px solid ${G.border};transition:all .1s;text-align:center;line-height:1.2;cursor:pointer;font-family:${G.font}}
.tb:active{transform:scale(.93)}
.tb.sel{border-color:${G.accent};background:${G.accent}1a;color:${G.accent}}
.tb.sel-multi{border-color:${G.green};background:${G.green}1a;color:${G.green}}

.rc-td{background:${G.green}14;color:${G.green};border-color:${G.green}44}
.rc-td.sel{border-color:${G.green};background:${G.green}28}
.rc-fp{background:${G.teal}14;color:${G.teal};border-color:${G.teal}44}
.rc-fp.sel{border-color:${G.teal};background:${G.teal}28}
.rc-nfp{background:${G.muted}18;color:${G.text};border-color:${G.muted}44}
.rc-nfp.sel{border-color:${G.text};background:${G.border}}
.rc-inc{background:${G.red}12;color:${G.red};border-color:${G.red}33}
.rc-inc.sel{border-color:${G.red};background:${G.red}28}

.dir-l{border-left:3px solid ${G.accent}55}
.dir-r{border-right:3px solid ${G.accent}55}

/* Progressive disclosure */
.pd-groups{display:flex;gap:7px;margin-bottom:0}
.pd-group-btn{flex:1;padding:12px 6px;border-radius:10px;font-size:13px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;background:${G.surface};color:${G.muted};border:2px solid ${G.border};cursor:pointer;font-family:${G.font};transition:all .12s;text-align:center;line-height:1.2}
.pd-group-btn:active{transform:scale(.94)}
.pd-group-btn .pd-val{display:block;font-size:12px;font-weight:800;margin-top:2px}
.pd-panel{border-radius:0 0 10px 10px;border:2px solid ${G.border};border-top:none;margin-top:-4px;padding:10px 8px 8px;background:${G.card};margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap}
.pd-sub-btn{flex:1;min-width:80px;padding:11px 8px;border-radius:8px;font-size:13px;font-weight:800;letter-spacing:.02em;text-transform:uppercase;background:${G.surface};color:${G.text};border:2px solid ${G.border};cursor:pointer;font-family:${G.font};transition:all .1s;text-align:center}
.pd-sub-btn:active{transform:scale(.94)}

/* Penalty */
.pen-toggle{width:100%;padding:12px 14px;border-radius:10px;font-size:13px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;background:${G.surface};color:${G.muted};border:2px dashed ${G.border};cursor:pointer;font-family:${G.font};transition:all .12s;text-align:left;display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
.pen-toggle.active{background:${G.yellow}12;color:${G.yellow};border-color:${G.yellow}55;border-style:solid}
.pen-toggle.open .pen-caret{transform:rotate(180deg)}
.pen-caret{font-size:10px;opacity:.5;transition:transform .15s}
.pen-sub-panel{background:${G.yellow}08;border:2px solid ${G.yellow}33;border-top:none;border-radius:0 0 10px 10px;margin-top:-4px;padding:10px 8px 8px;margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap}
.pen-sub-btn{flex:1;min-width:90px;padding:10px 8px;border-radius:8px;font-size:13px;font-weight:800;letter-spacing:.02em;text-transform:uppercase;background:${G.yellow}12;color:${G.yellow};border:1px solid ${G.yellow}33;cursor:pointer;font-family:${G.font};transition:all .1s;text-align:center}
.pen-sub-btn:active{transform:scale(.94)}
.pen-sub-btn.sel{background:${G.yellow};color:${G.bg};border-color:${G.yellow}}

/* Down tracker */
.dt{display:flex;align-items:center;justify-content:space-between;background:${G.surface};border:1px solid ${G.border};border-radius:11px;padding:10px 14px;margin-bottom:10px}
.dt-dot{width:9px;height:9px;border-radius:50%;background:${G.border};transition:background .2s}
.dt-dot.on{background:${G.accent}}
.dt-dots{display:flex;gap:6px}
.dt-zone{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${G.muted}}
.dt-zone.score{color:${G.yellow}}
.dt-label{font-size:20px;font-weight:800}
.dt-actions{display:flex;flex-direction:column;align-items:flex-end;gap:7px}

/* Tabs */
.tabs{display:flex;background:${G.surface};border-radius:11px;padding:3px;margin-bottom:14px;gap:3px;border:1px solid ${G.border}}
.tab{flex:1;padding:9px;border-radius:9px;font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${G.muted};transition:all .15s;cursor:pointer;font-family:${G.font};border:none;background:none}
.tab.active{background:${G.accent};color:${G.bg}}
.tab.active-def{background:${G.red};color:#fff}

/* Step labels */
.step-lbl{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${G.muted};margin-bottom:7px;display:flex;align-items:center;gap:6px}
.sdot{width:17px;height:17px;border-radius:50%;background:${G.border};display:inline-flex;align-items:center;justify-content:center;font-size:10px;color:${G.muted};font-weight:800;flex-shrink:0}
.sdot.done{background:${G.accent};color:${G.bg}}
.sdot.done-def{background:${G.green};color:${G.bg}}
.opt-lbl{color:${G.muted};font-weight:400;font-size:10px;text-transform:none;letter-spacing:0;margin-left:2px}

/* Forms */
.fl{margin-bottom:12px}
.fl label{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${G.muted};margin-bottom:6px;display:block}
.fi{width:100%;max-width:100%;background:${G.surface};border:1px solid ${G.border};border-radius:9px;padding:10px 12px;font-size:15px;outline:none;transition:border-color .15s;box-sizing:border-box}
.fi:focus{border-color:${G.accent}}
select.fi{appearance:none}
textarea.fi{resize:none;min-height:64px;line-height:1.4}
.score-row{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.score-box{flex:1;text-align:center}
.score-box label{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${G.muted};display:block;margin-bottom:6px}
.score-input{width:100%;background:${G.surface};border:1px solid ${G.border};border-radius:9px;padding:12px 8px;font-size:28px;font-weight:800;text-align:center;outline:none;font-family:${G.mono};transition:border-color .15s}
.score-input:focus{border-color:${G.accent}}
.score-vs{font-size:18px;font-weight:800;color:${G.muted};padding-top:20px}

/* Season picker */
.season-row{display:flex;gap:8px;margin-bottom:12px}
.season-sel{flex:1;background:${G.surface};border:1px solid ${G.border};border-radius:9px;padding:10px 12px;font-size:15px;outline:none;appearance:none;transition:border-color .15s}
.season-sel:focus{border-color:${G.accent}}

/* List rows */
.li{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid ${G.border}}
.li:last-child{border-bottom:none}
.li-name{font-size:16px;font-weight:700}
.li-meta{font-size:12px;color:${G.muted};margin-top:1px}
.li-score{font-size:15px;font-weight:800;font-family:${G.mono};color:${G.green}}
.li-score.loss{color:${G.red}}
.li-score.nc{color:${G.muted}}

/* Swipeable game row */
.swipe-wrap{position:relative;overflow:hidden;border-bottom:1px solid ${G.border}}
.swipe-wrap:last-child{border-bottom:none}
.swipe-delete-bg{position:absolute;right:0;top:0;bottom:0;width:80px;background:${G.red};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#fff}
.swipe-row{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:${G.card};transition:transform .2s ease;cursor:pointer;touch-action:pan-y}
.swipe-row:active{opacity:.9}

/* Play log / editor entries */
.pe{background:${G.surface};border-left:3px solid ${G.border};border-radius:0 9px 9px 0;padding:8px 11px;margin-bottom:6px;cursor:pointer;transition:opacity .1s}
.pe:active{opacity:.75}
.pe.off{border-left-color:${G.accent}}
.pe.def{border-left-color:${G.red}}
.pe.is-pen{border-left-color:${G.yellow};background:${G.yellow}06}
.pe.partial{border-left-color:${G.orange};border-left-style:dashed}
.pe-hd{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;gap:6px}
.pe-title{font-weight:800;font-size:14px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.pe-flag{font-size:11px;background:${G.yellow};color:${G.bg};border-radius:4px;padding:1px 6px;font-weight:800;letter-spacing:.04em}
.pe-partial-badge{font-size:10px;background:${G.orange}22;color:${G.orange};border:1px solid ${G.orange}44;border-radius:4px;padding:1px 5px;font-weight:700}
.pe-down{font-size:11px;color:${G.muted};font-family:${G.mono};white-space:nowrap;padding-top:2px}
.pe-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:2px}
.pe-note{font-size:12px;color:${G.muted};margin-top:5px;font-style:italic;border-top:1px solid ${G.border};padding-top:4px}

/* Tags */
.tag{background:${G.border};border-radius:4px;padding:2px 7px;font-size:11px;font-weight:700;letter-spacing:.03em}
.tag-a{background:${G.accent}18;color:${G.accent}}
.tag-g{background:${G.green}18;color:${G.green}}
.tag-tl{background:${G.teal}18;color:${G.teal}}
.tag-y{background:${G.yellow}18;color:${G.yellow}}
.tag-r{background:${G.red}18;color:${G.red}}
.tag-o{background:${G.orange}18;color:${G.orange}}
.tag-miss{background:${G.orange}12;color:${G.orange};border:1px dashed ${G.orange}44}

/* Stats */
.player-card{background:${G.card};border:1px solid ${G.border};border-radius:12px;margin-bottom:10px;overflow:hidden;cursor:pointer;transition:border-color .15s}
.player-card:active{border-color:${G.accent}}
.player-card-hdr{padding:14px;display:flex;align-items:center;justify-content:space-between}
.player-card-name{font-size:18px;font-weight:800}
.player-card-sub{font-size:12px;color:${G.muted};margin-top:2px}
.stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:${G.border}}
.stat-cell{background:${G.card};padding:10px 8px;text-align:center}
.stat-val{font-size:22px;font-weight:800;font-family:${G.mono};color:${G.text}}
.stat-val.hi{color:${G.accent}}
.stat-lbl{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${G.muted};margin-top:2px}
.stat-td-row{display:flex;gap:1px;background:${G.border}}
.stat-td-cell{flex:1;background:${G.card};padding:8px;text-align:center}
.game-stat-row{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid ${G.border}}
.game-stat-row:last-child{border-bottom:none}
.game-stat-opp{font-size:14px;font-weight:700}
.game-stat-date{font-size:11px;color:${G.muted}}
.game-stat-chips{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}

/* Season switcher */
.season-switch{display:flex;align-items:center;gap:8px;background:${G.surface};border:1px solid ${G.border};border-radius:9px;padding:6px 10px;margin-bottom:14px}
.season-switch label{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${G.muted};white-space:nowrap}
.season-switch select{background:none;border:none;color:${G.text};font-size:14px;font-weight:700;font-family:${G.font};outline:none;appearance:none;flex:1}

/* Misc */
.sec{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${G.muted};margin-bottom:9px}
.empty{text-align:center;padding:44px 20px;color:${G.muted}}
.empty .ico{font-size:38px;margin-bottom:10px}
.empty p{font-size:14px;line-height:1.5}
.badge{display:inline-block;border-radius:999px;font-size:11px;font-weight:800;padding:2px 8px}
.badge-b{background:${G.accent};color:${G.bg}}
.badge-r{background:${G.red};color:#fff}
.badge-done{background:${G.green}22;color:${G.green};border:1px solid ${G.green}44}
.pb{height:28px}
.game-hdr{display:flex;align-items:center;justify-content:space-between;padding:12px 0 10px}
.game-hdr-right{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.done-banner{background:${G.green}12;border:1px solid ${G.green}33;border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between}
.done-banner-score{font-size:22px;font-weight:800;font-family:${G.mono};color:${G.green}}
.done-banner-label{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${G.green};opacity:.7}

/* Overlay / sheet */
.overlay{position:fixed;inset:0;background:#000c;display:flex;align-items:flex-end;z-index:200}
.sheet{background:${G.card};border-top:1px solid ${G.border};border-radius:16px 16px 0 0;padding:22px 16px 28px;width:100%;max-width:480px;margin:0 auto;max-height:90vh;overflow-y:auto}
.sheet-title{font-size:21px;font-weight:800;margin-bottom:4px}
.sheet-sub{color:${G.muted};font-size:13px;margin-bottom:16px}
.sheet-divider{border:none;border-top:1px solid ${G.border};margin:14px 0}

/* Edit sheet inline selectors */
.edit-row{margin-bottom:12px}
.edit-row label{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${G.muted};margin-bottom:6px;display:block}
.edit-chips{display:flex;gap:6px;flex-wrap:wrap}
.edit-chip{padding:7px 12px;border-radius:8px;font-size:13px;font-weight:700;background:${G.surface};color:${G.text};border:2px solid ${G.border};cursor:pointer;font-family:${G.font};transition:all .1s}
.edit-chip:active{transform:scale(.95)}
.edit-chip.sel{border-color:${G.accent};background:${G.accent}1a;color:${G.accent}}

/* Live score banner */
.live-score{display:flex;align-items:center;gap:0;background:${G.surface};border:1px solid ${G.border};border-radius:11px;overflow:hidden;margin-bottom:10px}
.live-score-half{flex:1;text-align:center;padding:10px 8px}
.live-score-half.us{background:${G.green}0a}
.live-score-half.them{background:${G.red}0a}
.live-score-val{font-size:32px;font-weight:800;font-family:${G.mono};line-height:1}
.live-score-val.us{color:${G.green}}
.live-score-val.them{color:${G.red}}
.live-score-lbl{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${G.muted};margin-top:3px}
.live-score-div{width:1px;background:${G.border};align-self:stretch}

/* Conversion sheet */
.conv-pts{display:flex;gap:8px;margin-bottom:14px}
.conv-pt-btn{flex:1;padding:16px 8px;border-radius:10px;font-size:20px;font-weight:800;background:${G.surface};color:${G.text};border:2px solid ${G.border};cursor:pointer;font-family:${G.font};transition:all .1s;text-align:center}
.conv-pt-btn:active{transform:scale(.95)}
.conv-pt-btn.sel{border-color:${G.accent};background:${G.accent}1a;color:${G.accent}}
.conv-result-row{display:flex;gap:8px;margin-bottom:14px}
.conv-result-btn{flex:1;padding:13px 8px;border-radius:10px;font-size:15px;font-weight:800;background:${G.surface};color:${G.text};border:2px solid ${G.border};cursor:pointer;font-family:${G.font};transition:all .1s;text-align:center}
.conv-result-btn.good{border-color:${G.green}44;background:${G.green}0a;color:${G.green}}
.conv-result-btn.good.sel{border-color:${G.green};background:${G.green}22}
.conv-result-btn.no-good{border-color:${G.red}44;background:${G.red}0a;color:${G.red}}
.conv-result-btn.no-good.sel{border-color:${G.red};background:${G.red}22}

/* Rush selector */
.rush-row{display:flex;gap:7px;margin-bottom:14px}
.rush-btn{flex:1;padding:11px 4px;border-radius:9px;font-size:13px;font-weight:800;background:${G.surface};color:${G.muted};border:2px solid ${G.border};cursor:pointer;font-family:${G.font};transition:all .1s;text-align:center}
.rush-btn:active{transform:scale(.94)}
.rush-btn.sel{border-color:${G.orange};background:${G.orange}18;color:${G.orange}}

/* Collapsible section header */
.coll-hdr{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:${G.surface};border:1px solid ${G.border};border-radius:11px;cursor:pointer;margin-bottom:8px;transition:border-color .15s}
.coll-hdr:active{opacity:.85}
.coll-hdr.open{border-radius:11px 11px 0 0;border-bottom-color:transparent;margin-bottom:0}
.coll-hdr-left{display:flex;align-items:center;gap:10px}
.coll-hdr-ico{font-size:18px}
.coll-hdr-title{font-size:16px;font-weight:800}
.coll-hdr-sub{font-size:11px;color:${G.muted};margin-top:1px}
.coll-body{border:1px solid ${G.border};border-top:none;border-radius:0 0 11px 11px;padding:14px;margin-bottom:10px}

/* Bar chart */
.bar-chart{margin-bottom:16px}
.bar-chart-title{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${G.muted};margin-bottom:8px}
.bar-row{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.bar-label{font-size:12px;font-weight:700;width:88px;flex-shrink:0;color:${G.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar-track{flex:1;background:${G.border};border-radius:4px;height:14px;overflow:hidden}
.bar-fill{height:100%;border-radius:4px;transition:width .4s ease}
.bar-val{font-size:11px;font-weight:700;font-family:${G.mono};color:${G.muted};width:32px;text-align:right;flex-shrink:0}

/* Opponent chip selector */
.opp-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
.opp-chip{padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;background:${G.surface};color:${G.muted};border:1px solid ${G.border};cursor:pointer;font-family:${G.font};transition:all .1s}
.opp-chip.sel{background:${G.accent}18;color:${G.accent};border-color:${G.accent}55}

/* Insight cards */
.insight-pair{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
.insight-card{background:${G.surface};border:1px solid ${G.border};border-radius:10px;padding:12px}
.insight-card-title{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${G.muted};margin-bottom:8px;display:flex;align-items:center;justify-content:space-between}
.insight-card.game{border-color:${G.accent}33}
.insight-card.season{border-color:${G.teal}33}
.insight-bullet{font-size:12px;line-height:1.5;color:${G.text};margin-bottom:6px;padding-left:14px;position:relative}
.insight-bullet::before{content:"•";position:absolute;left:0;color:${G.accent};font-weight:800}
.insight-card.season .insight-bullet::before{color:${G.teal}}
.insight-generating{display:flex;align-items:center;gap:8px;color:${G.muted};font-size:12px;padding:8px 0}
.insight-err{font-size:12px;color:${G.red};padding:6px 0}
.insight-regen{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${G.muted};background:none;border:none;cursor:pointer;padding:0;font-family:${G.font}}
.insight-regen:active{opacity:.6}
.spin{display:inline-block;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* Flash */
.flash{position:fixed;top:58px;left:50%;transform:translateX(-50%);border-radius:9px;padding:8px 20px;font-weight:800;font-size:14px;z-index:300;white-space:nowrap;animation:fo 1.6s forwards;pointer-events:none}
.flash.ok{background:${G.green};color:${G.bg}}
.flash.pen{background:${G.yellow};color:${G.bg}}
.flash.end{background:${G.orange};color:#fff}
.flash.info{background:${G.accent};color:${G.bg}}
@keyframes fo{0%,55%{opacity:1;transform:translateX(-50%) translateY(0)}100%{opacity:0;transform:translateX(-50%) translateY(-6px)}}
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ord = n => ["","1st","2nd","3rd","4th"][n] || `${n}th`;

function offResultCls(r) {
  return { "TD":"rc-td","Flag Pulled":"rc-fp","No Flag Pulled":"rc-nfp","Incomplete":"rc-inc" }[r] || "";
}
function tagForResult(r) {
  const m = {
    "TD":"tag tag-g","Flag Pulled":"tag tag-tl","No Flag Pulled":"tag",
    "Incomplete":"tag tag-r","Incomplete Forced":"tag tag-r",
    "TD Allowed":"tag tag-o","Interception":"tag tag-a",
    "Turnover on Downs":"tag","Penalty":"tag tag-y",
    "Flag Pull":"tag tag-tl","Out of Bounds":"tag",
  };
  return m[r] || "tag tag-a";
}

// Compute player stats from plays
function computeStats(playerId, offPlays, defPlays) {
  const off = offPlays.filter(p => p.playerId === playerId);
  const def = defPlays.filter(p => p.pullers?.some(x => x.id === playerId));
  const ints = defPlays.filter(p => p.outcome === "Interception" && p.pullers?.some(x => x.id === playerId));
  return {
    catches:   off.filter(p => p.playType === "Catch" && p.result !== "Incomplete").length,
    carries:   off.filter(p => p.playType === "Carry" && p.result !== "Incomplete").length,
    tdCatch:   off.filter(p => p.playType === "Catch" && p.result === "TD").length,
    tdCarry:   off.filter(p => p.playType === "Carry" && p.result === "TD").length,
    flagPulls: def.length,
    ints:      ints.length,
    plays:     off.length,
  };
}

function computeGameStats(playerId, gameId, allOffPlays, allDefPlays) {
  return computeStats(
    playerId,
    allOffPlays.filter(p => p.gameId === gameId),
    allDefPlays.filter(p => p.gameId === gameId),
  );
}

function StepDot({ n, filled, defense }) {
  return <span className={`sdot ${filled ? (defense ? "done-def" : "done") : ""}`}>{n}</span>;
}

// ─── Progressive outcome ─────────────────────────────────────────────────────
function ProgressiveOutcome({ value, onChange }) {
  const [openGroup, setOpenGroup] = useState(null);
  const activeGroup = DEF_GROUPS.find(g => g.items.includes(value));
  return (
    <div style={{ marginBottom:14 }}>
      <div className="pd-groups" style={{ display:"flex", gap:7 }}>
        {DEF_GROUPS.map(g => {
          const col    = COL[g.color];
          const isOpen = openGroup === g.key;
          const hasVal = activeGroup?.key === g.key;
          return (
            <button key={g.key} className={`pd-group-btn ${isOpen?"open":""} ${hasVal?"has-val":""}`}
              style={{ borderColor:isOpen||hasVal?col:G.border, background:isOpen?`${col}18`:hasVal?`${col}12`:G.surface, color:isOpen||hasVal?col:G.muted, borderRadius:isOpen?"10px 10px 0 0":10 }}
              onClick={() => setOpenGroup(openGroup===g.key ? null : g.key)}>
              {g.label}
              {hasVal ? <span className="pd-val">{value}</span> : <span style={{ display:"block",fontSize:10,marginTop:2,opacity:.5 }}>▾</span>}
            </button>
          );
        })}
      </div>
      {DEF_GROUPS.map(g => {
        if (openGroup !== g.key) return null;
        const col = COL[g.color];
        return (
          <div key={g.key} className="pd-panel" style={{ borderColor:`${col}55`, background:`${col}08` }}>
            {g.items.map(item => (
              <button key={item} className="pd-sub-btn"
                style={{ borderColor:value===item?col:`${col}33`, background:value===item?col:`${col}12`, color:value===item?G.bg:col }}
                onClick={() => { onChange(value===item?null:item); setOpenGroup(null); }}>{item}</button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── Penalty disclosure ───────────────────────────────────────────────────────
function PenaltyDisclosure({ options, value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom:12 }}>
      <button className={`pen-toggle ${value?"active":""} ${open?"open":""}`}
        style={{ borderRadius:open?"10px 10px 0 0":10, borderBottomColor:open?"transparent":undefined }}
        onClick={() => setOpen(o => !o)}>
        <span>🚩 {value||"Penalty"}</span>
        <span className="pen-caret">▼</span>
      </button>
      {open && (
        <div className="pen-sub-panel">
          {options.map(p => (
            <button key={p} className={`pen-sub-btn ${value===p?"sel":""}`}
              onClick={() => { onChange(value===p?null:p); setOpen(false); }}>{p}</button>
          ))}
          {value && (
            <button className="pen-sub-btn" style={{ background:`${G.red}12`,color:G.red,borderColor:`${G.red}33` }}
              onClick={() => { onChange(null); setOpen(false); }}>Clear</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Play entry (shared between log and editor) ───────────────────────────────
function PlayEntry({ p, onClick }) {
  const side = p._side || p.side || (p.oppPlayType !== undefined ? "def" : "off");
  const isPartial = p.incomplete;
  const isPen = p.isPenaltyPlay;
  return (
    <div className={`pe ${side} ${isPen?"is-pen":""} ${isPartial?"partial":""}`} onClick={onClick}>
      <div className="pe-hd">
        <div className="pe-title">
          {side==="off" ? <>
            {p.playType && <span>{p.playType}</span>}
            {p.playerName && <span style={{ color:G.muted,fontWeight:600,fontSize:13 }}>· {p.playerName}</span>}
            {!p.playType && !p.playerName && <em style={{ color:G.muted,fontStyle:"italic",fontWeight:400 }}>No info</em>}
          </> : (p.oppPlayType ?? <em style={{ color:G.muted,fontStyle:"italic",fontWeight:400 }}>No play type</em>)}
          {isPen && <span className="pe-flag">🚩 {p.penalty}</span>}
          {isPartial && <span className="pe-partial-badge">partial</span>}
        </div>
        <div className="pe-down">{ord(p.down)} · {p.zone==="scoring"?"Score":"Mid"}</div>
      </div>
      <div className="pe-tags">
        {side==="off" && <>
          {p.role      ? <span className="tag tag-a">{p.role}</span>      : <span className="tag tag-miss">no role</span>}
          {p.direction ? <span className="tag">{p.direction}</span>        : <span className="tag tag-miss">no dir</span>}
          {p.result    ? <span className={tagForResult(p.result)}>{p.result}</span> : <span className="tag tag-miss">no result</span>}
        </>}
        {side==="def" && <>
          {p.direction ? <span className="tag">{p.direction}</span>        : <span className="tag tag-miss">no dir</span>}
          {p.outcome   ? <span className={tagForResult(p.outcome)}>{p.outcome}</span> : <span className="tag tag-miss">no outcome</span>}
          {p.pullers?.length > 0
            ? p.pullers.map(pl => <span key={pl.id} className="tag tag-g">🏃 {pl.name}</span>)
            : <span className="tag tag-miss">no puller</span>}
          {p.penalty && <span className="tag tag-y">🚩 {p.penalty}</span>}
        </>}
      </div>
      {p.note && <div className="pe-note">📝 {p.note}</div>}
    </div>
  );
}

// ─── Edit Play Sheet ──────────────────────────────────────────────────────────
function EditPlaySheet({ play, players, gameSeason, onSave, onDelete, onClose }) {
  const side = play._side || (play.oppPlayType !== undefined ? "def" : "off");
  const [player,  setPlayer]  = useState(players.find(p => p.id === play.playerId) || null);
  const [role,    setRole]    = useState(play.role || null);
  const [dir,     setDir]     = useState(play.direction || null);
  const [type,    setType]    = useState(play.playType || null);
  const [result,  setResult]  = useState(play.result || null);
  const [outcome, setOutcome] = useState(play.outcome || null);
  const [note,    setNote]    = useState(play.note || "");
  const [confirmDel, setConfirmDel] = useState(false);

  const gamePlayers = players.filter(p => p.season === gameSeason);

  const save = () => {
    if (side === "off") {
      onSave({ ...play, playerId:player?.id??null, playerName:player?.name??null, role, direction:dir, playType:type, result, note:note.trim()||null, incomplete:!player||!role||!dir||!type||!result });
    } else {
      onSave({ ...play, direction:dir, outcome, note:note.trim()||null, incomplete:!dir||!outcome });
    }
  };

  const ChipRow = ({ label, options, value, onSelect, cls="" }) => (
    <div className="edit-row">
      <label>{label}</label>
      <div className="edit-chips">
        {options.map(o => (
          <button key={o} className={`edit-chip ${value===o?"sel":""} ${cls}`}
            onClick={() => onSelect(value===o?null:o)}>{o}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-title">{side==="off" ? "Edit Offense Play" : "Edit Defense Play"}</div>
        <div className="sheet-sub">{ord(play.down)} down · {play.zone==="scoring"?"Score Zone":"Midfield"}</div>

        {side==="off" && <>
          <div className="edit-row">
            <label>Player</label>
            <div className="edit-chips">
              {gamePlayers.map(p => (
                <button key={p.id} className={`edit-chip ${player?.id===p.id?"sel":""}`}
                  onClick={() => setPlayer(player?.id===p.id?null:p)}>{p.name}</button>
              ))}
            </div>
          </div>
          <ChipRow label="Role" options={ROLES} value={role} onSelect={setRole} />
          <ChipRow label="Direction" options={DIRS} value={dir} onSelect={setDir} />
          <ChipRow label="Play Type" options={OFF_TYPES} value={type} onSelect={setType} />
          <ChipRow label="Result" options={OFF_RESULTS} value={result} onSelect={setResult} />
        </>}

        {side==="def" && <>
          <ChipRow label="Direction" options={DIRS} value={dir} onSelect={setDir} />
          <div className="edit-row">
            <label>Outcome</label>
            <ProgressiveOutcome value={outcome} onChange={setOutcome} />
          </div>
        </>}

        <div className="edit-row">
          <label>Note</label>
          <textarea className="fi" placeholder="Add a note about this play…" value={note} onChange={e => setNote(e.target.value)} />
        </div>

        <hr className="sheet-divider" />
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn btn-ghost btn-full" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-full" onClick={save}>Save</button>
        </div>
        <button className="btn btn-danger btn-full" style={{ marginTop:8 }}
          onClick={() => setConfirmDel(true)}>Delete Play</button>

        {confirmDel && (
          <div style={{ marginTop:12, background:`${G.red}12`, border:`1px solid ${G.red}33`, borderRadius:10, padding:12 }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:10, color:G.red }}>Delete this play?</div>
            <div style={{ display:"flex", gap:8 }}>
              <button className="btn btn-ghost btn-full" onClick={() => setConfirmDel(false)}>Keep</button>
              <button className="btn btn-danger btn-full" onClick={onDelete}>Delete</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── End Game Sheet ───────────────────────────────────────────────────────────
function EndGameSheet({ game, liveOurScore, liveTheirScore, onClose, onSave }) {
  // Prefer live tracked score over stale game record value
  const initUs   = liveOurScore   ?? game.ourScore   ?? "";
  const initThem = liveTheirScore ?? game.theirScore ?? "";
  const [ourScore,   setOurScore]   = useState(initUs   === 0 ? "0" : initUs);
  const [theirScore, setTheirScore] = useState(initThem === 0 ? "0" : initThem);
  const [notes,      setNotes]      = useState(game.notes ?? "");
  const save = () => onSave({ ...game, completed:true, ourScore:ourScore===""?null:parseInt(ourScore), theirScore:theirScore===""?null:parseInt(theirScore), notes:notes.trim()||null, completedAt:Date.now() });
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-title">End Game</div>
        <div className="sheet-sub">vs {game.opponent} · {game.date}</div>
        <div className="score-row">
          <div className="score-box">
            <label>Our Score</label>
            <input className="score-input" type="number" min="0" placeholder="0" value={ourScore} onChange={e => setOurScore(e.target.value)} />
          </div>
          <div className="score-vs">–</div>
          <div className="score-box">
            <label>Their Score</label>
            <input className="score-input" type="number" min="0" placeholder="0" value={theirScore} onChange={e => setTheirScore(e.target.value)} />
          </div>
        </div>
        <div className="fl">
          <label>Notes</label>
          <textarea className="fi" placeholder="Post-game notes…" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button className="btn btn-ghost btn-full" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-full" onClick={save}>Save & End Game</button>
        </div>
      </div>
    </div>
  );
}

// ─── Swipeable Game Row ───────────────────────────────────────────────────────
function SwipeGameRow({ g, onOpen, onExport, onDeleteRequest }) {
  const rowRef    = useRef(null);
  const startX    = useRef(null);
  const currentX  = useRef(0);
  const THRESHOLD = 72;

  const applyTranslate = (x) => {
    if (rowRef.current) rowRef.current.style.transform = `translateX(${x}px)`;
  };

  const onTouchStart = (e) => { startX.current = e.touches[0].clientX; };
  const onTouchMove  = (e) => {
    if (startX.current === null) return;
    const dx = Math.min(0, e.touches[0].clientX - startX.current);
    currentX.current = dx;
    applyTranslate(dx);
  };
  const onTouchEnd = () => {
    if (currentX.current < -THRESHOLD) {
      applyTranslate(-80);
    } else {
      applyTranslate(0);
    }
    startX.current = null;
  };
  const reset = () => { applyTranslate(0); currentX.current = 0; };

  return (
    <div className="swipe-wrap">
      <div className="swipe-delete-bg" onClick={() => { reset(); onDeleteRequest(g); }}>
        🗑 Delete
      </div>
      <div
        ref={rowRef}
        className="swipe-row"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => { if (Math.abs(currentX.current) < 10) onOpen(g); }}
      >
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div className="li-name">vs {g.opponent}</div>
            {g.completed && <span className="badge badge-done">Final</span>}
          </div>
          <div className="li-meta">{g.date} · {g.season}</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {g.ourScore != null && (() => {
            const us=g.ourScore??"?", them=g.theirScore??"?";
            const cls = g.ourScore>g.theirScore?"":g.ourScore<g.theirScore?"loss":"nc";
            return <span className={`li-score ${cls}`}>{us}–{them}</span>;
          })()}
          {g.completed && (
            <button className="btn btn-export btn-sm" onClick={e => { e.stopPropagation(); onExport(g); }}>Export</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); onOpen(g); }}>Open →</button>
        </div>
      </div>
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function Home({ games, setGames, players, setAllOffPlays, setAllDefPlays, setPage, setActiveGameId, flash }) {
  const sorted   = [...games].sort((a,b) => b.id - a.id);
  const active   = sorted.filter(g => !g.completed);
  const done     = sorted.filter(g =>  g.completed);
  const fileRef  = useRef(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const exportGame = async (g) => {
    const allOff = await db.getAll("plays");
    const allDef = await db.getAll("defPlays");
    const payload = { version:1, exportedAt:Date.now(), game:g, plays:allOff.filter(p=>p.gameId===g.id), defPlays:allDef.filter(p=>p.gameId===g.id) };
    const blob = new Blob([JSON.stringify(payload,null,2)], { type:"application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href=url; a.download=`flagtrack-${g.opponent.replace(/\s+/g,"-")}-${g.date}.json`;
    a.click(); URL.revokeObjectURL(url);
    flash("Exported!", "info");
  };

  const importGame = async (file) => {
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (payload.version !== 1) { flash("Unknown file format", "pen"); return; }
      const existing = games.find(g => g.id === payload.game.id);
      if (!existing) await db.add("games", { ...payload.game });
      const existingOff = await db.getAll("plays");
      const existingDef = await db.getAll("defPlays");
      const existingOffTs = new Set(existingOff.filter(p=>p.gameId===payload.game.id).map(p=>p.ts));
      const existingDefTs = new Set(existingDef.filter(p=>p.gameId===payload.game.id).map(p=>p.ts));
      let added = 0;
      for (const p of payload.plays)    { if (!existingOffTs.has(p.ts)) { const {id:_,...r}=p; await db.add("plays",r);    added++; } }
      for (const p of payload.defPlays) { if (!existingDefTs.has(p.ts)) { const {id:_,...r}=p; await db.add("defPlays",r); added++; } }
      flash(`Imported ${added} new plays`, "info");
      window.location.reload();
    } catch(e) { flash("Import failed", "pen"); }
  };

  const deleteGame = async (g) => {
    // Delete game record
    await db.delete("games", g.id);
    // Delete all associated plays
    const allOff = await db.getAll("plays");
    const allDef = await db.getAll("defPlays");
    for (const p of allOff.filter(p=>p.gameId===g.id)) await db.delete("plays",    p.id);
    for (const p of allDef.filter(p=>p.gameId===g.id)) await db.delete("defPlays", p.id);
    setGames(await db.getAll("games"));
    setAllOffPlays(await db.getAll("plays"));
    setAllDefPlays(await db.getAll("defPlays"));
    setConfirmDelete(null);
    flash("Game deleted", "ok");
  };

  const openGame = (g) => { setActiveGameId(g.id); setPage("live"); };

  const GameSection = ({ title, list }) => list.length === 0 ? null : (
    <>
      <div className="sec">{title}</div>
      <div className="card" style={{ padding:0, overflow:"hidden" }}>
        {list.map(g => (
          <SwipeGameRow
            key={g.id} g={g}
            onOpen={openGame}
            onExport={exportGame}
            onDeleteRequest={g => setConfirmDelete(g)}
          />
        ))}
      </div>
    </>
  );

  return (
    <div style={{ padding:"0 14px" }}>
      <div className="hdr"><h1>Flag<em>Track</em></h1><p>{players.length} players · {games.length} games logged</p></div>
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        <button className="btn btn-primary" style={{ flex:1 }} onClick={() => setPage("newgame")}>＋ New Game</button>
        <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>Import</button>
        <input ref={fileRef} type="file" accept=".json" style={{ display:"none" }} onChange={e => { if(e.target.files[0]) importGame(e.target.files[0]); e.target.value=""; }} />
      </div>

      <GameSection title="Active"    list={active} />
      <GameSection title="Completed" list={done.slice(0,10)} />
      {!games.length && <div className="empty"><div className="ico">🏈</div><p>No games yet.<br />Start a new game or add players to your roster.</p></div>}

      {confirmDelete && (
        <div className="overlay" onClick={() => setConfirmDelete(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-title">Delete this game?</div>
            <div className="sheet-sub" style={{ marginBottom:6 }}>vs {confirmDelete.opponent} · {confirmDelete.date}</div>
            <div style={{ background:`${G.red}12`, border:`1px solid ${G.red}33`, borderRadius:9, padding:"10px 12px", fontSize:13, color:G.red, marginBottom:18 }}>
              ⚠️ This will permanently delete the game and all {(() => { return "its plays"; })()}.
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button className="btn btn-ghost btn-full" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-danger btn-full" onClick={() => deleteGame(confirmDelete)}>Delete Game</button>
            </div>
          </div>
        </div>
      )}
      <div className="pb" />
    </div>
  );
}

// ─── ROSTER ───────────────────────────────────────────────────────────────────
function Roster({ players, setPlayers, flash }) {
  const [name,    setName]    = useState("");
  const [term,    setTerm]    = useState("Spring");
  const [year,    setYear]    = useState(String(new Date().getFullYear()));
  const [confirm, setConfirm] = useState(null);
  const season = seasonLabel(term, year);

  const add = async () => {
    const n = name.trim(); if (!n) return;
    await db.add("players", { name:n, season, createdAt:Date.now() });
    setPlayers(await db.getAll("players"));
    setName(""); flash("Player added!", "ok");
  };
  const remove = async (id) => {
    await db.delete("players", id);
    setPlayers(await db.getAll("players")); setConfirm(null);
  };
  const usedSeasons = [...new Set(players.map(p => p.season))].sort();
  const bySeason = usedSeasons.map(s => ({ s, ps:players.filter(p => p.season===s) }));

  return (
    <div style={{ padding:"0 14px" }}>
      <div className="hdr"><h1>Roster</h1><p>Manage players by season</p></div>
      <div className="card">
        <div className="fl">
          <label>Name</label>
          <input className="fi" value={name} placeholder="Player name"
            onChange={e => setName(e.target.value)} onKeyDown={e => e.key==="Enter" && add()} />
        </div>
        <div className="fl">
          <label>Season</label>
          <div className="season-row">
            <select className="season-sel" value={term} onChange={e => setTerm(e.target.value)}>
              {TERMS.map(t => <option key={t}>{t}</option>)}
            </select>
            <select className="season-sel" value={year} onChange={e => setYear(e.target.value)}>
              {YEARS.map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div style={{ fontSize:12, color:G.muted, marginTop:-4 }}>Season: <strong style={{ color:G.text }}>{season}</strong></div>
        </div>
        <button className="btn btn-primary btn-full" onClick={add}>Add Player</button>
      </div>
      {bySeason.map(({ s, ps }) => (
        <div key={s}>
          <div className="sec">{s} — {ps.length} players</div>
          <div className="card" style={{ padding:0 }}>
            {ps.map(p => (
              <div key={p.id} className="li">
                <div className="li-name">{p.name}</div>
                <button className="btn btn-danger btn-sm" onClick={() => setConfirm(p)}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {!players.length && <div className="empty"><div className="ico">👟</div><p>No players yet.</p></div>}
      {confirm && (
        <div className="overlay" onClick={() => setConfirm(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-title">Remove {confirm.name}?</div>
            <div className="sheet-sub">Removes from roster. Play data is kept.</div>
            <div style={{ display:"flex", gap:10 }}>
              <button className="btn btn-ghost btn-full" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn btn-danger btn-full" onClick={() => remove(confirm.id)}>Remove</button>
            </div>
          </div>
        </div>
      )}
      <div className="pb" />
    </div>
  );
}

// ─── NEW GAME ─────────────────────────────────────────────────────────────────
function NewGame({ games, setGames, setActiveGameId, setPage, flash }) {
  const [opponent, setOpponent] = useState("");
  const [date,     setDate]     = useState(new Date().toISOString().split("T")[0]);
  const [term,     setTerm]     = useState("Spring");
  const [year,     setYear]     = useState(String(new Date().getFullYear()));
  const opponents = [...new Set(games.map(g => g.opponent))].filter(Boolean);
  const season = seasonLabel(term, year);

  const start = async () => {
    const opp = opponent.trim(); if (!opp) return;
    const id = await db.add("games", { opponent:opp, date, season, completed:false, createdAt:Date.now() });
    setGames(await db.getAll("games"));
    setActiveGameId(id); flash("Game started!", "ok"); setPage("live");
  };

  return (
    <div style={{ padding:"0 14px" }}>
      <div className="hdr"><h1>New Game</h1><p>Set up before heading to the field</p></div>
      <div className="card">
        <div className="fl">
          <label>Opponent</label>
          <input className="fi" value={opponent} placeholder="Team name"
            onChange={e => setOpponent(e.target.value)} onKeyDown={e => e.key==="Enter" && start()} />
          {opponents.length > 0 && (
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>
              {opponents.map(o => (
                <button key={o} className="tag tag-a" style={{ cursor:"pointer", padding:"4px 10px", fontSize:12 }}
                  onClick={() => setOpponent(o)}>{o}</button>
              ))}
            </div>
          )}
        </div>
        <div className="fl">
          <label>Date</label>
          <input className="fi" type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ maxWidth:"100%", minWidth:0 }} />
        </div>
        <div className="fl">
          <label>Season</label>
          <div className="season-row">
            <select className="season-sel" value={term} onChange={e => setTerm(e.target.value)}>
              {TERMS.map(t => <option key={t}>{t}</option>)}
            </select>
            <select className="season-sel" value={year} onChange={e => setYear(e.target.value)}>
              {YEARS.map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div style={{ fontSize:12, color:G.muted, marginTop:-4 }}>Season: <strong style={{ color:G.text }}>{season}</strong></div>
        </div>
        <button className="btn btn-primary btn-full" onClick={start}>Start Game →</button>
      </div>
      <div className="pb" />
    </div>
  );
}

// ─── Insight helpers ──────────────────────────────────────────────────────────
function buildGameSummary(game, offPlays, defPlays) {
  const off = offPlays.filter(p => p.gameId === game.id && !p.isConversion);
  const def = defPlays.filter(p => p.gameId === game.id);
  const count = (arr, key, val) => arr.filter(p => p[key] === val).length;
  return {
    opponent: game.opponent, date: game.date, season: game.season,
    score: { us: game.ourScore ?? "?", them: game.theirScore ?? "?" },
    offPlays: off.length,
    offByDir: { L: count(off,"direction","L"), C: count(off,"direction","C"), R: count(off,"direction","R") },
    offByType: { Catch: count(off,"playType","Catch"), Carry: count(off,"playType","Carry") },
    offResults: { TD: count(off,"result","TD"), FlagPulled: count(off,"result","Flag Pulled"), NoFlag: count(off,"result","No Flag Pulled"), Incomplete: count(off,"result","Incomplete") },
    defPlays: def.length,
    defByDir: { L: count(def,"direction","L"), C: count(def,"direction","C"), R: count(def,"direction","R") },
    defOutcomes: { FlagPull: count(def,"outcome","Flag Pull"), OOB: count(def,"outcome","Out of Bounds"), IncForced: count(def,"outcome","Incomplete Forced"), INT: count(def,"outcome","Interception"), TOD: count(def,"outcome","Turnover on Downs"), TDAllowed: count(def,"outcome","TD Allowed") },
    oppRushCounts: { "1": count(off,"oppRush","1"), "2": count(off,"oppRush","2"), "3+": count(off,"oppRush","3+") },
    defRushCounts: { "1": count(def,"rush","1"), "2": count(def,"rush","2"), "3+": count(def,"rush","3+") },
  };
}

function buildSeasonSummary(season, games, offPlays, defPlays) {
  const sg = games.filter(g => g.season === season);
  const summaries = sg.map(g => buildGameSummary(g, offPlays, defPlays));
  const wins = sg.filter(g => (g.ourScore??0) > (g.theirScore??0)).length;
  const losses = sg.filter(g => (g.ourScore??0) < (g.theirScore??0)).length;
  return { season, games: sg.length, wins, losses, perGame: summaries };
}

async function generateInsights(gameData, seasonData) {
  const prompt = `You are a flag football coach analyst. Analyze this data and return ONLY a JSON object with this exact shape:
{"game":["bullet1","bullet2","bullet3"],"season":["bullet1","bullet2","bullet3"]}
Each bullet is a single concise coaching observation (max 20 words). Be specific to the numbers. No markdown, no preamble.

GAME DATA: ${JSON.stringify(gameData)}
SEASON DATA: ${JSON.stringify(seasonData)}`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  const data = await resp.json();
  const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
  const clean = text.replace(/```json|```/g,"").trim();
  return JSON.parse(clean);
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────
function BarChart({ title, rows, color }) {
  const max = Math.max(...rows.map(r => r.val), 1);
  return (
    <div className="bar-chart">
      <div className="bar-chart-title">{title}</div>
      {rows.map(r => (
        <div key={r.label} className="bar-row">
          <div className="bar-label">{r.label}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width:`${(r.val/max)*100}%`, background: color || G.accent }} />
          </div>
          <div className="bar-val">{r.val}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Collapsible Section ──────────────────────────────────────────────────────
function Collapsible({ ico, title, sub, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div style={{ marginBottom: open ? 0 : 2 }}>
      <div className={`coll-hdr ${open?"open":""}`} onClick={() => setOpen(o=>!o)}>
        <div className="coll-hdr-left">
          <span className="coll-hdr-ico">{ico}</span>
          <div>
            <div className="coll-hdr-title">{title}</div>
            {sub && <div className="coll-hdr-sub">{sub}</div>}
          </div>
        </div>
        <span style={{ fontSize:11, color:G.muted }}>{open?"▲":"▼"}</span>
      </div>
      {open && <div className="coll-body">{children}</div>}
    </div>
  );
}

// ─── STATS ────────────────────────────────────────────────────────────────────
function Stats({ players, games, allOffPlays, allDefPlays, insights, setInsights }) {
  const currentSeason = detectCurrentSeason(games);
  const [season, setSeason]               = useState(currentSeason);
  const [expandedPlayer, setExpandedPlayer] = useState(null);
  const [selOpp, setSelOpp]               = useState(null);

  const usedSeasons  = [...new Set(games.map(g => g.season))].sort();
  const seasonPlayers = players.filter(p => p.season === season);
  const seasonGames   = games.filter(g => g.season === season && g.completed).sort((a,b) => (a.createdAt||0)-(b.createdAt||0));
  const opponents    = [...new Set(seasonGames.map(g => g.opponent))];

  // Default to first opponent when season changes
  useEffect(() => {
    setSelOpp(opponents[0] ?? null);
  }, [season]); // eslint-disable-line

  const oppGames  = seasonGames.filter(g => g.opponent === selOpp);
  const oppOff    = allOffPlays.filter(p => oppGames.some(g => g.id === p.gameId) && !p.isConversion);
  const oppDef    = allDefPlays.filter(p => oppGames.some(g => g.id === p.gameId));
  const cnt       = (arr, key, val) => arr.filter(p => p[key] === val).length;

  // Season insights (most recent for this season, scope=season)
  const seasonInsight = insights.filter(i => i.season === season && i.scope === "season").sort((a,b) => b.ts-a.ts)[0];
  // Game insights — most recent completed game
  const latestGame    = seasonGames[seasonGames.length - 1];
  const gameInsight   = latestGame ? insights.filter(i => i.gameId === latestGame.id && i.scope === "game").sort((a,b) => b.ts-a.ts)[0] : null;

  const regenGame = async () => {
    if (!latestGame) return;
    const rows = await db.getAll("insights");
    for (const r of rows.filter(r => r.gameId === latestGame.id && r.scope === "game")) await db.delete("insights", r.id);
    setInsights(await db.getAll("insights"));
  };

  const regenSeason = async () => {
    const rows = await db.getAll("insights");
    for (const r of rows.filter(r => r.season === season && r.scope === "season")) await db.delete("insights", r.id);
    setInsights(await db.getAll("insights"));
  };

  const StatCell = ({ val, label, hi }) => (
    <div className="stat-cell">
      <div className={`stat-val ${hi?"hi":""}`}>{val}</div>
      <div className="stat-lbl">{label}</div>
    </div>
  );

  const InsightBlock = ({ insight, scope, regenFn }) => {
    const bullets = insight?.bullets;
    const color   = scope === "game" ? G.accent : G.teal;
    const title   = scope === "game" ? `vs ${latestGame?.opponent ?? ""}` : `${season} Season`;
    return (
      <div className={`insight-card ${scope}`} style={{ borderColor:`${color}33` }}>
        <div className="insight-card-title" style={{ color }}>
          {title}
          <button className="insight-regen" onClick={regenFn}>↺ redo</button>
        </div>
        {insight?.generating && <div className="insight-generating"><span className="spin">⟳</span> Generating…</div>}
        {!insight && <div className="insight-generating"><span style={{opacity:.5}}>No insights yet</span></div>}
        {insight?.error && <div className="insight-err">⚠ {insight.error}</div>}
        {bullets?.map((b,i) => <div key={i} className="insight-bullet">{b}</div>)}
      </div>
    );
  };

  return (
    <div style={{ padding:"0 14px" }}>
      <div className="hdr"><h1>Stats</h1></div>

      {usedSeasons.length > 1 && (
        <div className="season-switch">
          <label>Season</label>
          <select value={season} onChange={e => setSeason(e.target.value)}>
            {usedSeasons.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      )}

      {/* ── PLAYERS ── */}
      <Collapsible ico="👤" title="Players" sub={`${seasonPlayers.length} players · ${season}`} defaultOpen={true}>
        {!seasonPlayers.length
          ? <div style={{ color:G.muted, fontSize:13 }}>No players in {season}. Add them in Roster.</div>
          : seasonPlayers.map(player => {
            const total   = computeStats(player.id, allOffPlays.filter(p => seasonGames.some(g=>g.id===p.gameId)), allDefPlays.filter(p => seasonGames.some(g=>g.id===p.gameId)));
            const tdTotal = total.tdCatch + total.tdCarry;
            const isExp   = expandedPlayer === player.id;
            return (
              <div key={player.id} className="player-card" style={{ marginBottom:8 }} onClick={() => setExpandedPlayer(isExp?null:player.id)}>
                <div className="player-card-hdr">
                  <div>
                    <div className="player-card-name">{player.name}</div>
                    <div className="player-card-sub">{total.plays} plays · {total.flagPulls} stops</div>
                  </div>
                  <div style={{ fontSize:11, color:G.muted }}>{isExp?"▲":"▼"}</div>
                </div>
                <div className="stat-grid">
                  <StatCell val={total.catches}   label="Catches" />
                  <StatCell val={total.carries}   label="Carries" />
                  <StatCell val={tdTotal}         label="TDs" hi={tdTotal>0} />
                  <StatCell val={total.flagPulls} label="Flag Pulls" />
                  <StatCell val={total.ints}      label="INTs" />
                  <StatCell val={`${total.tdCatch}/${total.tdCarry}`} label="Rec/Rush TD" />
                </div>
                {isExp && seasonGames.length > 0 && (
                  <div style={{ borderTop:`1px solid ${G.border}` }}>
                    <div style={{ padding:"8px 14px 4px", fontSize:11, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", color:G.muted }}>Per Game</div>
                    {seasonGames.map(g => {
                      const gs     = computeGameStats(player.id, g.id, allOffPlays, allDefPlays);
                      const played = gs.catches+gs.carries+gs.flagPulls+gs.ints > 0;
                      return (
                        <div key={g.id} className="game-stat-row">
                          <div>
                            <div className="game-stat-opp" style={{ color: played?G.text:G.muted }}>vs {g.opponent}</div>
                            <div className="game-stat-date">{g.date}</div>
                          </div>
                          {!played ? <span style={{ fontSize:11, color:G.muted }}>—</span> : (
                            <div className="game-stat-chips">
                              {gs.catches>0   && <span className="tag">{gs.catches} rec</span>}
                              {gs.carries>0   && <span className="tag">{gs.carries} car</span>}
                              {(gs.tdCatch+gs.tdCarry)>0 && <span className="tag tag-g">{gs.tdCatch+gs.tdCarry} TD</span>}
                              {gs.flagPulls>0 && <span className="tag tag-tl">{gs.flagPulls} 🏃</span>}
                              {gs.ints>0      && <span className="tag tag-a">{gs.ints} INT</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        }
      </Collapsible>

      {/* ── PATTERNS ── */}
      <Collapsible ico="📊" title="Patterns" sub={selOpp ? `vs ${selOpp}` : "Select opponent below"}>
        {!opponents.length
          ? <div style={{ color:G.muted, fontSize:13 }}>No completed games in {season} yet.</div>
          : <>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", color:G.muted, marginBottom:8 }}>Opponent</div>
              <div className="opp-chips">
                {opponents.map(o => (
                  <button key={o} className={`opp-chip ${selOpp===o?"sel":""}`} onClick={() => setSelOpp(o)}>{o}</button>
                ))}
              </div>
              {selOpp && oppGames.length === 0 && <div style={{ color:G.muted, fontSize:13 }}>No plays logged for {selOpp}.</div>}
              {selOpp && oppGames.length > 0 && (
                <>
                  <div style={{ fontSize:11, color:G.muted, marginBottom:12 }}>{oppGames.length} game{oppGames.length>1?"s":""} vs {selOpp}</div>
                  <BarChart title="Their Play Direction" color={G.red}
                    rows={[
                      { label:"Left",   val: cnt(oppDef,"direction","L") },
                      { label:"Center", val: cnt(oppDef,"direction","C") },
                      { label:"Right",  val: cnt(oppDef,"direction","R") },
                    ]} />
                  <BarChart title="Their Play Type" color={G.orange}
                    rows={[
                      { label:"Pass Short", val: cnt(oppDef,"oppPlayType","Pass Short") },
                      { label:"Pass Deep",  val: cnt(oppDef,"oppPlayType","Pass Deep") },
                      { label:"Run",        val: cnt(oppDef,"oppPlayType","Run") },
                    ]} />
                  <BarChart title="Our Def Outcomes vs Them" color={G.teal}
                    rows={[
                      { label:"Flag Pull",  val: cnt(oppDef,"outcome","Flag Pull") },
                      { label:"OOB",        val: cnt(oppDef,"outcome","Out of Bounds") },
                      { label:"Inc Forced", val: cnt(oppDef,"outcome","Incomplete Forced") },
                      { label:"INT",        val: cnt(oppDef,"outcome","Interception") },
                      { label:"TOD",        val: cnt(oppDef,"outcome","Turnover on Downs") },
                      { label:"TD Allowed", val: cnt(oppDef,"outcome","TD Allowed") },
                    ]} />
                  <BarChart title="Our Off Direction vs Them" color={G.accent}
                    rows={[
                      { label:"Left",   val: cnt(oppOff,"direction","L") },
                      { label:"Center", val: cnt(oppOff,"direction","C") },
                      { label:"Right",  val: cnt(oppOff,"direction","R") },
                    ]} />
                  <BarChart title="Their Rush Frequency on Us" color={G.yellow}
                    rows={[
                      { label:"1 rusher",  val: cnt(oppOff,"oppRush","1") },
                      { label:"2 rushers", val: cnt(oppOff,"oppRush","2") },
                      { label:"3+ rushers",val: cnt(oppOff,"oppRush","3+") },
                    ]} />
                </>
              )}
            </>
        }
      </Collapsible>

      {/* ── INSIGHTS ── */}
      <Collapsible ico="🤖" title="AI Insights" sub={latestGame ? `Last: vs ${latestGame.opponent}` : "Complete a game to generate"}>
        {!latestGame
          ? <div style={{ color:G.muted, fontSize:13 }}>No completed games yet. Insights generate automatically when you end a game.</div>
          : (
            <div className="insight-pair">
              <InsightBlock insight={gameInsight}   scope="game"   regenFn={regenGame} />
              <InsightBlock insight={seasonInsight} scope="season" regenFn={regenSeason} />
            </div>
          )
        }
      </Collapsible>

      <div className="pb" />
    </div>
  );
}

// ─── Conversion Sheet ─────────────────────────────────────────────────────────
function ConversionSheet({ side, players, gamePlayers, onSave, onSkip }) {
  const [pts,    setPts]    = useState(null);   // 1 | 2
  const [result, setResult] = useState(null);   // "good" | "no-good"
  const [scorer, setScorer] = useState(null);   // player obj (our side only)

  const isOurs = side === "ours";
  const canSave = pts && result;

  const save = () => {
    if (!canSave) return;
    onSave({ pts, result, scorerId: scorer?.id ?? null, scorerName: scorer?.name ?? null });
  };

  return (
    <div className="overlay">
      <div className="sheet">
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
          <span style={{ fontSize:28 }}>🏈</span>
          <div>
            <div className="sheet-title" style={{ marginBottom:0 }}>Touchdown!</div>
            <div style={{ fontSize:13, color: isOurs ? G.green : G.red, fontWeight:700 }}>
              {isOurs ? "Log your conversion attempt" : "Log opponent conversion attempt"}
            </div>
          </div>
        </div>
        <hr className="sheet-divider" />

        <div style={{ fontSize:11, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", color:G.muted, marginBottom:8 }}>Points</div>
        <div className="conv-pts">
          {[1,2].map(n => (
            <button key={n} className={`conv-pt-btn ${pts===n?"sel":""}`} onClick={() => setPts(n)}>
              {n} pt
            </button>
          ))}
        </div>

        <div style={{ fontSize:11, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", color:G.muted, marginBottom:8 }}>Result</div>
        <div className="conv-result-row">
          <button className={`conv-result-btn good ${result==="good"?"sel":""}`} onClick={() => setResult("good")}>✓ Good</button>
          <button className={`conv-result-btn no-good ${result==="no-good"?"sel":""}`} onClick={() => setResult("no-good")}>✗ No Good</button>
        </div>

        {isOurs && gamePlayers.length > 0 && (
          <>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", color:G.muted, marginBottom:8 }}>Who scored? <span style={{ fontWeight:400, textTransform:"none", letterSpacing:0 }}>— optional</span></div>
            <div className="tg tg-auto" style={{ marginBottom:14 }}>
              {gamePlayers.map(p => (
                <button key={p.id} className={`tb ${scorer?.id===p.id?"sel":""}`}
                  onClick={() => setScorer(scorer?.id===p.id ? null : p)}>{p.name}</button>
              ))}
            </div>
          </>
        )}

        <div style={{ display:"flex", gap:8 }}>
          <button className="btn btn-ghost" style={{ flex:1 }} onClick={onSkip}>Skip</button>
          <button className="btn btn-primary" style={{ flex:2, opacity: canSave?1:.45 }} onClick={save}>
            Log Conversion →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── LIVE MODE ────────────────────────────────────────────────────────────────
function LiveMode({ activeGameId, games, setGames, players, allOffPlays, allDefPlays, setAllOffPlays, setAllDefPlays, flash, onGameEnded }) {
  const game = games.find(g => g.id === activeGameId);
  const [tab,          setTab]          = useState("off");
  const [downState,    setDownState]    = useState(initDown());
  const [showEndSheet, setShowEndSheet] = useState(false);
  const [editPlay,     setEditPlay]     = useState(null);
  const [convSheet,    setConvSheet]    = useState(null); // null | "ours" | "theirs"

  // Live score tracked in component state, synced to game record
  const [ourScore,   setOurScore]   = useState(0);
  const [theirScore, setTheirScore] = useState(0);

  // Sync score from game record on load
  useEffect(() => {
    if (game) {
      setOurScore(game.ourScore ?? 0);
      setTheirScore(game.theirScore ?? 0);
    }
  }, [activeGameId]); // eslint-disable-line

  const [offPlayer,  setOffPlayer]  = useState(null);
  const [offRole,    setOffRole]    = useState(null);
  const [offDir,     setOffDir]     = useState(null);
  const [offType,    setOffType]    = useState(null);
  const [offResult,  setOffResult]  = useState(null);
  const [offPenalty, setOffPenalty] = useState(null);
  const [offRush,    setOffRush]    = useState(null); // opp rushed us

  const [defOppType, setDefOppType] = useState(null);
  const [defDir,     setDefDir]     = useState(null);
  const [defPullers, setDefPullers] = useState([]);
  const [defOutcome, setDefOutcome] = useState(null);
  const [defPenalty, setDefPenalty] = useState(null);
  const [defRush,    setDefRush]    = useState(null);
  const [defInterceptor, setDefInterceptor] = useState(null); // player who caught the INT

  const offPlays = allOffPlays.filter(p => p.gameId === activeGameId);
  const defPlays = allDefPlays.filter(p => p.gameId === activeGameId);

  const reload = useCallback(async () => {
    setAllOffPlays(await db.getAll("plays"));
    setAllDefPlays(await db.getAll("defPlays"));
  }, [setAllOffPlays, setAllDefPlays]);

  const saveScore = useCallback(async (us, them) => {
    if (!game) return;
    const updated = { ...game, ourScore: us, theirScore: them };
    await db.put("games", updated);
    setGames(await db.getAll("games"));
  }, [game, setGames]);

  const resetOff = () => { setOffPlayer(null); setOffRole(null); setOffDir(null); setOffType(null); setOffResult(null); setOffPenalty(null); setOffRush(null); };
  const resetDef = () => { setDefOppType(null); setDefDir(null); setDefPullers([]); setDefOutcome(null); setDefPenalty(null); setDefRush(null); setDefInterceptor(null); };

  const togglePuller = p => setDefPullers(prev => prev.find(x=>x.id===p.id) ? prev.filter(x=>x.id!==p.id) : [...prev,p]);

  const logOff = async () => {
    const isPen   = !!offPenalty;
    const isTD    = offResult === "TD";
    const partial = !offPlayer||!offRole||!offDir||!offType||!offResult;
    await db.add("plays", { gameId:activeGameId, playerId:offPlayer?.id??null, playerName:offPlayer?.name??null, role:offRole, direction:offDir, playType:offType, result:offResult, penalty:offPenalty, isPenaltyPlay:isPen, oppRush:offRush, down:downState.down, zone:downState.zone, ts:Date.now(), incomplete:partial });
    await reload();
    resetOff();

    if (isTD) {
      const newUs = ourScore + 6;
      setOurScore(newUs);
      await saveScore(newUs, theirScore);
      setDownState(initDown());
      setConvSheet("ours");
      flash("🏈 Touchdown! +6", "ok");
    } else {
      setDownState(nextDown(downState));
      flash(isPen?`🚩 ${offPenalty}`:partial?"Play logged (partial)":"Play logged ✓", isPen?"pen":"ok");
    }
  };

  const logDef = async () => {
    const isPen      = !!defPenalty;
    const isTDAllow  = defOutcome === "TD Allowed";
    const isTurnover = defOutcome === "Interception" || defOutcome === "Turnover on Downs";
    const partial    = !defOppType||!defDir||!defOutcome;
    await db.add("defPlays", { gameId:activeGameId, oppPlayType:defOppType, direction:defDir, pullers:defPullers.map(p=>({id:p.id,name:p.name})), outcome:defOutcome, penalty:defPenalty, isPenaltyPlay:isPen, rush:defRush, interceptorId:defInterceptor?.id??null, interceptorName:defInterceptor?.name??null, down:downState.down, zone:downState.zone, ts:Date.now(), incomplete:partial });
    await reload();
    resetDef();

    if (isTDAllow) {
      const newThem = theirScore + 6;
      setTheirScore(newThem);
      await saveScore(ourScore, newThem);
      setDownState(initDown());
      setConvSheet("theirs");
      flash("TD Allowed — +6 them", "pen");
    } else if (isTurnover) {
      setDownState(initDown());
      setTab("off");
      flash(defOutcome === "Interception" ? "Interception! Ball our way 🏈" : "Turnover on downs!", "ok");
    } else {
      setDownState(nextDown(downState));
      flash(isPen?`🚩 ${defPenalty}`:partial?"Play logged (partial)":"Play logged ✓", isPen?"pen":"ok");
    }
  };

  const handleConversionSave = async ({ pts, result, scorerId, scorerName }) => {
    const isOurs  = convSheet === "ours";
    const scored  = result === "good";
    const ptVal   = scored ? pts : 0;

    // Log conversion as a special play record
    await db.add("plays", {
      gameId: activeGameId,
      isConversion: true,
      convPts: pts, convResult: result,
      playerId: scorerId ?? null, playerName: scorerName ?? null,
      side: isOurs ? "ours" : "theirs",
      ts: Date.now(), incomplete: false,
    });
    await reload();

    if (scored) {
      if (isOurs) {
        const newUs = ourScore + ptVal;
        setOurScore(newUs);
        await saveScore(newUs, theirScore);
        flash(`✓ ${pts}pt conversion! +${ptVal}`, "ok");
      } else {
        const newThem = theirScore + ptVal;
        setTheirScore(newThem);
        await saveScore(ourScore, newThem);
        flash(`Opp ${pts}pt conversion — +${ptVal}`, "pen");
      }
    } else {
      flash("Conversion no good", "ok");
    }

    setConvSheet(null);
    // Auto-switch tab: after our TD → defense; after their TD → offense
    setTab(isOurs ? "def" : "off");
  };

  const handleConversionSkip = () => {
    const isOurs = convSheet === "ours";
    setConvSheet(null);
    setTab(isOurs ? "def" : "off");
  };

  const endGame = async (updated) => {
    await db.put("games", updated);
    const updatedGames = await db.getAll("games");
    setGames(updatedGames);
    setOurScore(updated.ourScore ?? 0);
    setTheirScore(updated.theirScore ?? 0);
    setShowEndSheet(false);
    flash("Game complete! Generating insights…", "end");
    // Fire-and-forget insight generation
    onGameEnded(updated, await db.getAll("plays"), await db.getAll("defPlays"), updatedGames);
  };

  const saveEditPlay = async (updated) => {
    const side = updated._side || (updated.oppPlayType !== undefined ? "def" : "off");
    const { _side, ...rest } = updated;
    await db.put(side==="off"?"plays":"defPlays", rest);
    await reload(); setEditPlay(null); flash("Play updated", "ok");
  };

  const deletePlay = async (play) => {
    const side = play._side || (play.oppPlayType !== undefined ? "def" : "off");
    await db.delete(side==="off"?"plays":"defPlays", play.id);
    await reload(); setEditPlay(null); flash("Play deleted", "ok");
  };

  const gamePlayers = players.filter(p => p.season === game?.season);

  // Build combined log (exclude conversion records from main log display)
  const allPlays = [
    ...offPlays.filter(p => !p.isConversion).map(p => ({ ...p, _side:"off" })),
    ...defPlays.map(p => ({ ...p, _side:"def" })),
  ].sort((a,b) => a.ts-b.ts);

  // Conversion log entries for display
  const convPlays = offPlays.filter(p => p.isConversion);

  const offAny = offPlayer||offRole||offDir||offType||offResult||offPenalty||offRush;
  const defAny = defOppType||defDir||defPullers.length>0||defOutcome||defPenalty||defRush;
  const logCls = (any, pen) => pen?"btn-log pen-active":any?"btn-log ready":"btn-log";

  const RUSH_OPTIONS = ["None","1","2","3+"];

  if (!game) return (
    <div className="empty" style={{ padding:48 }}>
      <div className="ico">🏈</div><p>No active game.<br />Start one from Home.</p>
    </div>
  );

  return (
    <div style={{ padding:"0 14px" }}>
      {/* Header */}
      <div className="game-hdr">
        <div>
          <div style={{ fontSize:21, fontWeight:800 }}>vs {game.opponent}</div>
          <div style={{ fontSize:12, color:G.muted }}>{game.date} · {game.season}</div>
        </div>
        <div className="game-hdr-right">
          <span className="badge badge-b">{offPlays.filter(p=>!p.isConversion).length}</span>
          <span className="badge badge-r">{defPlays.length}</span>
          {!game.completed
            ? <button className="btn btn-end btn-sm" onClick={() => setShowEndSheet(true)}>End Game</button>
            : <span className="badge badge-done">Final</span>}
        </div>
      </div>

      {/* Score — live during game, final banner when done */}
      {game.completed ? (
        <div className="done-banner">
          <div>
            <div className="done-banner-label">Final Score</div>
            <div className="done-banner-score">{game.ourScore??"?"} – {game.theirScore??"?"}</div>
            {game.notes && <div style={{ fontSize:12,color:G.muted,marginTop:4 }}>{game.notes}</div>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowEndSheet(true)}>Edit</button>
        </div>
      ) : (
        <div className="live-score">
          <div className="live-score-half us">
            <div className="live-score-val us">{ourScore}</div>
            <div className="live-score-lbl">Us</div>
          </div>
          <div className="live-score-div" />
          <div className="live-score-half them">
            <div className="live-score-val them">{theirScore}</div>
            <div className="live-score-lbl">{game.opponent}</div>
          </div>
        </div>
      )}

      {/* Down tracker */}
      <div className="dt">
        <div>
          <div className="dt-label">{ord(downState.down)} Down</div>
          <div className={`dt-zone ${downState.zone==="scoring"?"score":""}`}>{downState.zone==="midfield"?"Cross Midfield":"Score Zone"}</div>
        </div>
        <div className="dt-actions">
          <div className="dt-dots">{Array.from({length:downState.maxDowns}).map((_,i) => <div key={i} className={`dt-dot ${i<downState.down?"on":""}`} />)}</div>
          <div style={{ display:"flex",gap:6 }}>
            <button className="btn btn-ghost btn-sm" style={{ fontSize:11 }} onClick={() => setDownState({zone:"scoring",down:1,maxDowns:3})}>Crossed Mid</button>
            <button className="btn btn-ghost btn-sm" style={{ fontSize:11 }} onClick={() => setDownState(initDown())}>Reset</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab==="off"?"active":""}`} onClick={() => setTab("off")}>⚔ Off</button>
        <button className={`tab ${tab==="def"?"active-def":""}`} onClick={() => setTab("def")}>🛡 Def</button>
        <button className={`tab ${tab==="log"?"active":""}`} onClick={() => setTab("log")}>
          📋 Log {allPlays.filter(p=>p.incomplete).length>0 && <span style={{ background:G.orange,color:G.bg,borderRadius:999,fontSize:10,padding:"1px 5px",marginLeft:4 }}>{allPlays.filter(p=>p.incomplete).length}</span>}
        </button>
      </div>

      {/* OFFENSE */}
      {tab==="off" && (
        <div>
          <div className="step-lbl"><StepDot n={1} filled={!!offPlayer} />Player <span className="opt-lbl">— optional</span></div>
          {!gamePlayers.length ? <p style={{ color:G.muted,fontSize:13,marginBottom:12 }}>Add players to roster first</p>
            : <div className="tg tg-auto">{gamePlayers.map(p => <button key={p.id} className={`tb ${offPlayer?.id===p.id?"sel":""}`} onClick={() => setOffPlayer(offPlayer?.id===p.id?null:p)}>{p.name}</button>)}</div>}
          <div className="step-lbl"><StepDot n={2} filled={!!offRole} />Role <span className="opt-lbl">— optional</span></div>
          <div className="tg tg-4">{ROLES.map(r => <button key={r} className={`tb ${offRole===r?"sel":""}`} onClick={() => setOffRole(offRole===r?null:r)}>{r}</button>)}</div>
          <div className="step-lbl"><StepDot n={3} filled={!!offDir} />Direction <span className="opt-lbl">— optional</span></div>
          <div className="tg tg-3">{DIRS.map(d => <button key={d} className={`tb dir-${d.toLowerCase()} ${offDir===d?"sel":""}`} onClick={() => setOffDir(offDir===d?null:d)}>{d==="L"?"← L":d==="R"?"R →":"Ctr"}</button>)}</div>
          <div className="step-lbl"><StepDot n={4} filled={!!offType} />Play Type <span className="opt-lbl">— optional</span></div>
          <div className="tg tg-2">{OFF_TYPES.map(t => <button key={t} className={`tb ${offType===t?"sel":""}`} onClick={() => setOffType(offType===t?null:t)}>{t}</button>)}</div>
          <div className="step-lbl"><StepDot n={5} filled={!!offResult} />Result <span className="opt-lbl">— optional</span></div>
          <div className="tg tg-2" style={{ marginBottom:12 }}>{OFF_RESULTS.map(r => <button key={r} className={`tb ${offResultCls(r)} ${offResult===r?"sel":""}`} onClick={() => setOffResult(offResult===r?null:r)}>{r}</button>)}</div>
          <div className="step-lbl"><StepDot n={6} filled={!!offRush} />Opp Rush <span className="opt-lbl">— optional</span></div>
          <div className="rush-row">
            {RUSH_OPTIONS.map(r => (
              <button key={r} className={`rush-btn ${offRush===r?"sel":""}`}
                onClick={() => setOffRush(offRush===r?null:r)}>
                {r==="None" ? "—" : r}
                {r!=="None" && <span style={{ display:"block", fontSize:10, color:"inherit", opacity:.7, marginTop:1 }}>rusher{r==="1"?"":"s"}</span>}
              </button>
            ))}
          </div>
          <PenaltyDisclosure options={OFF_PEN_OPTIONS} value={offPenalty} onChange={setOffPenalty} />
          <button className={logCls(offAny,offPenalty)} onClick={logOff}>
            {offPenalty?`Log 🚩 ${offPenalty} →`:!offAny?"Tap anything above, then log →":`Log Play${(!offPlayer||!offRole||!offDir||!offType||!offResult)?" (partial)":" ✓"} →`}
          </button>
        </div>
      )}

      {/* DEFENSE */}
      {tab==="def" && (
        <div>
          <div className="step-lbl"><StepDot n={1} filled={!!defOppType} defense />Opp Play Type <span className="opt-lbl">— optional</span></div>
          <div className="tg tg-3">{OPP_TYPES.map(t => <button key={t} className={`tb ${defOppType===t?"sel":""}`} style={{ fontSize:13 }} onClick={() => setDefOppType(defOppType===t?null:t)}>{t}</button>)}</div>
          <div className="step-lbl"><StepDot n={2} filled={!!defDir} defense />Direction <span className="opt-lbl">— optional</span></div>
          <div className="tg tg-3">{DIRS.map(d => <button key={d} className={`tb dir-${d.toLowerCase()} ${defDir===d?"sel":""}`} onClick={() => setDefDir(defDir===d?null:d)}>{d==="L"?"← L":d==="R"?"R →":"Ctr"}</button>)}</div>
          <div className="step-lbl"><StepDot n={3} filled={defPullers.length>0} defense />Flag Puller(s) <span className="opt-lbl">— multi-select, optional</span></div>
          {!gamePlayers.length ? <p style={{ color:G.muted,fontSize:13,marginBottom:14 }}>Add players to roster first</p>
            : <div className="tg tg-auto">{gamePlayers.map(p => { const sel=!!defPullers.find(x=>x.id===p.id); return <button key={p.id} className={`tb ${sel?"sel-multi":""}`} onClick={() => togglePuller(p)}>{p.name}{sel&&<span style={{ display:"block",fontSize:10,marginTop:2 }}>✓</span>}</button>; })}</div>}
          <div className="step-lbl"><StepDot n={4} filled={!!defOutcome} defense />Outcome <span className="opt-lbl">— optional</span></div>
          <ProgressiveOutcome value={defOutcome} onChange={v => { setDefOutcome(v); if (v !== "Interception") setDefInterceptor(null); }} />
          {defOutcome === "Interception" && gamePlayers.length > 0 && (
            <>
              <div className="step-lbl"><StepDot n="★" filled={!!defInterceptor} defense />Who intercepted? <span className="opt-lbl">— optional</span></div>
              <div className="tg tg-auto" style={{ marginBottom:14 }}>
                {gamePlayers.map(p => (
                  <button key={p.id} className={`tb ${defInterceptor?.id===p.id?"sel-multi":""}`}
                    onClick={() => setDefInterceptor(defInterceptor?.id===p.id ? null : p)}>
                    {p.name}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="step-lbl"><StepDot n={5} filled={!!defRush} defense />Def Rush <span className="opt-lbl">— optional</span></div>
          <div className="rush-row">
            {RUSH_OPTIONS.map(r => (
              <button key={r} className={`rush-btn ${defRush===r?"sel":""}`}
                onClick={() => setDefRush(defRush===r?null:r)}>
                {r==="None" ? "—" : r}
                {r!=="None" && <span style={{ display:"block", fontSize:10, color:"inherit", opacity:.7, marginTop:1 }}>rusher{r==="1"?"":"s"}</span>}
              </button>
            ))}
          </div>
          <PenaltyDisclosure options={DEF_PEN_OPTIONS} value={defPenalty} onChange={setDefPenalty} />
          <button className={logCls(defAny,defPenalty)} onClick={logDef}>
            {defPenalty?`Log 🚩 ${defPenalty} →`:!defAny?"Tap anything above, then log →":`Log Play${(!defOppType||!defDir||!defOutcome)?" (partial)":" ✓"} →`}
          </button>
        </div>
      )}

      {/* LOG */}
      {tab==="log" && (
        <div>
          {!allPlays.length && !convPlays.length
            ? <div className="empty"><div className="ico">📋</div><p>No plays yet.<br />Log plays in Offense or Defense tabs.</p></div>
            : <>
                <div style={{ fontSize:11, color:G.muted, marginBottom:10 }}>Tap any play to edit · Conversions shown inline</div>
                {/* Interleave plays and conversion records by ts */}
                {(() => {
                  const all = [
                    ...allPlays,
                    ...convPlays.map(p => ({ ...p, _side:"conv" })),
                  ].sort((a,b) => a.ts-b.ts);
                  return all.map((p, i) => {
                    if (p._side === "conv") {
                      const good = p.convResult === "good";
                      return (
                        <div key={i} style={{ background:`${G.accent}08`, border:`1px solid ${G.accent}22`, borderRadius:9, padding:"7px 11px", marginBottom:6, display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ fontSize:16 }}>🔄</span>
                          <div>
                            <div style={{ fontSize:13, fontWeight:800, color: good ? G.green : G.muted }}>
                              {p.side==="ours" ? "Our" : "Opp"} {p.convPts}pt conversion — {good ? "✓ Good" : "✗ No Good"}
                            </div>
                            {p.playerName && <div style={{ fontSize:11, color:G.muted }}>{p.playerName}</div>}
                          </div>
                          {good && <span className="tag tag-g" style={{ marginLeft:"auto" }}>+{p.convPts}</span>}
                        </div>
                      );
                    }
                    return <PlayEntry key={i} p={p} onClick={() => setEditPlay(p)} />;
                  });
                })()}
              </>
          }
        </div>
      )}

      {convSheet && (
        <ConversionSheet
          side={convSheet}
          players={players}
          gamePlayers={gamePlayers}
          onSave={handleConversionSave}
          onSkip={handleConversionSkip}
        />
      )}
      {showEndSheet && <EndGameSheet game={game} liveOurScore={ourScore} liveTheirScore={theirScore} onClose={() => setShowEndSheet(false)} onSave={endGame} />}
      {editPlay && (
        <EditPlaySheet
          play={editPlay}
          players={players}
          gameSeason={game.season}
          onSave={saveEditPlay}
          onDelete={() => deletePlay(editPlay)}
          onClose={() => setEditPlay(null)}
        />
      )}
      <div className="pb" />
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [page,         setPage]         = useState("home");
  const [players,      setPlayers]      = useState([]);
  const [games,        setGames]        = useState([]);
  const [allOffPlays,  setAllOffPlays]  = useState([]);
  const [allDefPlays,  setAllDefPlays]  = useState([]);
  const [activeGameId, setActiveGameId] = useState(null);
  const [insights,     setInsights]     = useState([]);
  const [flashMsg,     setFlashMsg]     = useState("");
  const [flashType,    setFlashType]    = useState("ok");
  const [flashKey,     setFlashKey]     = useState(0);

  useEffect(() => {
    db.getAll("players").then(setPlayers);
    db.getAll("games").then(setGames);
    db.getAll("plays").then(setAllOffPlays);
    db.getAll("defPlays").then(setAllDefPlays);
    db.getAll("insights").then(rows => setInsights(rows));
  }, []);

  const flash = useCallback((msg, type="ok") => {
    setFlashMsg(msg); setFlashType(type);
    setFlashKey(k => k+1);
    setTimeout(() => setFlashMsg(""), 1800);
  }, []);

  // Called by LiveMode after a game is ended
  const onGameEnded = useCallback(async (game, offPlays, defPlays, allGames) => {
    const season = game.season;

    // Build summaries
    const gameSummary   = buildGameSummary(game, offPlays, defPlays);
    const seasonSummary = buildSeasonSummary(season, allGames, offPlays, defPlays);

    // Clear old insights for this game and this season rollup
    const existing = await db.getAll("insights");
    for (const r of existing) {
      const isGameRecord   = r.gameId === game.id;
      const isSeasonRecord = r.season === season && !r.gameId;
      if (isGameRecord || isSeasonRecord) await db.delete("insights", r.id);
    }

    // Insert placeholder records (flat structure, keyPath "id" auto-incremented)
    const gameEntryId   = await db.add("insights", { gameId: game.id, season, bullets: null, scope: "game",   generating: true, ts: Date.now() });
    const seasonEntryId = await db.add("insights", { season,          bullets: null, scope: "season", generating: true, ts: Date.now() });

    const refreshInsights = async () => {
      const rows = await db.getAll("insights");
      setInsights(rows);
    };
    await refreshInsights();

    // Call Claude API
    try {
      const result = await generateInsights(gameSummary, seasonSummary);
      // result = { game: [...bullets], season: [...bullets] }
      await db.put("insights", { id: gameEntryId,   gameId: game.id, season, bullets: result.game,   scope: "game",   generating: false, ts: Date.now() });
      await db.put("insights", { id: seasonEntryId, season,          bullets: result.season, scope: "season", generating: false, ts: Date.now() });
    } catch(e) {
      await db.put("insights", { id: gameEntryId,   gameId: game.id, season, error: "Generation failed — check connection", scope: "game",   generating: false, ts: Date.now() });
      await db.put("insights", { id: seasonEntryId, season,          error: "Generation failed — check connection", scope: "season", generating: false, ts: Date.now() });
    }
    await refreshInsights();
    flash("Insights ready ✓", "info");
  }, [flash]);

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <nav className="nav">
          {[["home","Home"],["live","Live"],["stats","Stats"],["roster","Roster"]].map(([id,label]) => (
            <button key={id}
              className={`nav-btn ${(page===id||(page==="newgame"&&id==="home"))?"active":""}`}
              onClick={() => setPage(id)}>{label}</button>
          ))}
        </nav>
        {flashMsg && <div key={flashKey} className={`flash ${flashType}`}>{flashMsg}</div>}
        <div style={{ flex:1, overflowY:"auto" }}>
          {page==="home"    && <Home games={games} setGames={setGames} players={players} setAllOffPlays={setAllOffPlays} setAllDefPlays={setAllDefPlays} setPage={setPage} setActiveGameId={setActiveGameId} flash={flash} />}
          {page==="newgame" && <NewGame games={games} setGames={setGames} setActiveGameId={setActiveGameId} setPage={setPage} flash={flash} />}
          {page==="live"    && <LiveMode activeGameId={activeGameId} games={games} setGames={setGames} players={players} allOffPlays={allOffPlays} allDefPlays={allDefPlays} setAllOffPlays={setAllOffPlays} setAllDefPlays={setAllDefPlays} flash={flash} onGameEnded={onGameEnded} />}
          {page==="stats"   && <Stats players={players} games={games} allOffPlays={allOffPlays} allDefPlays={allDefPlays} insights={insights} setInsights={setInsights} />}
          {page==="roster"  && <Roster players={players} setPlayers={setPlayers} flash={flash} />}
        </div>
      </div>
    </>
  );
}
