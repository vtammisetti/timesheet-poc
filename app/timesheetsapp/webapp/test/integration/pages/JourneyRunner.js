sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"timesheetsapp/test/integration/pages/TimeEntriesList.gen",
	"timesheetsapp/test/integration/pages/TimeEntriesObjectPage.gen"
], function (JourneyRunner, TimeEntriesListGenerated, TimeEntriesObjectPageGenerated) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('timesheetsapp') + '/test/flp.html#app-preview',
        pages: {
			onTheTimeEntriesListGenerated: TimeEntriesListGenerated,
			onTheTimeEntriesObjectPageGenerated: TimeEntriesObjectPageGenerated
        },
        async: true
    });

    return runner;
});

