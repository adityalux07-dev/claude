// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const S = require('../js/store.js');

function setup() {
  const s = S.createState();
  s.settings.taxRate = 0;
  const tech = S.saveMember(s, { name: 'Ravi' });
  const cam = S.saveItem(s, { name: 'Camera', unit: 'pcs', cost: 1000, price: 1500, reorder: 2, openingQty: 10 });
  const cable = S.saveItem(s, { name: 'Cable', unit: 'm', cost: 10, price: 20, openingQty: 300 });
  return { s, tech, cam, cable };
}

test('full workflow: enquiry → assign → issue → work done → pay+feedback → close → return', () => {
  const { s, tech, cam, cable } = setup();
  const job = S.createEnquiry(s, { customer: { name: 'Shop', phone: '123' } });
  assert.equal(job.number, 'JOB-0001');
  assert.equal(job.status, 'enquiry');

  S.assignJob(s, job.id, [tech.id]);
  assert.equal(job.status, 'assigned');

  S.issueMaterial(s, job.id, [{ itemId: cam.id, qty: 4 }, { itemId: cable.id, qty: 100 }]);
  assert.equal(job.status, 'issued');
  assert.equal(cam.qty, 6);
  assert.equal(cable.qty, 200);

  S.markWorkDone(s, job.id, { used: { [cam.id]: 3, [cable.id]: 80 }, labour: 1000, discount: 100 });
  assert.equal(job.status, 'workdone');
  const inv = S.invoice(s, job);
  assert.equal(inv.materials, 3 * 1500 + 80 * 20);
  assert.equal(inv.total, inv.materials + 1000 - 100);

  assert.throws(() => S.completePaymentStage(s, job.id), /feedback/);
  S.saveFeedback(s, job.id, { rating: 4, comments: 'good' });
  assert.throws(() => S.completePaymentStage(s, job.id), /payment/);
  S.addPayment(s, job.id, { amount: 5000, mode: 'UPI' });
  S.completePaymentStage(s, job.id);
  assert.equal(job.status, 'paid');
  assert.equal(S.invoice(s, job).balance, inv.total - 5000);

  S.closeJob(s, job.id);
  assert.equal(job.status, 'closed');

  // 1 camera and 20 m cable unused; technician brings back camera but only 15 m cable
  S.returnMaterial(s, job.id, { [cam.id]: 1, [cable.id]: 15 });
  assert.equal(job.status, 'completed');
  assert.equal(cam.qty, 7);
  assert.equal(cable.qty, 215);
  assert.equal(job.shortfall[cable.id], 5);
  assert.ok(S.materialSummary(s, job).every(r => r.toReturn === 0));
});

test('cannot skip steps', () => {
  const { s, cam } = setup();
  const job = S.createEnquiry(s, { customer: { name: 'A', phone: '1' } });
  assert.throws(() => S.issueMaterial(s, job.id, [{ itemId: cam.id, qty: 1 }]), /Cannot issue material/);
  assert.throws(() => S.closeJob(s, job.id), /Cannot close/);
  assert.throws(() => S.returnMaterial(s, job.id, {}), /Cannot return/);
});

test('cannot issue more than available stock and nothing changes on failure', () => {
  const { s, tech, cam, cable } = setup();
  const job = S.createEnquiry(s, { customer: { name: 'A', phone: '1' } });
  S.assignJob(s, job.id, [tech.id]);
  assert.throws(() => S.issueMaterial(s, job.id, [{ itemId: cable.id, qty: 5 }, { itemId: cam.id, qty: 11 }]), /Not enough/);
  assert.equal(cam.qty, 10);
  assert.equal(cable.qty, 300);
  assert.equal(job.issues.length, 0);
});

test('used cannot exceed issued; return cannot exceed unused', () => {
  const { s, tech, cam } = setup();
  const job = S.createEnquiry(s, { customer: { name: 'A', phone: '1' } });
  S.assignJob(s, job.id, [tech.id]);
  S.issueMaterial(s, job.id, [{ itemId: cam.id, qty: 2 }]);
  assert.throws(() => S.markWorkDone(s, job.id, { used: { [cam.id]: 3 } }), /more than issued/);
  S.markWorkDone(s, job.id, { used: { [cam.id]: 1 } });
  S.saveFeedback(s, job.id, { rating: 5 });
  S.addPayment(s, job.id, { amount: 1500 });
  S.completePaymentStage(s, job.id);
  S.closeJob(s, job.id);
  assert.throws(() => S.returnMaterial(s, job.id, { [cam.id]: 2 }), /more than unused/);
});

test('cancel returns all issued material to stock', () => {
  const { s, tech, cam } = setup();
  const job = S.createEnquiry(s, { customer: { name: 'A', phone: '1' } });
  S.assignJob(s, job.id, [tech.id]);
  S.issueMaterial(s, job.id, [{ itemId: cam.id, qty: 3 }]);
  assert.equal(cam.qty, 7);
  S.cancelJob(s, job.id, 'client changed mind');
  assert.equal(job.status, 'cancelled');
  assert.equal(cam.qty, 10);
});

test('service job without material, zero-value bill can complete without payment', () => {
  const { s, tech } = setup();
  const job = S.createEnquiry(s, { customer: { name: 'A', phone: '1' }, type: 'AMC Visit' });
  S.assignJob(s, job.id, [tech.id]);
  S.skipMaterial(s, job.id);
  S.markWorkDone(s, job.id, { notes: 'checked all cameras' });
  S.saveFeedback(s, job.id, { rating: 5 });
  S.completePaymentStage(s, job.id);
  S.closeJob(s, job.id);
  S.returnMaterial(s, job.id, {});
  assert.equal(job.status, 'completed');
});

test('tax is applied after discount', () => {
  const { s, tech, cam } = setup();
  const job = S.createEnquiry(s, { customer: { name: 'A', phone: '1' } });
  S.assignJob(s, job.id, [tech.id]);
  S.issueMaterial(s, job.id, [{ itemId: cam.id, qty: 2 }]);
  S.markWorkDone(s, job.id, { labour: 1000, discount: 1000, taxRate: 18 });
  const inv = S.invoice(s, job);
  assert.equal(inv.taxable, 3000);
  assert.equal(inv.tax, 540);
  assert.equal(inv.total, 3540);
});

test('sample data builds and report runs', () => {
  const s = S.sampleState();
  const r = S.report(s);
  assert.ok(r.enquiries >= 4);
  assert.ok(r.collected > 0);
  assert.ok(S.lowStock(s).length >= 1);
});
