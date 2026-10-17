let dbConfigured = false;
jest.mock('../db/client', () => ({ isDatabaseConfigured: () => dbConfigured }));
jest.mock('../db/repository', () => ({
  upsertLead: jest.fn().mockResolvedValue(undefined),
  listAllLeads: jest.fn().mockResolvedValue([]),
  upsertMember: jest.fn().mockResolvedValue(undefined),
  listAllMembers: jest.fn().mockResolvedValue([])
}));

import { crmStore } from '../services/crmStore';

const email = () => `dup-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

// A real measured eval run showed the model sometimes re-issues create_or_update_lead or
// qualify_lead a moment later with no new information. These prove the resulting no-op
// doesn't write another "Updated"/"BANT Qualified" note.
describe('CRMStore: redundant same-lead updates are no-ops', () => {
  it('create_or_update_lead: an identical repeat call seconds later adds no note', () => {
    const e = email();
    const first = crmStore.createOrUpdateLead({ fullName: 'Sam Rivera', email: e, source: 'after_hours_inbound' });
    const notesAfterFirst = first.notes.length;

    const second = crmStore.createOrUpdateLead({ fullName: 'Sam Rivera', email: e, source: 'after_hours_inbound' });
    expect(second.notes.length).toBe(notesAfterFirst);
    expect(second.id).toBe(first.id);
  });

  it('create_or_update_lead: a genuine change still records, even moments later', () => {
    const e = email();
    const first = crmStore.createOrUpdateLead({ fullName: 'Sam Rivera', email: e, source: 'after_hours_inbound' });
    const notesBeforeSecondCall = first.notes.length; // snapshot: `first` is the same object `second` mutates in place
    const second = crmStore.createOrUpdateLead({ fullName: 'Sam Rivera', email: e, phone: '+1 555 010 9999', source: 'after_hours_inbound' });
    expect(second.notes.length).toBe(notesBeforeSecondCall + 1);
    expect(second.phone).toBe('+1 555 010 9999');
  });

  it('qualify_lead: an identical repeat call seconds later adds no note and keeps the same score', () => {
    const e = email();
    crmStore.createOrUpdateLead({ fullName: 'Sam Rivera', email: e, source: 'after_hours_inbound' });
    const args = { email: e, budgetRange: '1k_to_5k', coreNeed: 'after-hours qualification', authority: 'decision_maker', timelineWeeks: 4 };
    const first = crmStore.qualifyLead(args);
    const notesAfterFirst = first.lead!.notes.length;

    const second = crmStore.qualifyLead({ ...args, coreNeed: 'slightly reworded but same underlying need' });
    expect(second.lead!.notes.length).toBe(notesAfterFirst);
    expect(second.calculatedScore).toBe(first.calculatedScore);
  });

  it('qualify_lead: a real change in budget still records', () => {
    const e = email();
    crmStore.createOrUpdateLead({ fullName: 'Sam Rivera', email: e, source: 'after_hours_inbound' });
    const first = crmStore.qualifyLead({ email: e, budgetRange: '1k_to_5k', coreNeed: 'x', authority: 'decision_maker', timelineWeeks: 4 });
    const notesBeforeSecondCall = first.lead!.notes.length; // snapshot: same lead object, mutated in place
    const firstScore = first.calculatedScore;
    const second = crmStore.qualifyLead({ email: e, budgetRange: 'above_15k', coreNeed: 'x', authority: 'decision_maker', timelineWeeks: 4 });
    expect(second.lead!.notes.length).toBe(notesBeforeSecondCall + 1);
    expect(second.calculatedScore).toBeGreaterThan(firstScore);
  });
});
