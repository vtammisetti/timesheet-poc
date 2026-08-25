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

}