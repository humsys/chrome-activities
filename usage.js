let blameChangedListeners = []
let tabs = {}
let recoveryHints = {}
let userInitiated = /typed|auto_bookmark|generated|auto_toplevel|keyword|keyword_generated/
let googleSearch = /^https:\/\/www\.google\.\w+/

var currentTabId = null
var onNewUsageHandler = null
var isRunning = false
var previousBlame = null


function userInitiatedTransition(prevUrl, newUrl, transitionType){
  if (transitionType.match(userInitiated)) return true
  if (!prevUrl || prevUrl.match(googleSearch)) return true
  return false
}


function flush(){
  if (!currentTabId) return
  let tab = tabs[currentTabId]
  if (!tab) return
  if (!tab.t0) return
  let elapsed = Date.now() - tab.t0
  delete tab.t0
  currentTabId = null
  onNewUsageHandler(tab.blame, tab.url, tab.title, elapsed, tab.favIconUrl)
  chrome.storage.local.set({
    usageRecoveryTabs: tabs,
    usageRecoveryHints: recoveryHints
  })
}

function checkIfCurrentTabBlameChanged(){
  let currentBlame = tabs[currentTabId].blame
  if (previousBlame != currentBlame){
    blameChangedListeners.forEach(l => l(currentBlame))
    previousBlame = currentBlame
  }
}

function activate(tabId, tabInfo){
  if (currentTabId == tabId) return
  if (currentTabId) flush()
  currentTabId = tabId
  if (tabs[tabId]){
    tabs[tabId].t0 = Date.now();
    checkIfCurrentTabBlameChanged()
  } else {
    // attempt restore
    chrome.tabs.get(tabId, tabInfo => {
      createTab(tabInfo, true)
      tabs[tabInfo.id].t0 = Date.now()
      checkIfCurrentTabBlameChanged()
    })
  }
}


function trackFrontTab(){
  chrome.tabs.query({lastFocusedWindow:true, active:true}, (tabs) => {
    // in a window with no active tabs?
    if (!tabs[0] || tabs[0].id == chrome.tabs.TAB_ID_NONE) return flush()

    // count time in the new tab
    activate(tabs[0].id, tabs[0])
  })
}

function createTab(tabInfo, shouldRestore){
  // console.log('createTab', tabInfo, shouldRestore)
  if (!tabInfo.id) return
  if (tabs[tabInfo.id]) return
  let tab = tabs[tabInfo.id] = {
    url: tabInfo.url,
    title: tabInfo.title,
    favIconUrl: tabInfo.favIconUrl
  }
  if (shouldRestore && recoveryHints[tabInfo.url]){
    tab.blame = recoveryHints[tabInfo.url].blame
    delete recoveryHints[tabInfo.url]
  }
  else if (tabInfo.openerTabId && !tabInfo.url.match(/newtab/)){
    // query for the opening tab and assign blame
    chrome.tabs.get(tabInfo.openerTabId, (openerTab) => {
      let opener = tabs[openerTab.id]
      if (opener) tab.blame = opener.blame
    })
  }
}




