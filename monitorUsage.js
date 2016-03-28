let tabs = {}
let userInitiated = /typed|auto_bookmark|generated|auto_toplevel|keyword|keyword_generated/

var currentTabId



export default function(onUsage, onActivate){


  function flush(){
    if (!currentTabId) return
    let tab = tabs[currentTabId]
    if (!tab) return
    if (!tab.t0) return
    let elapsed = Date.now() - tab.t0
    delete tab.t0
    currentTabId = null
    onUsage(tab.blame, tab.url, tab.title, elapsed)
  }

  function activate(tabId){
    if (currentTabId == tabId) return
    if (currentTabId) flush()
    currentTabId = tabId
    if (!tabs[tabId]) {
      console.log("attempting to activate nonexistent tab", tabId)
      return
    }
    tabs[tabId].t0 = Date.now()
    if (onActivate) onActivate(tabs[tabId])
  }


  // HANDLE WINDOW AND APP FOCUS CHANGES

  function trackFrontTab(){
    chrome.tabs.query({lastFocusedWindow:true, active:true}, (tabs) => {
      // in a window with no active tabs?
      if (!tabs[0] || tabs[0].id == chrome.tabs.TAB_ID_NONE) return flush()

      // count time in the new tab
      activate(tabs[0].id)
    })
  }

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

  function createTab(tabInfo){
    if (!tabInfo.id) return
    if (tabs[tabInfo.id]) return
    let tab = tabs[tabInfo.id] = {
      url: tabInfo.url,
      title: tabInfo.title
    }
    if (tabInfo.openerTabId && !tabInfo.url.match(/newtab/)){
      // query for the opening tab and assign blame
      chrome.tabs.get(tabInfo.openerTabId, (openerTab) => {
        let opener = tabs[openerTab.id]
        if (opener) tab.blame = opener.blame
      })
    }
  }

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
      if (!changeInfo.url && !changeInfo.title) return
      if (!tabs[tabId]) return
      if (changeInfo.url == tabs[tabId].url && !changeInfo.title) return
      if (!changeInfo.url && changeInfo.title){
        tabs[tabId].title = tabInfo.title
        return
      }
      // console.log('onUpdated', tabId, changeInfo, tabInfo)
      let currentTabIdWas = currentTabId
      if (tabId == currentTabId) flush()
      tabs[tabId].url = tabInfo.url
      tabs[tabId].title = tabInfo.title
      if (currentTabIdWas == tabId) activate(tabId)
    }
  )
  chrome.history.onVisited.addListener(
    (historyItem) => {
      chrome.history.getVisits({url: historyItem.url}, results => {
        let lastVisit = results[results.length-1]
        if (lastVisit.transition.match(userInitiated)){
          // breakBlameForRecentOpen
          let url = historyItem.url
          Object.values(tabs).forEach(
            t => { if (t.url == url) t.blame = url }
          )
        }
      })
    }
  )


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
