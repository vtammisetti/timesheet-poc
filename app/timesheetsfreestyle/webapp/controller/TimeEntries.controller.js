sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/Fragment",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/ui/unified/DateRange",
  "timesheetsfreestyle/model/formatter"
], function (Controller, Fragment, JSONModel, MessageToast, DateRange, formatter) {
  "use strict";

  return Controller.extend("timesheetsfreestyle.controller.TimeEntries", {

    formatter: formatter,

    onInit: function () {
      this.getView().setModel(new JSONModel({
        entries: [],
        dailySummaries: [],
        periodMode: "1W",
        periodLabel: "",
        emptyIllustrationType: "NoActivities",
        emptyTitle: "No Records Recorded",
        emptyDescription: "You haven't logged any time for this period yet.",
        showCreateLogInEmptyState: true
      }), "myModel");
      this.getView().setModel(new JSONModel({ companyCode: [], category: [], workCenter: [] }), "facets");

      // Active facet/search selections, reapplied after every reload since summaries
      // are rebuilt (client-side) from raw entries rather than filtered on a live binding.
      this._aActiveFacetKeys = [];
      this._sActiveSearch = "";

      // Default landing view: current week, loaded automatically.
      this._periodMode = "1W";
      this._periodAnchor = new Date();
      this._loadCurrentPeriod();
    },

    // Public — called by the App shell's refresh button and after entry submission
    refresh: function () {
      if (this._periodMode === "CUSTOM") {
        this.onGoPress();
      } else {
        this._loadCurrentPeriod();
      }
    },

    // Public — called by the Object Page after an edit/delete/draft-submit, and by
    // this controller itself after any draft change. S4's timesheet write API is
    // asynchronous (a create/update/delete isn't immediately visible to a read), so
    // re-fetching from the backend right after a change would just read back the
    // pre-change state. Re-derive the list from the shared models instead — real
    // entries from "timesheetData" (already patched optimistically), plus this
    // employee's local drafts, which never touch the backend at all.
    syncFromSharedEntries: function () {
      var oUser = this.getOwnerComponent().getCurrentUser();
      var sFromDate = this._sActiveFromDate;
      var sToDate = this._sActiveToDate;
      var aRealEntries = this.getOwnerComponent().getModel("timesheetData").getProperty("/entries") || [];
      var aDrafts = this.getOwnerComponent().getDraftEntries().filter(function (d) {
        if (d.employeeId !== oUser.employeeId) {
          return false;
        }
        var sEntryDate = (d.entryDate || "").slice(0, 10);
        return (!sFromDate || sEntryDate >= sFromDate) && (!sToDate || sEntryDate <= sToDate);
      });
      var aCombined = aRealEntries.concat(aDrafts);

      this.getView().getModel("myModel").setProperty("/entries", aCombined);
      this._buildFacets(aCombined);
      this._applyFilters(this._aActiveFacetKeys, this._sActiveSearch);
    },

    onPeriodModeChange: function (oEvent) {
      var sKey = oEvent.getSource().getSelectedKey();
      this._periodMode = sKey;
      this._periodAnchor = new Date();

      if (sKey === "CUSTOM") {
        var oDateRange = this.byId("dateRangePicker");
        if (!oDateRange.getDateValue()) {
          var oFrom = new Date();
          oFrom.setDate(oFrom.getDate() - 6);
          oDateRange.setDateValue(oFrom);
          oDateRange.setSecondDateValue(new Date());
        }
        return;
      }

      this._loadCurrentPeriod();
    },

    onPeriodPrev: function () {
      this._shiftPeriod(-1);
    },

    onPeriodNext: function () {
      this._shiftPeriod(1);
    },

    onPeriodToday: function () {
      this._periodAnchor = new Date();
      this._loadCurrentPeriod();
    },

    _shiftPeriod: function (iDirection) {
      if (this._periodMode === "1D") {
        this._periodAnchor.setDate(this._periodAnchor.getDate() + iDirection);
      } else if (this._periodMode === "1M") {
        this._periodAnchor.setMonth(this._periodAnchor.getMonth() + iDirection);
      } else {
        this._periodAnchor.setDate(this._periodAnchor.getDate() + (iDirection * 7));
      }
      this._loadCurrentPeriod();
    },

    _loadCurrentPeriod: function () {
      var oRange = this._computePeriodRange(this._periodMode, this._periodAnchor);
      this.getView().getModel("myModel").setProperty("/periodLabel", oRange.label);

      var oUser = this.getOwnerComponent().getCurrentUser();
      this._loadEntries(oUser.employeeId, this._formatForBackend(oRange.from), this._formatForBackend(oRange.to));
    },

    // Translate the active period mode + anchor date into a from/to range and a display label
    _computePeriodRange: function (sMode, oAnchor) {
      var oToday = new Date();

      if (sMode === "1D") {
        var sIsToday = this._formatForBackend(oAnchor) === this._formatForBackend(oToday);
        var sDayLabel = sIsToday
          ? "Today"
          : oAnchor.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
        return { from: oAnchor, to: oAnchor, label: sDayLabel };
      }

      if (sMode === "1M") {
        var oMonthFrom = new Date(oAnchor.getFullYear(), oAnchor.getMonth(), 1);
        var oMonthTo = new Date(oAnchor.getFullYear(), oAnchor.getMonth() + 1, 0);
        return { from: oMonthFrom, to: oMonthTo, label: oAnchor.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) };
      }

      // 1W (default)
      var oWeekStart = this._getWeekStart(oAnchor);
      var oWeekEnd = new Date(oWeekStart);
      oWeekEnd.setDate(oWeekEnd.getDate() + 6);
      var bIsCurrentWeek = this._formatForBackend(this._getWeekStart(oToday)) === this._formatForBackend(oWeekStart);
      var sWeekLabel = (bIsCurrentWeek ? "This Week: " : "") +
        oWeekStart.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " - " +
        oWeekEnd.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      return { from: oWeekStart, to: oWeekEnd, label: sWeekLabel };
    },

    onGoPress: function () {
      var oDateRange = this.byId("dateRangePicker");
      var oFrom = oDateRange.getDateValue();
      var oTo = oDateRange.getSecondDateValue();

      if (!oFrom || !oTo) {
        MessageToast.show("Please select a date range first");
        return;
      }

      var sFromDate = this._formatForBackend(oFrom);
      var sToDate = this._formatForBackend(oTo);
      var sLabel = oFrom.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
        " - " + oTo.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      this.getView().getModel("myModel").setProperty("/periodLabel", sLabel);

      var oUser = this.getOwnerComponent().getCurrentUser();
      this._loadEntries(oUser.employeeId, sFromDate, sToDate);
    },

    _formatForBackend: function (oDate) {
      var y = oDate.getFullYear();
      var m = String(oDate.getMonth() + 1).padStart(2, "0");
      var d = String(oDate.getDate()).padStart(2, "0");
      return y + "-" + m + "-" + d;
    },

    _loadEntries: function (sEmployeeId, sFromDate, sToDate) {
      this._sActiveFromDate = sFromDate;
      this._sActiveToDate = sToDate;

      var oModel = this.getOwnerComponent().getModel();
      var sUrl = "/getMyTimeEntries(employeeId='" + sEmployeeId +
                 "',fromDate='" + sFromDate + "',toDate='" + sToDate + "')";

      var oContextBinding = oModel.bindContext(sUrl);

      oContextBinding.requestObject().then(function (oResult) {
        var aEntries = oResult.value || oResult;
        // Shared with the Object Page so it can look up a date's logs without refetching.
        this.getOwnerComponent().getModel("timesheetData").setProperty("/entries", aEntries);
        this.syncFromSharedEntries();
      }.bind(this)).catch(function (oError) {
        MessageToast.show("Failed to load entries: " + oError.message);
      });
    },

    // Roll individual log entries up into one row per date.
    _buildDailySummaries: function (aEntries) {
      var mByDate = {};
      aEntries.forEach(function (e) {
        var sDate = (e.entryDate || "").slice(0, 10);
        if (!mByDate[sDate]) {
          mByDate[sDate] = { isoDate: sDate, totalHours: 0, logCount: 0, logs: [] };
        }
        mByDate[sDate].totalHours += parseFloat(e.hours) || 0;
        mByDate[sDate].logCount += 1;
        mByDate[sDate].logs.push(e);
      });

      return Object.keys(mByDate).sort().reverse().map(function (sDate) {
        var oDay = mByDate[sDate];
        return {
          isoDate: oDay.isoDate,
          totalHours: oDay.totalHours.toFixed(2),
          logCount: oDay.logCount,
          companyCode: oDay.logs[0] ? oDay.logs[0].companyCode : "",
          status: formatter.overallStatusCode(oDay.logs)
        };
      });
    },

    // Switch the table's empty-state illustration/copy between "nothing logged yet"
    // (show Create Log) and "filters matched nothing" (no Create Log)
    _setEmptyState: function (bHasEntries, bFilteredEmpty) {
      var oModel = this.getView().getModel("myModel");
      if (bFilteredEmpty) {
        oModel.setProperty("/emptyIllustrationType", "NoFilterResults");
        oModel.setProperty("/emptyTitle", "No Matching Entries");
        oModel.setProperty("/emptyDescription", "Try adjusting your search or filters.");
        oModel.setProperty("/showCreateLogInEmptyState", false);
      } else if (!bHasEntries) {
        oModel.setProperty("/emptyIllustrationType", "NoActivities");
        oModel.setProperty("/emptyTitle", "No Records Recorded");
        oModel.setProperty("/emptyDescription",
          "You haven't logged any time for " + oModel.getProperty("/periodLabel") + ". Click \"Create Log\" to add an entry.");
        oModel.setProperty("/showCreateLogInEmptyState", true);
      }
    },

    // Derive facet filter options from the actual data returned — no hardcoded lists
    _buildFacets: function (aEntries) {
      var mCompanyCode = {}, mCategory = {}, mWorkCenter = {};

      aEntries.forEach(function (e) {
        if (e.companyCode) mCompanyCode[e.companyCode] = true;
        if (e.category) mCategory[e.category] = true;
        if (e.workCenter) mWorkCenter[e.workCenter] = true;
      });

      var toFacetArray = function (mMap, fnLabel) {
        return Object.keys(mMap).map(function (k) {
          return { key: k, text: fnLabel ? fnLabel(k) : k };
        });
      };

      this.getView().getModel("facets").setData({
        companyCode: toFacetArray(mCompanyCode),
        category: toFacetArray(mCategory),
        workCenter: toFacetArray(mWorkCenter)
      });
    },

    onFacetFilterConfirm: function (oEvent) {
      var oFacetFilter = this.byId("idFacetFilter");
      var aSelectedKeys = [];

      oFacetFilter.getLists().forEach(function (oList) {
        var sListKey = oList.getKey();
        oList.getSelectedItems().forEach(function (oItem) {
          aSelectedKeys.push({ field: sListKey, value: oItem.getKey() });
        });
      });

      this._applyFilters(aSelectedKeys, this.byId("searchField").getValue());
    },

    onFacetFilterReset: function () {
      this._applyFilters([], this.byId("searchField").getValue());
    },

    onSearch: function (oEvent) {
      var sQuery = oEvent.getParameter("newValue");
      var oFacetFilter = this.byId("idFacetFilter");
      var aSelectedKeys = [];

      oFacetFilter.getLists().forEach(function (oList) {
        var sListKey = oList.getKey();
        oList.getSelectedItems().forEach(function (oItem) {
          aSelectedKeys.push({ field: sListKey, value: oItem.getKey() });
        });
      });

      this._applyFilters(aSelectedKeys, sQuery);
    },

    // Filters the raw entries (client-side — myModel is a JSONModel) then rebuilds the
    // per-date summaries shown in the table from that filtered subset. A date only
    // shows up if at least one of its logs matches; totals reflect the matching logs only.
    _applyFilters: function (aFacetKeys, sSearchQuery) {
      this._aActiveFacetKeys = aFacetKeys;
      this._sActiveSearch = sSearchQuery;

      var aRawEntries = this.getView().getModel("myModel").getProperty("/entries") || [];

      var mByField = {};
      aFacetKeys.forEach(function (o) {
        mByField[o.field] = mByField[o.field] || [];
        mByField[o.field].push(o.value);
      });

      var aFiltered = aRawEntries.filter(function (e) {
        return Object.keys(mByField).every(function (sField) {
          return mByField[sField].indexOf(e[sField]) !== -1;
        });
      });

      if (sSearchQuery) {
        var sQuery = sSearchQuery.toLowerCase();
        aFiltered = aFiltered.filter(function (e) {
          return (e.workCenter || "").toLowerCase().indexOf(sQuery) !== -1 ||
                 (e.category || "").toLowerCase().indexOf(sQuery) !== -1 ||
                 (e.remarks || "").toLowerCase().indexOf(sQuery) !== -1;
        });
      }

      var aSummaries = this._buildDailySummaries(aFiltered);
      this.getView().getModel("myModel").setProperty("/dailySummaries", aSummaries);

      var bHasEntries = aRawEntries.length > 0;
      var bFilteredEmpty = bHasEntries && aSummaries.length === 0;
      this._setEmptyState(bHasEntries, bFilteredEmpty);
    },

    onDailySummaryPress: function (oEvent) {
      var oContext = oEvent.getSource().getBindingContext("myModel");
      var sIsoDate = oContext.getProperty("isoDate");
      this.getOwnerComponent().getRouter().navTo("objectPage", { date: sIsoDate });
    },

    onSortPress: function () {
      MessageToast.show("Sort dialog — coming soon");
    },

    onCreateEntryPress: function () {
  var oView = this.getView();

  if (!this._pDialog) {
    this._pDialog = Fragment.load({
      id: oView.getId(),
      name: "timesheetsfreestyle.view.CreateEntryDialog",
      controller: this
    }).then(function (oDialog) {
      oView.addDependent(oDialog);
      return oDialog;
    });
  }

  this._pDialog.then(function (oDialog) {
    var oUser = this.getOwnerComponent().getCurrentUser();

    this._selectedDate = new Date(); // today, for Day view
    this._weekStart = this._getWeekStart(new Date()); // Monday of current week, for Week view

    var oDialogModel = new JSONModel({
      employeeId: oUser.employeeId,
      companyCode: oUser.companyCode,
      viewMode: "day",
      periodLabel: "",
      selectedDateValue: this._selectedDate,
      dayRows: this._buildDefaultDayRows(),
      weekRows: this._buildDefaultWeekRows(),
      weekDates: [],
      dayTotal: "0.00",
      weekTotal: "0.00"
    });

    oDialog.setModel(oDialogModel, "entryDialog");
    this._refreshPeriodLabel(oDialog);
    this._refreshWeekDates(oDialog);
    oDialog.open();
  }.bind(this));
},

_buildDefaultDayRows: function () {
  return [{ sNo: 1, category: "TRAI", workCenter: "OD11101901", remarks: "", hours: "", startTime: "", endTime: "" }];
},

_buildDefaultWeekRows: function () {
  var aRows = [];
  for (var i = 0; i < 5; i++) {
    aRows.push({
      category: "TRAI",
      workCenter: "OD11101901",
      remarks: "",
      hoursByDay: { day0: "", day1: "", day2: "", day3: "", day4: "", day5: "", day6: "" }
    });
  }
  return aRows;
},

_getWeekStart: function (oDate) {
  var oResult = new Date(oDate);
  var iDay = oResult.getDay(); // 0=Sun
  var iDiff = iDay === 0 ? -6 : 1 - iDay; // shift to Monday
  oResult.setDate(oResult.getDate() + iDiff);
  return oResult;
},

_formatForBackendDate: function (oDate) {
  var y = oDate.getFullYear();
  var m = String(oDate.getMonth() + 1).padStart(2, "0");
  var d = String(oDate.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
},

_refreshPeriodLabel: function (oDialog) {
  var oModel = oDialog.getModel("entryDialog");
  var sMode = oModel.getProperty("/viewMode");

  if (sMode === "day") {
    var sLabel = this._selectedDate.toDateString() === new Date().toDateString()
      ? "Today"
      : this._selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    oModel.setProperty("/periodLabel", sLabel);
    oModel.setProperty("/selectedDateValue", new Date(this._selectedDate));
  } else {
    var oEnd = new Date(this._weekStart);
    oEnd.setDate(oEnd.getDate() + 6);
    var sStartLabel = this._weekStart.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    var sEndLabel = oEnd.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    oModel.setProperty("/periodLabel", sStartLabel + " - " + sEndLabel);
    oModel.setProperty("/selectedDateValue", new Date(this._weekStart));
  }
},

_refreshWeekDates: function (oDialog) {
  var oModel = oDialog.getModel("entryDialog");
  var aDates = [];
  for (var i = 0; i < 7; i++) {
    var oDay = new Date(this._weekStart);
    oDay.setDate(oDay.getDate() + i);
    aDates.push({
      isoDate: this._formatForBackendDate(oDay),
      label: oDay.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
             "\n" + oDay.toLocaleDateString("en-US", { weekday: "short" })
    });
  }
  oModel.setProperty("/weekDates", aDates);
},

onViewModeChange: function (oEvent) {
  this._pDialog.then(function (oDialog) {
    this._refreshPeriodLabel(oDialog);
  }.bind(this));
},

onPrevPeriod: function () {
  this._pDialog.then(function (oDialog) {
    var oModel = oDialog.getModel("entryDialog");
    var sMode = oModel.getProperty("/viewMode");

    if (sMode === "day") {
      this._selectedDate.setDate(this._selectedDate.getDate() - 1);
    } else {
      this._weekStart.setDate(this._weekStart.getDate() - 7);
      this._refreshWeekDates(oDialog);
    }
    this._refreshPeriodLabel(oDialog);
  }.bind(this));
},

onNextPeriod: function () {
  this._pDialog.then(function (oDialog) {
    var oModel = oDialog.getModel("entryDialog");
    var sMode = oModel.getProperty("/viewMode");

    if (sMode === "day") {
      this._selectedDate.setDate(this._selectedDate.getDate() + 1);
    } else {
      this._weekStart.setDate(this._weekStart.getDate() + 7);
      this._refreshWeekDates(oDialog);
    }
    this._refreshPeriodLabel(oDialog);
  }.bind(this));
},

onDatePickerChange: function (oEvent) {
  if (!oEvent.getParameter("valid")) {
    return;
  }
  // sap.m.DatePicker's change event carries only { value, valid } — there is no
  // "date" parameter. Reading one always came back undefined, so this handler
  // returned early every time and _selectedDate kept whatever the arrows last set
  // (usually today), while the picker showed the date the user actually chose.
  // Rows were then saved against the stale date. Take it off the control instead.
  var oDate = oEvent.getSource().getDateValue();
  if (!oDate) {
    return;
  }

  this._pDialog.then(function (oDialog) {
    this._selectedDate = oDate;
    this._refreshPeriodLabel(oDialog);
  }.bind(this));
},

onWeekPickerPress: function (oEvent) {
  this._pDialog.then(function () {
    var oPopover = this.byId("weekPickerPopover");
    var oCalendar = this.byId("weekPickerCalendar");

    oCalendar.destroySelectedDates();
    var oWeekEnd = new Date(this._weekStart);
    oWeekEnd.setDate(oWeekEnd.getDate() + 6);
    oCalendar.addSelectedDate(new DateRange({ startDate: new Date(this._weekStart), endDate: oWeekEnd }));
    oCalendar.displayDate(this._weekStart);

    oPopover.openBy(oEvent.getSource());
  }.bind(this));
},

onWeekCalendarSelect: function (oEvent) {
  var oCalendar = oEvent.getSource();
  var aSelectedDates = oCalendar.getSelectedDates();
  if (!aSelectedDates.length) {
    return;
  }
  this._applySelectedWeek(oCalendar, aSelectedDates[0].getStartDate());
},

onWeekNumberSelect: function (oEvent) {
  var oWeekDays = oEvent.getParameter("weekDays");
  if (!oWeekDays) {
    return;
  }
  this._applySelectedWeek(oEvent.getSource(), oWeekDays.getStartDate());
},

_applySelectedWeek: function (oCalendar, oClickedDate) {
  this._weekStart = this._getWeekStart(oClickedDate);
  var oWeekEnd = new Date(this._weekStart);
  oWeekEnd.setDate(oWeekEnd.getDate() + 6);

  oCalendar.destroySelectedDates();
  oCalendar.addSelectedDate(new DateRange({ startDate: new Date(this._weekStart), endDate: oWeekEnd }));

  this._pDialog.then(function (oDialog) {
    this._refreshWeekDates(oDialog);
    this._refreshPeriodLabel(oDialog);
  }.bind(this));

  this.byId("weekPickerPopover").close();
},

onAddDayRow: function () {
  this._pDialog.then(function (oDialog) {
    var oModel = oDialog.getModel("entryDialog");
    var aRows = oModel.getProperty("/dayRows");
    aRows.push({ sNo: aRows.length + 1, category: "TRAI", workCenter: "OD11101901", remarks: "", hours: "", startTime: "", endTime: "" });
    oModel.setProperty("/dayRows", aRows);
  });
},

onDeleteDayRow: function (oEvent) {
  this._pDialog.then(function (oDialog) {
    var oItem = oEvent.getSource().getParent();
    var oTable = this.byId("dayRowsTable");
    var oModel = oDialog.getModel("entryDialog");
    var iIndex = oTable.getItems().indexOf(oItem);
    var aRows = oModel.getProperty("/dayRows");
    aRows.splice(iIndex, 1);
    oModel.setProperty("/dayRows", aRows);
    this._refreshDayTotal(oDialog);
  }.bind(this));
},

onDayHoursChange: function (oEvent) {
  this._pDialog.then(function (oDialog) {
    // Only normalize on blur/enter (change), not on every keystroke (liveChange) —
    // reformatting mid-type would fight the user's typing.
    if (oEvent.getId() === "change") {
      this._normalizeHoursInput(oEvent.getSource());
    }
    this._refreshDayTotal(oDialog);
  }.bind(this));
},

_refreshDayTotal: function (oDialog) {
  var oModel = oDialog.getModel("entryDialog");
  var aRows = oModel.getProperty("/dayRows");
  var iTotalMinutes = 0;

  aRows.forEach(function (oRow) {
    iTotalMinutes += formatter.hoursToMinutes(oRow.hours);
  });

  oModel.setProperty("/dayTotal", formatter.minutesToHours(iTotalMinutes));
},

// Re-writes an hours Input's bound value through the H.MM carry-over rule
// (e.g. "4.80" -> "5.20") right in the model, regardless of whether it's a
// day row's flat "hours" or a week row's nested "hoursByDay/dayN".
_normalizeHoursInput: function (oInput) {
  var oBinding = oInput.getBinding("value");
  if (!oBinding) return;
  oBinding.setValue(formatter.normalizeHours(oInput.getValue()));
},

onAddWeekRow: function () {
  this._pDialog.then(function (oDialog) {
    var oModel = oDialog.getModel("entryDialog");
    var aRows = oModel.getProperty("/weekRows");
    aRows.push({
      category: "TRAI", workCenter: "OD11101901", remarks: "",
      hoursByDay: { day0: "", day1: "", day2: "", day3: "", day4: "", day5: "", day6: "" }
    });
    oModel.setProperty("/weekRows", aRows);
  });
},

onDeleteWeekRow: function (oEvent) {
  this._pDialog.then(function (oDialog) {
    var oItem = oEvent.getSource().getParent();
    var oTable = this.byId("weekRowsTable");
    var oModel = oDialog.getModel("entryDialog");
    var iIndex = oTable.getItems().indexOf(oItem);
    var aRows = oModel.getProperty("/weekRows");
    aRows.splice(iIndex, 1);
    oModel.setProperty("/weekRows", aRows);
    this._refreshWeekTotal(oDialog);
  }.bind(this));
},

onWeekHoursChange: function (oEvent) {
  this._pDialog.then(function (oDialog) {
    if (oEvent.getId() === "change") {
      this._normalizeHoursInput(oEvent.getSource());
    }
    this._refreshWeekTotal(oDialog);
  }.bind(this));
},

_refreshWeekTotal: function (oDialog) {
  var oModel = oDialog.getModel("entryDialog");
  var aRows = oModel.getProperty("/weekRows");
  var iTotalMinutes = 0;

  aRows.forEach(function (oRow) {
    Object.keys(oRow.hoursByDay).forEach(function (sKey) {
      iTotalMinutes += formatter.hoursToMinutes(oRow.hoursByDay[sKey]);
    });
  });

  oModel.setProperty("/weekTotal", formatter.minutesToHours(iTotalMinutes));
},

onCancelDialog: function () {
  this._pDialog.then(function (oDialog) { oDialog.close(); });
},

onSubmitEntries: function () {
  var that = this;

  this._pDialog.then(function (oDialog) {
    var oData = oDialog.getModel("entryDialog").getData();
    var aNewDrafts = [];

    // Only genuinely untouched rows are skipped here. Anything the user actually
    // filled in goes to the server even if it looks wrong (0 hours, blank work
    // center, future date) — the server owns the business rules, and dropping a
    // bad row on the client instead would replace its specific message with a
    // vague "enter a valid row" and make validation look broken on create.
    if (oData.viewMode === "day") {
      var sDate = that._formatForBackendDate(that._selectedDate);
      oData.dayRows.forEach(function (oRow) {
        if (that._isBlankDayRow(oRow)) return;
        aNewDrafts.push(that._buildDraftEntry(oData, sDate, oRow));
      });
    } else {
      oData.weekRows.forEach(function (oRow) {
        oData.weekDates.forEach(function (oDay, i) {
          // An empty day cell means "nothing worked that day", so it stays skipped;
          // a filled-in one is submitted as-is and validated server-side.
          var sHours = oRow.hoursByDay["day" + i];
          if (!sHours || !String(sHours).trim()) return;
          aNewDrafts.push(that._buildDraftEntry(oData, oDay.isoDate, Object.assign({}, oRow, { hours: sHours })));
        });
      });
    }

    if (!aNewDrafts.length) {
      MessageToast.show("Enter at least one row with hours before saving.");
      return;
    }

    // Nothing is sent to S4 here — rows are saved as local Drafts (now backend-persisted
    // TimeEntries records) and only reach S4 when the user submits them from the day's
    // Logs table. addDraftEntry is a POST now, so a failure here has to be surfaced
    // instead of silently dropping the row.
    var aCreatePromises = aNewDrafts.map(function (oDraft) {
      return that.getOwnerComponent().addDraftEntry(oDraft);
    });

    Promise.allSettled(aCreatePromises).then(function (aResults) {
      var aFailed = aResults.filter(function (o) { return o.status === "rejected"; });
      var iSucceeded = aResults.length - aFailed.length;

      if (iSucceeded) {
        oDialog.close();
        that.syncFromSharedEntries();
      }

      if (aFailed.length) {
        // Server-side validation rejects with the specific business reason (hours
        // range, future date, missing field) — show that, not just "failed", or the
        // user has no idea what to correct. Duplicates are collapsed so a batch of
        // rows failing the same rule reads as one message.
        var aReasons = aFailed.map(function (o) {
          return (o.reason && o.reason.message) || "Unknown error";
        }).filter(function (s, i, a) { return a.indexOf(s) === i; });

        MessageToast.show(aFailed.length + " of " + aNewDrafts.length + " entries failed to save as Draft: " +
          aReasons.join(" "), { duration: 6000 });
      }
      if (iSucceeded) {
        MessageToast.show(iSucceeded + " entries saved as Draft — submit them from the day's Logs to send to your timesheet.");
      }
    });
  });
},

// A day row the user never touched. Task Type and Work Center are pre-filled with
// defaults on every new row, so they can't tell an untouched row from a real one —
// only the fields that start empty can. Anything else (including a row whose
// defaults were cleared) counts as intentional input and is sent for validation.
_isBlankDayRow: function (oRow) {
  return !["hours", "remarks", "startTime", "endTime"].some(function (sKey) {
    return oRow[sKey] && String(oRow[sKey]).trim();
  });
},

// Builds a local Draft entry shaped like a real backend entry (same field names as
// getMyTimeEntries) so it flows through the existing rendering/formatter/sort code
// unmodified. No "record" id here anymore — the server assigns the real one on
// create, and Component#addDraftEntry maps the returned ID back onto "record".
_buildDraftEntry: function (oDialogData, sIsoDate, oRow) {
  // Same [TSAPP_START:...|TSAPP_END:...] convention the Edit Draft dialog uses
  // (see ObjectPage.controller.js#_saveDraftEdit) — only tagged when both are set,
  // so week rows (which have no time-of-day fields) fall through untagged.
  var sTimeTag = (oRow.startTime && oRow.endTime)
    ? "[TSAPP_START:" + oRow.startTime + "|TSAPP_END:" + oRow.endTime + "] "
    : "";
  return {
    employeeId: oDialogData.employeeId,
    companyCode: oDialogData.companyCode,
    entryDate: sIsoDate,
    status: "DRAFT",
    workCenter: oRow.workCenter,
    category: oRow.category,
    hours: formatter.normalizeHours(oRow.hours),
    remarks: (sTimeTag + (oRow.remarks || "")).trim(),
    isDraft: true
  };
}
  });
});