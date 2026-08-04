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

module.exports = cds.service.impl(async function () {

  const S4 = await cds.connect.to('API_MANAGE_WORKFORCE_TIMESHEET');

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

});