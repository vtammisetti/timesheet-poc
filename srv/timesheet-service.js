const cds = require('@sap/cds');
const axios = require('axios');

const S4_BASE = 'https://my432407-api.s4hana.cloud.sap:443/sap/opu/odata/sap/API_MANAGE_WORKFORCE_TIMESHEET';

// TimeSheetEntryCollection has no native OData PUT/DELETE (sap:updatable="false",
// sap:deletable="false") — create, update, and delete are all this same CSRF-protected
// POST, distinguished only by the TimeSheetOperation flag ('C'/'U'/'D') in the payload.
async function postToS4(payload) {
  const creds = cds.env.requires['API_MANAGE_WORKFORCE_TIMESHEET'].credentials;
  const auth = { username: creds.username, password: creds.password };

  const tokenResp = await axios.get(`${S4_BASE}/TimeSheetEntryCollection`, {
    auth,
    headers: { 'x-csrf-token': 'fetch' }
  });

  const csrfToken = tokenResp.headers['x-csrf-token'];
  const cookies   = tokenResp.headers['set-cookie'];

  if (!csrfToken) {
    throw new Error(`No CSRF token returned. Headers: ${JSON.stringify(tokenResp.headers)}`);
  }

  // S4's CSRF token is valid for 30 minutes, but the cookies are only valid for 5 minutes. If the cookies expire, S4 will return a 403 with "CSRF token validation failed" even if the token itself is still valid. So we must always send both the token and the cookies together.
  const postResp = await axios.post(`${S4_BASE}/TimeSheetEntryCollection`, payload, {
    auth,
    headers: {
      'x-csrf-token': csrfToken,
      'Cookie': cookies ? cookies.join('; ') : '',
      'Content-Type': 'application/json'
    }
  });

  return postResp.data;
}

// Business-rule validation shared by the local TimeEntries draft writes and the
// S4-bound createTimeEntry/updateTimeEntry actions, so a rule can't drift between
// the two paths. Field names match db/schema.cds TimeEntries and the action
// parameters in timesheet-service.cds (they're already aligned).
//
// bPartial is set for PATCH/UPDATE, where req.data carries ONLY the changed fields:
// the drafts client PATCHes field-by-field (Component#updateDraftEntry) and the
// edit dialog never sends employeeId/companyCode at all, so requiring every field
// on an update would reject every legitimate draft edit. On a partial write we
// validate what's actually being written and leave untouched fields alone.
function validateEntryFields(data, bPartial) {
  const errors = [];

  if (!bPartial || data.hours !== undefined) {
    const hours = Number(data.hours);
    if (isNaN(hours) || hours <= 0 || hours > 24) {
      errors.push('Hours must be greater than 0 and no more than 24.');
    }
  }

  // entryDate arrives as a 'YYYY-MM-DD' string for both cds.Date columns and Date
  // action params (the handlers below already .split('-') it). Comparing the date
  // strings directly keeps this exact regardless of server timezone — building
  // Date objects here would let a UTC-behind server accept tomorrow's date.
  if (data.entryDate) {
    const sEntryDate = String(data.entryDate).slice(0, 10);
    const sToday = new Date().toISOString().slice(0, 10);
    if (sEntryDate > sToday) {
      errors.push('Entry date cannot be in the future.');
    }
  }

  const requiredStringFields = {
    employeeId: 'Employee ID',
    companyCode: 'Company code',
    workCenter: 'Work center',
    category: 'Category'
  };
  for (const [field, label] of Object.entries(requiredStringFields)) {
    if (bPartial && data[field] === undefined) continue; // not being changed
    if (!data[field] || typeof data[field] !== 'string' || !data[field].trim()) {
      errors.push(`${label} is required.`);
    }
  }

  return errors;
}

