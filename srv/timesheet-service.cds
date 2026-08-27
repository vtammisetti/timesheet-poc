using poc.timesheet as db from '../db/schema';
using { API_MANAGE_WORKFORCE_TIMESHEET as external } from './external/API_MANAGE_WORKFORCE_TIMESHEET';

//local entities for projections
service TimesheetService {
  entity Employees   as projection on db.Employees;
  entity TimeEntries as projection on db.TimeEntries;

//external entities for projections - renaming the fields to match the local entities(friendly to use in the UI)
  @readonly
  entity S4TimeEntries as projection on external.TimeSheetEntryCollection {
    key PersonWorkAgreementExternalID as employeeId,
    key CompanyCode,
    key TimeSheetRecord,
        TimeSheetDate                              as entryDate,
        TimeSheetStatus                             as status,
        TimeSheetDataFields.ReceiverCostCenter      as workCenter,
        TimeSheetDataFields.TimeSheetTaskType       as category,
        TimeSheetDataFields.RecordedHours           as hours,
        TimeSheetDataFields.TimeSheetNote           as remarks
  };

//actions and functions
//testS4Connection function is used to test the connection to the S4 system.
  function testS4Connection() returns String;

//createTimeEntry action is used to create a new time entry in S4 system.
  action createTimeEntry(
  employeeId   : String,
  companyCode  : String,
  entryDate    : Date,
  workCenter   : String,
  category     : String,
  startTime    : String,   // e.g. "08:00 AM"
  endTime      : String,   // e.g. "11:30 AM"
  hours        : Decimal(5,2),
  remarks      : String
) returns String;

//updateTimeEntry action is used to update the time entry in S4 system. The record parameter is the TimeSheetRecord of the time entry to be updated.
action updateTimeEntry(
  employeeId   : String,
  companyCode  : String,
  record       : String,
  entryDate    : Date,
  workCenter   : String,
  category     : String,
  startTime    : String,   // e.g. "08:00 AM"
  endTime      : String,   // e.g. "11:30 AM"
  hours        : Decimal(5,2),
  remarks      : String
) returns String;

//deleteTimeEntry action is used to delete the time entry in S4 system. The record parameter is the TimeSheetRecord of the time entry to be deleted.
action deleteTimeEntry(
  employeeId   : String,
  companyCode  : String,
  record       : String
) returns String;

//getMyTimeEntries function is used to get the time entries of the logged-in user from S4 system. The function takes employeeId, fromDate and toDate as parameters and returns an array of time entries.
function getMyTimeEntries(
  employeeId : String,
  fromDate   : Date,
  toDate     : Date
) returns array of {
  employeeId  : String;
  companyCode : String;
  entryDate   : String;
  status      : String;
  workCenter  : String;
  category    : String;
  hours       : String;
  remarks     : String;
  record      : String;
};

//This CDS version accepts an entity as a whole return type but not as the type of a
//nested element, so the created rows travel as a named structured type. Its elements
//are declared as references into db.TimeEntries rather than retyped by hand, so the
//shape follows the schema if a column there ever changes.
type CopiedTimeEntry {
  ID          : db.TimeEntries:ID;
  employeeId  : db.TimeEntries:employeeId;
  companyCode : db.TimeEntries:companyCode;
  entryDate   : db.TimeEntries:entryDate;
  workCenter  : db.TimeEntries:workCenter;
  category    : db.TimeEntries:category;
  hours       : db.TimeEntries:hours;
  remarks     : db.TimeEntries:remarks;
  status      : db.TimeEntries:status;
}

//copyWeek action bulk-copies one week's entries onto another week. Source is both the
//local TimeEntries drafts and the live S4 entries (via the same supersession-filtered
//read getMyTimeEntries uses) for fromWeekStart..fromWeekStart+6. Every copy is created
//as a NEW LOCAL DRAFT — this action never posts anything to S4; the user reviews and
//submits the copies later like any other draft. Rows that fail validation or would
//duplicate an existing entry are skipped individually and reported, not failed as a batch.
action copyWeek(
  employeeId    : String,
  fromWeekStart : Date,
  toWeekStart   : Date
) returns {
  created : array of CopiedTimeEntry;
  skipped : array of {
    entryDate  : Date;
    workCenter : String;
    category   : String;
    reason     : String;
  };
};

//----------------------------------------------------------------------------------
// Local approval workflow. S/4's API_MANAGE_WORKFORCE_TIMESHEET has no approval
// mechanism of its own (it only exposes create/update/delete via TimeSheetOperation),
// so the whole DRAFT -> SUBMITTED -> APPROVED/REJECTED lifecycle lives here, on the
// local TimeEntries. The S4 write is no longer done when the employee submits — it
// happens once, inside approveEntry, and only if the manager approves.
//----------------------------------------------------------------------------------

//submitEntry hands a DRAFT entry to the manager: it validates the row and flips it to
//SUBMITTED. Deliberately does NOT touch S4.
action submitEntry(ID : UUID) returns TimeEntries;

//approveEntry is the only path that writes an entry to S4. On a successful write the
//local row is kept as audit history with status APPROVED and the returned
//TimeSheetRecord in s4Record; on failure the row stays SUBMITTED and the S4 error is raised.
action approveEntry(ID : UUID) returns TimeEntries;

//rejectEntry sends a SUBMITTED entry back with a mandatory reason. Nothing goes to S4.
action rejectEntry(ID : UUID, reason : String) returns TimeEntries;

//getEntriesForApproval lists everything awaiting approval. Intentionally unfiltered by
//manager for now — there is no role/manager mapping in this POC yet.
function getEntriesForApproval() returns array of TimeEntries;

}