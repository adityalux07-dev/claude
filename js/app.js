/* CCTV Business Manager — UI layer (vanilla JS, no build step). */
(function () {
  'use strict';

  var S = window.CCTV;
  var KEY = 'cctv-manager-data-v1';
  var app = document.getElementById('app');
  var modal = document.getElementById('modal');
  var modalBody = document.getElementById('modal-body');
  var state = load();

  /* ================= persistence ================= */

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var data = JSON.parse(raw);
        var base = S.createState();
        data.settings = Object.assign(base.settings, data.settings || {});
        return Object.assign(base, data);
      }
    } catch (e) { console.error(e); }
    return S.createState();
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('Could not save — browser storage may be full', true); }
  }

  // Run a change; roll back everything if it throws.
  function commit(fn, okMsg) {
    var backup = JSON.stringify(state);
    try {
      var result = fn();
      save();
      if (okMsg) toast(okMsg);
      return result === undefined ? true : result;
    } catch (e) {
      state = JSON.parse(backup);
      toast(e.message || String(e), true);
      return false;
    }
  }

  /* ================= helpers ================= */

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    n = Number(n) || 0;
    var frac = Math.round(n * 100) % 100 !== 0;
    return esc(state.settings.currency) + n.toLocaleString(undefined, { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 });
  }
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    return isNaN(d) ? esc(iso) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function fmtDateTime(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function stars(n) { return '<span class="star-show">' + '★★★★★'.slice(0, n) + '<span class="muted">' + '★★★★★'.slice(n) + '</span></span>'; }
  function badge(status) { return '<span class="badge s-' + status + '">' + esc(S.stageOf(status).label) + '</span>'; }
  function memberNames(ids) {
    return ids.map(function (id) { var m = S.getMember(state, id); return m ? m.name : '?'; }).join(', ');
  }
  function phoneDigits(p) {
    var d = String(p || '').replace(/\D/g, '');
    if (d.length === 10 && state.settings.countryCode) d = String(state.settings.countryCode).replace(/\D/g, '') + d;
    return d;
  }
  function waLink(phone, text) {
    return 'https://wa.me/' + phoneDigits(phone) + '?text=' + encodeURIComponent(text);
  }
  function opt(value, label, selected) {
    return '<option value="' + esc(value) + '"' + (selected ? ' selected' : '') + '>' + esc(label) + '</option>';
  }
  function formData(form) {
    var o = {};
    new FormData(form).forEach(function (v, k) {
      if (o[k] !== undefined) { if (!Array.isArray(o[k])) o[k] = [o[k]]; o[k].push(v); }
      else o[k] = v;
    });
    return o;
  }
  function asArray(v) { return v === undefined ? [] : Array.isArray(v) ? v : [v]; }
  function monthStart() { var d = S.today(); return d.slice(0, 8) + '01'; }

  var toastTimer;
  function toast(msg, isError) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, isError ? 4000 : 2200);
  }

  function openModal(html) {
    modalBody.innerHTML = html;
    modal.showModal();
    var f = modalBody.querySelector('input, select, textarea');
    if (f) f.focus();
  }
  function closeModal() { modal.close(); }

  function balanceOf(job) {
    return job.workDoneAt && job.status !== 'cancelled' ? S.invoice(state, job).balance : 0;
  }

  /* ================= router ================= */

  var routes = [
    [/^\/?$/, viewDashboard],
    [/^\/dashboard$/, viewDashboard],
    [/^\/jobs\/new$/, function () { return viewJobForm(null); }],
    [/^\/jobs\/([\w-]+)\/edit$/, function (m) { return viewJobForm(m[1]); }],
    [/^\/jobs\/([\w-]+)$/, function (m) { return viewJob(m[1]); }],
    [/^\/jobs$/, viewJobs],
    [/^\/invoice\/([\w-]+)$/, function (m) { return viewInvoice(m[1]); }],
    [/^\/stock\/([\w-]+)$/, function (m) { return viewItem(m[1]); }],
    [/^\/stock$/, viewStock],
    [/^\/team$/, viewTeam],
    [/^\/reports$/, viewReports],
    [/^\/settings$/, viewSettings]
  ];

  function parseHash() {
    var h = location.hash.replace(/^#/, '') || '/dashboard';
    var q = {};
    var i = h.indexOf('?');
    if (i >= 0) {
      h.slice(i + 1).split('&').forEach(function (p) {
        var kv = p.split('=');
        if (kv[0]) q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
      });
      h = h.slice(0, i);
    }
    return { path: h, query: q };
  }

  var route = parseHash();
  function render() {
    route = parseHash();
    var html = null;
    for (var i = 0; i < routes.length; i++) {
      var m = route.path.match(routes[i][0]);
      if (m) { html = routes[i][1](m); break; }
    }
    app.innerHTML = html || '<div class="empty">Page not found. <a href="#/dashboard">Go to dashboard</a></div>';
    var section = route.path.split('/')[1] || 'dashboard';
    if (section === 'invoice') section = 'jobs';
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-nav') === section);
    });
    document.getElementById('brand-name').textContent = state.settings.businessName || 'CCTV Manager';
    document.title = (state.settings.businessName || 'CCTV') + ' — Manager';
  }
  function go(path) {
    if (location.hash === '#' + path) render(); else location.hash = path;
  }
  window.addEventListener('hashchange', function () { render(); window.scrollTo(0, 0); });

  /* ================= dashboard ================= */

  function viewDashboard() {
    var jobs = state.jobs;
    if (!jobs.length && !state.items.length && !state.team.length) {
      return '<div class="card"><h1>Welcome 👋</h1>' +
        '<p>This app follows your job flow from start to finish:</p>' +
        '<p><strong>Enquiry → Assign to team → Issue material from stock → Work done → Payment &amp; feedback → Close → Return unused material</strong></p>' +
        '<p>To get started:</p><ol>' +
        '<li>Set your business name in <a href="#/settings">Settings</a></li>' +
        '<li>Add your technicians in <a href="#/team">Team</a></li>' +
        '<li>Add cameras, DVRs, cable etc. in <a href="#/stock">Stock</a></li>' +
        '<li>Create your first <a href="#/jobs/new">enquiry</a></li></ol>' +
        '<div class="btn-row"><a class="btn btn-primary" href="#/jobs/new">+ New Enquiry</a>' +
        '<button class="btn" data-action="load-sample">Try with sample data</button></div></div>';
    }

    var counts = {};
    jobs.forEach(function (j) { counts[j.status] = (counts[j.status] || 0) + 1; });
    var pipeline = S.STAGES.slice(0, 6).map(function (st, i) {
      return '<a class="tile s-' + st.key + '" href="#/jobs?status=' + st.key + '">' +
        '<div class="label">' + (i + 1) + '. ' + esc(st.label) + '</div>' +
        '<div class="value">' + (counts[st.key] || 0) + '</div>' +
        '<div class="muted small">Next: ' + esc(st.next) + '</div></a>';
    }).join('');

    var r = S.report(state, monthStart(), S.today());
    var all = S.report(state);
    var low = S.lowStock(state);
    var today = S.today();
    var todays = jobs.filter(function (j) {
      return j.scheduledDate && j.scheduledDate <= today && S.stageIndex(j.status) >= 0 && S.stageIndex(j.status) < 3;
    });
    var dues = jobs.filter(function (j) { return balanceOf(j) > 0; });
    var returns = jobs.filter(function (j) { return j.status === 'closed'; });

    return '<div class="page-head"><div><h1>Dashboard</h1><div class="muted">' + fmtDate(today) + '</div></div></div>' +
      '<h2>Job pipeline</h2><div class="pipeline tiles">' + pipeline + '</div>' +
      '<div class="tiles">' +
        tile('Collected this month', money(r.collected), 'ok', '#/reports') +
        tile('Billed this month', money(r.billed), '', '#/reports') +
        tile('Outstanding dues', money(all.outstanding), all.outstanding > 0 ? 'danger' : '', '#/jobs?status=dues') +
        tile('Jobs done this month', r.completed, '', '#/reports') +
        tile('Avg rating', r.ratings.length ? r.avgRating.toFixed(1) + ' ★' : '—', '', '#/reports') +
        tile('Low stock items', low.length, low.length ? 'warn' : '', '#/stock?filter=low') +
      '</div>' +
      '<div class="grid grid-2">' +
        listCard('Scheduled / overdue visits', todays, function (j) {
          return badge(j.status) + ' ' + (j.scheduledDate < today ? '<span class="danger-text small">overdue · </span>' : '') +
            '<span class="small muted">' + fmtDate(j.scheduledDate) + '</span>';
        }, 'No visits due today') +
        listCard('Material pending return', returns, function (j) {
          var n = S.materialSummary(state, j).reduce(function (s, r) { return s + (r.toReturn > 0 ? 1 : 0); }, 0);
          return '<span class="small muted">' + (n ? n + ' item type(s) to return' : 'nothing to return — just confirm') + '</span>';
        }, 'All material reconciled 👍') +
        listCard('Payment dues', dues, function (j) {
          return '<span class="danger-text"><strong>' + money(balanceOf(j)) + '</strong></span>';
        }, 'No pending dues') +
        '<div class="card"><h2>Low stock</h2>' + (low.length ? '<table><tbody>' + low.map(function (i) {
          return '<tr><td><a href="#/stock/' + i.id + '">' + esc(i.name) + '</a></td><td class="right danger-text nowrap">' +
            i.qty + ' ' + esc(i.unit) + '</td><td class="right muted small nowrap">min ' + i.reorder + '</td></tr>';
        }).join('') + '</tbody></table>' : '<div class="empty">Stock levels look fine</div>') + '</div>' +
      '</div>';
  }

  function tile(label, value, cls, href) {
    return '<a class="tile ' + (cls || '') + '" href="' + href + '"><div class="label">' + esc(label) + '</div><div class="value">' + value + '</div></a>';
  }
  function listCard(title, jobs, extra, emptyText) {
    return '<div class="card"><h2>' + esc(title) + ' <span class="muted small">(' + jobs.length + ')</span></h2>' +
      (jobs.length ? '<table><tbody>' + jobs.slice(0, 8).map(function (j) {
        return '<tr><td><a href="#/jobs/' + j.id + '"><strong>' + esc(j.number) + '</strong></a> ' + esc(j.customer.name) +
          '</td><td class="right">' + extra(j) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<div class="empty">' + esc(emptyText) + '</div>') + '</div>';
  }

  /* ================= jobs list ================= */

  function viewJobs() {
    var status = route.query.status || 'active';
    var q = (route.query.q || '').toLowerCase();
    var filters = [['active', 'Active']].concat(S.STAGES.map(function (s) { return [s.key, s.label]; }))
      .concat([['dues', 'Payment due'], ['cancelled', 'Cancelled'], ['all', 'All']]);
    function match(j, f) {
      if (f === 'all') return true;
      if (f === 'active') return j.status !== 'completed' && j.status !== 'cancelled';
      if (f === 'dues') return balanceOf(j) > 0;
      return j.status === f;
    }
    var tabs = filters.map(function (f) {
      var n = state.jobs.filter(function (j) { return match(j, f[0]); }).length;
      return '<a href="#/jobs?status=' + f[0] + '" class="' + (status === f[0] ? 'active' : '') + '">' + esc(f[1]) + '<span class="n">' + n + '</span></a>';
    }).join('');

    var list = state.jobs.filter(function (j) {
      if (!match(j, status)) return false;
      if (!q) return true;
      return [j.number, j.customer.name, j.customer.phone, j.customer.address, j.description, j.type]
        .join(' ').toLowerCase().indexOf(q) >= 0;
    }).slice().reverse();

    return '<div class="page-head"><h1>Jobs</h1><a class="btn btn-primary" href="#/jobs/new">+ New Enquiry</a></div>' +
      '<div class="tabs">' + tabs + '</div>' +
      '<form data-form="job-search" class="field"><input class="search" name="q" type="search" placeholder="Search name, phone, job no…" value="' + esc(route.query.q || '') + '"></form>' +
      (list.length ? '<div class="job-list">' + list.map(jobCard).join('') + '</div>' :
        '<div class="card empty">No jobs here. <a href="#/jobs/new">Add an enquiry</a></div>');
  }

  function jobCard(j) {
    var bal = balanceOf(j);
    var st = S.stageOf(j.status);
    return '<a class="job-card" href="#/jobs/' + j.id + '">' +
      '<div class="title">' + esc(j.number) + ' · ' + esc(j.customer.name) + '</div>' +
      '<div class="right">' + badge(j.status) + '</div>' +
      '<div class="meta">' + esc(j.type) + (j.assignedTo.length ? ' · 👷 ' + esc(memberNames(j.assignedTo)) : '') +
        (j.scheduledDate ? ' · 📅 ' + fmtDate(j.scheduledDate) : '') + '</div>' +
      '<div class="meta right">' + (bal > 0 ? '<span class="danger-text">Due ' + money(bal) + '</span>' :
        (st.next ? 'Next: ' + esc(st.next) : '')) + '</div></a>';
  }

  /* ================= enquiry form ================= */

  function viewJobForm(id) {
    var j = id ? S.find(state.jobs, id) : null;
    if (id && !j) return null;
    var c = j ? j.customer : {};
    var types = S.JOB_TYPES.map(function (t) { return opt(t, t, j && j.type === t); }).join('');
    var sources = ['', 'Phone', 'Walk-in', 'WhatsApp', 'Referral', 'Website', 'Repeat customer', 'Other']
      .map(function (s) { return opt(s, s || '— select —', j && j.source === s); }).join('');
    return '<div class="page-head"><h1>' + (j ? 'Edit ' + esc(j.number) : 'New Enquiry') + '</h1></div>' +
      '<form class="card" data-form="job"' + (j ? ' data-id="' + j.id + '"' : '') + '>' +
      '<h2>Customer</h2><div class="form-grid">' +
        field('Customer / business name *', '<input name="name" required value="' + esc(c.name) + '">') +
        field('Phone *', '<input name="phone" type="tel" required value="' + esc(c.phone) + '">') +
        field('Email', '<input name="email" type="email" value="' + esc(c.email) + '">') +
      '</div>' + field('Site address', '<textarea name="address" rows="2">' + esc(c.address) + '</textarea>') +
      '<h2>Requirement</h2><div class="form-grid">' +
        field('Job type', '<select name="type">' + types + '</select>') +
        field('Enquiry source', '<select name="source">' + sources + '</select>') +
        field('Preferred visit date', '<input name="scheduledDate" type="date" value="' + esc(j ? j.scheduledDate : '') + '">') +
        field('Estimate / quote (' + esc(state.settings.currency) + ')', '<input name="estimate" type="number" min="0" step="any" value="' + (j && j.estimate ? j.estimate : '') + '">') +
      '</div>' + field('Details (no. of cameras, problem description…)', '<textarea name="description" rows="3">' + esc(j ? j.description : '') + '</textarea>') +
      '<div class="btn-row"><button class="btn btn-primary" type="submit">' + (j ? 'Save changes' : 'Save enquiry') + '</button>' +
      '<a class="btn" href="' + (j ? '#/jobs/' + j.id : '#/jobs') + '">Cancel</a></div></form>';
  }
  function field(label, input) { return '<div class="field"><label>' + label + '</label>' + input + '</div>'; }

  /* ================= job detail ================= */

  function viewJob(id) {
    var j = S.find(state.jobs, id);
    if (!j) return null;
    var idx = S.stageIndex(j.status);
    var stepper = '<div class="stepper">' + S.STAGES.map(function (st, i) {
      var cls = j.status === 'cancelled' ? '' : i <= idx ? 'done' : i === idx + 1 ? 'current' : '';
      return '<div class="step ' + cls + '"><div class="dot">' + (i <= idx && j.status !== 'cancelled' ? '✓' : i + 1) + '</div>' + esc(st.label) + '</div>';
    }).join('') + '</div>';

    var c = j.customer;
    var phoneLinks = '<a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a> · <a target="_blank" rel="noopener" href="' +
      waLink(c.phone, 'Hello ' + c.name + ', this is ' + state.settings.businessName + ' regarding your ' + j.type + ' (' + j.number + ').') + '">WhatsApp</a>';

    var actions = [];
    if (['enquiry', 'assigned', 'issued'].indexOf(j.status) >= 0) {
      actions.push('<a class="btn btn-sm" href="#/jobs/' + j.id + '/edit">Edit</a>');
      actions.push('<button class="btn btn-sm btn-danger" data-action="cancel-job" data-id="' + j.id + '">Cancel job</button>');
    }
    if (j.status === 'enquiry' || j.status === 'cancelled') actions.push('<button class="btn btn-sm btn-danger" data-action="delete-job" data-id="' + j.id + '">Delete</button>');
    if (j.workDoneAt) actions.push('<a class="btn btn-sm" href="#/invoice/' + j.id + '">🧾 Invoice</a>');

    return '<div class="page-head"><div><a href="#/jobs" class="small">← Jobs</a><h1>' + esc(j.number) + ' · ' + esc(c.name) + '</h1>' +
      '<div>' + badge(j.status) + ' <span class="muted small">' + esc(j.type) + ' · created ' + fmtDate(j.createdAt) + '</span></div></div>' +
      '<div class="btn-row">' + actions.join('') + '</div></div>' +
      stepper +
      nextStepPanel(j) +
      '<div class="grid grid-2">' +
        '<div class="card"><h2>Customer &amp; requirement</h2><dl class="kv">' +
          '<dt>Phone</dt><dd>' + phoneLinks + '</dd>' +
          (c.email ? '<dt>Email</dt><dd>' + esc(c.email) + '</dd>' : '') +
          '<dt>Address</dt><dd>' + (c.address ? esc(c.address) + ' · <a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.address) + '">Map</a>' : '—') + '</dd>' +
          (j.source ? '<dt>Source</dt><dd>' + esc(j.source) + '</dd>' : '') +
          '<dt>Details</dt><dd>' + (esc(j.description) || '—') + '</dd>' +
          (j.estimate ? '<dt>Estimate</dt><dd>' + money(j.estimate) + '</dd>' : '') +
          '<dt>Visit date</dt><dd>' + (j.scheduledDate ? fmtDate(j.scheduledDate) : '—') + '</dd>' +
          '<dt>Team</dt><dd>' + (j.assignedTo.length ? esc(memberNames(j.assignedTo)) : '—') + '</dd>' +
          (j.work ? '<dt>Work done</dt><dd>' + fmtDate(j.work.date) + (j.work.notes ? ' — ' + esc(j.work.notes) : '') + '</dd>' : '') +
          (j.feedback ? '<dt>Feedback</dt><dd>' + stars(j.feedback.rating) + (j.feedback.comments ? '<br>“' + esc(j.feedback.comments) + '”' : '') + '</dd>' : '') +
        '</dl></div>' +
        materialCard(j) +
        (j.workDoneAt && j.status !== 'cancelled' ? billCard(j) : '') +
        '<div class="card"><h2>History</h2><ul class="timeline">' + j.history.slice().reverse().map(function (h) {
          return '<li><div>' + esc(h.text) + '</div><div class="when">' + fmtDateTime(h.date) + '</div></li>';
        }).join('') + '</ul></div>' +
      '</div>';
  }

  function materialCard(j) {
    var rows = S.materialSummary(state, j);
    if (!rows.length) return '<div class="card"><h2>Material</h2><div class="empty">No material issued' +
      (j.status === 'issued' || S.stageIndex(j.status) > 2 ? ' (not required)' : ' yet') + '</div></div>';
    var showUsed = !!j.workDoneAt;
    return '<div class="card"><h2>Material</h2><div class="table-wrap"><table><thead><tr><th>Item</th><th class="right">Issued</th>' +
      (showUsed ? '<th class="right">Used</th><th class="right">Returned</th><th class="right">Pending</th>' : '') +
      '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr><td>' + esc(r.name) + '</td><td class="right nowrap">' + r.issued + ' ' + esc(r.unit) + '</td>' +
          (showUsed ? '<td class="right">' + r.used + '</td><td class="right">' + r.returned + '</td><td class="right">' +
            (r.shortfall ? '<span class="danger-text" title="Not returned (lost / damaged)">' + r.shortfall + ' short</span>' :
              r.toReturn ? '<span class="warn-text">' + r.toReturn + '</span>' : '<span class="ok-text">✓</span>') + '</td>' : '') +
          '</tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  function billCard(j) {
    var inv = S.invoice(state, j);
    return '<div class="card"><h2>Bill &amp; payments</h2>' + billTable(inv) +
      (j.payments.length ? '<h3>Payments received</h3><table><tbody>' + j.payments.map(function (p) {
        return '<tr><td>' + fmtDate(p.date) + '</td><td>' + esc(p.mode) + (p.ref ? ' <span class="muted small">' + esc(p.ref) + '</span>' : '') +
          '</td><td class="right">' + money(p.amount) + '</td><td class="right"><button class="icon-btn" title="Remove" data-action="remove-payment" data-id="' + j.id + '" data-pid="' + p.id + '">✕</button></td></tr>';
      }).join('') + '</tbody></table>' : '') +
      '<table class="bill"><tbody><tr><td>Paid</td><td class="right ok-text">' + money(inv.paid) + '</td></tr>' +
      '<tr class="total"><td>Balance</td><td class="right ' + (inv.balance > 0 ? 'danger-text' : '') + '">' + money(inv.balance) + '</td></tr></tbody></table>' +
      (j.status !== 'workdone' && inv.balance > 0 ? '<hr>' + paymentForm(j, inv) : '') +
      '</div>';
  }

  function billTable(inv) {
    return '<div class="table-wrap"><table class="bill"><tbody>' +
      inv.lines.map(function (l) {
        return '<tr><td>' + esc(l.name) + ' <span class="muted small">' + l.qty + ' ' + esc(l.unit) + ' × ' + money(l.rate) + '</span></td><td class="right">' + money(l.amount) + '</td></tr>';
      }).join('') +
      '<tr><td>Labour / installation</td><td class="right">' + money(inv.labour) + '</td></tr>' +
      (inv.discount ? '<tr><td>Discount</td><td class="right">− ' + money(inv.discount) + '</td></tr>' : '') +
      (inv.taxRate ? '<tr><td>Tax (' + inv.taxRate + '%)</td><td class="right">' + money(inv.tax) + '</td></tr>' : '') +
      '<tr class="total"><td>Total</td><td class="right">' + money(inv.total) + '</td></tr></tbody></table></div>';
  }

  function paymentForm(j, inv) {
    var modes = S.PAYMENT_MODES.map(function (m) { return opt(m, m); }).join('');
    return '<form data-form="payment" data-id="' + j.id + '"><h3>Record payment</h3><div class="form-grid">' +
      field('Amount', '<input name="amount" type="number" min="0" step="any" required value="' + (inv.balance > 0 ? inv.balance : '') + '">') +
      field('Mode', '<select name="mode">' + modes + '</select>') +
      field('Date', '<input name="date" type="date" value="' + S.today() + '">') +
      field('Reference (UPI ID / cheque no.)', '<input name="ref">') +
      '</div><button class="btn btn-ok" type="submit">Add payment</button></form>';
  }

  /* ---------- the "what to do next" panel ---------- */

  function nextStepPanel(j) {
    var s = j.status;
    var h = '';
    if (s === 'enquiry') h = assignForm(j, 'Step 2 · Assign to team');
    else if (s === 'assigned') {
      h = issueForm(j, 'Step 3 · Issue material from stock') +
        '<hr><div class="btn-row"><span class="muted">Service visit with no material?</span>' +
        '<button class="btn" data-action="skip-material" data-id="' + j.id + '">Skip — no material needed</button></div>' +
        '<details><summary>Change assigned team</summary>' + assignForm(j, '') + '</details>';
    } else if (s === 'issued') {
      h = workDoneForm(j) + '<hr><details><summary>Issue more material</summary>' + issueForm(j, '') + '</details>' +
        '<details><summary>Change assigned team</summary>' + assignForm(j, '') + '</details>';
    } else if (s === 'workdone') h = paymentStagePanel(j);
    else if (s === 'paid') {
      var inv = S.invoice(state, j);
      h = '<h2>Step 6 · Close job</h2>' +
        (inv.balance > 0 ? '<div class="alert warn">Balance of ' + money(inv.balance) + ' is still pending. You can close now and collect later — it stays in “Payment due”.</div>' :
          '<div class="alert ok">Fully paid. Feedback: ' + stars(j.feedback.rating) + '</div>') +
        '<button class="btn btn-primary" data-action="close-job" data-id="' + j.id + '">Close job</button>';
    } else if (s === 'closed') h = returnForm(j);
    else if (s === 'completed') {
      var b = balanceOf(j);
      h = '<div class="alert ok">✅ Job completed — all material reconciled' + (b > 0 ? '' : ' and fully paid') + '.</div>' +
        (b > 0 ? '<div class="alert warn">Balance due: ' + money(b) + ' — record it in Bill &amp; payments below when collected.</div>' : '');
      return '<div class="card">' + h + '</div>';
    } else if (s === 'cancelled') {
      return '<div class="card"><div class="alert warn">This job was cancelled. Any issued material was returned to stock.</div></div>';
    }
    return '<div class="card highlight">' + h + '</div>';
  }

  function assignForm(j, title) {
    var active = state.team.filter(function (m) { return m.active || j.assignedTo.indexOf(m.id) >= 0; });
    if (!active.length) return (title ? '<h2>' + title + '</h2>' : '') +
      '<div class="alert info">No team members yet. <a href="#/team">Add your technicians</a> first.</div>';
    return '<form data-form="assign" data-id="' + j.id + '">' + (title ? '<h2>' + title + '</h2>' : '') +
      '<label>Team members</label><div class="checks">' + active.map(function (m) {
        var busy = state.jobs.filter(function (x) { return x.id !== j.id && x.assignedTo.indexOf(m.id) >= 0 && ['assigned', 'issued'].indexOf(x.status) >= 0; }).length;
        return '<label class="check"><input type="checkbox" name="members" value="' + m.id + '"' + (j.assignedTo.indexOf(m.id) >= 0 ? ' checked' : '') + '> ' +
          esc(m.name) + ' <span class="muted small">' + esc(m.role) + (busy ? ' · ' + busy + ' open job' + (busy > 1 ? 's' : '') : '') + '</span></label>';
      }).join('') + '</div>' +
      '<div class="form-grid">' + field('Visit date', '<input type="date" name="scheduledDate" value="' + esc(j.scheduledDate) + '">') + '</div>' +
      '<button class="btn btn-primary" type="submit">' + (j.status === 'enquiry' ? 'Assign' : 'Update team') + '</button></form>';
  }

  function issueRow() {
    var items = state.items.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    return '<div class="issue-row"><select name="itemId"><option value="">— select item —</option>' + items.map(function (i) {
      return '<option value="' + i.id + '"' + (i.qty <= 0 ? ' disabled' : '') + '>' + esc(i.name) + ' (' + i.qty + ' ' + esc(i.unit) + ' in stock)</option>';
    }).join('') + '</select><input name="qty" type="number" min="0" step="any" placeholder="Qty">' +
      '<button type="button" class="icon-btn" data-action="remove-row" title="Remove">✕</button></div>';
  }

  function issueForm(j, title) {
    if (!state.items.length) return (title ? '<h2>' + title + '</h2>' : '') +
      '<div class="alert info">No stock items yet. <a href="#/stock">Add items to stock</a> first.</div>';
    return '<form data-form="issue" data-id="' + j.id + '">' + (title ? '<h2>' + title + '</h2>' : '') +
      '<p class="muted small">Material given to the team for this job. It will be deducted from stock.</p>' +
      '<div class="issue-rows">' + issueRow() + issueRow() + issueRow() + '</div>' +
      '<div class="btn-row"><button type="button" class="btn btn-sm" data-action="add-row">+ Add row</button>' +
      '<button class="btn btn-primary" type="submit">Issue material</button></div></form>';
  }

  function workDoneForm(j) {
    var rows = S.materialSummary(state, j);
    var set = state.settings;
    return '<form data-form="workdone" data-id="' + j.id + '"><h2>Step 4 · Mark work done</h2>' +
      '<div class="form-grid">' + field('Completion date', '<input type="date" name="date" value="' + S.today() + '">') + '</div>' +
      field('Work notes', '<textarea name="notes" placeholder="e.g. 4 cameras installed, DVR configured, mobile app set up"></textarea>') +
      (rows.length ? '<h3>Material actually used on site</h3><p class="muted small">Unused quantity will be returned to stock after closing.</p>' +
        '<div class="table-wrap"><table><thead><tr><th>Item</th><th class="right">Issued</th><th class="right">Used</th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td>' + esc(r.name) + '</td><td class="right nowrap">' + r.issued + ' ' + esc(r.unit) + '</td><td class="right">' +
            '<input class="input-sm" type="number" min="0" max="' + r.issued + '" step="any" name="used_' + r.itemId + '" value="' + r.issued + '"></td></tr>';
        }).join('') + '</tbody></table></div>' : '') +
      '<h3>Charges</h3><div class="form-grid">' +
        field('Labour / installation (' + esc(set.currency) + ')', '<input type="number" min="0" step="any" name="labour" value="' + (set.defaultLabour || 0) + '">') +
        field('Discount (' + esc(set.currency) + ')', '<input type="number" min="0" step="any" name="discount" value="0">') +
        field('Tax %', '<input type="number" min="0" step="any" name="taxRate" value="' + set.taxRate + '">') +
      '</div><button class="btn btn-primary" type="submit">Work done → go to billing</button></form>';
  }

  function paymentStagePanel(j) {
    var inv = S.invoice(state, j);
    var fb = j.feedback;
    var feedbackMsg = 'Hello ' + j.customer.name + ', thank you for choosing ' + state.settings.businessName +
      '. Your ' + j.type + ' (' + j.number + ') is complete. Bill amount: ' + state.settings.currency + inv.total +
      (inv.balance > 0 ? ', balance due: ' + state.settings.currency + inv.balance : '') +
      '. Please rate our service from 1 to 5 and share any feedback.';
    var ready = fb && (j.payments.length || inv.total <= 0);
    return '<h2>Step 5 · Take payment &amp; feedback</h2><div class="grid grid-2"><div>' +
      '<h3>Bill</h3>' + billTable(inv) +
      '<table class="bill"><tbody><tr><td>Paid</td><td class="right ok-text">' + money(inv.paid) + '</td></tr>' +
      '<tr class="total"><td>Balance</td><td class="right ' + (inv.balance > 0 ? 'danger-text' : 'ok-text') + '">' + money(inv.balance) + '</td></tr></tbody></table>' +
      '<details><summary>Edit charges</summary><form data-form="charges" data-id="' + j.id + '"><div class="form-grid">' +
        field('Labour', '<input type="number" min="0" step="any" name="labour" value="' + inv.labour + '">') +
        field('Discount', '<input type="number" min="0" step="any" name="discount" value="' + inv.discount + '">') +
        field('Tax %', '<input type="number" min="0" step="any" name="taxRate" value="' + inv.taxRate + '">') +
      '</div><button class="btn btn-sm" type="submit">Update bill</button></form></details>' +
      (inv.balance > 0 ? '<hr>' + paymentForm(j, inv) : '<div class="alert ok">Fully paid ✓</div>') +
      '</div><div>' +
      '<form data-form="feedback" data-id="' + j.id + '"><h3>Client feedback</h3>' +
        '<div class="stars">' + [5, 4, 3, 2, 1].map(function (n) {
          return '<input type="radio" name="rating" id="r' + n + '" value="' + n + '"' + (fb && fb.rating === n ? ' checked' : '') + '><label for="r' + n + '" title="' + n + ' star">★</label>';
        }).join('') + '</div>' +
        field('Comments', '<textarea name="comments" placeholder="What did the client say?">' + esc(fb ? fb.comments : '') + '</textarea>') +
        '<div class="btn-row"><button class="btn" type="submit">' + (fb ? 'Update feedback' : 'Save feedback') + '</button>' +
        '<a class="btn btn-sm" target="_blank" rel="noopener" href="' + waLink(j.customer.phone, feedbackMsg) + '">Ask on WhatsApp</a></div>' +
      '</form></div></div><hr>' +
      '<div class="btn-row"><button class="btn btn-primary" data-action="complete-payment" data-id="' + j.id + '"' + (ready ? '' : ' disabled') + '>Payment &amp; feedback done →</button>' +
      '<span class="muted small">' + (ready ? (inv.balance > 0 ? 'Balance ' + money(inv.balance) + ' will stay as due.' : '') :
        'Needs ' + [!fb ? 'client feedback' : '', !(j.payments.length || inv.total <= 0) ? 'a payment entry' : ''].filter(Boolean).join(' and ')) + '</span></div>';
  }

  function returnForm(j) {
    var rows = S.materialSummary(state, j).filter(function (r) { return r.toReturn > 0; });
    var h = '<form data-form="return" data-id="' + j.id + '"><h2>Step 7 · Return unused material to stock</h2>';
    if (!rows.length) {
      return h + '<p class="muted">All issued material was used — nothing to return.</p>' +
        '<button class="btn btn-primary" type="submit">Confirm &amp; complete job</button></form>';
    }
    return h + '<p class="muted small">Enter what the team actually brought back. Any difference is recorded as a shortfall (lost/damaged).</p>' +
      '<div class="table-wrap"><table><thead><tr><th>Item</th><th class="right">Unused</th><th class="right">Returned</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td>' + esc(r.name) + '</td><td class="right nowrap">' + r.toReturn + ' ' + esc(r.unit) + '</td><td class="right">' +
          '<input class="input-sm" type="number" min="0" max="' + r.toReturn + '" step="any" name="ret_' + r.itemId + '" value="' + r.toReturn + '"></td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<button class="btn btn-primary" type="submit">Return to stock &amp; complete job</button></form>';
  }

  /* ================= invoice ================= */

  function viewInvoice(id) {
    var j = S.find(state.jobs, id);
    if (!j || !j.workDoneAt) return null;
    var inv = S.invoice(state, j);
    var st = state.settings;
    return '<div class="btn-row no-print" style="margin-bottom:12px"><a class="btn" href="#/jobs/' + j.id + '">← Back</a>' +
      '<button class="btn btn-primary" data-action="print">Print / Save PDF</button></div>' +
      '<div class="invoice"><div class="inv-head"><div><h1>' + esc(st.businessName) + '</h1>' +
        '<div>' + esc(st.address) + '</div><div>' + esc(st.phone) + (st.email ? ' · ' + esc(st.email) : '') + '</div>' +
        (st.taxId ? '<div>Tax ID: ' + esc(st.taxId) + '</div>' : '') + '</div>' +
        '<div class="right"><h2>INVOICE</h2><div>No: <strong>' + esc(j.number) + '</strong></div><div>Date: ' + fmtDate(j.work.date) + '</div></div></div>' +
      '<p><strong>Bill to:</strong> ' + esc(j.customer.name) + '<br>' + esc(j.customer.address) + '<br>' + esc(j.customer.phone) + '</p>' +
      '<p><strong>Work:</strong> ' + esc(j.type) + (j.work.notes ? ' — ' + esc(j.work.notes) : '') + '</p>' +
      '<table><thead><tr><th>#</th><th>Description</th><th class="right">Qty</th><th class="right">Rate</th><th class="right">Amount</th></tr></thead><tbody>' +
      inv.lines.map(function (l, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(l.name) + '</td><td class="right">' + l.qty + ' ' + esc(l.unit) + '</td><td class="right">' + money(l.rate) + '</td><td class="right">' + money(l.amount) + '</td></tr>';
      }).join('') +
      (inv.labour ? '<tr><td>' + (inv.lines.length + 1) + '</td><td>Labour / installation charges</td><td></td><td></td><td class="right">' + money(inv.labour) + '</td></tr>' : '') +
      '</tbody><tfoot>' +
        '<tr><td colspan="4" class="right">Subtotal</td><td class="right">' + money(inv.subtotal) + '</td></tr>' +
        (inv.discount ? '<tr><td colspan="4" class="right">Discount</td><td class="right">− ' + money(inv.discount) + '</td></tr>' : '') +
        (inv.taxRate ? '<tr><td colspan="4" class="right">Tax @ ' + inv.taxRate + '%</td><td class="right">' + money(inv.tax) + '</td></tr>' : '') +
        '<tr><td colspan="4" class="right">Total</td><td class="right">' + money(inv.total) + '</td></tr>' +
        '<tr><td colspan="4" class="right">Paid</td><td class="right">' + money(inv.paid) + '</td></tr>' +
        '<tr><td colspan="4" class="right">Balance due</td><td class="right">' + money(inv.balance) + '</td></tr>' +
      '</tfoot></table><p style="margin-top:40px" class="small">Thank you for your business!</p></div>';
  }

  /* ================= stock ================= */

  function viewStock() {
    var q = (route.query.q || '').toLowerCase();
    var onlyLow = route.query.filter === 'low';
    var lowIds = S.lowStock(state).map(function (i) { return i.id; });
    var items = state.items.filter(function (i) {
      if (onlyLow && lowIds.indexOf(i.id) < 0) return false;
      return !q || [i.name, i.sku, i.category].join(' ').toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return (a.category + a.name).localeCompare(b.category + b.name); });
    var total = state.items.reduce(function (s, i) { return s + i.qty * i.cost; }, 0);

    // material currently out with teams (issued and not yet used/returned)
    var out = 0;
    state.jobs.forEach(function (j) {
      if (j.status === 'cancelled') return;
      S.materialSummary(state, j).forEach(function (r) { out += (j.workDoneAt ? r.toReturn : r.issued) * r.unitCost; });
    });

    return '<div class="page-head"><h1>Stock</h1><div class="btn-row">' +
      '<button class="btn btn-primary" data-action="item-form">+ Add item</button></div></div>' +
      '<div class="tiles">' + tile('Items', state.items.length, '', '#/stock') +
        tile('Stock value (cost)', money(total), '', '#/stock') +
        tile('Material out with teams', money(out), out ? 'warn' : '', '#/jobs?status=closed') +
        tile('Low stock', lowIds.length, lowIds.length ? 'danger' : '', '#/stock?filter=low') + '</div>' +
      '<div class="btn-row field"><form data-form="stock-search" style="flex:1"><input class="search" name="q" type="search" placeholder="Search items…" value="' + esc(route.query.q || '') + '"></form>' +
      (onlyLow ? '<a class="btn btn-sm" href="#/stock">Show all</a>' : '') + '</div>' +
      (items.length ? '<div class="card table-wrap"><table><thead><tr><th>Item</th><th class="hide-sm">Category</th><th class="right">In stock</th>' +
        '<th class="right hide-sm">Cost</th><th class="right hide-sm">Sale price</th><th class="right">Actions</th></tr></thead><tbody>' +
        items.map(function (i) {
          var low = lowIds.indexOf(i.id) >= 0;
          return '<tr class="' + (low ? 'low' : '') + '"><td><a href="#/stock/' + i.id + '"><strong>' + esc(i.name) + '</strong></a>' +
            (i.sku ? '<div class="muted small">' + esc(i.sku) + '</div>' : '') + '</td>' +
            '<td class="hide-sm">' + esc(i.category) + '</td>' +
            '<td class="right nowrap"><strong>' + i.qty + '</strong> ' + esc(i.unit) + (low ? ' <span class="badge low">low</span>' : '') + '</td>' +
            '<td class="right hide-sm">' + money(i.cost) + '</td><td class="right hide-sm">' + money(i.price) + '</td>' +
            '<td class="right nowrap"><button class="btn btn-sm" data-action="stock-in" data-id="' + i.id + '">+ Stock</button> ' +
            '<button class="btn btn-sm" data-action="item-form" data-id="' + i.id + '">Edit</button></td></tr>';
        }).join('') + '</tbody></table></div>' :
        '<div class="card empty">No items' + (q || onlyLow ? ' match' : ' yet') + '. <button class="btn btn-sm" data-action="item-form">Add item</button></div>');
  }

  function viewItem(id) {
    var i = S.find(state.items, id);
    if (!i) return null;
    var moves = state.movements.filter(function (m) { return m.itemId === id; }).slice().reverse();
    var labels = { purchase: 'Stock in', issue: 'Issued', 'return': 'Returned', adjust: 'Adjustment' };
    return '<div class="page-head"><div><a href="#/stock" class="small">← Stock</a><h1>' + esc(i.name) + '</h1>' +
      '<div class="muted">' + esc(i.category) + (i.sku ? ' · ' + esc(i.sku) : '') + '</div></div>' +
      '<div class="btn-row"><button class="btn btn-primary" data-action="stock-in" data-id="' + i.id + '">+ Add stock</button>' +
      '<button class="btn" data-action="stock-adjust" data-id="' + i.id + '">Correct count</button>' +
      '<button class="btn" data-action="item-form" data-id="' + i.id + '">Edit</button></div></div>' +
      '<div class="tiles">' + tile('In stock', i.qty + ' ' + esc(i.unit), S.lowStock(state).indexOf(i) >= 0 ? 'danger' : '', '#/stock/' + i.id) +
        tile('Reorder at', i.reorder || '—', '', '#/stock/' + i.id) +
        tile('Cost / Sale', money(i.cost) + ' / ' + money(i.price), '', '#/stock/' + i.id) +
        tile('Value', money(i.qty * i.cost), '', '#/stock/' + i.id) + '</div>' +
      '<div class="card"><h2>Movement history</h2>' + (moves.length ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th class="right">Qty</th><th>Job / note</th></tr></thead><tbody>' +
        moves.map(function (m) {
          var j = m.jobId ? S.find(state.jobs, m.jobId) : null;
          return '<tr><td class="nowrap">' + fmtDateTime(m.date) + '</td><td>' + esc(labels[m.type] || m.type) + '</td>' +
            '<td class="right ' + (m.qty < 0 ? 'danger-text' : 'ok-text') + '">' + (m.qty > 0 ? '+' : '') + m.qty + '</td>' +
            '<td>' + (j ? '<a href="#/jobs/' + j.id + '">' + esc(j.number) + '</a> ' + esc(j.customer.name) : esc(m.note)) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">No movements yet</div>') + '</div>';
  }

  function itemFormHtml(i) {
    i = i || {};
    var cats = {};
    state.items.forEach(function (x) { cats[x.category] = 1; });
    ['Cameras', 'Recorders', 'Storage', 'Cable', 'Power', 'Accessories', 'Networking'].forEach(function (c) { cats[c] = 1; });
    return '<form data-form="item"' + (i.id ? ' data-id="' + i.id + '"' : '') + '><h2>' + (i.id ? 'Edit item' : 'Add stock item') + '</h2>' +
      field('Item name *', '<input name="name" required value="' + esc(i.name) + '" placeholder="e.g. 2MP Dome Camera">') +
      '<div class="form-grid">' +
        field('Category', '<input name="category" list="cats" value="' + esc(i.category || '') + '"><datalist id="cats">' + Object.keys(cats).map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>') +
        field('Code / SKU', '<input name="sku" value="' + esc(i.sku) + '">') +
        field('Unit', '<input name="unit" list="units" value="' + esc(i.unit || 'pcs') + '"><datalist id="units"><option value="pcs"><option value="m"><option value="roll"><option value="box"><option value="set"></datalist>') +
        field('Reorder level', '<input name="reorder" type="number" min="0" step="any" value="' + (i.reorder || '') + '">') +
        field('Cost price', '<input name="cost" type="number" min="0" step="any" value="' + (i.cost || '') + '">') +
        field('Sale price', '<input name="price" type="number" min="0" step="any" value="' + (i.price || '') + '">') +
        (i.id ? '' : field('Opening quantity', '<input name="openingQty" type="number" min="0" step="any">')) +
      '</div><button class="btn btn-primary" type="submit">Save</button></form>';
  }

  /* ================= team ================= */

  function viewTeam() {
    var members = state.team.slice().sort(function (a, b) { return (b.active - a.active) || a.name.localeCompare(b.name); });
    return '<div class="page-head"><h1>Team</h1><button class="btn btn-primary" data-action="member-form">+ Add member</button></div>' +
      (members.length ? '<div class="grid grid-2">' + members.map(function (m) {
        var mine = state.jobs.filter(function (j) { return j.assignedTo.indexOf(m.id) >= 0; });
        var open = mine.filter(function (j) { return ['assigned', 'issued'].indexOf(j.status) >= 0; });
        var done = mine.filter(function (j) { return j.workDoneAt && j.status !== 'cancelled'; });
        var rated = done.filter(function (j) { return j.feedback; });
        var avg = rated.length ? rated.reduce(function (s, j) { return s + j.feedback.rating; }, 0) / rated.length : 0;
        return '<div class="card"' + (m.active ? '' : ' style="opacity:.6"') + '><div class="page-head" style="margin:0">' +
          '<div><h2 style="margin:0">' + esc(m.name) + (m.active ? '' : ' <span class="badge s-cancelled">inactive</span>') + '</h2>' +
          '<div class="muted small">' + esc(m.role) + (m.phone ? ' · <a href="tel:' + esc(m.phone) + '">' + esc(m.phone) + '</a>' : '') + '</div></div>' +
          '<button class="btn btn-sm" data-action="member-form" data-id="' + m.id + '">Edit</button></div>' +
          '<div class="tiles" style="margin:12px 0 0;grid-template-columns:repeat(3,1fr)">' +
            '<div class="tile"><div class="label">Open jobs</div><div class="value">' + open.length + '</div></div>' +
            '<div class="tile"><div class="label">Completed</div><div class="value">' + done.length + '</div></div>' +
            '<div class="tile"><div class="label">Rating</div><div class="value">' + (rated.length ? avg.toFixed(1) + '★' : '—') + '</div></div></div>' +
          (open.length ? '<div class="small" style="margin-top:10px">' + open.map(function (j) {
            return '<a href="#/jobs/' + j.id + '">' + esc(j.number) + '</a> ' + esc(j.customer.name);
          }).join(' · ') + '</div>' : '') + '</div>';
      }).join('') + '</div>' : '<div class="card empty">No team members yet. Add your technicians and helpers.</div>');
  }

  function memberFormHtml(m) {
    m = m || { active: true };
    return '<form data-form="member"' + (m.id ? ' data-id="' + m.id + '"' : '') + '><h2>' + (m.id ? 'Edit member' : 'Add team member') + '</h2>' +
      field('Name *', '<input name="name" required value="' + esc(m.name) + '">') +
      '<div class="form-grid">' + field('Phone', '<input name="phone" type="tel" value="' + esc(m.phone) + '">') +
      field('Role', '<input name="role" list="roles" value="' + esc(m.role || 'Technician') + '"><datalist id="roles"><option value="Senior Technician"><option value="Technician"><option value="Helper"><option value="Supervisor"></datalist>') + '</div>' +
      (m.id ? '<label class="check"><input type="checkbox" name="active"' + (m.active ? ' checked' : '') + '> Active (can be assigned to jobs)</label>' : '') +
      '<button class="btn btn-primary" type="submit">Save</button></form>';
  }

  /* ================= reports ================= */

  function viewReports() {
    var from = route.query.from !== undefined ? route.query.from : monthStart();
    var to = route.query.to !== undefined ? route.query.to : S.today();
    var r = S.report(state, from, to);
    function rows(obj, fmt) {
      var keys = Object.keys(obj);
      return keys.length ? keys.map(function (k) { return '<tr><td>' + esc(k) + '</td><td class="right">' + fmt(obj[k]) + '</td></tr>'; }).join('') :
        '<tr><td colspan="2" class="muted">No data</td></tr>';
    }
    var mats = Object.keys(r.materialsUsed).sort(function (a, b) { return r.materialsUsed[b].amount - r.materialsUsed[a].amount; });
    var members = Object.keys(r.byMember);
    return '<div class="page-head"><h1>Reports</h1><button class="btn" data-action="export-csv">Export jobs (CSV)</button></div>' +
      '<form class="card btn-row" data-form="report-range">' +
        '<div><label>From</label><input type="date" name="from" value="' + esc(from) + '"></div>' +
        '<div><label>To</label><input type="date" name="to" value="' + esc(to) + '"></div>' +
        '<div style="align-self:flex-end" class="btn-row"><button class="btn btn-primary" type="submit">Apply</button>' +
        '<a class="btn" href="#/reports?from=&to=">All time</a></div></form>' +
      '<div class="tiles">' +
        tile('Enquiries', r.enquiries, '', '#/jobs?status=all') +
        tile('Jobs completed', r.completed, '', '#/jobs?status=completed') +
        tile('Billed', money(r.billed), '', '#/reports') +
        tile('Collected', money(r.collected), 'ok', '#/reports') +
        tile('Material cost', money(r.materialCost), '', '#/reports') +
        tile('Gross margin', money(r.billed - r.materialCost), '', '#/reports') +
        tile('Outstanding (all)', money(r.outstanding), r.outstanding ? 'danger' : '', '#/jobs?status=dues') +
        tile('Avg rating', r.ratings.length ? r.avgRating.toFixed(1) + ' ★ (' + r.ratings.length + ')' : '—', '', '#/reports') +
        tile('Cancelled', r.cancelled, '', '#/jobs?status=cancelled') +
      '</div><div class="grid grid-2">' +
        '<div class="card"><h2>Team performance</h2><table><thead><tr><th>Member</th><th class="right">Jobs</th><th class="right">Avg rating</th></tr></thead><tbody>' +
          (members.length ? members.map(function (n) {
            var b = r.byMember[n];
            var avg = b.ratings.length ? (b.ratings.reduce(function (a, c) { return a + c; }, 0) / b.ratings.length).toFixed(1) + ' ★' : '—';
            return '<tr><td>' + esc(n) + '</td><td class="right">' + b.jobs + '</td><td class="right">' + avg + '</td></tr>';
          }).join('') : '<tr><td colspan="3" class="muted">No data</td></tr>') + '</tbody></table></div>' +
        '<div class="card"><h2>Enquiries by type</h2><table><tbody>' + rows(r.byType, function (v) { return v; }) + '</tbody></table>' +
          '<h3>Collections by mode</h3><table><tbody>' + rows(r.byMode, money) + '</tbody></table></div>' +
        '<div class="card"><h2>Material used</h2><table><thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Billed</th></tr></thead><tbody>' +
          (mats.length ? mats.map(function (k) {
            var m = r.materialsUsed[k];
            return '<tr><td>' + esc(k) + '</td><td class="right nowrap">' + m.qty + ' ' + esc(m.unit) + '</td><td class="right">' + money(m.amount) + '</td></tr>';
          }).join('') : '<tr><td colspan="3" class="muted">No data</td></tr>') + '</tbody></table></div>' +
        '<div class="card"><h2>Material shortfalls</h2><p class="muted small">Material not returned after jobs (lost / damaged).</p>' + shortfallTable() + '</div>' +
      '</div>';
  }

  function shortfallTable() {
    var rows = [];
    state.jobs.forEach(function (j) {
      Object.keys(j.shortfall || {}).forEach(function (id) {
        if (j.shortfall[id] > 0) {
          var it = S.find(state.items, id);
          rows.push('<tr><td><a href="#/jobs/' + j.id + '">' + esc(j.number) + '</a></td><td>' + esc(it ? it.name : '?') + '</td><td class="right danger-text">' + j.shortfall[id] + ' ' + esc(it ? it.unit : '') + '</td></tr>');
        }
      });
    });
    return '<table><tbody>' + (rows.join('') || '<tr><td class="muted">None 👍</td></tr>') + '</tbody></table>';
  }

  function exportCsv() {
    var head = ['Job No', 'Created', 'Status', 'Type', 'Customer', 'Phone', 'Address', 'Team', 'Work date', 'Materials', 'Labour', 'Discount', 'Tax', 'Total', 'Paid', 'Balance', 'Rating', 'Feedback'];
    var lines = [head];
    state.jobs.forEach(function (j) {
      var inv = S.invoice(state, j);
      lines.push([j.number, j.createdAt.slice(0, 10), S.stageOf(j.status).label, j.type, j.customer.name, j.customer.phone, j.customer.address,
        memberNames(j.assignedTo), j.work ? j.work.date : '', inv.materials, inv.labour, inv.discount, inv.tax, inv.total, inv.paid,
        j.workDoneAt ? inv.balance : '', j.feedback ? j.feedback.rating : '', j.feedback ? j.feedback.comments : '']);
    });
    var csv = lines.map(function (row) {
      return row.map(function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',');
    }).join('\n');
    download('jobs-' + S.today() + '.csv', '﻿' + csv, 'text/csv');
  }

  function download(name, text, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ================= settings ================= */

  function viewSettings() {
    var s = state.settings;
    return '<div class="page-head"><h1>Settings</h1></div>' +
      '<form class="card" data-form="settings"><h2>Business details</h2><p class="muted small">Shown on invoices and WhatsApp messages.</p><div class="form-grid">' +
        field('Business name', '<input name="businessName" value="' + esc(s.businessName) + '">') +
        field('Phone', '<input name="phone" value="' + esc(s.phone) + '">') +
        field('Email', '<input name="email" value="' + esc(s.email) + '">') +
        field('GSTIN / Tax ID', '<input name="taxId" value="' + esc(s.taxId) + '">') +
      '</div>' + field('Address', '<textarea name="address" rows="2">' + esc(s.address) + '</textarea>') +
      '<h2>Billing defaults</h2><div class="form-grid">' +
        field('Currency symbol', '<input name="currency" value="' + esc(s.currency) + '">') +
        field('Default tax %', '<input name="taxRate" type="number" min="0" step="any" value="' + s.taxRate + '">') +
        field('Default labour charge', '<input name="defaultLabour" type="number" min="0" step="any" value="' + (s.defaultLabour || 0) + '">') +
        field('Phone country code (for WhatsApp)', '<input name="countryCode" value="' + esc(s.countryCode === undefined ? '91' : s.countryCode) + '">') +
      '</div><button class="btn btn-primary" type="submit">Save settings</button></form>' +
      '<div class="card"><h2>Backup &amp; data</h2>' +
        '<p class="muted small">Your data is stored only in this browser on this device. Download a backup regularly, and use “Restore” to move data to another phone or computer.</p>' +
        '<div class="btn-row"><button class="btn btn-primary" data-action="backup">⬇ Download backup</button>' +
        '<label class="btn" style="margin:0;color:var(--text)">⬆ Restore backup<input type="file" accept=".json,application/json" data-action="restore" hidden></label></div><hr>' +
        '<div class="btn-row"><button class="btn" data-action="load-sample">Load sample data</button>' +
        '<button class="btn btn-danger" data-action="reset">Erase all data</button></div></div>';
  }

  /* ================= event handling ================= */

  document.addEventListener('submit', function (e) {
    var f = e.target;
    var kind = f.getAttribute('data-form');
    if (!kind) return;
    e.preventDefault();
    var d = formData(f);
    var id = f.getAttribute('data-id');
    var ok;

    switch (kind) {
      case 'job-search': go('/jobs?status=' + (route.query.status || 'active') + '&q=' + encodeURIComponent(d.q || '')); return;
      case 'stock-search': go('/stock?q=' + encodeURIComponent(d.q || '')); return;
      case 'report-range': go('/reports?from=' + (d.from || '') + '&to=' + (d.to || '')); return;

      case 'job':
        var payload = { customer: { name: d.name, phone: d.phone, email: d.email, address: d.address },
          type: d.type, source: d.source, description: d.description, scheduledDate: d.scheduledDate, estimate: d.estimate };
        ok = commit(function () { return id ? S.updateEnquiry(state, id, payload) : S.createEnquiry(state, payload); }, id ? 'Saved' : 'Enquiry created');
        if (ok) go('/jobs/' + ok.id);
        return;

      case 'assign':
        ok = commit(function () { S.assignJob(state, id, asArray(d.members), d.scheduledDate); }, 'Team assigned');
        break;

      case 'issue':
        var lines = asArray(d.itemId).map(function (itemId, i) { return { itemId: itemId, qty: asArray(d.qty)[i] }; });
        ok = commit(function () { S.issueMaterial(state, id, lines); }, 'Material issued from stock');
        break;

      case 'workdone':
        var used = {};
        Object.keys(d).forEach(function (k) { if (k.indexOf('used_') === 0) used[k.slice(5)] = d[k]; });
        ok = commit(function () {
          S.markWorkDone(state, id, { date: d.date, notes: d.notes, used: used, labour: d.labour, discount: d.discount, taxRate: d.taxRate });
        }, 'Work marked done');
        break;

      case 'charges':
        ok = commit(function () { S.updateCharges(state, id, d); }, 'Bill updated');
        break;

      case 'payment':
        ok = commit(function () { S.addPayment(state, id, d); }, 'Payment recorded');
        break;

      case 'feedback':
        ok = commit(function () { S.saveFeedback(state, id, d); }, 'Feedback saved');
        break;

      case 'return':
        var ret = {};
        Object.keys(d).forEach(function (k) { if (k.indexOf('ret_') === 0) ret[k.slice(4)] = d[k]; });
        ok = commit(function () { S.returnMaterial(state, id, ret); }, 'Material returned — job completed');
        break;

      case 'item':
        d.id = id;
        ok = commit(function () { S.saveItem(state, d); }, 'Item saved');
        if (ok) closeModal();
        break;

      case 'stock-in':
        ok = commit(function () { S.addStock(state, id, d.qty, d.note); }, 'Stock added');
        if (ok) closeModal();
        break;

      case 'stock-adjust':
        ok = commit(function () { S.adjustStock(state, id, d.qty, d.note); }, 'Stock corrected');
        if (ok) closeModal();
        break;

      case 'member':
        d.id = id;
        if (id) d.active = d.active === 'on';
        ok = commit(function () { S.saveMember(state, d); }, 'Saved');
        if (ok) closeModal();
        break;

      case 'settings':
        ok = commit(function () {
          Object.assign(state.settings, d, { taxRate: S.num(d.taxRate), defaultLabour: S.num(d.defaultLabour) });
        }, 'Settings saved');
        break;
    }
    if (ok) render();
  });

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'INPUT') return;
    var action = el.getAttribute('data-action');
    var id = el.getAttribute('data-id');

    switch (action) {
      case 'add-row':
        el.closest('form').querySelector('.issue-rows').insertAdjacentHTML('beforeend', issueRow());
        return;
      case 'remove-row':
        var rows = el.closest('.issue-rows');
        if (rows.children.length > 1) el.closest('.issue-row').remove();
        else el.closest('.issue-row').querySelectorAll('input, select').forEach(function (i) { i.value = ''; });
        return;
      case 'skip-material':
        if (commit(function () { S.skipMaterial(state, id); }, 'Marked as no material needed')) render();
        return;
      case 'complete-payment':
        if (commit(function () { S.completePaymentStage(state, id); }, 'Payment & feedback done')) render();
        return;
      case 'close-job':
        if (confirm('Close this job?')) if (commit(function () { S.closeJob(state, id); }, 'Job closed')) render();
        return;
      case 'remove-payment':
        if (confirm('Remove this payment entry?')) if (commit(function () { S.removePayment(state, id, el.getAttribute('data-pid')); }, 'Payment removed')) render();
        return;
      case 'cancel-job':
        var reason = prompt('Reason for cancelling? (any issued material goes back to stock)');
        if (reason !== null) if (commit(function () { S.cancelJob(state, id, reason); }, 'Job cancelled')) render();
        return;
      case 'delete-job':
        if (confirm('Delete this job permanently?')) if (commit(function () { S.deleteJob(state, id); }, 'Deleted')) go('/jobs');
        return;
      case 'print':
        window.print();
        return;
      case 'item-form':
        openModal(itemFormHtml(id ? S.find(state.items, id) : null));
        return;
      case 'member-form':
        openModal(memberFormHtml(id ? S.find(state.team, id) : null));
        return;
      case 'stock-in':
        var it = S.find(state.items, id);
        openModal('<form data-form="stock-in" data-id="' + id + '"><h2>Add stock · ' + esc(it.name) + '</h2>' +
          '<p class="muted">Currently ' + it.qty + ' ' + esc(it.unit) + '</p>' +
          field('Quantity received (' + esc(it.unit) + ')', '<input name="qty" type="number" min="0" step="any" required>') +
          field('Note (supplier / bill no.)', '<input name="note">') +
          '<button class="btn btn-primary" type="submit">Add to stock</button></form>');
        return;
      case 'stock-adjust':
        var it2 = S.find(state.items, id);
        openModal('<form data-form="stock-adjust" data-id="' + id + '"><h2>Correct count · ' + esc(it2.name) + '</h2>' +
          '<p class="muted">Use after a physical count. System shows ' + it2.qty + ' ' + esc(it2.unit) + '.</p>' +
          field('Actual quantity on shelf', '<input name="qty" type="number" min="0" step="any" required value="' + it2.qty + '">') +
          field('Reason', '<input name="note" placeholder="e.g. damaged, physical count">') +
          '<button class="btn btn-primary" type="submit">Save</button></form>');
        return;
      case 'export-csv':
        exportCsv();
        return;
      case 'backup':
        download('cctv-backup-' + S.today() + '.json', JSON.stringify(state, null, 2), 'application/json');
        return;
      case 'load-sample':
        if (state.jobs.length && !confirm('This replaces ALL current data with sample data. Continue?')) return;
        state = S.sampleState();
        save();
        toast('Sample data loaded');
        go('/dashboard');
        return;
      case 'reset':
        if (confirm('Erase ALL jobs, stock and team data? Download a backup first if unsure.') && confirm('Really erase everything?')) {
          state = S.createState();
          save();
          toast('All data erased');
          go('/dashboard');
        }
        return;
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target.getAttribute('data-action') !== 'restore') return;
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.jobs) || !Array.isArray(data.items)) throw new Error('Not a valid backup file');
        if (!confirm('Replace current data with this backup (' + data.jobs.length + ' jobs, ' + data.items.length + ' items)?')) return;
        var base = S.createState();
        data.settings = Object.assign(base.settings, data.settings || {});
        state = Object.assign(base, data);
        save();
        toast('Backup restored');
        go('/dashboard');
      } catch (err) { toast(err.message, true); }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  /* ================= start ================= */

  render();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* offline support is optional */ });
  }
})();
