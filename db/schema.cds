namespace poc.timesheet;

entity Employees {
  key ID       : String(10);
  name         : String(100);
  role         : String(60);
}

entity TimeEntries {
  key ID       : UUID;
  employee     : Association to Employees;
  entryDate    : Date;
  workCenter   : String(20);
  category     : String(20);
  hours        : Decimal(5,2);
  status       : String(10) default 'Draft';
}