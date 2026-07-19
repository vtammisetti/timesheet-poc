const cds = require('@sap/cds');
const axios = require('axios');

const S4_BASE = 'https://my432407-api.s4hana.cloud.sap:443/sap/opu/odata/sap/API_MANAGE_WORKFORCE_TIMESHEET';

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
      const creds = cds.env.requires['API_MANAGE_WORKFORCE_TIMESHEET'].credentials;
      const auth = { username: creds.username, password: creds.password };

      const tokenResp = await axios.get(`${S4_BASE}/TimeSheetEntryCollection`, {
        auth,
        headers: { 'x-csrf-token': 'fetch' }
      });

      const csrfToken = tokenResp.headers['x-csrf-token'];
      const cookies   = tokenResp.headers['set-cookie'];

      if (!csrfToken) {
        return `ERROR: No CSRF token returned. Headers: ${JSON.stringify(tokenResp.headers)}`;
      }

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

      const postResp = await axios.post(
        `${S4_BASE}/TimeSheetEntryCollection`,
        payload,
        {
          auth,
          headers: {
            'x-csrf-token': csrfToken,
            'Cookie': cookies ? cookies.join('; ') : '',
            'Content-Type': 'application/json'
          }
        }
      );

      return JSON.stringify(postResp.data);

    } catch (err) {
      const detail = err.response?.data || err.message;
      return `ERROR: ${JSON.stringify(detail)}`;
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

    const filtered = result.filter(r => {
      const d = r.TimeSheetDate?.slice(0, 10);
      return (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
    });

    return filtered.map(r => ({
      employeeId: r.PersonWorkAgreementExternalID,
      entryDate:  r.TimeSheetDate,
      status:     r.TimeSheetStatus,
      workCenter: r.TimeSheetDataFields?.ReceiverCostCenter,
      category:   r.TimeSheetDataFields?.TimeSheetTaskType,
      hours:      r.TimeSheetDataFields?.RecordedHours,
      remarks:    r.TimeSheetDataFields?.TimeSheetNote,
      record:     r.TimeSheetRecord
    }));

  } catch (err) {
    req.error(500, `S4 read failed: ${err.message}`);
  }
});

});