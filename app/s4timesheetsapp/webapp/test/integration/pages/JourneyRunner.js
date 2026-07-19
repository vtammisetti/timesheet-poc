sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"s4timesheet/s4timesheetsapp/test/integration/pages/S4TimeEntriesList.gen",
	"s4timesheet/s4timesheetsapp/test/integration/pages/S4TimeEntriesObjectPage.gen"
], function (JourneyRunner, S4TimeEntriesListGenerated, S4TimeEntriesObjectPageGenerated) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('s4timesheet/s4timesheetsapp') + '/test/flp.html#app-preview',
        pages: {
			onTheS4TimeEntriesListGenerated: S4TimeEntriesListGenerated,
			onTheS4TimeEntriesObjectPageGenerated: S4TimeEntriesObjectPageGenerated
        },
        async: true
    });

    return runner;
});

