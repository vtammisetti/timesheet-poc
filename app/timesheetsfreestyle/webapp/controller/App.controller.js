sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/Menu",
  "sap/m/MenuItem"
], function (Controller, Menu, MenuItem) {
  "use strict";

  return Controller.extend("timesheetsfreestyle.controller.App", {

    onInit: function () {
      // User identity now lives on the Component (see Component.js) so it is
      // available before this or any nested view's onInit runs.
    },

    onAfterRendering: function () {
      this._hideSplashScreen();
    },

    _hideSplashScreen: function () {
      if (this._bSplashHidden) {
        return;
      }
      this._bSplashHidden = true;

      var oSplash = document.getElementById("appSplashScreen");
      if (!oSplash) {
        return;
      }
      oSplash.classList.add("tsSplashHidden");
      oSplash.addEventListener("transitionend", function () {
        if (oSplash.parentNode) {
          oSplash.parentNode.removeChild(oSplash);
        }
      }, { once: true });
    },

    onSideNavButtonPress: function () {
      var oSideNav = this.byId("sideNav");
      oSideNav.setExpanded(!oSideNav.getExpanded());
    },

    onRefreshApp: function () {
      // Drafts are mirrored to localStorage (see Component.js), so a full
      // reload is safe and reflects "refresh" for the whole app. Reset the
      // hash to the start route first (replacing history) so the reload
      // lands on index.html# instead of re-matching e.g. an object page URL.
      this.getOwnerComponent().getRouter().navTo("timeEntries", {}, true);
      window.location.reload();
    },

    onUserNamePress: function (oEvent) {
      if (!this._oMenu) {
        this._oMenu = new Menu({
          items: [
            new MenuItem({ text: "Personalization" }),
            new MenuItem({ text: "Settings" }),
            new MenuItem({ text: "Logout" })
          ]
        });
      }
      this._oMenu.openBy(oEvent.getSource());
    },

    onNavItemSelect: function (oEvent) {
      if (oEvent.getParameter("item").getKey() === "myTimesheets") {
        this.getOwnerComponent().getRouter().navTo("timeEntries");
      }
    }
  });
});