import Dexie from 'dexie'
import monitorUsage from './monitorUsage'

let db = new Dexie("ChromeActivities")

let MINUTES = 60*1000
let DAYS = 24*60*MINUTES
let WEEKS = 7*DAYS
let IGNORE_USAGES_BELOW_THRESHOLD = 3*1000
let IGNORE_TRAILS_BELOW_THRESHOLD = 10*MINUTES
let TRAILS_SEALED_AFTER = 1*DAYS

let activeTrails = {} // blameUrl: {ctime, mtime}

db.version(1).stores({
  trails: "ctime,unmarked,total"
  // mtime, blameUrl
  // steps: [[t0,t1,activityId,url,title]]
})




export default {

  monitorTrails(onTrailActive){
    monitorUsage(this.postUsage, onTrailActive && (tabInfo => {
      if (activeTrails[tabInfo.blame]){
        let ctime = activeTrails[tabInfo.blame].ctime
        db.trails.get(ctime).then(onTrailActive)
      }
    }))
  },

  mostSignificantTrails(max_age){
    if (!max_age) max_age = 4*WEEKS
    pruneOldAndTinyTrails()

    return db.trails.orderBy('unmarked').reverse().limit(100).and(x => {
      return now - x.mtime < max_age
    })
  },

  markTrailSteps(trailId, whichSteps, mark){
    db.trails.where(":id").equals(trailId).modify(trail => {
      let elapsed = 0
      trail.steps.each(s => {
        if (whichSteps.find(ws => ws[0] == s[0])){
          s[2] = mark
          elapsed += s[1] - s[0]
        }
      })
      trail.unmarked -= elapsed
    })
  },


  // PRIVATE

  pruneOldAndTinyTrails(){
    db.trails.where('total').below(IGNORE_TRAILS_BELOW_THRESHOLD).and(x => {
      return now - x.mtime > TRAILS_SEALED_AFTER
    }).delete()
  },

  postUsage(blameUrl, url, title, elapsed){
    if (elapsed < IGNORE_USAGES_BELOW_THRESHOLD) return
    if (!blameUrl) return

    let now = Date.now(), t0 = now-elapsed
    let active = (
      activeTrails[blameUrl] &&
      TRAILS_SEALED_AFTER > (now - activeTrails[blameUrl].mtime)
    )

    if (!active){
      console.log('new trail', blameUrl, url, title, elapsed)
      activeTrails[blameUrl] = { mtime: now, ctime: now }
      db.trails.put({
        blameUrl: blameUrl,
        ctime: now,
        mtime: now,
        unmarked: elapsed,
        total: elapsed,
        steps: [ [t0,now,null,url,title] ]
      })

    } else {
      console.log('trail continued', blameUrl, url, title, elapsed)
      activeTrails[blameUrl].mtime = now
      let ctime = activeTrails[blameUrl].ctime
      db.trails.where(":id").equals(ctime).modify(trail => {
        trail.total += elapsed
        trail.unmarked += elapsed
        trail.mtime = now
        trail.steps.push([t0,now,null,url,title])
      })
    }
  }

}


// // NOT CURRENTLY USED
// function cleanURL(url){
//   if (url && !url.match(/^https?\:\/\//)) return
//   if (!(url = url || currentURL)) return
//   var m = url.match(/:\/\/(.[^/]+)/)
//   return m ? (m[1]).replace('www.','') : url
// }
