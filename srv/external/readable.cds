@cds.external : true
@m.IsDefaultEntityContainer : 'true'
@sap.supported.formats : 'atom json xlsx'
service API_MANAGE_WORKFORCE_TIMESHEET {
  @cds.external : true
  @cds.persistence.skip : true
  @sap.label : 'TimeSheetEntryCollection'
  @sap.updatable : 'false'
  @sap.deletable : 'false'
  @sap.content.version : '1'
  entity TimeSheetEntryCollection {
    @sap.unicode : 'false'
    @sap.label : 'Person Work Agreement External ID'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    key PersonWorkAgreementExternalID : String(20) not null;
    @sap.unicode : 'false'
    @sap.label : 'Company Code'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    key CompanyCode : String(4) not null;
    @sap.unicode : 'false'
    @sap.label : 'Time Sheet Record'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    key TimeSheetRecord : String(12) not null;
    TimeSheetDataFields : TimeSheetDataFields not null;
    @sap.unicode : 'false'
    @sap.label : 'Person Work Agreement'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    PersonWorkAgreement : String(8);
    @odata.Type : 'Edm.DateTime'
    @sap.unicode : 'false'
    @sap.label : 'Time Sheet Date'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    TimeSheetDate : DateTime;
    @sap.unicode : 'false'
    @sap.label : 'Time sheet Is Released On Save'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    TimeSheetIsReleasedOnSave : Boolean;
    @sap.unicode : 'false'
    @sap.label : 'Time Sheet Predecessor Record'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    TimeSheetPredecessorRecord : String(12);
    @sap.unicode : 'false'
    @sap.label : 'Time Sheet Status'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    TimeSheetStatus : String(2);
    @sap.unicode : 'false'
    @sap.label : 'Times Sheet Is Executed In Test Run'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    TimeSheetIsExecutedInTestRun : Boolean;
    @sap.unicode : 'false'
    @sap.label : 'Time Sheet Operation'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    TimeSheetOperation : String(1);
  };

  @cds.external : true
  type TimeSheetDataFields {
    @sap.label : 'Controlling Area'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    ControllingArea : String(4);
    @sap.label : 'Sender Cost Center'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    SenderCostCenter : String(10);
    @sap.label : 'Receiver Cost Center'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    ReceiverCostCenter : String(10);
    @sap.label : 'Internal Order'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    InternalOrder : String(12);
    @sap.label : 'Activity Type'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    ActivityType : String(6);
    @sap.label : 'WBS Element'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    WBSElement : String(24);
    @sap.label : 'Work Item'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    WorkItem : String(10);
    @sap.label : 'Billing Control Category'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    BillingControlCategory : String(8);
    @sap.label : 'Purchase Order'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    PurchaseOrder : String(10);
    @sap.label : 'Purchase Order Item'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    PurchaseOrderItem : String(5);
    @sap.label : 'Time Sheet Task Type'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    TimeSheetTaskType : String(4);
    @sap.label : 'Time Sheet Task Level'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    TimeSheetTaskLevel : String(8);
    @sap.label : 'Time Sheet Task Component'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    TimeSheetTaskComponent : String(8);
    @sap.label : 'Time Sheet Note'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    TimeSheetNote : String;
    @sap.label : 'Recorded Hours'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    RecordedHours : Decimal(4, 2);
    @sap.label : 'Recorded Quantity'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    RecordedQuantity : Decimal(15, 3);
    @sap.label : 'Hours Unit Of Measure'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    @sap.semantics : 'unit-of-measure'
    HoursUnitOfMeasure : String(3);
    @sap.label : 'Rejection Reason'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    RejectionReason : String(4);
    @sap.label : 'Time Sheet Work Location Code'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    TimeSheetWrkLocCode : String(4);
    @sap.label : 'Time Sheet Overtime Category'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    TimeSheetOvertimeCategory : String(4);
    @sap.label : 'Sender Fund'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    SenderPubSecFund : String(10);
    @sap.label : 'Sender Functional Area'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    SendingPubSecFunctionalArea : String(16);
    @sap.label : 'Sender Grant'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    SenderPubSecGrant : String(20);
    @sap.label : 'Sender Budget Period'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    SenderPubSecBudgetPeriod : String(10);
    @sap.label : 'Receiver Fund'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    ReceiverPubSecFund : String(10);
    @sap.label : 'Receivier Functiona Area'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    ReceiverPubSecFuncnlArea : String(16);
    @sap.label : 'Receiver Grant'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    ReceiverPubSecGrant : String(20);
    @sap.label : 'Receiver Budget Period'
    @sap.updatable : 'false'
    @sap.sortable : 'false'
    @sap.filterable : 'false'
    ReceiverPubSecBudgetPeriod : String(10);
  };
};