function rejectIfInvalid(req, data, bPartial) {
  const errors = validateEntryFields(data, bPartial);
  if (errors.length > 0) {
    req.error(400, errors.join(' '));
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Normalises the date shapes that reach copyWeek: a cds.Date param and a local
// TimeEntries column are already 'YYYY-MM-DD', while S4's TimeSheetDate arrives from
// getMyTimeEntries either as an ISO-ish '2026-08-25T00:00:00' string or as OData v2's
// '/Date(1756080000000)/'. Returns null for anything it can't read as a date.
function toDateString(vDate) {
  if (!vDate) return null;
  if (vDate instanceof Date) return vDate.toISOString().slice(0, 10);
  const s = String(vDate);
  const odataMatch = s.match(/^\/Date\((-?\d+)/);
  if (odataMatch) return new Date(Number(odataMatch[1])).toISOString().slice(0, 10);
  const sDate = s.slice(0, 10);
  return DATE_RE.test(sDate) ? sDate : null;
}

function isValidDateString(sDate) {
  if (!sDate || !DATE_RE.test(sDate)) return false;
  const [y, m, d] = sDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toEpochDay(sDate) {
  const [y, m, d] = sDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

function addDays(sDate, iDays) {
  const [y, m, d] = sDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + iDays)).toISOString().slice(0, 10);
}


function entryKey(oEntry) {
  return [
    oEntry.employeeId,
    toDateString(oEntry.entryDate),
    (oEntry.workCenter || '').trim(),
    (oEntry.category || '').trim()
  ].join('|');
}

// LR/162 is S4's rejection for a record that's already Processed (status 60) — those
// are locked from further change via this API, which is expected, not a bug. Surface
// that as a plain-English message instead of the raw nested SAP error payload.
function s4ErrorMessage(err) {
  const oError = err.response?.data?.error;
  if (oError?.code === 'LR/162') {
    return 'This log has already been processed and can no longer be edited or deleted.';
  }
  return oError?.message?.value || JSON.stringify(err.response?.data || err.message);
}


// Service implementation
// Note: the S4 connection is established once at service startup, not per request, to avoid the 5-minute cookie expiration issue.
module.exports = cds.service.impl(async function () {

  const S4 = await cds.connect.to('API_MANAGE_WORKFORCE_TIMESHEET');

  // Validation runs before the write handlers on every path that creates or changes
  // an entry — local drafts and both S4-bound actions. Deletes, getMyTimeEntries and
  // testS4Connection are deliberately not hooked: they don't write entry fields.
  // Only new/changed data is checked; rows already in db/timesheet.sqlite are untouched.
  this.before(['CREATE', 'UPDATE'], 'TimeEntries', (req) => {
    rejectIfInvalid(req, req.data, req.event === 'UPDATE');
  });

  this.before('createTimeEntry', (req) => {
    rejectIfInvalid(req, req.data, false);
  });

  this.before('updateTimeEntry', (req) => {
    rejectIfInvalid(req, req.data, false);
  });

// The S4 connection is used only for the testS4Connection handler; all other handlers use postToS4() directly.
  this.on('testS4Connection', async () => {
  try {
    const S4 = await cds.connect.to('API_MANAGE_WORKFORCE_TIMESHEET');
    const result = await S4.run(
      SELECT.from('TimeSheetEntryCollection')
        .where({ PersonWorkAgreementExternalID: 'P000023' })
        .limit(200)
    );
    // Only return entries from today's test date
    const filtered = result.filter(r => r.TimeSheetDate?.startsWith('2026-07-16'));
    return JSON.stringify(filtered);
  } catch (err) {
    return `ERROR: ${err.message}`;
  }
});

//createTimeEntry action is used to create a new time entry in S4 system.
  this.on('createTimeEntry', async (req) => {
    const {
      employeeId, companyCode, entryDate,
      workCenter, category, startTime, endTime,
      hours, remarks
    } = req.data;

    if (!employeeId || !companyCode || !entryDate || !workCenter || !category || !hours) {
      return `ERROR: Missing required field(s). Received: ${JSON.stringify(req.data)}`;
    }

    try {
      const epochMs = Date.UTC(
        ...entryDate.split('-').map((v, i) => i === 1 ? Number(v) - 1 : Number(v))
      );

      const timeTag = (startTime && endTime)
        ? `[TSAPP_START:${startTime}|TSAPP_END:${endTime}] `
        : '';
      const note = `${timeTag}${remarks || ''}`.trim();

      const payload = {
        PersonWorkAgreementExternalID: employeeId,
        CompanyCode: companyCode,
        TimeSheetDate: `/Date(${epochMs})/`,
        TimeSheetOperation: 'C',
        TimeSheetIsExecutedInTestRun: false,
        TimeSheetDataFields: {
          ReceiverCostCenter: workCenter,
          TimeSheetTaskType: category,
          TimeSheetTaskLevel: 'NONE',
          TimeSheetTaskComponent: 'WORK',
          RecordedHours: Number(hours).toFixed(2),
          HoursUnitOfMeasure: 'H',
          ReceiverPubSecFuncnlArea: 'YB25',
          TimeSheetNote: note
        }
      };

      const data = await postToS4(payload);
      return JSON.stringify(data);

    } catch (err) {
      const detail = err.response?.data || err.message;
      return `ERROR: ${JSON.stringify(detail)}`;
    }
  });
//update the entry in S4 system. The record parameter is the TimeSheetRecord of the time entry to be updated.
  this.on('updateTimeEntry', async (req) => {
    const {
      employeeId, companyCode, record, entryDate,
      workCenter, category, startTime, endTime,
      hours, remarks
    } = req.data;

    if (!employeeId || !companyCode || !record || !entryDate || !workCenter || !category || !hours) {
      return `ERROR: Missing required field(s). Received: ${JSON.stringify(req.data)}`;
    }

    try {
      const epochMs = Date.UTC(
        ...entryDate.split('-').map((v, i) => i === 1 ? Number(v) - 1 : Number(v))
      );

      const timeTag = (startTime && endTime)
        ? `[TSAPP_START:${startTime}|TSAPP_END:${endTime}] `
        : '';
      const note = `${timeTag}${remarks || ''}`.trim();

      const payload = {
        PersonWorkAgreementExternalID: employeeId,
        CompanyCode: companyCode,
        TimeSheetRecord: record,
        TimeSheetDate: `/Date(${epochMs})/`,
        TimeSheetOperation: 'U',
        TimeSheetIsExecutedInTestRun: false,
        TimeSheetDataFields: {
          ReceiverCostCenter: workCenter,
          TimeSheetTaskType: category,
          TimeSheetTaskLevel: 'NONE',
          TimeSheetTaskComponent: 'WORK',
          RecordedHours: Number(hours).toFixed(2),
          HoursUnitOfMeasure: 'H',
          ReceiverPubSecFuncnlArea: 'YB25',
          TimeSheetNote: note
        }
      };

      const data = await postToS4(payload);
      return JSON.stringify(data);

    } catch (err) {
      return `ERROR: ${s4ErrorMessage(err)}`;
    }
  });

//delete the entry, but create a new record in S4 system. The record parameter is the TimeSheetRecord of the time entry to be deleted.
  this.on('deleteTimeEntry', async (req) => {
    const { employeeId, companyCode, record } = req.data;

    if (!employeeId || !companyCode || !record) {
      return `ERROR: Missing required field(s). Received: ${JSON.stringify(req.data)}`;
    }

    try {
      const payload = {
        PersonWorkAgreementExternalID: employeeId,
        CompanyCode: companyCode,
        TimeSheetRecord: record,
        TimeSheetOperation: 'D',
        TimeSheetIsExecutedInTestRun: false
      };

      const data = await postToS4(payload);
      return JSON.stringify(data);

    } catch (err) {
      return `ERROR: ${s4ErrorMessage(err)}`;
    }
  });

  this.on('getMyTimeEntries', async (req) => {
  const { employeeId, fromDate, toDate } = req.data;

  if (!employeeId) {
    req.error(400, 'employeeId is required');
    return;
  }

  try {
    const S4 = await cds.connect.to('API_MANAGE_WORKFORCE_TIMESHEET');

    const result = await S4.run(
      SELECT.from('TimeSheetEntryCollection')
        .where({ PersonWorkAgreementExternalID: employeeId })
        .limit(200)
    );

    // TimeSheetEntryCollection has no real update/delete: updateTimeEntry and
    // deleteTimeEntry both create a new record linked back via
    // TimeSheetPredecessorRecord, and the original is left in the collection
    // unchanged. So a record is "live" only if nothing points back to it — anything
    // that's someone else's predecessor is a stale version and must be hidden. A
    // live record with 0 hours is itself the tombstone left behind by a delete, so
    // its whole chain is dropped too.

    // Build a set of all predecessor records, then filter out any record that is in that set.
    const supersededRecords = new Set(
      result.map(r => r.TimeSheetPredecessorRecord).filter(Boolean)
    );
    const liveRecords = result
      .filter(r => !supersededRecords.has(r.TimeSheetRecord))
      .filter(r => Number(r.TimeSheetDataFields?.RecordedHours) > 0);

    const filtered = liveRecords.filter(r => {
      const d = r.TimeSheetDate?.slice(0, 10);
      return (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
    });
// Map the filtered records to the desired output format
    return filtered.map(r => ({
      employeeId:  r.PersonWorkAgreementExternalID,
      companyCode: r.CompanyCode,
      entryDate:   r.TimeSheetDate,
      status:      r.TimeSheetStatus,
      workCenter:  r.TimeSheetDataFields?.ReceiverCostCenter,
      category:    r.TimeSheetDataFields?.TimeSheetTaskType,
      hours:       r.TimeSheetDataFields?.RecordedHours,
      remarks:     r.TimeSheetDataFields?.TimeSheetNote,
      record:      r.TimeSheetRecord
    }));
  } catch (err) {
    req.error(500, `S4 read failed: ${err.message}`);
  }
});

// copyWeek bulk-copies one week onto another. Both weeks are given explicitly by the
// caller (no hardcoded "last week"/"this week"), and every copy lands in the local
// TimeEntries as a fresh DRAFT no matter whether it came from a local draft or from a
// real S4 record — nothing here is posted to S4. Rows are processed independently, in
// the spirit of the client's removeDraftEntries/Promise.allSettled pattern: one
// duplicate or invalid row is skipped with a reason, it never aborts the batch.
  this.on('copyWeek', async (req) => {
    const { employeeId, fromWeekStart, toWeekStart } = req.data;

    if (!employeeId || typeof employeeId !== 'string' || !employeeId.trim()) {
      return req.error(400, 'employeeId is required.');
    }

    const sFromStart = toDateString(fromWeekStart);
    const sToStart   = toDateString(toWeekStart);

    if (!isValidDateString(sFromStart)) {
      return req.error(400, 'fromWeekStart is required and must be a valid date (YYYY-MM-DD).');
    }
    if (!isValidDateString(sToStart)) {
      return req.error(400, 'toWeekStart is required and must be a valid date (YYYY-MM-DD).');
    }

    const iOffsetDays = toEpochDay(sToStart) - toEpochDay(sFromStart);
    const sFromEnd = addDays(sFromStart, 6);
    const sToEnd   = addDays(sToStart, 6);

    const created = [];
    const skipped = [];

    // --- source: local drafts in the from-week ---
    const aLocalSource = await SELECT.from('TimeEntries').where({
      employeeId,
      entryDate: { between: sFromStart, and: sFromEnd }
    });

    // --- source: live S4 entries in the same range, read through getMyTimeEntries so
    // the supersession/tombstone filtering lives in exactly one place ---
    let aS4Source = [];
    try {
      aS4Source = await this.send('getMyTimeEntries', {
        employeeId,
        fromDate: sFromStart,
        toDate: sFromEnd
      }) || [];
    } catch (err) {
      skipped.push({
        entryDate: null,
        workCenter: null,
        category: null,
        reason: `S4 source entries could not be read, only local drafts were copied: ${err.message}`
      });
    }

    const aSource = [...aLocalSource, ...aS4Source];

    // --- existing target-week entries, for the duplicate check ---
    const aTargetExisting = await SELECT.from('TimeEntries').where({
      employeeId,
      entryDate: { between: sToStart, and: sToEnd }
    });
   
    const oExistingKeys = new Set(aTargetExisting.map(entryKey));

    for (const oSource of aSource) {
      const sSourceDate = toDateString(oSource.entryDate);
      if (!sSourceDate) {
        skipped.push({
          entryDate: null,
          workCenter: oSource.workCenter,
          category: oSource.category,
          reason: 'Source entry has no readable entry date.'
        });
        continue;
      }

      const oNew = {
        ID:          cds.utils.uuid(),
        employeeId:  oSource.employeeId,
        companyCode: oSource.companyCode,
        entryDate:   addDays(sSourceDate, iOffsetDays),
        workCenter:  oSource.workCenter,
        category:    oSource.category,
        hours:       oSource.hours !== undefined && oSource.hours !== null ? Number(oSource.hours) : oSource.hours,
        remarks:     oSource.remarks,
        status:      'DRAFT'   // always a draft, whatever the source's own status was
      };

      if (oExistingKeys.has(entryKey(oNew))) {
        skipped.push({
          entryDate:  oNew.entryDate,
          workCenter: oNew.workCenter,
          category:   oNew.category,
          reason:     'Duplicate entry already exists for this date/work center/category.'
        });
        continue;
      }

      const aErrors = validateEntryFields(oNew, false);
      if (aErrors.length > 0) {
        skipped.push({
          entryDate:  oNew.entryDate,
          workCenter: oNew.workCenter,
          category:   oNew.category,
          reason:     aErrors.join(' ')
        });
        continue;
      }

      try {
        await INSERT.into('TimeEntries').entries(oNew);
        created.push(oNew);
      } catch (err) {
        skipped.push({
          entryDate:  oNew.entryDate,
          workCenter: oNew.workCenter,
          category:   oNew.category,
          reason:     `Could not be created: ${err.message}`
        });
      }
    }

    return { created, skipped };
  });

});