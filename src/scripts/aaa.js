/**
 * Copyright 2018 Jorge Villalobos
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

"use strict";

const AAA_RE_LISTING_PAGE =
  /^\/(?:[a-z]{2}(?:\-[a-z]{2})?\/)?(?:(?:firefox|thunderbird|seamonkey|mobile|android)\/)?addon\/([^\/]+)(?:\/)?$/i;
const AAA_RE_EDIT_PAGE =
  /^\/(?:[a-z]{2}(?:\-[a-z]{2})?\/)?developers\/addon\/([^\/]+)(?:\/([^\/]+))?/i;
const AAA_RE_BG_THEME_EDIT_PAGE =
  /^\/(?:[a-z]{2}(?:\-[a-z]{2})?\/)?developers\/theme\/([^\/]+)(?:\/([^\/]+))?/i;
const AAA_RE_USER_PAGE =
  /^\/(?:[a-z]{2}(?:\-[a-z]{2})?\/)?(?:(?:firefox|thunderbird|seamonkey|mobile|android)\/)?user\//i;
const AAA_RE_USER_ADMIN_PAGE =
  /^\/(?:[a-z]{2}(?:\-[a-z]{2})?\/)?admin\/models\/(?:(?:auth\/user\/)|(?:users\/userprofile\/))([0-9]+)?/i;
const AAA_RE_ADDON_MANAGE_PAGE =
  /^\/(?:[a-z]{2}(?:\-[a-z]{2})?\/)?admin\/addon\/manage\/([^\/]+)?/i;
const AAA_RE_COLLECTION_PAGE =
  /^\/(?:[a-z]{2}(?:\-[a-z]{2})?\/)?(?:(?:firefox|thunderbird|seamonkey|mobile|android)\/)?collections\//i;
const AAA_RE_COLLECTION_ID =
  /^\/(?:[a-z]{2}(?:\-[a-z]{2})?\/)?(?:(?:firefox|thunderbird|seamonkey|mobile|android)\/)?collections\/((?:[^\/]+)\/(?:[^\/]+))/i;
const AAA_RE_GET_NUMBER = /\/([0-9]+)(\/|$)/;

let AAAContentScript = {
  _path : null,

  /**
   * Runs the content script on this page.
   */
  run : function(aEvent) {
    this._path = document.location.pathname;

    // check if this is a listing page.
    let matchListing = this._path.match(AAA_RE_LISTING_PAGE, "ig");

    if (matchListing && (2 <= matchListing.length)) {
      this._log("Found an AMO listing page.");
      // this is an AMO listing page. matchListing[1] is the add-on slug.
      this._modifyListingPage(matchListing[1]);
      // let the record state I hate early returns, but the logic in this
      // function was becoming a bit unruly.
      return;
    }

    // not a listing page, check if this is an edit page.
    let matchEdit = this._path.match(AAA_RE_EDIT_PAGE, "ig");

    if (matchEdit && (2 <= matchEdit.length)) {
      // this excludes validation result pages.
      if ((2 == matchEdit.length) || ("file" != matchEdit[2])) {
        this._log("Found an AMO edit page.");
        // this is an AMO edit page.
        this._modifyEditPage();
      }

      return;
    }

    // check if this is a lightweight theme edit page.
    let matchBgEdit = this._path.match(AAA_RE_BG_THEME_EDIT_PAGE, "ig");

    if (matchBgEdit && (2 <= matchBgEdit.length)) {
      this._log("Found an AMO lightweight theme edit page.");
      // this is an AMO lightweight theme edit page. matchBgEdit[1] is the
      // add-on slug.
      this._modifyThemeEditPage(matchBgEdit[1]);

      return;
    }

    // check if this is a user admin page.
    let matchUserAdmin = this._path.match(AAA_RE_USER_ADMIN_PAGE, "ig");

    if (matchUserAdmin) {
      if (null != matchUserAdmin[1]) {
        this._log("Found a user admin page.");
        // this is a user admin page. matchUserAdmin[1] is the user ID.
        this._modifyUserAdminPage(matchUserAdmin[1]);
      } else {
        this._log("Found a user admin search page.");
        this._modifyUserAdminSearchPage();
      }

      return;
    }

    // check if this is an add-on management page.
    let matchAddonManage = this._path.match(AAA_RE_ADDON_MANAGE_PAGE, "ig");

    if (matchAddonManage) {
      if (null != matchAddonManage[1]) {
        this._log("Found an add-on management page.");
        // this is an add-on management page. matchAddonManage[1] is the add-on
        // slug.
        this._modifyAddonManagePage(matchAddonManage[1]);
      }

      return;
    }

    // nope, test the simpler cases.
    if (AAA_RE_USER_PAGE.test(this._path)) {
      this._log("Found a user profile page.");
      this._addLinksToUserPage();
    } else if (AAA_RE_COLLECTION_PAGE.test(this._path)) {
      this._log("Found a collection page.");
      this._addToCollectionPage();
    }
  },

  /**
   * Adds a few useful admin links to listing pages, and exposes the internal
   * add-on id.
   */
  _modifyListingPage : function(aSlug) {
    let isThemeListing =
      (null != document.getElementById("persona-summary"));

    if (isThemeListing) {
      this._modifyThemeListing(aSlug);
    } else {
      this._modifyRegularListing(aSlug);
    }
  },

  /**
   * Adds a link to the header image in theme listing pages.
   */
  _modifyThemeListing : function(aSlug) {
    let summaryNode = document.getElementById("persona-summary");
    let personaNode =
      document.querySelector("#persona-summary div.persona-preview > div");

    if (null != personaNode) {
      let personaJSON = personaNode.getAttribute("data-browsertheme");
      let persona = JSON.parse(personaJSON);
      let headerLink = this._createLink("Header", persona.headerURL);
      let insertionPoint = document.querySelector("div.widgets");

      if (null != insertionPoint) {
        headerLink.setAttribute("class", "collection-add widget collection");
        insertionPoint.appendChild(headerLink);
      } else {
        this._log("Insertion point could not be found.");
      }
    } else {
      this._log("Persona node could not be found.");
    }
  },

  /**
   * Adds a few useful admin links to regular add-on listing pages, and exposes
   * the internal add-on id.
   */
  _modifyRegularListing : function(aSlug) {
    let addonNode = document.getElementById("addon");

    if (null == addonNode) {
      this._log("There is no add-on node. This may be a 404 page.");

      let aside = document.querySelector("aside.secondary");
      let insertionPoint = null;

      if (null != aside) {
        // author-disabled add-on page.
        insertionPoint = document.createElement("div");
        insertionPoint.setAttribute("style", "margin-top: 1em;");
        aside.appendChild(insertionPoint);
      } else {
        let errorMessage = document.querySelector("div.primary");

        if (null != errorMessage) {
          // 404 pages (disabled, incomplete, or actually 404).
          insertionPoint = document.createElement("div");
          insertionPoint.setAttribute(
            "style", "margin-top: 1em; margin-bottom: 1em;");
          errorMessage.insertBefore(
            insertionPoint, errorMessage.firstElementChild.nextSibling);
        }
      }

      if (null != insertionPoint) {
        let adminLink = this._createAdminLink(aSlug);
        let reviewLink = this._createAMOReviewLink(aSlug);
        let editLink = this._createEditLink(aSlug);

        this._appendListingLink(insertionPoint, adminLink);
        this._appendListingLink(insertionPoint, reviewLink);
        this._appendListingLink(insertionPoint, editLink);
      } else {
        this._log("Insertion point could not be found.");
      }
    }
  },

  /**
   * Makes deletion dialog easier to use.
   */
  _modifyEditPage : function() {
    this._fillDeletionDialog();
  },

  /**
   * Adds a few useful admin links to lightweight theme edit pages.
   * @param aSlug the slug that identifies the theme.
   */
  _modifyThemeEditPage : function(aSlug) {
    let result = document.querySelector("div.info > p:nth-child(2)");

    if (null != result) {
      let insertionPoint = result.parentNode;
      let container = document.createElement("p");
      let reviewLink = this._createThemeReviewLink(aSlug);

      container.appendChild(reviewLink);
      insertionPoint.insertBefore(container, result.nextSibling);
    } else {
      this._log("Insertion point could not be found.");
    }

    this._fillDeletionDialog();
  },

  /**
   * Adds an admin link to user pages.
   */
  _addLinksToUserPage : function() {
    let manageButton = document.getElementById("manage-user");

    if (null != manageButton) {
      let manageURL = manageButton.getAttribute("href");
      let userId = manageURL.substring(manageURL.lastIndexOf("/") + 1);
      let adminLink = this._createAdminUserLink(userId);

      adminLink.setAttribute("class", "button");
      manageButton.parentNode.appendChild(adminLink);
    } else {
      this._log("Insertion point could not be found.");
    }
  },

  /**
   * Adds delete buttons to collection pages.
   */
  _addToCollectionPage : function() {
    let widgetBoxes =
      document.querySelectorAll("div.collection_widgets.condensed.widgets");

    for (let box of widgetBoxes) {
      let watchURL = box.firstElementChild.getAttribute("href");
      let matchURL = watchURL.match(AAA_RE_COLLECTION_ID, "ig");

      if (matchURL && (2 <= matchURL.length)) {
        let collectionID = matchURL[1];
        let link = document.createElement("a");
        let label = document.createTextNode("Delete");

        link.setAttribute("href", `/collections/${collectionID}/delete`);
        link.appendChild(label);
        box.appendChild(link);
      } else {
        this._log("Invalid collection URL.");
      }
    }
  },

  /**
   * Improve the user administration page.
   * @param aUserID the user ID from the page URL.
   */
  _modifyUserAdminPage : function(aUserID) {
    let result = document.querySelector("a.viewsitelink");

    if (null != result) {
      result.setAttribute("href", ("/user/" + aUserID + "/"));
    } else {
      this._log("View on site button could not be found.");
    }
  },

  /**
   * Adds links to profile pages in user admin search results.
   */
  _modifyUserAdminSearchPage : function() {
    try {
      let result =
        document.querySelectorAll("#result_list > tbody > tr > th > a");
      let match;
      let userID;
      let newLink;

      for (let link of result) {
        match = link.getAttribute("href").match(AAA_RE_GET_NUMBER, "ig");

        if (match && (2 <= match.length)){
          userID = match[1];
          // create a new link that points to the profile page.
          newLink = document.createElement("a");
          newLink.setAttribute("href", ("/user/" + userID + "/"));
          newLink.setAttribute("style", "margin-left: 0.5em;");
          newLink.textContent = "[" + userID + "]";
          link.parentNode.appendChild(newLink);
        }
      }
    } catch (e) {
      this._log("_modifyUserAdminSearchPage error:\n" + e);
    }
  },

  /**
   * Improve the add-on management page.
   * @param aSlug the add-on slug.
   */
  _modifyAddonManagePage : function(aSlug) {
    let result = document.querySelector("form > p > input[type=submit]");

    if (null != result) {
      let disableButton = document.createElement("input");

      disableButton.setAttribute("value", "Disable");
      disableButton.setAttribute("type", "submit");
      document.querySelector("form h3").insertAdjacentElement('beforebegin', disableButton);
      disableButton.addEventListener("click", function(aEvent) {
        let result = document.querySelectorAll("select");

        for (let select of result) {
          select.value = "5";
        }
      });
    } else {
      this._log("Update button could not be found.");
    }
  },

  /**
   * Pre-fills the deletion dialog for add-ons, to make it easier for admins.
   */
  _fillDeletionDialog : function() {
    let slugInput = document.querySelector("div.modal-delete input[name=slug]");

    if (null != slugInput) {
      let reason = document.getElementById("id_reason");

      slugInput.value = slugInput.getAttribute("placeholder");

      if (null != reason) {
          reason.value = "I'm an admin, bitch!";
      }
    } else {
      this._log("Delete dialog could not be found.");
    }
  },

  /**
   * Inserts a link to a listing page.
   * @param aParent the parent node.
   * @param aLink the link node to insert.
   */
  _appendListingLink : function(aParent, aLink) {
    let container = document.createElement("p");

    aLink.setAttribute("class", "collection-add widget collection");
    container.appendChild(aLink);
    aParent.appendChild(container);
  },

  _createAdminLink : function(aId) {
    let link =
      this._createAMOLink(
        "Admin this Add-on", "/admin/addon/manage/$(PARAM)", aId);

    return link;
  },

  _createEditLink : function(aId, aText) {
    let link =
      this._createAMOLink(
        ((null != aText) ? aText : "Edit this Add-on"),
        "/developers/addon/$(PARAM)/edit/", aId, true);

    return link;
  },

  _createAdminUserLink : function(aId) {
    let link =
      this._createAMOLink(
        "Admin user", "/admin/models/users/userprofile/$(PARAM)/change/", aId);

    return link;
  },

  _createAMOReviewLink : function(aId) {
    let link =
      this._createAMOLink(
        "Review this Add-on", "/editors/review/$(PARAM)", aId);

    return link;
  },

  _createThemeReviewLink : function(aId) {
    let link =
      this._createAMOLink(
        "Review this Add-on", "/editors/themes/queue/single/$(PARAM)", aId);

    return link;
  },

  /**
   * Creates an 'a' node pointing to AMO.
   * @param aText the text in the link.
   * @param aPath the relative path to use.
   * @param aParameter the parameter value to replace in the path.
   * @param aForceAMO whether to force the add-on site host.
   */
  _createAMOLink : function(aText, aPath, aParameter, aForceAMO) {
    let href;

    if (aForceAMO) {
      href = "https://addons-internal.prod.mozaws.net" + aPath;
    } else {
      href = aPath;
    }

    return this._createLink(aText, href.replace("$(PARAM)", aParameter));
  },

  /**
   * Creates an 'a' node with the given text and URL.
   * @param aText the text in the link.
   * @param aURL the URL the link points to.
   */
  _createLink : function(aText, aURL) {
    let link = document.createElement("a");
    let linkContent = document.createTextNode(aText);

    link.setAttribute("href", aURL);
    link.appendChild(linkContent);

    return link;
  },

  _log : function (aText) {
    console.log(aText);
  }
};

AAAContentScript.run();
