sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "timesheetsfreestyle/model/models"
], (UIComponent, JSONModel, Filter, FilterOperator, models) => {
    "use strict";

    // All fields on the backend TimeEntries entity (db/schema.cds) — selected explicitly
    // on every headless read/create below. The default "" model runs with
    // autoExpandSelect: true (manifest.json), which normally derives $select from the
    // control bindings attached to a request; these requests aren't attached to any
    // control, so without an explicit $select they could come back with just the key.
    var DRAFT_SELECT = "ID,employeeId,companyCode,entryDate,workCenter,category,hours,remarks,status";

    return UIComponent.extend("timesheetsfreestyle.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // Set the signed-in user identity here (rather than in a view controller) so it
            // is guaranteed to exist before any view/controller onInit runs.
            // Placeholder identity — replace once Chaitanya confirms the real
            // PersonWorkAgreementExternalID / CompanyCode for this user
            this.setModel(new JSONModel({
                FirstName: "Venkatesh",
                SecondName: "Tammisetti",
                Role: "Employee",
                name: "Venkatesh Tammisetti",
                email: "vtammisetti@ondevicesolutions.com",
                employeeId: "P000023",   // PLACEHOLDER //P000136
                companyCode: "ODUK"      // PLACEHOLDER
            }), "userData");

            // Raw time entries currently loaded in "My Timesheets", shared here so the
            // Object Page can look up a date's logs without a second backend round-trip.
            this.setModel(new JSONModel({ entries: [] }), "timesheetData");

            // Draft entries are now backend-persisted (poc.timesheet.TimeEntries, a plain
            // CAP auto-CRUD entity at /odata/v4/timesheet/TimeEntries) — this model is just
            // a local view/cache of what the server has, kept in sync by the methods below.
            this.setModel(new JSONModel({ entries: [] }), "drafts");

            // Fired without awaiting — router.initialize() must not block on the network.
            // The "drafts" model starts empty and fills in whenever the response lands.
            this._loadDraftsFromBackend();

            // enable routing
            this.getRouter().initialize();
        },

        getCurrentUser() {
            var oData = this.getModel("userData").getData();
            return {
                name: oData.name,
                email: oData.email,
                employeeId: oData.employeeId,
                companyCode: oData.companyCode
            };
        },

        // The backend entity's key is "ID" (server-assigned UUID), but every consumer in
        // this app — sorting, edit/delete/submit in both controllers — reads a uniform
        // "record" field across real (S4) and draft entries alike, since S4's
        // TimeSheetRecord is already surfaced as "record" by getMyTimeEntries. Renaming
        // ID -> record here, once, means nothing downstream needs to know there are two
        // different id field names underneath.
        //
        // Also coerces hours to the "X.XX" string convention used everywhere else
        // (S4-sourced entries, the old localStorage drafts) — the backend's Decimal(5,2)
        // comes back from OData v4 as a raw JSON number (e.g. 2, 3.5), and view bindings
        // like ObjectPage.view.xml's hours Text have no formatter, so left as a number it
        // would display inconsistently next to real entries in the same list.
        _toDraftModelEntry(oBackendEntry) {
            var oEntry = Object.assign({}, oBackendEntry);
            oEntry.record = oEntry.ID;
            delete oEntry.ID;
            oEntry.isDraft = true;
            oEntry.hours = Number(oEntry.hours).toFixed(2);
            return oEntry;
        },

        _loadDraftsFromBackend() {
            var oUser = this.getCurrentUser();
            var oListBinding = this.getModel().bindList("/TimeEntries", undefined, undefined, [
                new Filter("status", FilterOperator.EQ, "DRAFT"),
                new Filter("employeeId", FilterOperator.EQ, oUser.employeeId)
            ], {
                $select: DRAFT_SELECT
            });

            return oListBinding.requestContexts(0, 1000).then(function (aContexts) {
                var aDrafts = aContexts.map(function (oContext) {
                    return this._toDraftModelEntry(oContext.getObject());
                }.bind(this));
                this.getModel("drafts").setProperty("/entries", aDrafts);
            }.bind(this)).catch(function (oError) {
                // Non-fatal — the app still works, it just starts with an empty drafts
                // list until the user's next successful mutation repopulates it.
                // eslint-disable-next-line no-console
                console.error("Failed to load draft entries from backend:", oError);
                this.getModel("drafts").setProperty("/entries", []);
            }.bind(this));
        },

        getDraftEntries() {
            return this.getModel("drafts").getProperty("/entries") || [];
        },

        // Returns a Promise. Resolves with the server-confirmed draft (real "record" id
        // included) once the POST succeeds; rejects if it fails — callers must handle
        // both, this no longer fails silently.
        addDraftEntry(oEntry) {
            // The server assigns the real key — never send a client-generated one.
            var oPayload = Object.assign({}, oEntry);
            delete oPayload.record;
            delete oPayload.ID;
            delete oPayload.isDraft;

            var oListBinding = this.getModel().bindList("/TimeEntries", undefined, undefined, undefined, {
                $select: DRAFT_SELECT
            });
            var oContext = oListBinding.create(oPayload);

            return oContext.created().then(function () {
                var oCreated = this._toDraftModelEntry(oContext.getObject());
                var aDrafts = this.getDraftEntries();
                aDrafts.push(oCreated);
                this.getModel("drafts").setProperty("/entries", aDrafts);
                return oCreated;
            }.bind(this));
        },

        // Returns a Promise. sRecord is the real server-assigned id (see
        // _toDraftModelEntry). Only updates the local "drafts" model after the PATCH
        // resolves — no optimistic update, so a failed save never shows a value that
        // isn't actually saved.
        updateDraftEntry(sRecord, oPatch) {
            var oContext = this.getModel().bindContext("/TimeEntries('" + sRecord + "')").getBoundContext();

            var aPatches = Object.keys(oPatch).map(function (sKey) {
                return oContext.setProperty(sKey, oPatch[sKey]);
            });

            return Promise.all(aPatches).then(function () {
                var aDrafts = this.getDraftEntries().map(function (o) {
                    return o.record === sRecord ? Object.assign({}, o, oPatch) : o;
                });
                this.getModel("drafts").setProperty("/entries", aDrafts);
            }.bind(this));
        },

        // One DELETE per record, via Promise.allSettled — a batch of drafts can be
        // partially removed if some deletes fail, so this only drops the ones that
        // actually succeeded from the local "drafts" model and returns both lists
        // ({ succeeded, failed }) for the caller to inspect and react to.
        //
        // Context#delete() checks the model's *cache* first (a cache-only lookup, no
        // network call) to find the entity it's about to delete. A context built via a
        // bare bindContext().getBoundContext() — as this used to do — is never actually
        // read, so the cache has nothing for it; the framework then assumes "not in
        // cache means already deleted by someone else" and resolves success WITHOUT ever
        // sending a DELETE request. (Confirmed via the UI5 v4 source — _Cache#_delete
        // fetches with `_GroupLock.$cached` before doing anything else — and empirically:
        // deleting a draft showed a success toast with zero network activity and no
        // console error.) Reading the entity first via a filtered list binding — the same
        // pattern _loadDraftsFromBackend/addDraftEntry already use — populates the cache
        // so delete() finds something there and actually fires the request.
        removeDraftEntries(aRecords) {
            var that = this;
            var aDeletePromises = aRecords.map(function (sRecord) {
                var oListBinding = that.getModel().bindList("/TimeEntries", undefined, undefined, [
                    new Filter("ID", FilterOperator.EQ, sRecord)
                ], {
                    $select: DRAFT_SELECT
                });

                return oListBinding.requestContexts(0, 1).then(function (aContexts) {
                    if (!aContexts.length) {
                        // Already gone server-side (e.g. deleted elsewhere) — nothing to do,
                        // this counts as a successful removal.
                        return sRecord;
                    }
                    return aContexts[0].delete().then(function () {
                        return sRecord;
                    });
                });
            });

            return Promise.allSettled(aDeletePromises).then(function (aResults) {
                var aSucceeded = [];
                var aFailed = [];

                aResults.forEach(function (oResult, i) {
                    if (oResult.status === "fulfilled") {
                        aSucceeded.push(aRecords[i]);
                    } else {
                        aFailed.push({ record: aRecords[i], error: oResult.reason });
                    }
                });

                if (aSucceeded.length) {
                    var aRemaining = that.getDraftEntries().filter(function (o) {
                        return aSucceeded.indexOf(o.record) === -1;
                    });
                    that.getModel("drafts").setProperty("/entries", aRemaining);
                }

                return { succeeded: aSucceeded, failed: aFailed };
            });
        }
    });
});
