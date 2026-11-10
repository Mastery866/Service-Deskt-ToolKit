/* flows.js - Question Flows (probing questions that lead to a KI).
   A flow is a decision tree: a question, the answers the user can give, and where each answer leads (another
   question, or a result that suggests KIs). In the Ticket Generator you search for a flow, click the answers the user
   gives, and the flow ends on a result with suggested KIs. The questions asked can be added to the work notes.
   Flows have a category, tags, an owner and a review date, can continue into another flow, and can be written as text.
   Saved in the browser with the rest of the app and included in backups. */
(function (global) {
  "use strict";
  var SDT = global.SDT, store = SDT.storage;
  var MAX_PATH = 40, STALE_DAYS = 180;
  var ui = { query: "", category: "", sort: "name", select: false, view: {} };   // page state
  var openCards = {}, selected = {}, refocus = false, pendingScroll = null, findText = "", findCat = "";

  var $ = window.SDT.dom.$;
  var el = window.SDT.dom.el;
  function uid(p) { return window.SDT.dom.uid(p || "fl"); }
  var toast = window.SDT.dom.toast;
  var csv = window.SDT.dom.csv;
  function kbAll() { var k = store.get("kb", []); return Array.isArray(k) ? k : []; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function words(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  var today = window.SDT.dom.today;
  function prefs() { return SDT.prefs ? SDT.prefs.get("flows", { category: "", sort: "name" }) : { category: "", sort: "name" }; }
  function savePrefs() { if (SDT.prefs) SDT.prefs.set("flows", { category: ui.category, sort: ui.sort }); }
  function dot(name) { var s = el("span", "cat-dot"); if (SDT.shell) s.style.background = SDT.shell.catColor(name); s.setAttribute("aria-hidden", "true"); return s; }

  /* ---- Starter flow (the VPN example). Edit it, or delete it. ---- */
  function starter() {
    function q(id, text, answers) { return { id: id, type: "q", text: text, answers: answers, kis: [], search: "", note: "" }; }
    function r(id, text, o) { return { id: id, type: "r", text: text, answers: [], kis: o.kis || [], search: o.search || "", note: o.note || "" }; }
    return {
      id: uid(), title: "Unable to access VPN", category: "Access", tags: ["vpn", "remote"], owner: "", reviewed: today(),
      keywords: ["vpn", "remote access", "cannot connect", "work from home"],
      description: "Find out whether the problem is access, an expired certificate, the account or the network.",
      start: "n1", updatedAt: new Date().toISOString(),
      nodes: [
        q("n1", "Is this the first time the user is connecting to the VPN?", [{ label: "Yes", next: "n2" }, { label: "No", next: "n3" }]),
        r("n2", "VPN access has probably not been provisioned yet.", { search: "VPN access request", note: "Check the VPN access group or the approved access request before troubleshooting the client." }),
        q("n3", "When did the user last connect to the VPN successfully?", [{ label: "Less than 3 months ago", next: "n4" }, { label: "More than 3 months ago", next: "n5" }]),
        r("n5", "The VPN certificate has probably expired.", { search: "VPN certificate expired", note: "Renew or reissue the certificate, then ask the user to reconnect." }),
        q("n4", "What happens when the user tries to connect?", [
          { label: "A login or password error", next: "n6" }, { label: "A certificate error", next: "n5" },
          { label: "It times out or cannot reach the server", next: "n7" }, { label: "Nothing happens", next: "n8" }]),
        r("n6", "The account may be locked or the password expired.", { kis: ["KB-001", "KB-002"], search: "password reset account unlock", note: "Verify the user's identity first." }),
        q("n7", "Can the user open internal sites or the internet without the VPN?", [{ label: "No, no connection at all", next: "n9" }, { label: "Yes, other sites work", next: "n10" }]),
        r("n8", "The VPN client may be damaged or blocked.", { search: "VPN client reinstall", note: "Restart the client, then repair or reinstall it." }),
        r("n9", "This looks like a network problem on the user's side.", { search: "network connection", note: "Check the user's Wi-Fi or cable first, then retry." }),
        r("n10", "No clear match. Escalate with the answers collected so far.", { note: "The VPN gateway or the user's connection may need a closer look by the network team." })
      ]
    };
  }

  function list() {
    var f = store.get("flows", null);
    if (!Array.isArray(f)) { f = [starter()]; store.set("flows", f); }
    return f;
  }
  function save(arr) { store.set("flows", arr); }
  function byId(id) { return list().filter(function (f) { return f.id === id; })[0]; }
  function nodeOf(flow, id) { for (var i = 0; i < flow.nodes.length; i++) if (flow.nodes[i].id === id) return flow.nodes[i]; return null; }
  function nodeLabel(flow, n) {
    var q = 0, r = 0, i;
    for (i = 0; i < flow.nodes.length; i++) { if (flow.nodes[i].type === "q") q++; else r++; if (flow.nodes[i] === n || flow.nodes[i].id === n.id) break; }
    return (n.type === "q" ? "Q" + q : "R" + r);
  }
  function short(t, n) { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > (n || 46) ? t.slice(0, (n || 46) - 1) + "\u2026" : t; }
  function counts(f) { var q = 0, r = 0; f.nodes.forEach(function (n) { if (n.type === "q") q++; else r++; }); return { q: q, r: r }; }
  function tagsOf(f) { return Array.isArray(f.tags) ? f.tags : []; }
  function categories() { var c = []; list().forEach(function (f) { var k = f.category || "General"; if (c.indexOf(k) === -1) c.push(k); }); return c.sort(function (a, b) { return a.localeCompare(b); }); }
  function titleOf(id) { var f = byId(id); return f ? f.title : ""; }
  function idByTitle(t) { var x = list().filter(function (f) { return f.title.toLowerCase() === String(t).trim().toLowerCase(); })[0]; return x ? x.id : ""; }
  function hay(f) { return (f.title + " " + (f.category || "") + " " + tagsOf(f).join(" ") + " " + (f.keywords || []).join(" ") + " " + (f.description || "")).toLowerCase(); }
  function usage() { return SDT.insights ? SDT.insights.flowUse() : {}; }

  /* ---- Find the flow that fits what the user reported ---- */
  function match(text) {
    var t = " " + words(text) + " ";
    if (t.trim().length < 3) return [];
    return list().map(function (f) {
      var score = 0;
      (f.keywords || []).concat(tagsOf(f)).forEach(function (k) { k = words(k); if (!k) return; if (t.indexOf(" " + k + " ") > -1) score += 3; else if (t.indexOf(k) > -1) score += 1; });
      words(f.title + " " + (f.category || "")).split(" ").forEach(function (w) { if (w.length > 3 && t.indexOf(" " + w + " ") > -1) score += 1; });
      return { flow: f, score: score };
    }).filter(function (x) { return x.score > 0; }).sort(function (a, b) { return b.score - a.score; }).map(function (x) { return x.flow; });
  }
  function find(q) {
    var terms = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
    return list().filter(function (f) { var h = hay(f); return terms.every(function (t) { return h.indexOf(t) > -1; }); });
  }
  function recent() { var r = store.get("flowRecent", []); return (Array.isArray(r) ? r : []).map(byId).filter(Boolean); }

  /* ---- Quick start: pinned flows first, then the three you use most ---- */
  function pins() { var p = store.get("flowPins", []); return Array.isArray(p) ? p : []; }
  function togglePin(id) {
    var p = pins(), i = p.indexOf(id); if (i > -1) p.splice(i, 1); else p.push(id);
    store.set("flowPins", p); return i === -1;
  }
  function quick() {
    var use = usage(), out = [], seen = {};
    pins().forEach(function (id) { var f = byId(id); if (f && !seen[id]) { seen[id] = true; out.push({ f: f, pinned: true, n: (use[id] || {}).n || 0 }); } });
    Object.keys(use).filter(function (id) { return byId(id) && !seen[id]; }).sort(function (a, b) { return use[b].n - use[a].n; }).slice(0, 3)
      .forEach(function (id) { seen[id] = true; out.push({ f: byId(id), pinned: false, n: use[id].n }); });
    if (!out.length) recent().slice(0, 3).forEach(function (f) { if (!seen[f.id]) out.push({ f: f, pinned: false, n: 0 }); });
    return out.slice(0, 6);
  }

  /* ---- KIs suggested by a result: the ones you linked, then good matches from a search ---- */
  function suggestions(node) {
    var kb = kbAll(), out = [], seen = {};
    function add(a, exact) { if (a && !seen[a.id]) { seen[a.id] = true; out.push({ id: a.id, title: a.title, exact: exact, steps: a.steps || [] }); } }
    (node.kis || []).forEach(function (id) { add(kb.filter(function (x) { return x.id === id; })[0], true); });
    if (node.search && SDT.search) {
      var res = SDT.search.search(node.search, kb, 3);
      if (!res.fuzzy) res.forEach(function (r) { if (r.score >= 20) add(r.article, false); });
    }
    return out;
  }

  /* ---- Saved with the ticket, for the reports ---- */
  function summary(st) {
    var fl = st && st.flow; if (!fl || !fl.path || !fl.path.length) return null;
    var flow = byId(fl.id); if (!flow) return null;
    if (fl.gap) return { id: flow.id, title: flow.title, resultId: "", resultText: "None of the answers fit", noKi: true, gap: true };
    var n = nodeOf(flow, fl.at), r = n && n.type === "r" ? n : null;
    return { id: flow.id, title: flow.title, resultId: r ? r.id : "", resultText: r ? r.text : "", noKi: r ? (suggestions(r).length === 0 && !r.goto) : false };
  }
  function forKi(id) { return list().filter(function (f) { return f.nodes.some(function (n) { return n.type === "r" && (n.kis || []).indexOf(id) > -1; }); }); }
  function show(id) { ui.query = ""; ui.category = ""; var s = $("fl-search"); if (s) s.value = ""; openCards[id] = true; pendingScroll = id; }

  /* ---- Work notes text for the ticket ---- */
  function notes(st) {
    var fl = st && st.flow; if (!fl || !fl.path || !fl.path.length || fl.include === false) return "";
    var titles = [];
    fl.path.forEach(function (p) { var t = titleOf(p.fid); if (t && titles.indexOf(t) === -1) titles.push(t); });
    var cur = titleOf(fl.id); if (cur && titles.indexOf(cur) === -1) titles.push(cur);
    var lines = ["Questions asked to the user" + (titles.length ? " (" + titles.join(" > ") + ")" : "") + ":"];
    fl.path.forEach(function (p) {
      if (p.link) { lines.push("- " + p.a); return; }
      lines.push("- " + String(p.q).trim() + " " + p.a + (p.note ? " (" + String(p.note).trim() + ")" : ""));
    });
    if (fl.gap) lines.push("None of the flow's answers fit - needs a closer look.");
    var flow = byId(fl.id), n = flow && nodeOf(flow, fl.at);
    if (n && n.type === "r") lines.push("Likely cause: " + n.text);
    return lines.join("\n");
  }

  /* ---- Runner: used in the Ticket Generator and in the "Try it" preview ---- */
  function start(st, flowId) {
    var f = byId(flowId); if (!f) return;
    st.flow = { id: f.id, at: f.start, path: [], include: true };
    if (SDT.shell && SDT.shell.expandFlow) SDT.shell.expandFlow();
    var r = store.get("flowRecent", []); r = (Array.isArray(r) ? r : []).filter(function (x) { return x !== f.id; }); r.unshift(f.id); store.set("flowRecent", r.slice(0, 8));
  }
  function startOn(id) { var st = SDT.ticket.current(); start(st, id); SDT.ticket.persist(); SDT.ticket.render(); }
  function maxMore(flow, node, seen) {
    if (!node || node.type !== "q") return 0;
    seen = seen || {}; if (seen[node.id]) return 0;
    var s2 = Object.assign({}, seen); s2[node.id] = true;
    var best = 0;
    (node.answers || []).forEach(function (a) { var n = a.next && nodeOf(flow, a.next); if (n && n.type === "q") best = Math.max(best, 1 + maxMore(flow, n, s2)); });
    return best;
  }
  function stepsOf(a) { return (a.steps || []).slice(0, 8).map(function (s) { return SDT.cmd && SDT.cmd.strip ? SDT.cmd.strip(s) : s; }); }

  function mount(host, st, api) {
    host.innerHTML = "";
    var fl = st.flow;
    if (fl && !byId(fl.id)) { st.flow = fl = null; }
    var flow = fl ? byId(fl.id) : null;

    if (!flow) { mountPicker(host, st, api); return; }
    host.onkeydown = null;

    var bar = el("div", "fl-bar");
    var ttl = el("div", "fl-active"); ttl.appendChild(dot(flow.category || "General")); ttl.appendChild(el("strong", "", flow.title));
    if (flow.category) ttl.appendChild(el("span", "tag", flow.category));
    bar.appendChild(ttl);
    if (!api.fixed) {
      var rs = el("button", "btn btn-ghost btn-sm", "Restart"); rs.type = "button";
      rs.addEventListener("click", function () { var prev = JSON.parse(JSON.stringify(st.flow)), first = fl.path.length && fl.path[0].fid ? fl.path[0].fid : flow.id; start(st, first); api.persist(); refocus = true; api.changed(); if (prev.path && prev.path.length) toast("Flow restarted", function () { st.flow = prev; api.persist(); api.changed(); }); });
      var cl = el("button", "btn btn-ghost btn-sm", "Clear"); cl.type = "button"; cl.title = "Remove this flow and its answers from the ticket";
      cl.addEventListener("click", function () { var prev = JSON.parse(JSON.stringify(st.flow)); st.flow = null; api.persist(); api.changed(); if (prev.path && prev.path.length) toast("Flow cleared", function () { st.flow = prev; api.persist(); api.changed(); }); });
      bar.appendChild(rs); bar.appendChild(cl);
    }
    host.appendChild(bar);

    var path = fl.path || (fl.path = []);
    if (path.length) {
      var trail = el("ol", "fl-trail");
      path.forEach(function (p, i) {
        var li = el("li");
        if (p.link) { li.appendChild(el("span", "fl-a", p.a)); }
        else {
          li.appendChild(el("span", "fl-q", p.q)); li.appendChild(el("span", "fl-a", p.a));
          if (p.note) li.appendChild(el("span", "fl-pnote", "Note: " + p.note));
          var nb = el("button", "link-btn", p.note ? "Edit note" : "Add note"); nb.type = "button"; nb.setAttribute("aria-label", "Note for the answer to: " + p.q);
          nb.addEventListener("click", function () {
            var inp = el("input"); inp.type = "text"; inp.value = p.note || ""; inp.placeholder = "e.g. user says it started after the update"; inp.className = "fl-note-input"; inp.setAttribute("aria-label", "Note for: " + p.q);
            nb.replaceWith(inp); inp.focus();
            var done = false; function commit() { if (done) return; done = true; p.note = inp.value.trim(); api.persist(); api.changed(); }
            inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); commit(); } });
            inp.addEventListener("blur", commit);
          });
          li.appendChild(nb);
        }
        var ch = el("button", "link-btn", "Change"); ch.type = "button"; ch.setAttribute("aria-label", "Change the answer to: " + (p.q || p.a));
        ch.addEventListener("click", function () { fl.id = p.fid || fl.id; fl.gap = false; fl.path = path.slice(0, i); fl.at = p.n; api.persist(); refocus = true; api.changed(); });
        li.appendChild(ch); trail.appendChild(li);
      });
      host.appendChild(trail);
    }

    function pushAnswer(node, label, next, extra) {
      var e = Object.assign({ fid: flow.id, n: node.id, q: node.text, a: label }, extra || {});
      path.push(e); fl.at = next || ""; api.persist(); refocus = true; api.changed();
    }
    function goBack() {
      var last = path.pop(); if (!last) return;
      fl.id = last.fid || fl.id; fl.at = last.n; fl.gap = false; api.persist(); refocus = true; api.changed();
    }

    var node = nodeOf(flow, fl.at);
    var cur = el("div", "fl-current");
    if (fl.gap) {
      cur.appendChild(el("h3", "fl-question", "None of the answers fit this user"));
      cur.appendChild(el("p", "fl-note", "This is saved with the ticket, so it shows up in the Knowledge gaps report. Look for a KI yourself, or escalate."));
      var row0 = el("div", "btn-row");
      if (api.find) { var fb0 = el("button", "btn btn-sm", "Find KIs..."); fb0.type = "button"; fb0.addEventListener("click", api.find); row0.appendChild(fb0); }
      var bk0 = el("button", "btn btn-ghost btn-sm", "Back"); bk0.type = "button"; bk0.addEventListener("click", goBack); row0.appendChild(bk0);
      cur.appendChild(row0); host.appendChild(cur); focusIfAsked(cur); return;
    }
    if (!node || path.length >= MAX_PATH) {
      cur.appendChild(el("p", "empty", path.length >= MAX_PATH ? "This flow loops. Restart it, or fix the flow in Question Flows." : "This answer is not connected to a question or result yet. Go back, or finish the flow in Question Flows."));
      if (path.length) { var bk1 = el("button", "btn btn-ghost btn-sm", "Back"); bk1.type = "button"; bk1.addEventListener("click", goBack); cur.appendChild(bk1); }
      host.appendChild(cur); return;
    }

    if (node.type === "q") {
      var stepNo = path.filter(function (p) { return !p.link && !p.gap; }).length + 1, more = maxMore(flow, node);
      cur.appendChild(el("p", "fl-progress", "Question " + stepNo + (more ? " - up to " + more + " more" : " - last question")));
      var track = el("div", "fl-track"); track.setAttribute("aria-hidden", "true"); var fill = el("div", "fl-fill"); fill.style.width = Math.round(stepNo * 100 / (stepNo + more)) + "%"; track.appendChild(fill); cur.appendChild(track);
      var h = el("h3", "fl-question", node.text); h.tabIndex = -1; cur.appendChild(h);
      var box = el("div", "fl-answers"); box.setAttribute("role", "group"); box.setAttribute("aria-label", "Answers");
      node.answers.forEach(function (a, i) {
        var b = el("button", "fl-answer"); b.type = "button";
        b.appendChild(el("kbd", "", String(i + 1))); b.appendChild(document.createTextNode(" " + a.label));
        b.addEventListener("click", function () { pushAnswer(node, a.label, a.next); });
        box.appendChild(b);
      });
      cur.appendChild(box);
      var row = el("div", "btn-row");
      if (node.unsure && nodeOf(flow, node.unsure)) {
        var ub = el("button", "btn btn-ghost btn-sm", "Not sure"); ub.type = "button";
        ub.addEventListener("click", function () { pushAnswer(node, "Not sure", node.unsure); }); row.appendChild(ub);
      }
      var nf = el("button", "btn btn-ghost btn-sm", "None of these fit"); nf.type = "button"; nf.title = "The user's answer is not covered. It is recorded as a gap in this flow.";
      nf.addEventListener("click", function () { path.push({ fid: flow.id, n: node.id, q: node.text, a: "None of these fit", gap: true }); fl.gap = true; fl.at = ""; api.persist(); refocus = true; api.changed(); });
      row.appendChild(nf);
      if (path.length) { var bk = el("button", "btn btn-ghost btn-sm", "Back"); bk.type = "button"; bk.addEventListener("click", goBack); row.appendChild(bk); }
      cur.appendChild(row);
      host.onkeydown = function (e) {
        var t = e.target && e.target.tagName;
        if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || e.ctrlKey || e.altKey || e.metaKey) return;
        var n = parseInt(e.key, 10);
        if (n >= 1 && n <= node.answers.length) { e.preventDefault(); box.children[n - 1].click(); }
      };
    } else {
      var res = el("div", "fl-result");
      res.appendChild(el("p", "fl-label fl-likely", "Likely cause"));
      var rh = el("h3", "fl-question", node.text); rh.tabIndex = -1; res.appendChild(rh);
      if (node.note) res.appendChild(el("p", "fl-note", node.note));
      var sg = suggestions(node);
      if (sg.length) {
        res.appendChild(el("p", "fl-label", "Suggested KI" + (sg.length === 1 ? "" : "s")));
        sg.forEach(function (s) {
          var wrap = el("div", "fl-ki-wrap"), row = el("div", "fl-ki");
          row.appendChild(el("span", "fl-ki-name", s.id + " - " + s.title));
          row.appendChild(el("span", "tag", s.exact ? "Linked" : "Possible match"));
          if (s.steps.length) {
            var sb = el("button", "btn btn-ghost btn-sm", "Show steps"); sb.type = "button"; sb.setAttribute("aria-expanded", "false"); sb.setAttribute("aria-label", "Show the steps of " + s.id);
            var ol = el("ol", "fl-steps"); ol.hidden = true; stepsOf(s).forEach(function (t) { ol.appendChild(el("li", "", t)); });
            sb.addEventListener("click", function () { ol.hidden = !ol.hidden; sb.setAttribute("aria-expanded", ol.hidden ? "false" : "true"); sb.textContent = ol.hidden ? "Show steps" : "Hide steps"; });
            row.appendChild(sb); wrap.appendChild(row); wrap.appendChild(ol);
          } else wrap.appendChild(row);
          if (api.applyKi) {
            var applied = api.hasKi && api.hasKi(s.id);
            var ab = el("button", "btn btn-sm", applied ? "Applied" : "Apply"); ab.type = "button"; ab.disabled = !!applied;
            ab.setAttribute("aria-label", (applied ? "Already applied: " : "Apply ") + s.id);
            ab.addEventListener("click", function () { api.applyKi(s.id); }); row.appendChild(ab);
          }
          var ob = el("button", "btn btn-ghost btn-sm", "Open"); ob.type = "button"; ob.setAttribute("aria-label", "Open " + s.id + " in the Knowledge Base");
          ob.addEventListener("click", function () { if (api.fixed) { var x = document.querySelector(".modal-x"); if (x) x.click(); } SDT.kb.openArticle(s.id); global.location.hash = "#kb"; });
          row.appendChild(ob); res.appendChild(wrap);
        });
      } else if (!node.goto) {
        res.appendChild(el("p", "empty small", "No KI is linked to this result yet. Search the Knowledge Base, or link a KI to this result in Question Flows."));
        if (api.find) { var fb = el("button", "btn btn-sm", "Find KIs..."); fb.type = "button"; fb.addEventListener("click", api.find); res.appendChild(fb); }
      }
      var next = node.goto && byId(node.goto);
      if (next) {
        var cb2 = el("button", "btn btn-sm", "Continue with: " + next.title); cb2.type = "button";
        cb2.addEventListener("click", function () {
          path.push({ fid: flow.id, n: node.id, a: "Continued in flow: " + next.title, link: true });
          fl.id = next.id; fl.at = next.start; api.persist(); refocus = true; api.changed();
        });
        res.appendChild(cb2);
      }
      cur.appendChild(res);
      var row2 = el("div", "btn-row");
      var bk2 = el("button", "btn btn-ghost btn-sm", "Back"); bk2.type = "button"; bk2.addEventListener("click", goBack);
      row2.appendChild(bk2);
      if (!api.fixed) {
        var lb = el("label", "check"), cb = el("input"); cb.type = "checkbox"; cb.checked = fl.include !== false;
        cb.addEventListener("change", function () { fl.include = cb.checked; api.persist(); api.changed(); });
        lb.appendChild(cb); lb.appendChild(document.createTextNode(" Add these questions to the work notes")); row2.appendChild(lb);
      }
      cur.appendChild(row2);
    }
    host.appendChild(cur);
    focusIfAsked(cur);
  }
  function focusIfAsked(cur) {
    if (!refocus) return; refocus = false;
    var f0 = cur.querySelector(".fl-answer") || cur.querySelector(".fl-question");
    if (f0) { try { f0.focus({ preventScroll: true }); } catch (e) {} }
  }

  /* Picker: suggestions from the issue, a search box, category chips and recent flows */
  function mountPicker(host, st, api) {
    var flows = list();
    if (!flows.length) { host.appendChild(el("p", "empty small", "No question flows yet. Create one in Question Flows.")); return; }
    var sug = api.issue ? match(api.issue()).slice(0, 3) : [];
    function begin(id) { start(st, id); api.persist(); refocus = true; api.changed(); }
    if (sug.length) {
      var hint = el("div", "fl-suggest");
      hint.appendChild(el("p", "fl-suggest-title", "Suggested flows for this issue"));
      sug.forEach(function (f) {
        var r = el("div", "fl-suggest-row"); r.appendChild(dot(f.category || "General")); r.appendChild(el("strong", "", f.title));
        if (f.category) r.appendChild(el("span", "tag", f.category));
        var go = el("button", "btn btn-sm", "Start"); go.type = "button"; go.setAttribute("aria-label", "Start " + f.title); go.addEventListener("click", function () { begin(f.id); });
        r.appendChild(go); hint.appendChild(r);
      });
      host.appendChild(hint);
    }
    var qk = quick();
    if (qk.length) {
      var qb = el("div", "fl-quick"); qb.setAttribute("role", "group"); qb.setAttribute("aria-label", "Quick start flows");
      qb.appendChild(el("span", "fl-quick-label", "Quick start"));
      qk.forEach(function (q) {
        var c = el("button", "chip chip-flow"); c.type = "button"; c.appendChild(dot(q.f.category || "General"));
        c.appendChild(document.createTextNode(" " + q.f.title)); if (q.pinned) c.appendChild(el("span", "chip-pin", "\u2605"));
        c.title = (q.pinned ? "Pinned. " : "") + (q.n ? "Used on " + q.n + " saved ticket" + (q.n === 1 ? "" : "s") + "." : "Starts this flow.");
        c.setAttribute("aria-label", "Start " + q.f.title + (q.pinned ? " (pinned)" : "")); c.addEventListener("click", function () { begin(q.f.id); }); qb.appendChild(c);
      });
      host.appendChild(qb);
    }
    var lab = el("label", "sr-only", "Find a question flow"); lab.htmlFor = "fl-find-" + (host.id || "x");
    var inp = el("input", "fl-find"); inp.type = "search"; inp.id = lab.htmlFor; inp.autocomplete = "off"; inp.placeholder = "Find a flow: type a symptom, category or tag"; inp.value = findText;
    host.appendChild(lab); host.appendChild(inp);
    var chipsBox = el("div", "fl-cats"); chipsBox.setAttribute("role", "group"); chipsBox.setAttribute("aria-label", "Filter flows by category");
    var cats = {}; flows.forEach(function (f) { var k = f.category || "General"; cats[k] = (cats[k] || 0) + 1; });
    var catNames = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a] || a.localeCompare(b); });
    if (flows.length >= 6 && catNames.length > 1) host.appendChild(chipsBox);
    var box = el("ul", "fl-pick-list"); box.setAttribute("aria-label", "Question flows"); host.appendChild(box);
    function drawChips() {
      chipsBox.innerHTML = "";
      [["", "All"]].concat(catNames.slice(0, 8).map(function (c) { return [c, c + " (" + cats[c] + ")"]; })).forEach(function (c) {
        var b = el("button", "chip" + (findCat === c[0] ? " active" : ""), c[1]); b.type = "button"; b.setAttribute("aria-pressed", findCat === c[0] ? "true" : "false");
        b.addEventListener("click", function () { findCat = c[0]; drawChips(); fill(); }); chipsBox.appendChild(b);
      });
    }
    function row(f) {
      var li = el("li", "fl-pick");
      li.appendChild(dot(f.category || "General"));
      var tx = el("span", "fl-pick-text"); tx.appendChild(el("strong", "", f.title));
      var meta = [f.category, tagsOf(f).slice(0, 3).join(", ")].filter(Boolean).join(" | "); if (meta) tx.appendChild(el("span", "result-meta", meta));
      li.appendChild(tx);
      var on = pins().indexOf(f.id) > -1, pn = el("button", "pin-btn" + (on ? " on" : ""), on ? "\u2605" : "\u2606"); pn.type = "button"; pn.setAttribute("aria-pressed", on ? "true" : "false");
      pn.setAttribute("aria-label", (on ? "Unpin " : "Pin ") + f.title + (on ? " from Quick start" : " to Quick start")); pn.title = on ? "Unpin from Quick start" : "Pin to Quick start";
      pn.addEventListener("click", function (e) { e.stopPropagation(); togglePin(f.id); host.innerHTML = ""; mountPicker(host, st, api); });
      li.appendChild(pn);
      var b = el("button", "btn btn-ghost btn-sm", "Start"); b.type = "button"; b.setAttribute("aria-label", "Start " + f.title); b.addEventListener("click", function (e) { e.stopPropagation(); begin(f.id); });
      li.appendChild(b); li.addEventListener("click", function () { begin(f.id); }); return li;
    }
    function fill() {
      box.innerHTML = ""; findText = inp.value;
      var q = inp.value.trim(), items, label = "";
      var pool = findCat ? flows.filter(function (f) { return (f.category || "General") === findCat; }) : flows;
      if (q) { var terms = q.toLowerCase().split(/\s+/).filter(Boolean); items = pool.filter(function (f) { var h = hay(f); return terms.every(function (t) { return h.indexOf(t) > -1; }); }).slice(0, 10); }
      else if (findCat) items = pool.slice().sort(function (a, b) { return a.title.localeCompare(b.title); }).slice(0, 10);
      else { items = recent().slice(0, 4); label = items.length ? "Recently used" : ""; if (!items.length) items = flows.slice().sort(function (a, b) { return a.title.localeCompare(b.title); }).slice(0, 6); }
      if (label) box.appendChild(el("li", "fl-pick-label", label));
      if (!items.length) { box.appendChild(el("li", "empty small fl-pick-note", "No flow matches that. Try fewer words, or pick All.")); return; }
      items.forEach(function (f) { box.appendChild(row(f)); });
      if (!q && !findCat && flows.length > items.length) box.appendChild(el("li", "fl-pick-note", flows.length + " flows in total. Type to search them" + (catNames.length > 1 && flows.length >= 6 ? ", or pick a category." : ".")));
    }
    inp.addEventListener("input", fill);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); var b = box.querySelector(".fl-pick .btn"); if (b) b.click(); } });
    drawChips(); fill();
    if (refocus) { refocus = false; }
  }

  /* ---- Preview ("Try it") ---- */
  function tryFlow(f) {
    var st = { flow: null }, host = el("div", "fl-run");
    var api = { persist: function () {}, changed: function () { mount(host, st, api); }, applyKi: null, hasKi: null, issue: function () { return ""; }, fixed: f.id };
    start(st, f.id); mount(host, st, api);
    SDT.modal.open({ title: "Try: " + f.title, body: host, size: "md", actions: [{ label: "Close", kind: "ghost", cancel: true }] });
  }

  /* ---- Outline and map (page preview) ---- */
  function outline(f) {
    var out = [], seen = {};
    function walk(id, depth) {
      var n = nodeOf(f, id), pad = new Array(depth + 1).join("    ");
      if (!n) { out.push(pad + "(not connected)"); return; }
      if (seen[id]) { out.push(pad + "(back to " + nodeLabel(f, n) + ")"); return; }
      seen[id] = true;
      if (n.type === "q") {
        out.push(pad + nodeLabel(f, n) + ": " + n.text);
        n.answers.forEach(function (a) { out.push(pad + "    [" + a.label + "]"); if (a.next) walk(a.next, depth + 2); else out.push(pad + "        (not connected)"); });
        if (n.unsure) { out.push(pad + "    [Not sure]"); walk(n.unsure, depth + 2); }
      } else {
        out.push(pad + "=> " + n.text + (n.kis && n.kis.length ? "   KI: " + n.kis.join(", ") : "") + (n.search ? "   search: " + n.search : "") + (n.goto ? "   continues in: " + titleOf(n.goto) : ""));
      }
    }
    walk(f.start, 0);
    return out.join("\n");
  }
  function mapTree(f) {
    var seen = {}, root = el("ul", "fl-map");
    function nodeEl(id) {
      var n = nodeOf(f, id), li = el("li", "");
      if (!n) { li.appendChild(el("div", "fl-map-box fl-map-missing", "Not connected")); return li; }
      var lab = nodeLabel(f, n);
      if (seen[id]) { li.appendChild(el("div", "fl-map-box fl-map-ref", "See " + lab + ": " + short(n.text, 40))); return li; }
      seen[id] = true;
      var b = el("div", "fl-map-box " + (n.type === "q" ? "fl-map-q" : "fl-map-r"));
      b.appendChild(el("strong", "", lab + " ")); b.appendChild(document.createTextNode(short(n.text, 70)));
      if (n.type === "r") {
        (n.kis || []).forEach(function (k) { b.appendChild(el("span", "tag", k)); });
        if (n.search) b.appendChild(el("span", "tag", "search: " + short(n.search, 24)));
        if (n.goto) b.appendChild(el("span", "tag tag-ki", "continues: " + short(titleOf(n.goto), 24)));
      }
      li.appendChild(b);
      if (n.type === "q") {
        var ul = el("ul", "");
        n.answers.forEach(function (a) {
          var al = el("li", "fl-map-edge"); al.appendChild(el("span", "fl-map-label", a.label));
          var sub = el("ul", ""); sub.appendChild(a.next ? nodeEl(a.next) : (function () { var x = el("li"); x.appendChild(el("div", "fl-map-box fl-map-missing", "Not connected")); return x; })());
          al.appendChild(sub); ul.appendChild(al);
        });
        if (n.unsure) { var ul2 = el("li", "fl-map-edge"); ul2.appendChild(el("span", "fl-map-label", "Not sure")); var s2 = el("ul", ""); s2.appendChild(nodeEl(n.unsure)); ul2.appendChild(s2); ul.appendChild(ul2); }
        li.appendChild(ul);
      }
      return li;
    }
    root.appendChild(nodeEl(f.start)); return root;
  }
  function reachable(f) {
    var seen = {};
    (function walk(id) { var n = nodeOf(f, id); if (!n || seen[id]) return; seen[id] = true; (n.answers || []).forEach(function (a) { if (a.next) walk(a.next); }); if (n.unsure) walk(n.unsure); })(f.start);
    return seen;
  }

  /* ---- Editor ---- */
  function openEditor(id) {
    if (SDT.modal.isOpen()) return;
    var cur = id ? byId(id) : null;
    var model = cur ? clone(cur) : { id: uid(), title: "", category: ui.category || "", tags: [], owner: "", reviewed: today(), keywords: [], description: "", start: "n1", nodes: [{ id: "n1", type: "q", text: "", answers: [{ label: "Yes", next: "" }, { label: "No", next: "" }], kis: [], search: "", note: "" }] };
    var body = el("div", "kb-form fl-editor");
    function field(label, ctl, idv, hint) { var d = el("div"), l = el("label", "", label); l.htmlFor = idv; d.appendChild(l); d.appendChild(ctl); if (hint) d.appendChild(el("p", "empty small", hint)); return d; }
    function inp(idv, v, type) { var i = el("input"); i.type = type || "text"; i.id = idv; i.value = v || ""; i.autocomplete = "off"; return i; }
    var title = inp("fe-title", model.title), kw = inp("fe-kw", (model.keywords || []).join(", ")), desc = inp("fe-desc", model.description);
    var cat = inp("fe-cat", model.category); cat.setAttribute("list", "fe-cats");
    var dl = el("datalist"); dl.id = "fe-cats"; categories().forEach(function (c) { var o = document.createElement("option"); o.value = c; dl.appendChild(o); });
    var tags = inp("fe-tags", tagsOf(model).join(", ")), owner = inp("fe-owner", model.owner), rev = inp("fe-rev", model.reviewed, "date");
    var two = el("div", "two"); two.appendChild(field("Flow title", title, "fe-title")); two.appendChild(field("Category", cat, "fe-cat", "Groups flows on the Question Flows page and in the picker."));
    var two2 = el("div", "two"); two2.appendChild(field("Words that suggest this flow", kw, "fe-kw", "Comma separated, e.g. vpn, remote access. Matched against the issue the user reports.")); two2.appendChild(field("Tags", tags, "fe-tags", "Comma separated, e.g. vpn, remote."));
    var two3 = el("div", "two"); two3.appendChild(field("Owner (optional)", owner, "fe-owner")); two3.appendChild(field("Last reviewed", rev, "fe-rev"));
    body.appendChild(two); body.appendChild(dl); body.appendChild(two2); body.appendChild(two3); body.appendChild(field("Short description (optional)", desc, "fe-desc"));

    var hdr = el("div", "fl-editor-head"); hdr.appendChild(el("h3", "fl-h3", "Questions and results"));
    var txtBtn = el("button", "btn btn-ghost btn-sm", "Edit as text..."); txtBtn.type = "button"; txtBtn.title = "Write or paste the whole flow as indented text, which is faster for big flows";
    hdr.appendChild(txtBtn); body.appendChild(hdr);
    body.appendChild(el("p", "empty small", "Start with the first question. For each answer, choose where it leads: another question, or a result with suggested KIs. Choose \"+ New question\" or \"+ New result\" to create the next step right there."));
    var nodesBox = el("div", "fl-nodes"); body.appendChild(nodesBox);
    var addRow = el("div", "btn-row");
    var addQ = el("button", "btn btn-ghost btn-sm", "Add question"); addQ.type = "button";
    var addR = el("button", "btn btn-ghost btn-sm", "Add result"); addR.type = "button";
    addRow.appendChild(addQ); addRow.appendChild(addR); body.appendChild(addRow);
    var err = el("p", "form-error"); err.hidden = true; body.appendChild(err);

    function newNode(type) {
      var n = { id: uid("n"), type: type, text: "", answers: type === "q" ? [{ label: "Yes", next: "" }, { label: "No", next: "" }] : [], kis: [], search: "", note: "" };
      model.nodes.push(n); return n;
    }
    function fillTargets(sel, value, self, withNew, emptyLabel) {
      sel.innerHTML = "";
      var o = el("option", "", emptyLabel || "Choose where this leads..."); o.value = ""; sel.appendChild(o);
      model.nodes.forEach(function (n) { if (n.id === self) return; var x = el("option", "", nodeLabel(model, n) + ": " + short(n.text || "(empty)")); x.value = n.id; sel.appendChild(x); });
      if (withNew) { var a = el("option", "", "+ New question"); a.value = "__q"; sel.appendChild(a); var b = el("option", "", "+ New result"); b.value = "__r"; sel.appendChild(b); }
      sel.value = value || "";
    }
    function removeNode(n) {
      model.nodes = model.nodes.filter(function (x) { return x.id !== n.id; });
      model.nodes.forEach(function (x) { (x.answers || []).forEach(function (a) { if (a.next === n.id) a.next = ""; }); if (x.unsure === n.id) x.unsure = ""; });
      if (model.start === n.id) model.start = model.nodes.length ? model.nodes[0].id : "";
    }
    function draw() {
      nodesBox.innerHTML = "";
      var reach = reachable(model);
      model.nodes.forEach(function (n, i) {
        var card = el("div", "fl-node " + (n.type === "q" ? "is-q" : "is-r"));
        var head = el("div", "fl-node-head");
        head.appendChild(el("strong", "fl-node-label", nodeLabel(model, n)));
        var sel = el("select", "head-select"); sel.setAttribute("aria-label", "Type of " + nodeLabel(model, n));
        [["q", "Question"], ["r", "Result"]].forEach(function (t) { var o = el("option", "", t[1]); o.value = t[0]; sel.appendChild(o); }); sel.value = n.type;
        sel.addEventListener("change", function () { n.type = sel.value; if (n.type === "q" && !n.answers.length) n.answers = [{ label: "Yes", next: "" }, { label: "No", next: "" }]; draw(); });
        head.appendChild(sel);
        var lab = el("label", "check"), rd = el("input"); rd.type = "radio"; rd.name = "fe-start"; rd.checked = model.start === n.id;
        rd.addEventListener("change", function () { model.start = n.id; draw(); });
        lab.appendChild(rd); lab.appendChild(document.createTextNode(" Start here")); head.appendChild(lab);
        if (!reach[n.id]) head.appendChild(el("span", "tag sc-risk-changes", "Not reachable"));
        var tools = el("div", "fl-node-tools");
        function tb(label, fn, dis, danger) { var b = el("button", "btn btn-sm " + (danger ? "btn-danger" : "btn-ghost"), label); b.type = "button"; b.disabled = !!dis; b.setAttribute("aria-label", label + " " + nodeLabel(model, n)); b.addEventListener("click", fn); tools.appendChild(b); }
        tb("Up", function () { model.nodes.splice(i - 1, 0, model.nodes.splice(i, 1)[0]); draw(); }, i === 0);
        tb("Down", function () { model.nodes.splice(i + 1, 0, model.nodes.splice(i, 1)[0]); draw(); }, i === model.nodes.length - 1);
        tb("Delete", function () { removeNode(n); draw(); }, false, true);
        head.appendChild(tools); card.appendChild(head);

        var ta = el("textarea"); ta.rows = 2; ta.value = n.text; ta.placeholder = n.type === "q" ? "The question to ask the user" : "What this result means";
        ta.setAttribute("aria-label", nodeLabel(model, n) + " text"); ta.addEventListener("input", function () { n.text = ta.value; });
        card.appendChild(ta);

        if (n.type === "q") {
          var al = el("div", "fl-answers-edit");
          n.answers.forEach(function (a, ai) {
            var row = el("div", "fl-ans-row");
            var li = el("input"); li.type = "text"; li.value = a.label; li.placeholder = "Answer"; li.setAttribute("aria-label", "Answer " + (ai + 1)); li.addEventListener("input", function () { a.label = li.value; });
            var ts = el("select"); ts.setAttribute("aria-label", "Where answer " + (ai + 1) + " leads"); fillTargets(ts, a.next, n.id, true);
            ts.addEventListener("focus", function () { fillTargets(ts, a.next, n.id, true); });
            ts.addEventListener("change", function () {
              if (ts.value === "__q" || ts.value === "__r") { var nn = newNode(ts.value === "__q" ? "q" : "r"); a.next = nn.id; draw(); }
              else a.next = ts.value;
            });
            var rm = el("button", "btn btn-ghost btn-sm", "Remove"); rm.type = "button"; rm.addEventListener("click", function () { n.answers.splice(ai, 1); draw(); });
            row.appendChild(li); row.appendChild(el("span", "fl-arrow", "\u2192")); row.appendChild(ts); row.appendChild(rm); al.appendChild(row);
          });
          var adda = el("button", "btn btn-ghost btn-sm", "Add answer"); adda.type = "button"; adda.addEventListener("click", function () { n.answers.push({ label: "", next: "" }); draw(); });
          al.appendChild(adda);
          var ur = el("div", "fl-ans-row fl-unsure-row"); ur.appendChild(el("span", "fl-unsure-label", "If the user is not sure"));
          ur.appendChild(el("span", "fl-arrow", "\u2192"));
          var us = el("select"); us.setAttribute("aria-label", "Where Not sure leads"); fillTargets(us, n.unsure, n.id, true, "No Not sure button");
          us.addEventListener("focus", function () { fillTargets(us, n.unsure, n.id, true, "No Not sure button"); });
          us.addEventListener("change", function () { if (us.value === "__q" || us.value === "__r") { var nn = newNode(us.value === "__q" ? "q" : "r"); n.unsure = nn.id; draw(); } else n.unsure = us.value; });
          ur.appendChild(us); al.appendChild(ur);
          card.appendChild(al);
        } else {
          var kis = el("input"); kis.type = "text"; kis.value = (n.kis || []).join(", "); kis.placeholder = "KB IDs to suggest, e.g. KB-001, KB-002"; kis.setAttribute("aria-label", "KB IDs to suggest");
          kis.addEventListener("input", function () { n.kis = csv(kis.value).map(function (k) { return k.toUpperCase(); }); });
          var se = el("input"); se.type = "text"; se.value = n.search || ""; se.placeholder = "Or search the Knowledge Base for, e.g. VPN certificate expired"; se.setAttribute("aria-label", "Knowledge Base search text");
          se.addEventListener("input", function () { n.search = se.value; });
          var nt = el("textarea"); nt.rows = 2; nt.value = n.note || ""; nt.placeholder = "Hint for the analyst (optional)"; nt.setAttribute("aria-label", "Hint for the analyst");
          nt.addEventListener("input", function () { n.note = nt.value; });
          var gs = el("select"); gs.setAttribute("aria-label", "Then continue with another flow");
          var g0 = el("option", "", "Do not continue in another flow"); g0.value = ""; gs.appendChild(g0);
          list().forEach(function (f) { if (f.id === model.id) return; var o = el("option", "", "Then continue with: " + f.title); o.value = f.id; gs.appendChild(o); });
          gs.value = n.goto || ""; gs.addEventListener("change", function () { n.goto = gs.value; });
          card.appendChild(kis); card.appendChild(se); card.appendChild(nt); card.appendChild(gs);
        }
        nodesBox.appendChild(card);
      });
    }
    addQ.addEventListener("click", function () { newNode("q"); draw(); });
    addR.addEventListener("click", function () { newNode("r"); draw(); });
    txtBtn.addEventListener("click", function () { openText(); });
    draw();

    function openText() {
      var tb = el("div", "kb-form"), ta = el("textarea", "sc-code"); ta.rows = 18; ta.value = SDT.flowtext.toText(model, titleOf); ta.spellcheck = false; ta.setAttribute("wrap", "off"); ta.setAttribute("aria-label", "Flow as text");
      var terr = el("p", "form-error"); terr.hidden = true;
      var help = el("details", "fl-help"); help.appendChild(el("summary", "", "How to write a flow as text"));
      help.appendChild(el("pre", "sc-pre", ["Q: a question", "  an answer -> Q: the next question", "    another answer -> R: a result | KI: KB-001 | search: words | note: hint | flow: Another flow title", "  second answer -> [name]      (go to a step that has a name)", "  ? -> R: shown when the user is not sure", "R[name]: a result you can point to from several answers", "", "Indent each answer under its question. Lines starting with # are comments."].join("\n")));
      tb.appendChild(el("p", "empty small", "Write the flow here and choose Apply. This replaces the questions and results in the editor.")); tb.appendChild(help); tb.appendChild(ta); tb.appendChild(terr);
      SDT.modal.open({ title: "Flow as text", body: tb, size: "lg", initialFocus: ta, actions: [
        { label: "Apply", kind: "primary", onClick: function () {
            var r = SDT.flowtext.fromText(ta.value, idByTitle);
            if (r.error) { terr.textContent = r.error; terr.hidden = false; return false; }
            model.nodes = r.nodes; model.start = r.start; draw();
          } }, { label: "Cancel", kind: "ghost", cancel: true }] });
    }

    function problems() {
      var p = [];
      if (!title.value.trim()) p.push("Enter a flow title.");
      if (!model.nodes.length) p.push("Add at least one question.");
      else if (!nodeOf(model, model.start)) p.push("Choose which step to start with.");
      model.nodes.forEach(function (n) {
        var l = nodeLabel(model, n);
        if (!n.text.trim()) p.push(l + " has no text.");
        if (n.type === "q") {
          if (!n.answers.length) p.push(l + " needs at least one answer.");
          n.answers.forEach(function (a, i) {
            if (!a.label.trim()) p.push(l + ", answer " + (i + 1) + " has no label.");
            else if (!a.next || !nodeOf(model, a.next)) p.push(l + ", answer \u201C" + a.label + "\u201D does not lead anywhere yet.");
          });
        }
      });
      return p;
    }
    function snap() { return JSON.stringify([title.value, kw.value, desc.value, cat.value, tags.value, owner.value, rev.value, model.start, model.nodes]); }
    var initial = snap(), secState = { ok: false };
    SDT.modal.open({
      title: cur ? "Edit question flow" : "New question flow", body: body, size: "lg", initialFocus: title,
      isDirty: function () { return snap() !== initial; },
      actions: [
        { label: "Save", kind: "primary", onClick: function (h) {
            var pr = problems();
            if (pr.length) { err.textContent = pr.slice(0, 4).join(" ") + (pr.length > 4 ? " (and " + (pr.length - 4) + " more)" : ""); err.hidden = false; return false; }
            if (SDT.secrets && !SDT.secrets.gate(secState, [title.value, desc.value].concat(model.nodes.map(function (n) { return n.text + " " + (n.note || "") + " " + (n.search || ""); })), "this flow", h)) return false;
            model.title = title.value.trim(); model.keywords = csv(kw.value); model.description = desc.value.trim(); model.updatedAt = new Date().toISOString();
            model.category = cat.value.trim(); model.tags = csv(tags.value); model.owner = owner.value.trim(); model.reviewed = rev.value;
            model.nodes.forEach(function (n) {
              n.text = n.text.trim();
              if (n.type === "r") { n.answers = []; delete n.unsure; } else { n.kis = []; n.search = ""; n.note = ""; delete n.goto; n.answers.forEach(function (a) { a.label = a.label.trim(); }); if (!n.unsure) delete n.unsure; }
              if (n.type === "r" && !n.goto) delete n.goto;
            });
            var all = list(); all = cur ? all.map(function (f) { return f.id === cur.id ? model : f; }) : all.concat([model]);
            save(all); openCards[model.id] = true; render(); refreshTicket(); toast("Flow saved");
          } },
        { label: "Cancel", kind: "ghost", cancel: true }
      ]
    });
  }

  /* ---- Page ---- */
  function refreshTicket() { if (SDT.ticket && SDT.ticket.render) { try { SDT.ticket.render(); } catch (e) {} } }
  function duplicate(f) {
    var c = clone(f); c.id = uid(); c.title = f.title + " (copy)"; c.updatedAt = new Date().toISOString(); c.reviewed = "";
    save(list().concat([c])); openCards[c.id] = true; render(); toast("Flow duplicated");
  }
  function remove(f) {
    var snap = list(); save(snap.filter(function (x) { return x.id !== f.id; })); render(); refreshTicket();
    toast("Flow deleted", function () { save(snap); render(); refreshTicket(); });
  }
  function exportFlows() {
    var all = list(); if (!all.length) { toast("Nothing to export"); return; }
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    SDT.app.download("question-flows-" + d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + ".json",
      JSON.stringify({ app: "ServiceDeskToolkit", kind: "flows", version: 1, exportedAt: d.toISOString(), flows: all }, null, 2), "application/json");
    toast("Exported " + all.length + " flow" + (all.length === 1 ? "" : "s"));
  }
  function importFlows(file) {
    if (!file) return;
    if (file.size > 2000000) { toast("That file is too large"); return; }
    var r = new FileReader();
    r.onload = function () {
      var data; try { data = JSON.parse(String(r.result).replace(/^\uFEFF/, "")); } catch (e) { toast("That is not a valid flows file"); return; }
      var items = data && Array.isArray(data.flows) ? data.flows : null;
      if (!items) { toast("That file has no flows in it"); return; }
      var all = list().slice(), added = 0, skipped = 0;
      items.forEach(function (f) {
        var ok = f && f.title && Array.isArray(f.nodes) && f.nodes.length && f.nodes.every(function (n) { return n && n.id && (n.type === "q" || n.type === "r"); });
        if (!ok || all.some(function (x) { return x.id === f.id || x.title === f.title; })) { skipped++; return; }
        f.id = f.id || uid(); all.push(f); added++;
      });
      save(all); render(); refreshTicket();
      toast("Imported " + added + " flow" + (added === 1 ? "" : "s") + (skipped ? ", skipped " + skipped + " already here or incomplete" : ""));
    };
    r.readAsText(file);
  }

  function filteredFlows() {
    var terms = ui.query.toLowerCase().split(/\s+/).filter(Boolean), use = usage();
    var out = list().filter(function (f) {
      if (ui.category && (f.category || "General") !== ui.category) return false;
      var h = hay(f) + " " + f.nodes.map(function (n) { return n.text; }).join(" ").toLowerCase();
      return terms.every(function (t) { return h.indexOf(t) > -1; });
    });
    if (ui.sort === "updated") out.sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
    else if (ui.sort === "used") out.sort(function (a, b) { return ((use[b.id] || {}).n || 0) - ((use[a.id] || {}).n || 0) || a.title.localeCompare(b.title); });
    else out.sort(function (a, b) { return a.title.localeCompare(b.title); });
    return out;
  }
  function selectedIds() { return Object.keys(selected).filter(function (k) { return selected[k]; }); }
  function renderBulk() {
    var bar = $("fl-bulk"); if (!bar) return; bar.innerHTML = ""; bar.hidden = !ui.select;
    if (!ui.select) return;
    var n = selectedIds().length;
    bar.appendChild(el("span", "", n + " selected"));
    function b(label, kind, fn, dis) { var x = el("button", "btn btn-sm " + kind, label); x.type = "button"; x.disabled = !!dis; x.addEventListener("click", fn); bar.appendChild(x); }
    b("Select all shown", "btn-ghost", function () { filteredFlows().forEach(function (f) { selected[f.id] = true; }); render(); });
    b("Change category...", "btn-ghost", function () {
      SDT.modal.prompt({ title: "Move " + n + " flow" + (n === 1 ? "" : "s") + " to a category", label: "Category", value: "", confirmLabel: "Move" }).then(function (v) {
        if (v == null || !String(v).trim()) return;
        var ids = selectedIds(); save(list().map(function (f) { if (ids.indexOf(f.id) > -1) f.category = String(v).trim(); return f; })); render(); refreshTicket(); toast("Moved " + ids.length);
      });
    }, !n);
    b("Delete", "btn-danger", function () {
      var ids = selectedIds(), snap = list();
      save(snap.filter(function (f) { return ids.indexOf(f.id) === -1; })); selected = {}; render(); refreshTicket();
      toast("Deleted " + ids.length + " flow" + (ids.length === 1 ? "" : "s"), function () { save(snap); render(); refreshTicket(); });
    }, !n);
  }

  function render() {
    var box = $("fl-list"); if (!box) return; box.innerHTML = "";
    var p = prefs(); if (!render.loaded) { ui.category = p.category || ""; ui.sort = p.sort || "name"; render.loaded = true; }
    var cs = $("fl-category"), ss = $("fl-sort");
    if (cs) { cs.innerHTML = ""; var o0 = el("option", "", "All categories"); o0.value = ""; cs.appendChild(o0); categories().forEach(function (c) { var o = el("option", "", c); o.value = c; cs.appendChild(o); }); if (categories().indexOf(ui.category) === -1) ui.category = ""; cs.value = ui.category; }
    if (ss) ss.value = ui.sort;
    var sb = $("fl-select"); if (sb) { sb.setAttribute("aria-pressed", ui.select ? "true" : "false"); sb.classList.toggle("active", ui.select); }
    var use = usage(), all = list(), items = filteredFlows();
    $("fl-summary").textContent = items.length + " of " + all.length + " flow" + (all.length === 1 ? "" : "s") + " in " + categories().length + " categor" + (categories().length === 1 ? "y" : "ies");
    renderBulk();
    if (!items.length) {
      var e = el("div", "empty-state"); e.appendChild(el("p", "empty", all.length ? "No flow matches that search." : "No flows yet. Choose New flow to build your first set of probing questions."));
      box.appendChild(e); return;
    }
    var by = {};
    items.forEach(function (f) { var k = f.category || "General"; (by[k] = by[k] || []).push(f); });
    Object.keys(by).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (c) {
      var g = el("details", "sc-cat"); g.open = true;
      var h = el("summary", "sc-cat-sum"); h.appendChild(dot(c)); h.appendChild(el("span", "sc-cat-name", c)); h.appendChild(el("span", "tag", String(by[c].length))); g.appendChild(h);
      var wrap = el("div", "sc-cat-body");
      by[c].forEach(function (f) { wrap.appendChild(card(f, use[f.id])); });
      g.appendChild(wrap); box.appendChild(g);
    });
    if (pendingScroll) {
      var t = box.querySelector('[data-id="' + pendingScroll + '"]'); pendingScroll = null;
      if (t) setTimeout(function () { t.scrollIntoView({ block: "center" }); }, 30);
    }
  }
  function card(f, u) {
    var d = el("details", "sc-item"); d.open = !!openCards[f.id]; d.setAttribute("data-id", f.id);
    d.addEventListener("toggle", function () { openCards[f.id] = d.open; });
    var sm = el("summary", "sc-sum"), c = counts(f);
    if (ui.select) {
      var cb = el("input"); cb.type = "checkbox"; cb.checked = !!selected[f.id]; cb.className = "sel-box"; cb.setAttribute("aria-label", "Select " + f.title);
      cb.addEventListener("click", function (e) { e.stopPropagation(); }); cb.addEventListener("change", function () { selected[f.id] = cb.checked; renderBulk(); });
      sm.appendChild(cb);
    }
    sm.appendChild(el("span", "sc-title", f.title));
    sm.appendChild(el("span", "tag", c.q + " question" + (c.q === 1 ? "" : "s")));
    sm.appendChild(el("span", "tag", c.r + " result" + (c.r === 1 ? "" : "s")));
    if (u) sm.appendChild(el("span", "tag", "Used " + u.n + "x"));
    d.appendChild(sm);
    var filled = false;
    function fill() {   // the body is only built when the card is opened, so long lists stay fast
    if (filled) return; filled = true;
    var inner = el("div", "sc-body");
    if (f.description) inner.appendChild(el("p", "sc-desc", f.description));
    var meta = [];
    if (f.owner) meta.push("owner: " + f.owner);
    meta.push(f.reviewed ? "reviewed " + f.reviewed : "never reviewed");
    inner.appendChild(el("p", "result-meta", meta.join(" | ")));
    if (u) {
      var top = Object.keys(u.results).sort(function (a, b) { return u.results[b] - u.results[a]; })[0];
      inner.appendChild(el("p", "result-meta", "Used on " + u.n + " saved ticket" + (u.n === 1 ? "" : "s") + " | resolved " + Math.round(u.resolved * 100 / u.n) + "% | escalated " + Math.round(u.escalated * 100 / u.n) + "%" + (top ? " | most common result: " + top : "")));
    }
    var chips = el("div", "sc-chips");
    (f.keywords || []).forEach(function (k) { chips.appendChild(el("span", "tag", k)); });
    tagsOf(f).forEach(function (t) { chips.appendChild(el("span", "tag tag-ki", "#" + t)); });
    if (chips.children.length) inner.appendChild(chips);

    var mode = ui.view[f.id] || "outline", seg = el("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "View of " + f.title);
    [["outline", "Outline"], ["map", "Map"]].forEach(function (v) {
      var b = el("button", mode === v[0] ? "active" : "", v[1]); b.type = "button"; b.setAttribute("aria-pressed", mode === v[0] ? "true" : "false");
      b.addEventListener("click", function () { ui.view[f.id] = v[0]; openCards[f.id] = true; render(); }); seg.appendChild(b);
    });
    inner.appendChild(seg);
    if (mode === "map") { var mw = el("div", "fl-map-wrap"); mw.tabIndex = 0; mw.setAttribute("aria-label", "Map of " + f.title); mw.appendChild(mapTree(f)); inner.appendChild(mw); }
    else { var pre = el("pre", "sc-pre fl-outline"); pre.tabIndex = 0; pre.setAttribute("aria-label", "Outline of " + f.title); pre.appendChild(el("code", "", outline(f))); inner.appendChild(pre); }

    var row = el("div", "sc-tools");
    function btn(label, kind, fn) { var b = el("button", "btn " + kind + " btn-sm", label); b.type = "button"; b.setAttribute("aria-label", label + " " + f.title); b.addEventListener("click", fn); row.appendChild(b); }
    btn("Try it", "", function () { tryFlow(f); });
    btn("Edit", "btn-ghost", function () { openEditor(f.id); });
    btn(pins().indexOf(f.id) > -1 ? "Unpin from Quick start" : "Pin to Quick start", "btn-ghost", function () { var on = togglePin(f.id); render(); refreshTicket(); toast(on ? "Pinned to Quick start" : "Unpinned"); });
    btn("Mark reviewed", "btn-ghost", function () { save(list().map(function (x) { if (x.id === f.id) x.reviewed = today(); return x; })); render(); toast("Marked as reviewed today"); });
    btn("Duplicate", "btn-ghost", function () { duplicate(f); });
    btn("Delete", "btn-danger", function () { remove(f); });
    inner.appendChild(row); d.appendChild(inner);
    }
    d.addEventListener("toggle", function () { if (d.open) fill(); });
    if (d.open) fill();
    return d;
  }

  function init() {
    list();
    var timer, p = prefs(); ui.category = p.category || ""; ui.sort = p.sort || "name"; render.loaded = true;
    $("fl-search").addEventListener("input", function (e) { var v = e.target.value; clearTimeout(timer); timer = setTimeout(function () { ui.query = v; render(); }, 120); });
    $("fl-category").addEventListener("change", function (e) { ui.category = e.target.value; savePrefs(); render(); });
    $("fl-sort").addEventListener("change", function (e) { ui.sort = e.target.value; savePrefs(); render(); });
    $("fl-select").addEventListener("click", function () { ui.select = !ui.select; if (!ui.select) selected = {}; render(); });
    $("fl-new").addEventListener("click", function () { openEditor(null); });
    $("fl-export").addEventListener("click", exportFlows);
    $("fl-import").addEventListener("click", function () { $("fl-file").click(); });
    $("fl-file").addEventListener("change", function (e) { importFlows(e.target.files[0]); e.target.value = ""; });
  }

  SDT.flows = { init: init, render: render, list: list, match: match, find: find, mount: mount, notes: notes, openEditor: openEditor, show: show, forKi: forKi, summary: summary, startOn: startOn, reachable: reachable, categories: categories, quick: quick, togglePin: togglePin, pins: pins };
})(window);
