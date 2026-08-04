using poc.timesheet as db from '../db/schema';
using { API_MANAGE_WORKFORCE_TIMESHEET as external } from './external/API_MANAGE_WORKFORCE_TIMESHEET';

service TimesheetService {
  entity Employees   as projection on db.Employees;
  entity TimeEntries as projection on db.TimeEntries;

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

  function testS4Connection() returns String;
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

action deleteTimeEntry(
  employeeId   : String,
  companyCode  : String,
  record       : String
) returns String;

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