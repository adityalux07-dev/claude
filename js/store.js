/*
 * CCTV Business Manager — core business logic.
 * Pure functions that operate on a plain `state` object. No DOM access here,
 * so this file can be unit-tested in Node and reused by the UI.
 */
(function (root) {
  'use strict';

  // Job workflow, in order. Each job's `status` is the last step it completed.
  var STAGES = [
    { key: 'enquiry',   label: 'Enquiry',            next: 'Assign to team' },
    { key: 'assigned',  label: 'Assigned',           next: 'Issue material' },
    { key: 'issued',    label: 'Material Issued',    next: 'Mark work done' },
    { key: 'workdone',  label: 'Work Done',          next: 'Take payment & feedback' },
    { key: 'paid',      label: 'Payment & Feedback', next: 'Close job' },
    { key: 'closed',    label: 'Closed',             next: 'Return unused material' },
    { key: 'completed', label: 'Material Returned',  next: null }
  ];
  var CANCELLED = { key: 'cancelled', label: 'Cancelled', next: null };

  var JOB_TYPES = ['New Installation', 'Service / Repair', 'AMC Visit', 'Upgrade / Add-on', 'Inspection'];
  var PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card'];

  function stageIndex(status) {
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].key === status) return i;
    return -1;
  }
  function stageOf(status) {
    return status === 'cancelled' ? CANCELLED : STAGES[stageIndex(status)];
  }

  function now() { return new Date().toISOString(); }
  function today() { return now().slice(0, 10); }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function num(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  function fail(msg) { throw new Error(msg); }

  function createState() {
    return {
      version: 1,
      settings: {
        businessName: 'My CCTV Services',
        phone: '',
        email: '',
        address: '',
        taxId: '',
        currency: '₹',
        taxRate: 18,
        defaultLabour: 0,
        countryCode: '91'
      },
      counters: { job: 0 },
      team: [],
      items: [],
      movements: [],
      jobs: []
    };
  }

  /* ---------- lookups ---------- */

  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function getJob(state, id) { return find(state.jobs, id) || fail('Job not found'); }
  function getItem(state, id) { return find(state.items, id) || fail('Stock item not found'); }
  function getMember(state, id) { return find(state.team, id); }

  function requireStatus(job, allowed, action) {
    if (allowed.indexOf(job.status) === -1) {
      fail('Cannot ' + action + ' while job is "' + stageOf(job.status).label + '".');
    }
  }

  function log(job, text) {
    job.history.push({ date: now(), text: text });
  }

  function moveStock(state, item, qty, type, jobId, note) {
    item.qty = round2(item.qty + qty);
    state.movements.push({
      id: uid(), date: now(), itemId: item.id, qty: qty,
      type: type, jobId: jobId || null, note: note || ''
    });
  }

  /* ---------- team ---------- */

  function saveMember(state, data) {
    if (!data.name || !String(data.name).trim()) fail('Name is required');
    var m = data.id ? find(state.team, data.id) : null;
    if (!m) {
      m = { id: uid(), active: true, createdAt: now() };
      state.team.push(m);
    }
    m.name = String(data.name).trim();
    m.phone = data.phone || '';
    m.role = data.role || 'Technician';
    if (data.active !== undefined) m.active = !!data.active;
    return m;
  }

  /* ---------- stock ---------- */

  function saveItem(state, data) {
    if (!data.name || !String(data.name).trim()) fail('Item name is required');
    var it = data.id ? find(state.items, data.id) : null;
    var isNew = !it;
    if (isNew) {
      it = { id: uid(), qty: 0, createdAt: now() };
      state.items.push(it);
    }
    it.name = String(data.name).trim();
    it.sku = data.sku || '';
    it.category = data.category || 'General';
    it.unit = data.unit || 'pcs';
    it.cost = num(data.cost);
    it.price = num(data.price);
    it.reorder = num(data.reorder);
    if (isNew && num(data.openingQty) > 0) {
      moveStock(state, it, num(data.openingQty), 'purchase', null, 'Opening stock');
    }
    return it;
  }

  function addStock(state, itemId, qty, note) {
    qty = num(qty);
    if (qty <= 0) fail('Quantity must be more than zero');
    var it = getItem(state, itemId);
    moveStock(state, it, qty, 'purchase', null, note || 'Stock added');
    return it;
  }

  function adjustStock(state, itemId, newQty, note) {
    newQty = num(newQty);
    if (newQty < 0) fail('Quantity cannot be negative');
    var it = getItem(state, itemId);
    var diff = round2(newQty - it.qty);
    if (diff === 0) return it;
    moveStock(state, it, diff, 'adjust', null, note || 'Stock count correction');
    return it;
  }

  function lowStock(state) {
    return state.items.filter(function (i) { return i.reorder > 0 && i.qty <= i.reorder; });
  }

  /* ---------- jobs: workflow steps ---------- */

  // Step 1 — Enquiry
  function createEnquiry(state, data) {
    var c = data.customer || {};
    if (!c.name || !String(c.name).trim()) fail('Customer name is required');
    if (!c.phone || !String(c.phone).trim()) fail('Customer phone is required');
    state.counters.job += 1;
    var job = {
      id: uid(),
      number: 'JOB-' + String(state.counters.job).padStart(4, '0'),
      createdAt: now(),
      status: 'enquiry',
      customer: {
        name: String(c.name).trim(),
        phone: String(c.phone).trim(),
        address: c.address || '',
        email: c.email || ''
      },
      type: data.type || JOB_TYPES[0],
      source: data.source || '',
      description: data.description || '',
      scheduledDate: data.scheduledDate || '',
      estimate: num(data.estimate),
      assignedTo: [],
      issues: [],       // { itemId, qty, price, cost, date }
      used: {},         // itemId -> qty used on site
      returns: [],      // { itemId, qty, date }
      shortfall: {},    // itemId -> qty not accounted for at return
      work: null,       // { date, notes }
      charges: { labour: 0, discount: 0, taxRate: state.settings.taxRate },
      payments: [],     // { id, date, amount, mode, ref }
      feedback: null,   // { rating, comments, date }
      history: []
    };
    log(job, 'Enquiry received');
    state.jobs.push(job);
    return job;
  }

  function updateEnquiry(state, jobId, data) {
    var job = getJob(state, jobId);
    requireStatus(job, ['enquiry', 'assigned', 'issued'], 'edit enquiry details');
    var c = data.customer || {};
    if (!c.name || !String(c.name).trim()) fail('Customer name is required');
    if (!c.phone || !String(c.phone).trim()) fail('Customer phone is required');
    job.customer = { name: String(c.name).trim(), phone: String(c.phone).trim(), address: c.address || '', email: c.email || '' };
    job.type = data.type || job.type;
    job.source = data.source || '';
    job.description = data.description || '';
    job.scheduledDate = data.scheduledDate || '';
    job.estimate = num(data.estimate);
    log(job, 'Enquiry details updated');
    return job;
  }

  // Step 2 — Assign to team (can also re-assign later)
  function assignJob(state, jobId, memberIds, scheduledDate) {
    var job = getJob(state, jobId);
    requireStatus(job, ['enquiry', 'assigned', 'issued', 'workdone'], 'assign team');
    memberIds = (memberIds || []).filter(function (id) { return getMember(state, id); });
    if (!memberIds.length) fail('Select at least one team member');
    job.assignedTo = memberIds;
    if (scheduledDate) job.scheduledDate = scheduledDate;
    var names = memberIds.map(function (id) { return getMember(state, id).name; }).join(', ');
    if (job.status === 'enquiry') {
      job.status = 'assigned';
      job.assignedAt = now();
      log(job, 'Assigned to ' + names);
    } else {
      log(job, 'Re-assigned to ' + names);
    }
    return job;
  }

  // Step 3 — Issue material from stock (can issue more than once before work is done)
  function issueMaterial(state, jobId, lines) {
    var job = getJob(state, jobId);
    requireStatus(job, ['assigned', 'issued'], 'issue material');
    lines = (lines || []).map(function (l) { return { itemId: l.itemId, qty: num(l.qty) }; })
      .filter(function (l) { return l.itemId && l.qty > 0; });
    if (!lines.length) fail('Add at least one item with quantity');

    // Merge duplicates and validate stock before touching anything.
    var want = {};
    lines.forEach(function (l) { want[l.itemId] = round2((want[l.itemId] || 0) + l.qty); });
    Object.keys(want).forEach(function (id) {
      var it = getItem(state, id);
      if (want[id] > it.qty) fail('Not enough "' + it.name + '" in stock (available ' + it.qty + ' ' + it.unit + ')');
    });

    var desc = [];
    Object.keys(want).forEach(function (id) {
      var it = getItem(state, id);
      moveStock(state, it, -want[id], 'issue', job.id, 'Issued to ' + job.number);
      job.issues.push({ itemId: id, qty: want[id], price: it.price, cost: it.cost, date: now() });
      desc.push(want[id] + ' ' + it.unit + ' ' + it.name);
    });
    if (job.status === 'assigned') job.status = 'issued';
    log(job, 'Material issued: ' + desc.join(', '));
    return job;
  }

  // Step 3 (alt) — service visit that needs no material
  function skipMaterial(state, jobId) {
    var job = getJob(state, jobId);
    requireStatus(job, ['assigned'], 'skip material');
    job.status = 'issued';
    log(job, 'No material required');
    return job;
  }

  // Per-item material reconciliation for a job.
  function materialSummary(state, job) {
    var map = {};
    var order = [];
    function row(id) {
      if (!map[id]) {
        var it = find(state.items, id);
        map[id] = { itemId: id, name: it ? it.name : '(deleted item)', unit: it ? it.unit : '',
          issued: 0, value: 0, cost: 0, used: 0, returned: 0, shortfall: 0 };
        order.push(id);
      }
      return map[id];
    }
    job.issues.forEach(function (l) {
      var r = row(l.itemId);
      r.issued = round2(r.issued + l.qty);
      r.value += l.qty * l.price;
      r.cost += l.qty * l.cost;
    });
    job.returns.forEach(function (l) { var r = row(l.itemId); r.returned = round2(r.returned + l.qty); });
    return order.map(function (id) {
      var r = map[id];
      r.price = r.issued ? r.value / r.issued : 0;     // weighted price at time of issue
      r.unitCost = r.issued ? r.cost / r.issued : 0;
      r.used = num(job.used[id]);
      r.shortfall = num(job.shortfall[id]);
      r.toReturn = round2(Math.max(0, r.issued - r.used - r.returned - r.shortfall));
      return r;
    });
  }

  // Step 4 — Work done: record what was actually used on site + charges
  function markWorkDone(state, jobId, data) {
    var job = getJob(state, jobId);
    requireStatus(job, ['issued'], 'mark work done');
    data = data || {};
    var used = {};
    materialSummary(state, job).forEach(function (r) {
      var u = data.used && data.used[r.itemId] !== undefined ? num(data.used[r.itemId]) : r.issued;
      if (u < 0) fail('Used quantity cannot be negative');
      if (u > r.issued) fail('Used "' + r.name + '" (' + u + ') is more than issued (' + r.issued + ')');
      used[r.itemId] = round2(u);
    });
    job.used = used;
    job.work = { date: data.date || today(), notes: data.notes || '' };
    job.charges = {
      labour: num(data.labour),
      discount: num(data.discount),
      taxRate: data.taxRate !== undefined && data.taxRate !== '' ? num(data.taxRate) : state.settings.taxRate
    };
    job.status = 'workdone';
    job.workDoneAt = now();
    log(job, 'Work completed' + (job.work.notes ? ': ' + job.work.notes : ''));
    return job;
  }

  function updateCharges(state, jobId, data) {
    var job = getJob(state, jobId);
    requireStatus(job, ['workdone', 'paid'], 'edit charges');
    job.charges = {
      labour: num(data.labour),
      discount: num(data.discount),
      taxRate: num(data.taxRate)
    };
    log(job, 'Charges updated');
    return job;
  }

  function invoice(state, job) {
    var lines = materialSummary(state, job).filter(function (r) { return r.used > 0; }).map(function (r) {
      return { name: r.name, unit: r.unit, qty: r.used, rate: round2(r.price), amount: round2(r.used * r.price),
        cost: round2(r.used * r.unitCost) };
    });
    var materials = round2(lines.reduce(function (s, l) { return s + l.amount; }, 0));
    var materialCost = round2(lines.reduce(function (s, l) { return s + l.cost; }, 0));
    var ch = job.charges || { labour: 0, discount: 0, taxRate: 0 };
    var subtotal = round2(materials + num(ch.labour));
    var taxable = round2(Math.max(0, subtotal - num(ch.discount)));
    var tax = round2(taxable * num(ch.taxRate) / 100);
    var total = round2(taxable + tax);
    var paid = round2(job.payments.reduce(function (s, p) { return s + p.amount; }, 0));
    return {
      lines: lines, materials: materials, materialCost: materialCost,
      labour: num(ch.labour), discount: num(ch.discount), taxRate: num(ch.taxRate),
      subtotal: subtotal, taxable: taxable, tax: tax, total: total,
      paid: paid, balance: round2(total - paid)
    };
  }

  // Step 5 — Payment (can be recorded in parts, also after closing)
  function addPayment(state, jobId, data) {
    var job = getJob(state, jobId);
    requireStatus(job, ['workdone', 'paid', 'closed', 'completed'], 'record payment');
    var amount = num(data.amount);
    if (amount <= 0) fail('Payment amount must be more than zero');
    var p = { id: uid(), date: data.date || today(), amount: round2(amount), mode: data.mode || 'Cash', ref: data.ref || '' };
    job.payments.push(p);
    log(job, 'Payment received: ' + p.amount + ' via ' + p.mode);
    return p;
  }

  function removePayment(state, jobId, paymentId) {
    var job = getJob(state, jobId);
    var before = job.payments.length;
    job.payments = job.payments.filter(function (p) { return p.id !== paymentId; });
    if (job.payments.length !== before) log(job, 'Payment entry removed');
    return job;
  }

  // Step 5 — Client feedback
  function saveFeedback(state, jobId, data) {
    var job = getJob(state, jobId);
    requireStatus(job, ['workdone', 'paid', 'closed', 'completed'], 'record feedback');
    var rating = Math.round(num(data.rating));
    if (rating < 1 || rating > 5) fail('Choose a rating from 1 to 5 stars');
    job.feedback = { rating: rating, comments: data.comments || '', date: today() };
    log(job, 'Client feedback: ' + rating + '/5');
    return job;
  }

  // Step 5 → done: payment & feedback stage complete
  function completePaymentStage(state, jobId) {
    var job = getJob(state, jobId);
    requireStatus(job, ['workdone'], 'complete payment stage');
    if (!job.feedback) fail('Record client feedback first');
    if (!job.payments.length && invoice(state, job).total > 0) fail('Record at least one payment first');
    job.status = 'paid';
    log(job, 'Payment & feedback completed');
    return job;
  }

  // Step 6 — Close
  function closeJob(state, jobId) {
    var job = getJob(state, jobId);
    requireStatus(job, ['paid'], 'close job');
    job.status = 'closed';
    job.closedAt = now();
    var bal = invoice(state, job).balance;
    log(job, 'Job closed' + (bal > 0 ? ' (balance due ' + bal + ')' : ''));
    return job;
  }

  // Step 7 — Return unused material to stock.
  // `returned` maps itemId -> qty physically brought back. Anything expected but
  // not returned is recorded as shortfall (lost/damaged) so stock stays honest.
  function returnMaterial(state, jobId, returned) {
    var job = getJob(state, jobId);
    requireStatus(job, ['closed'], 'return material');
    returned = returned || {};
    var rows = materialSummary(state, job);
    rows.forEach(function (r) {
      var q = returned[r.itemId] !== undefined ? num(returned[r.itemId]) : r.toReturn;
      if (q < 0) fail('Returned quantity cannot be negative');
      if (q > r.toReturn) fail('Returned "' + r.name + '" (' + q + ') is more than unused quantity (' + r.toReturn + ')');
    });
    var desc = [];
    rows.forEach(function (r) {
      var q = returned[r.itemId] !== undefined ? round2(num(returned[r.itemId])) : r.toReturn;
      var it = find(state.items, r.itemId);
      if (q > 0 && it) {
        moveStock(state, it, q, 'return', job.id, 'Returned from ' + job.number);
        job.returns.push({ itemId: r.itemId, qty: q, date: now() });
        desc.push(q + ' ' + r.unit + ' ' + r.name);
      }
      var missing = round2(r.toReturn - q);
      if (missing > 0) job.shortfall[r.itemId] = round2(num(job.shortfall[r.itemId]) + missing);
    });
    job.status = 'completed';
    job.completedAt = now();
    log(job, desc.length ? 'Unused material returned: ' + desc.join(', ') : 'No unused material to return');
    return job;
  }

  function cancelJob(state, jobId, reason) {
    var job = getJob(state, jobId);
    requireStatus(job, ['enquiry', 'assigned', 'issued'], 'cancel');
    // Everything issued goes straight back to stock.
    var back = [];
    materialSummary(state, job).forEach(function (r) {
      var it = find(state.items, r.itemId);
      if (r.toReturn > 0 && it) {
        moveStock(state, it, r.toReturn, 'return', job.id, 'Returned (cancelled ' + job.number + ')');
        job.returns.push({ itemId: r.itemId, qty: r.toReturn, date: now() });
        back.push(r.toReturn + ' ' + r.unit + ' ' + r.name);
      }
    });
    job.status = 'cancelled';
    job.cancelledAt = now();
    log(job, 'Cancelled' + (reason ? ': ' + reason : '') + (back.length ? ' — material returned: ' + back.join(', ') : ''));
    return job;
  }

  function deleteJob(state, jobId) {
    var job = getJob(state, jobId);
    if (job.status !== 'enquiry' && job.status !== 'cancelled') fail('Only new enquiries or cancelled jobs can be deleted');
    state.jobs = state.jobs.filter(function (j) { return j.id !== jobId; });
  }

  /* ---------- reporting ---------- */

  function inRange(iso, from, to) {
    var d = (iso || '').slice(0, 10);
    return (!from || d >= from) && (!to || d <= to);
  }

  function report(state, from, to) {
    var r = {
      enquiries: 0, completed: 0, cancelled: 0, billed: 0, collected: 0, materialCost: 0,
      outstanding: 0, ratings: [], byType: {}, byMember: {}, materialsUsed: {},
      byMode: {}, stockValue: 0
    };
    state.jobs.forEach(function (job) {
      if (inRange(job.createdAt, from, to)) {
        r.enquiries++;
        r.byType[job.type] = (r.byType[job.type] || 0) + 1;
      }
      if (job.status === 'cancelled') { if (inRange(job.cancelledAt, from, to)) r.cancelled++; return; }
      var inv = invoice(state, job);
      if (job.workDoneAt && inRange(job.workDoneAt, from, to)) {
        r.completed++;
        r.billed += inv.total;
        r.materialCost += inv.materialCost;
        inv.lines.forEach(function (l) {
          var m = r.materialsUsed[l.name] || (r.materialsUsed[l.name] = { qty: 0, unit: l.unit, amount: 0 });
          m.qty = round2(m.qty + l.qty); m.amount += l.amount;
        });
        job.assignedTo.forEach(function (id) {
          var mem = getMember(state, id);
          var name = mem ? mem.name : '(removed)';
          var b = r.byMember[name] || (r.byMember[name] = { jobs: 0, ratings: [] });
          b.jobs++;
          if (job.feedback) b.ratings.push(job.feedback.rating);
        });
        if (job.feedback) r.ratings.push(job.feedback.rating);
      }
      job.payments.forEach(function (p) {
        if (inRange(p.date, from, to)) {
          r.collected += p.amount;
          r.byMode[p.mode] = (r.byMode[p.mode] || 0) + p.amount;
        }
      });
      if (job.workDoneAt && inv.balance > 0) r.outstanding += inv.balance;
    });
    state.items.forEach(function (i) { r.stockValue += i.qty * i.cost; });
    r.avgRating = r.ratings.length ? r.ratings.reduce(function (a, b) { return a + b; }, 0) / r.ratings.length : 0;
    ['billed', 'collected', 'materialCost', 'outstanding', 'stockValue'].forEach(function (k) { r[k] = round2(r[k]); });
    return r;
  }

  /* ---------- sample data ---------- */

  function sampleState() {
    var s = createState();
    s.settings.businessName = 'SecureEye CCTV Solutions';
    s.settings.phone = '98765 43210';
    s.settings.address = 'Shop 4, Main Market Road';
    var ravi = saveMember(s, { name: 'Ravi Kumar', phone: '9800000001', role: 'Senior Technician' });
    var amit = saveMember(s, { name: 'Amit Patil', phone: '9800000002', role: 'Technician' });
    saveMember(s, { name: 'Sunil More', phone: '9800000003', role: 'Helper' });
    var cam = saveItem(s, { name: '2MP Dome Camera', sku: 'CAM-D2', category: 'Cameras', unit: 'pcs', cost: 1100, price: 1600, reorder: 5, openingQty: 24 });
    var bul = saveItem(s, { name: '5MP Bullet Camera', sku: 'CAM-B5', category: 'Cameras', unit: 'pcs', cost: 1900, price: 2700, reorder: 4, openingQty: 10 });
    var dvr = saveItem(s, { name: '8 Channel DVR', sku: 'DVR-8', category: 'Recorders', unit: 'pcs', cost: 3200, price: 4500, reorder: 2, openingQty: 5 });
    var hdd = saveItem(s, { name: '1TB Surveillance HDD', sku: 'HDD-1T', category: 'Storage', unit: 'pcs', cost: 3000, price: 3900, reorder: 2, openingQty: 3 });
    var cab = saveItem(s, { name: '3+1 CCTV Cable', sku: 'CBL-31', category: 'Cable', unit: 'm', cost: 9, price: 15, reorder: 100, openingQty: 450 });
    var bnc = saveItem(s, { name: 'BNC Connector', sku: 'CON-BNC', category: 'Accessories', unit: 'pcs', cost: 6, price: 15, reorder: 50, openingQty: 200 });
    var smps = saveItem(s, { name: '4 Ch Power Supply', sku: 'PSU-4', category: 'Power', unit: 'pcs', cost: 450, price: 750, reorder: 3, openingQty: 2 });

    var j1 = createEnquiry(s, { customer: { name: 'Sharma General Store', phone: '9822000011', address: 'Station Road' },
      type: 'New Installation', source: 'Walk-in', description: '4 cameras for shop + DVR', estimate: 18000 });
    assignJob(s, j1.id, [ravi.id, amit.id]);
    issueMaterial(s, j1.id, [{ itemId: cam.id, qty: 4 }, { itemId: dvr.id, qty: 1 }, { itemId: hdd.id, qty: 1 },
      { itemId: cab.id, qty: 120 }, { itemId: bnc.id, qty: 10 }, { itemId: smps.id, qty: 1 }]);
    markWorkDone(s, j1.id, { notes: '4 dome cameras installed, mobile view configured',
      used: (function () { var u = {}; u[cab.id] = 95; u[bnc.id] = 8; return u; })(), labour: 2500, discount: 500 });
    addPayment(s, j1.id, { amount: 15000, mode: 'UPI' });
    saveFeedback(s, j1.id, { rating: 5, comments: 'Neat wiring, very professional' });
    completePaymentStage(s, j1.id);
    closeJob(s, j1.id);

    var j2 = createEnquiry(s, { customer: { name: 'Dr. Mehta Clinic', phone: '9822000022', address: 'MG Road' },
      type: 'Service / Repair', source: 'Phone', description: 'Camera 3 not showing video' });
    assignJob(s, j2.id, [amit.id]);
    issueMaterial(s, j2.id, [{ itemId: bnc.id, qty: 4 }, { itemId: smps.id, qty: 1 }]);

    var j3 = createEnquiry(s, { customer: { name: 'Patel Residency', phone: '9822000033', address: 'Sector 7' },
      type: 'New Installation', source: 'Referral', description: 'Society gate — 2 bullet cameras', estimate: 12000 });
    assignJob(s, j3.id, [ravi.id]);

    createEnquiry(s, { customer: { name: 'Joshi Residence', phone: '9822000044', address: 'Lake View Colony' },
      type: 'AMC Visit', source: 'WhatsApp', description: 'Quarterly maintenance' });
    void bul;
    return s;
  }

  var api = {
    STAGES: STAGES, CANCELLED: CANCELLED, JOB_TYPES: JOB_TYPES, PAYMENT_MODES: PAYMENT_MODES,
    stageIndex: stageIndex, stageOf: stageOf, today: today, uid: uid, num: num, round2: round2,
    createState: createState, sampleState: sampleState,
    find: find, getJob: getJob, getItem: getItem, getMember: getMember,
    saveMember: saveMember, saveItem: saveItem, addStock: addStock, adjustStock: adjustStock, lowStock: lowStock,
    createEnquiry: createEnquiry, updateEnquiry: updateEnquiry, assignJob: assignJob,
    issueMaterial: issueMaterial, skipMaterial: skipMaterial, materialSummary: materialSummary,
    markWorkDone: markWorkDone, updateCharges: updateCharges, invoice: invoice,
    addPayment: addPayment, removePayment: removePayment, saveFeedback: saveFeedback,
    completePaymentStage: completePaymentStage, closeJob: closeJob, returnMaterial: returnMaterial,
    cancelJob: cancelJob, deleteJob: deleteJob, report: report
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CCTV = api;
})(this);
