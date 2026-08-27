namespace poc.timesheet;

entity Employees {
  key ID       : String(10);
  name         : String(100);
  role         : String(60);
}

entity TimeEntries {
  key ID       : UUID;
  employeeId   : String(10);
  companyCode  : String(10);
  entryDate    : Date;
  workCenter   : String(20);
  category     : String(20);
  hours        : Decimal(5,2);
  remarks      : String(255);

  // Approval lifecycle: DRAFT -> SUBMITTED -> APPROVED, or SUBMITTED -> REJECTED
  // (and back to DRAFT once the employee edits a rejected entry). Valid values are
  // DRAFT, SUBMITTED, APPROVED and REJECTED. Nothing reaches S4 until APPROVED.
  status       : String(10) default 'DRAFT';

  // Set only while status is REJECTED — the manager's reason, null/empty otherwise.
  rejectionReason : String(255);

  // Set only once status is APPROVED: the real TimeSheetRecord returned by S4 for the
  // write that approval triggered, null/empty otherwise. String(12) matches
  // TimeSheetRecord's MaxLength in srv/external/API_MANAGE_WORKFORCE_TIMESHEET
  // (Edm.String, MaxLength="12").
  s4Record        : String(12);
}