export default {

  onBlameChanged(cb){
    blameChangedListeners.push(cb)
  },

  onNewUsage(cb){
    onNewUsageHandler = cb
    if (!isRunning){
      this.recoverOldSession()
      this.trackUsage()
    }
  },

  recoverOldSession(){
    chrome.storage.local.get(['usageRecoveryTabs', 'usageRecoveryHints'],
      items => {
        let usageRecoveryTabs = items.usageRecoveryTabs || {}
        let usageRecoveryHints = items.usageRecoveryHints || {}
        let now = Date.now()
        let four_days_ago = now - 4*24*60*60*1000

        // add a hint for every interesting tab from the previous session
        for (var k in usageRecoveryTabs){
          let t = usageRecoveryTabs[k]
          if (t.blame && t.url && t.blame != t.url)
          recoveryHints[t.url] = { blame: t.blame, asOf: now }
        }

        // copy over old hints if they're less than 4 days old
        for (var k in usageRecoveryHints){
          if (usageRecoveryHints[k].asOf > four_days_ago){
            recoveryHints[k] = usageRecoveryHints[k]
          }
        }
      }
    )
  },

  trackUsage(){
    isRunning = true

    // HANDLE WINDOW AND APP FOCUS CHANGES

    chrome.windows.onFocusChanged.addListener(
      (windowId) => {
        if (windowId == chrome.windows.WINDOW_ID_NONE) flush()
        else trackFrontTab()
      }
    )
    chrome.idle.onStateChanged.addListener(
      (new_state) => {
        if (new_state != 'active') flush()
        else trackFrontTab()
      }
    )


    // HANDLE TAB CREATE / REMOVE / REPLACE

    chrome.tabs.onCreated.addListener(createTab)
    chrome.tabs.onRemoved.addListener(
      (tabId) => {
        if (tabId == currentTabId) flush()
        delete tabs[tabId]
      }
    )
    chrome.tabs.onReplaced.addListener(
      (addedTabId, removedTabId) => {
        if (removedTabId == currentTabId) flush()
        delete tabs[removedTabId]
        chrome.tabs.get(addedTabId, createTab)
      }
    )


    // HANDLE BROWSING

    chrome.tabs.onActivated.addListener( info => activate(info.tabId) )
    chrome.tabs.onUpdated.addListener(
      (tabId, changeInfo, tabInfo) => {
        if (!changeInfo.url && !changeInfo.title && !changeInfo.favIconUrl) return
        if (!tabs[tabId]) return
        if (changeInfo.url == tabs[tabId].url && !changeInfo.title) return
        if (!changeInfo.url && (changeInfo.title || changeInfo.favIconUrl)){
          if (tabInfo.title) tabs[tabId].title = tabInfo.title
          if (tabInfo.favIconUrl) tabs[tabId].favIconUrl = tabInfo.favIconUrl
          return
        }
        // console.log('onUpdated', tabId, changeInfo, tabInfo)
        let currentTabIdWas = currentTabId
        if (tabId == currentTabId) flush()
        tabs[tabId].url = tabInfo.url
        tabs[tabId].title = tabInfo.title
        tabs[tabId].favIconUrl = tabInfo.favIconUrl
        if (currentTabIdWas == tabId) activate(tabId, tabInfo)
      }
    )
    chrome.history.onVisited.addListener(
      (historyItem) => {
        let url = historyItem.url
        chrome.history.getVisits({url: url}, results => {
          let lastVisit = results[results.length-1]
          let transition = lastVisit.transition

          Object.values(tabs).forEach(t => {
            if (t.url == url){
              if (userInitiatedTransition(t.blame, url, transition)){
                t.blame = url
              }
            }
          })
          checkIfCurrentTabBlameChanged()
        })
      }
    )
  }
}





// monitor(){
//   function focus(url, tab) {
//     if (!(url = cleanURL(url))) return;
//     if (currentURL && currentURL != url) this.blur();
//     currentURL = url;
//     if (tab) currentTitle = tab.title;
//     t0 = Date.now()/1000
//     adjustEyeball()
//   }
//
//   function blur(url, tab) {
//     if (!t0 || !(url = cleanURL(url))) return;
//     var title = tab ? tab.title : currentTitle
//     BrowserHistory.addBout(t0, (Date.now()/1000) - t0, url, title)
//   }
//
//   chrome.tabs.onUpdated.addListener(
//     (tabId,changeInfo,tab) => {
//       if (changeInfo.status == 'complete') this.focus(tab.url, tab)
//     }
//   )
//   chrome.tabs.onCreated.addListener(
//     (tab) => {
//       this.focus(tab.url, tab);
//     }
//   )
//   chrome.tabs.onRemoved.addListener(
//     (tabId,removeInfo) => this.blur()
//   )
  // chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
  //   if (m.akce != 'content' || !m.focus) return
  //   this[m.focus].call(this, m.url, sender.tab)
  // })
// }
