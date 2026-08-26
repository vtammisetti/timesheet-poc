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
  status       : String(10) default 'DRAFT';
}